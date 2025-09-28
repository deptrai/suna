/**
 * T2.1.1a: OnChain Analysis Service - Main Application Service
 * Basic service information and utilities
 */

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AppService {
  constructor(private readonly configService: ConfigService) {}

  getServiceInfo() {
    const port = this.configService.get<number>('PORT', 3001);
    const nodeEnv = this.configService.get<string>('NODE_ENV', 'development');
    
    return {
      service: 'onchain-analysis',
      version: '1.0.0',
      description: 'Blockchain data analysis and risk assessment',
      status: 'running',
      environment: nodeEnv,
      port,
      timestamp: new Date().toISOString(),
      endpoints: {
        health: '/health',
        metrics: '/metrics',
        docs: nodeEnv !== 'production' ? '/api/docs' : null,
        analyze: '/api/v1/onchain/analyze',
      },
      capabilities: [
        'Token price and market data analysis',
        'Holder distribution analysis',
        'Transaction pattern analysis',
        'Liquidity and volume analysis',
        'Risk scoring and assessment',
        'Multi-chain support',
        'Real-time data processing',
      ],
      supportedChains: [
        'ethereum',
        'bsc',
        'polygon',
        'arbitrum',
        'optimism',
        'avalanche',
      ],
    };
  }

  getVersion() {
    return {
      version: '1.0.0',
      buildDate: new Date().toISOString(),
      gitCommit: process.env.GIT_COMMIT || 'unknown',
      nodeVersion: process.version,
      dependencies: {
        nestjs: '^10.0.0',
        typeorm: '^0.3.17',
        web3: '^4.3.0',
        ethers: '^6.8.1',
      },
    };
  }

  getHealthStatus() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: '1.0.0',
    };
  }
}
