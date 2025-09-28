import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerService } from '../common/services/logger.service';
import { MetricsService } from '../metrics/metrics.service';

export interface CircuitBreakerState {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failureCount: number;
  lastFailureTime: number;
  successCount: number;
  nextAttempt: number;
  totalCalls: number;
  totalFailures: number;
  lastStateChange: number;
  consecutiveFailures: number;
}

export interface CircuitBreakerConfig {
  timeout: number;
  errorThresholdPercentage: number;
  resetTimeout: number;
  minimumNumberOfCalls: number;
  slidingWindowSize: number;
  maxRetries: number;
  retryDelay: number;
  fallbackEnabled: boolean;
}

export interface FallbackStrategy<T> {
  execute(): Promise<T>;
  canExecute(): boolean;
  priority: number;
}

export interface CircuitBreakerMetrics {
  serviceName: string;
  state: string;
  failureRate: number;
  totalCalls: number;
  totalFailures: number;
  recentCalls: number;
  averageResponseTime: number;
  lastFailureTime: number;
  timeInCurrentState: number;
  nextAttemptIn?: number;
}

@Injectable()
export class CircuitBreakerService {
  private readonly breakers = new Map<string, CircuitBreakerState>();
  private readonly config: CircuitBreakerConfig;
  private readonly callHistory = new Map<string, Array<{ timestamp: number; success: boolean; responseTime?: number }>>();
  private readonly fallbackStrategies = new Map<string, FallbackStrategy<any>[]>();
  private readonly responseTimeHistory = new Map<string, number[]>();

  constructor(
    private configService: ConfigService,
    private logger: LoggerService,
    private metricsService: MetricsService,
  ) {
    this.config = {
      timeout: this.configService.get<number>('services.circuitBreaker.timeout', 10000),
      errorThresholdPercentage: this.configService.get<number>('services.circuitBreaker.errorThresholdPercentage', 50),
      resetTimeout: this.configService.get<number>('services.circuitBreaker.resetTimeout', 30000),
      minimumNumberOfCalls: this.configService.get<number>('services.circuitBreaker.minimumNumberOfCalls', 10),
      slidingWindowSize: this.configService.get<number>('services.circuitBreaker.slidingWindowSize', 100),
      maxRetries: this.configService.get<number>('services.circuitBreaker.maxRetries', 3),
      retryDelay: this.configService.get<number>('services.circuitBreaker.retryDelay', 1000),
      fallbackEnabled: this.configService.get<boolean>('services.circuitBreaker.fallbackEnabled', true),
    };
  }

  async executeWithBreaker<T>(
    serviceName: string,
    operation: () => Promise<T>,
    fallbackStrategies?: FallbackStrategy<T>[],
  ): Promise<T> {
    const breaker = this.getOrCreateBreaker(serviceName);

    // Register fallback strategies if provided
    if (fallbackStrategies && fallbackStrategies.length > 0) {
      this.registerFallbackStrategies(serviceName, fallbackStrategies);
    }

    // Check if circuit breaker is open
    if (breaker.state === 'OPEN') {
      const timeSinceLastFailure = Date.now() - breaker.lastFailureTime;

      if (timeSinceLastFailure < this.config.resetTimeout) {
        // Try fallback strategies if available
        if (this.config.fallbackEnabled) {
          const fallbackResult = await this.tryFallbackStrategies<T>(serviceName);
          if (fallbackResult !== null) {
            this.logger.log(`Circuit breaker OPEN for ${serviceName}, fallback strategy executed successfully`, 'CircuitBreakerService');
            return fallbackResult;
          }
        }

        const nextAttemptIn = Math.ceil((this.config.resetTimeout - timeSinceLastFailure) / 1000);
        const error = new Error(`Circuit breaker is OPEN for ${serviceName}. Next attempt in ${nextAttemptIn} seconds`);
        error.name = 'CircuitBreakerOpenError';

        // Record metrics
        this.recordCircuitBreakerMetrics(serviceName, 'REJECTED', 0);
        throw error;
      }

      // Transition to HALF_OPEN
      breaker.state = 'HALF_OPEN';
      breaker.successCount = 0;
      breaker.lastStateChange = Date.now();
      this.logger.log(`Circuit breaker transitioning to HALF_OPEN for ${serviceName}`, 'CircuitBreakerService');
    }

    const startTime = Date.now();

    try {
      // Execute operation with timeout and retry logic
      const result = await this.executeWithRetry(operation, serviceName);
      const responseTime = Date.now() - startTime;

      // Record success
      this.recordCall(serviceName, true, responseTime);
      this.recordResponseTime(serviceName, responseTime);
      this.onSuccess(breaker, serviceName);

      // Record metrics
      this.recordCircuitBreakerMetrics(serviceName, 'SUCCESS', responseTime);

      return result;
    } catch (error) {
      const responseTime = Date.now() - startTime;

      // Record failure
      this.recordCall(serviceName, false, responseTime);
      this.recordResponseTime(serviceName, responseTime);
      this.onFailure(breaker, serviceName, error);

      // Record metrics
      this.recordCircuitBreakerMetrics(serviceName, 'FAILURE', responseTime);

      // Try fallback strategies if available
      if (this.config.fallbackEnabled) {
        const fallbackResult = await this.tryFallbackStrategies<T>(serviceName);
        if (fallbackResult !== null) {
          this.logger.log(`Primary operation failed for ${serviceName}, fallback strategy executed successfully`, 'CircuitBreakerService');
          return fallbackResult;
        }
      }

      throw error;
    }
  }

  getCircuitBreakerState(serviceName: string): CircuitBreakerState {
    return this.getOrCreateBreaker(serviceName);
  }

  getCircuitBreakerStats(serviceName: string): CircuitBreakerMetrics {
    const breaker = this.getOrCreateBreaker(serviceName);
    const history = this.getRecentCallHistory(serviceName);
    const responseTimes = this.responseTimeHistory.get(serviceName) || [];

    const totalCalls = history.length;
    const failures = history.filter(call => !call.success).length;
    const failureRate = totalCalls > 0 ? (failures / totalCalls) * 100 : 0;
    const averageResponseTime = responseTimes.length > 0
      ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length
      : 0;

    const timeInCurrentState = Date.now() - (breaker.lastStateChange || Date.now());
    const nextAttemptIn = breaker.state === 'OPEN'
      ? Math.max(0, breaker.nextAttempt - Date.now())
      : undefined;

    return {
      serviceName,
      state: breaker.state,
      failureRate,
      totalCalls: breaker.totalCalls,
      totalFailures: breaker.totalFailures,
      recentCalls: totalCalls,
      averageResponseTime,
      lastFailureTime: breaker.lastFailureTime,
      timeInCurrentState,
      nextAttemptIn,
    };
  }

  // Register fallback strategies for a service
  registerFallbackStrategies<T>(serviceName: string, strategies: FallbackStrategy<T>[]): void {
    // Sort strategies by priority (higher priority first)
    const sortedStrategies = strategies.sort((a, b) => b.priority - a.priority);
    this.fallbackStrategies.set(serviceName, sortedStrategies);

    this.logger.log(`Registered ${strategies.length} fallback strategies for ${serviceName}`, 'CircuitBreakerService');
  }

  // Get all circuit breaker metrics
  getAllCircuitBreakerMetrics(): CircuitBreakerMetrics[] {
    const metrics: CircuitBreakerMetrics[] = [];

    for (const serviceName of this.breakers.keys()) {
      metrics.push(this.getCircuitBreakerStats(serviceName));
    }

    return metrics;
  }

  // Reset circuit breaker for a service
  resetCircuitBreaker(serviceName: string): void {
    const breaker = this.getOrCreateBreaker(serviceName);
    breaker.state = 'CLOSED';
    breaker.failureCount = 0;
    breaker.successCount = 0;
    breaker.totalCalls = 0;
    breaker.totalFailures = 0;
    breaker.consecutiveFailures = 0;
    breaker.lastStateChange = Date.now();

    // Clear history
    this.callHistory.delete(serviceName);
    this.responseTimeHistory.delete(serviceName);

    this.logger.log(`Circuit breaker reset for ${serviceName}`, 'CircuitBreakerService');
  }

  // Force circuit breaker state (for testing/admin purposes)
  forceState(serviceName: string, state: 'CLOSED' | 'OPEN' | 'HALF_OPEN'): void {
    const breaker = this.getOrCreateBreaker(serviceName);
    breaker.state = state;
    breaker.lastStateChange = Date.now();

    if (state === 'CLOSED') {
      breaker.failureCount = 0;
      breaker.successCount = 0;
      breaker.consecutiveFailures = 0;
    } else if (state === 'OPEN') {
      breaker.nextAttempt = Date.now() + this.config.resetTimeout;
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
        totalCalls: 0,
        totalFailures: 0,
        lastStateChange: Date.now(),
        consecutiveFailures: 0,
      });
    }

    return this.breakers.get(serviceName);
  }

  private async executeWithRetry<T>(operation: () => Promise<T>, serviceName: string): Promise<T> {
    let lastError: Error;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          // Wait before retry
          await this.delay(this.config.retryDelay * Math.pow(2, attempt - 1)); // Exponential backoff
          this.logger.log(`Retrying operation for ${serviceName}, attempt ${attempt + 1}/${this.config.maxRetries + 1}`, 'CircuitBreakerService');
        }

        return await this.withTimeout(operation(), this.config.timeout);
      } catch (error) {
        lastError = error;

        // Don't retry on certain error types
        if (this.isNonRetryableError(error)) {
          break;
        }

        if (attempt < this.config.maxRetries) {
          this.logger.warn(`Operation failed for ${serviceName}, attempt ${attempt + 1}/${this.config.maxRetries + 1}: ${error.message}`, 'CircuitBreakerService');
        }
      }
    }

    throw lastError;
  }

  private async tryFallbackStrategies<T>(serviceName: string): Promise<T | null> {
    const strategies = this.fallbackStrategies.get(serviceName) || [];

    for (const strategy of strategies) {
      try {
        if (strategy.canExecute()) {
          this.logger.log(`Executing fallback strategy (priority: ${strategy.priority}) for ${serviceName}`, 'CircuitBreakerService');
          const result = await strategy.execute();

          // Record fallback success
          this.recordCircuitBreakerMetrics(serviceName, 'FALLBACK_SUCCESS', 0);

          return result;
        }
      } catch (error) {
        this.logger.warn(`Fallback strategy failed for ${serviceName}: ${error.message}`, 'CircuitBreakerService');

        // Record fallback failure
        this.recordCircuitBreakerMetrics(serviceName, 'FALLBACK_FAILURE', 0);
      }
    }

    return null;
  }

  private recordCircuitBreakerMetrics(serviceName: string, result: string, responseTime: number): void {
    try {
      this.metricsService.recordCircuitBreakerEvent(serviceName, result, responseTime);
    } catch (error) {
      this.logger.warn(`Failed to record circuit breaker metrics for ${serviceName}: ${error.message}`, 'CircuitBreakerService');
    }
  }

  private recordResponseTime(serviceName: string, responseTime: number): void {
    if (!this.responseTimeHistory.has(serviceName)) {
      this.responseTimeHistory.set(serviceName, []);
    }

    const history = this.responseTimeHistory.get(serviceName);
    history.push(responseTime);

    // Keep only last 100 response times
    if (history.length > 100) {
      history.splice(0, history.length - 100);
    }
  }

  private isNonRetryableError(error: Error): boolean {
    // Don't retry on certain error types
    const nonRetryableErrors = [
      'CircuitBreakerOpenError',
      'ValidationError',
      'AuthenticationError',
      'AuthorizationError',
    ];

    return nonRetryableErrors.includes(error.name) ||
           error.message.includes('Circuit breaker is OPEN');
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private onSuccess(breaker: CircuitBreakerState, serviceName: string): void {
    breaker.totalCalls++;
    breaker.consecutiveFailures = 0;

    if (breaker.state === 'HALF_OPEN') {
      breaker.successCount++;

      // If we have enough successful calls, close the circuit
      if (breaker.successCount >= this.config.minimumNumberOfCalls) {
        breaker.state = 'CLOSED';
        breaker.failureCount = 0;
        breaker.successCount = 0;
        breaker.lastStateChange = Date.now();
        this.logger.log(`Circuit breaker CLOSED for ${serviceName}`, 'CircuitBreakerService');
      }
    } else if (breaker.state === 'CLOSED') {
      // Reset failure count on success
      breaker.failureCount = 0;
    }
  }

  private onFailure(breaker: CircuitBreakerState, serviceName: string, error: Error): void {
    breaker.failureCount++;
    breaker.totalCalls++;
    breaker.totalFailures++;
    breaker.consecutiveFailures++;
    breaker.lastFailureTime = Date.now();

    if (breaker.state === 'HALF_OPEN') {
      // Any failure in HALF_OPEN state opens the circuit
      breaker.state = 'OPEN';
      breaker.nextAttempt = Date.now() + this.config.resetTimeout;
      breaker.lastStateChange = Date.now();
      this.logger.warn(`Circuit breaker OPENED for ${serviceName} (failure in HALF_OPEN state): ${error.message}`, 'CircuitBreakerService');
    } else if (breaker.state === 'CLOSED') {
      // Check if we should open the circuit
      const shouldOpen = this.shouldOpenCircuit(serviceName);

      if (shouldOpen) {
        breaker.state = 'OPEN';
        breaker.nextAttempt = Date.now() + this.config.resetTimeout;
        breaker.lastStateChange = Date.now();
        this.logger.warn(`Circuit breaker OPENED for ${serviceName} (failure threshold exceeded): ${error.message}`, 'CircuitBreakerService');
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

  private recordCall(serviceName: string, success: boolean, responseTime?: number): void {
    if (!this.callHistory.has(serviceName)) {
      this.callHistory.set(serviceName, []);
    }

    const history = this.callHistory.get(serviceName);
    history.push({
      timestamp: Date.now(),
      success,
      responseTime,
    });

    // Keep only recent calls within sliding window
    const cutoffTime = Date.now() - (this.config.slidingWindowSize * 1000);
    const recentHistory = history.filter(call => call.timestamp > cutoffTime);

    this.callHistory.set(serviceName, recentHistory);
  }

  private getRecentCallHistory(serviceName: string): Array<{ timestamp: number; success: boolean; responseTime?: number }> {
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
