import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerService } from '../common/services/logger.service';

interface CircuitBreakerState {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failureCount: number;
  lastFailureTime: number;
  successCount: number;
  nextAttempt: number;
}

interface CircuitBreakerConfig {
  timeout: number;
  errorThresholdPercentage: number;
  resetTimeout: number;
  minimumNumberOfCalls: number;
  slidingWindowSize: number;
}

@Injectable()
export class CircuitBreakerService {
  private readonly breakers = new Map<string, CircuitBreakerState>();
  private readonly config: CircuitBreakerConfig;
  private readonly callHistory = new Map<string, Array<{ timestamp: number; success: boolean }>>();

  constructor(
    private configService: ConfigService,
    private logger: LoggerService,
  ) {
    this.config = {
      timeout: this.configService.get<number>('services.circuitBreaker.timeout', 10000),
      errorThresholdPercentage: this.configService.get<number>('services.circuitBreaker.errorThresholdPercentage', 50),
      resetTimeout: this.configService.get<number>('services.circuitBreaker.resetTimeout', 30000),
      minimumNumberOfCalls: this.configService.get<number>('services.circuitBreaker.minimumNumberOfCalls', 10),
      slidingWindowSize: this.configService.get<number>('services.circuitBreaker.slidingWindowSize', 100),
    };
  }

  async executeWithBreaker<T>(
    serviceName: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const breaker = this.getOrCreateBreaker(serviceName);
    
    // Check if circuit breaker is open
    if (breaker.state === 'OPEN') {
      const timeSinceLastFailure = Date.now() - breaker.lastFailureTime;
      
      if (timeSinceLastFailure < this.config.resetTimeout) {
        throw new Error(`Circuit breaker is OPEN for ${serviceName}. Next attempt in ${Math.ceil((this.config.resetTimeout - timeSinceLastFailure) / 1000)} seconds`);
      }
      
      // Transition to HALF_OPEN
      breaker.state = 'HALF_OPEN';
      breaker.successCount = 0;
      this.logger.log(`Circuit breaker transitioning to HALF_OPEN for ${serviceName}`, 'CircuitBreakerService');
    }

    const startTime = Date.now();
    
    try {
      // Execute operation with timeout
      const result = await this.withTimeout(operation(), this.config.timeout);
      
      // Record success
      this.recordCall(serviceName, true);
      this.onSuccess(breaker, serviceName);
      
      return result;
    } catch (error) {
      // Record failure
      this.recordCall(serviceName, false);
      this.onFailure(breaker, serviceName, error);
      
      throw error;
    }
  }

  getCircuitBreakerState(serviceName: string): CircuitBreakerState {
    return this.getOrCreateBreaker(serviceName);
  }

  getCircuitBreakerStats(serviceName: string): {
    state: string;
    failureRate: number;
    totalCalls: number;
    recentCalls: number;
  } {
    const breaker = this.getOrCreateBreaker(serviceName);
    const history = this.getRecentCallHistory(serviceName);
    
    const totalCalls = history.length;
    const failures = history.filter(call => !call.success).length;
    const failureRate = totalCalls > 0 ? (failures / totalCalls) * 100 : 0;
    
    return {
      state: breaker.state,
      failureRate,
      totalCalls,
      recentCalls: totalCalls,
    };
  }

  // Force circuit breaker state (for testing/admin purposes)
  forceState(serviceName: string, state: 'CLOSED' | 'OPEN' | 'HALF_OPEN'): void {
    const breaker = this.getOrCreateBreaker(serviceName);
    breaker.state = state;
    
    if (state === 'CLOSED') {
      breaker.failureCount = 0;
      breaker.successCount = 0;
    }
    
    this.logger.log(`Circuit breaker for ${serviceName} forced to ${state}`, 'CircuitBreakerService');
  }

  private getOrCreateBreaker(serviceName: string): CircuitBreakerState {
    if (!this.breakers.has(serviceName)) {
      this.breakers.set(serviceName, {
        state: 'CLOSED',
        failureCount: 0,
        lastFailureTime: 0,
        successCount: 0,
        nextAttempt: 0,
      });
    }
    
    return this.breakers.get(serviceName);
  }

  private onSuccess(breaker: CircuitBreakerState, serviceName: string): void {
    if (breaker.state === 'HALF_OPEN') {
      breaker.successCount++;
      
      // If we have enough successful calls, close the circuit
      if (breaker.successCount >= this.config.minimumNumberOfCalls) {
        breaker.state = 'CLOSED';
        breaker.failureCount = 0;
        breaker.successCount = 0;
        this.logger.log(`Circuit breaker CLOSED for ${serviceName}`, 'CircuitBreakerService');
      }
    } else if (breaker.state === 'CLOSED') {
      // Reset failure count on success
      breaker.failureCount = 0;
    }
  }

  private onFailure(breaker: CircuitBreakerState, serviceName: string, error: Error): void {
    breaker.failureCount++;
    breaker.lastFailureTime = Date.now();
    
    if (breaker.state === 'HALF_OPEN') {
      // Any failure in HALF_OPEN state opens the circuit
      breaker.state = 'OPEN';
      breaker.nextAttempt = Date.now() + this.config.resetTimeout;
      this.logger.warn(`Circuit breaker OPENED for ${serviceName} (failure in HALF_OPEN state)`, 'CircuitBreakerService');
    } else if (breaker.state === 'CLOSED') {
      // Check if we should open the circuit
      const shouldOpen = this.shouldOpenCircuit(serviceName);
      
      if (shouldOpen) {
        breaker.state = 'OPEN';
        breaker.nextAttempt = Date.now() + this.config.resetTimeout;
        this.logger.warn(`Circuit breaker OPENED for ${serviceName} (failure threshold exceeded)`, 'CircuitBreakerService');
      }
    }
  }

  private shouldOpenCircuit(serviceName: string): boolean {
    const history = this.getRecentCallHistory(serviceName);
    
    // Need minimum number of calls to make a decision
    if (history.length < this.config.minimumNumberOfCalls) {
      return false;
    }
    
    const failures = history.filter(call => !call.success).length;
    const failureRate = (failures / history.length) * 100;
    
    return failureRate >= this.config.errorThresholdPercentage;
  }

  private recordCall(serviceName: string, success: boolean): void {
    if (!this.callHistory.has(serviceName)) {
      this.callHistory.set(serviceName, []);
    }
    
    const history = this.callHistory.get(serviceName);
    history.push({
      timestamp: Date.now(),
      success,
    });
    
    // Keep only recent calls within sliding window
    const cutoffTime = Date.now() - (this.config.slidingWindowSize * 1000);
    const recentHistory = history.filter(call => call.timestamp > cutoffTime);
    
    this.callHistory.set(serviceName, recentHistory);
  }

  private getRecentCallHistory(serviceName: string): Array<{ timestamp: number; success: boolean }> {
    const history = this.callHistory.get(serviceName) || [];
    const cutoffTime = Date.now() - (this.config.slidingWindowSize * 1000);
    
    return history.filter(call => call.timestamp > cutoffTime);
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        const error = new Error(`Operation timed out after ${timeoutMs}ms`);
        error.name = 'TimeoutError';
        reject(error);
      }, timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]);
  }
}
