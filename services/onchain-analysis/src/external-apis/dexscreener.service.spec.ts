/**
 * T2.1.4: DexScreener Service Unit Tests
 * Testing DEX data client and liquidity analysis functionality
 */

import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';
import { DexScreenerService, DexScreenerPair } from './dexscreener.service';
import { MetricsService } from '../metrics/metrics.service';

describe('DexScreenerService', () => {
  let service: DexScreenerService;
  let httpService: jest.Mocked<HttpService>;
  let configService: jest.Mocked<ConfigService>;
  let metricsService: jest.Mocked<MetricsService>;

  const mockPair: DexScreenerPair = {
    chainId: 'ethereum',
    dexId: 'uniswap',
    url: 'https://dexscreener.com/ethereum/0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640',
    pairAddress: '0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640',
    baseToken: {
      address: '0xA0b86a33E6441e6e80A0c4C7596C5C0B6b8b8b8b',
      name: 'Test Token',
      symbol: 'TEST',
    },
    quoteToken: {
      address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      name: 'Wrapped Ether',
      symbol: 'WETH',
    },
    priceNative: '0.001',
    priceUsd: '2.50',
    txns: {
      m5: { buys: 5, sells: 3 },
      h1: { buys: 50, sells: 30 },
      h6: { buys: 200, sells: 150 },
      h24: { buys: 800, sells: 600 },
    },
    volume: {
      h24: 150000,
      h6: 40000,
      h1: 8000,
      m5: 1500,
    },
    priceChange: {
      m5: 2.5,
      h1: 5.0,
      h6: -3.2,
      h24: 12.8,
    },
    liquidity: {
      usd: 250000,
      base: 100000,
      quote: 150000,
    },
    fdv: 2500000,
    marketCap: 2000000,
    pairCreatedAt: Math.floor(Date.now() / 1000) - 86400 * 30, // 30 days ago
  };

  beforeEach(async () => {
    const mockHttpService = {
      get: jest.fn(),
    };

    const mockConfigService = {
      get: jest.fn(),
    };

    const mockMetricsService = {
      recordExternalApiCall: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DexScreenerService,
        { provide: HttpService, useValue: mockHttpService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: MetricsService, useValue: mockMetricsService },
      ],
    }).compile();

    service = module.get<DexScreenerService>(DexScreenerService);
    httpService = module.get(HttpService);
    configService = module.get(ConfigService);
    metricsService = module.get(MetricsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getPairsByToken', () => {
    it('should fetch pairs for a token successfully', async () => {
      const tokenAddress = '0xA0b86a33E6441e6e80A0c4C7596C5C0B6b8b8b8b';
      const mockResponse = {
        data: {
          schemaVersion: '1.0.0',
          pairs: [mockPair],
        },
      };

      httpService.get.mockReturnValue(of(mockResponse));

      const result = await service.getPairsByToken(tokenAddress);

      expect(result).toEqual([mockPair]);
      expect(httpService.get).toHaveBeenCalledWith(
        `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`,
        expect.objectContaining({
          timeout: 30000,
          headers: expect.objectContaining({
            'User-Agent': 'ChainLens-OnChain-Analysis/1.0',
          }),
        })
      );
      expect(metricsService.recordExternalApiCall).toHaveBeenCalledWith(
        'dexscreener',
        'getPairsByToken',
        'success',
        expect.any(Number)
      );
    });

    it('should handle API errors gracefully', async () => {
      const tokenAddress = '0xA0b86a33E6441e6e80A0c4C7596C5C0B6b8b8b8b';
      const error = new Error('Network error');

      httpService.get.mockReturnValue(throwError(() => error));

      await expect(service.getPairsByToken(tokenAddress)).rejects.toThrow();
      expect(metricsService.recordExternalApiCall).toHaveBeenCalledWith(
        'dexscreener',
        'getPairsByToken',
        'error',
        expect.any(Number)
      );
    });

    it('should handle rate limiting', async () => {
      const tokenAddress = '0xA0b86a33E6441e6e80A0c4C7596C5C0B6b8b8b8b';
      const error = { response: { status: 429 } };

      httpService.get.mockReturnValue(throwError(() => error));

      await expect(service.getPairsByToken(tokenAddress)).rejects.toThrow('Rate limit exceeded');
    });
  });

  describe('getPairInfo', () => {
    it('should fetch pair info successfully', async () => {
      const pairAddress = '0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640';
      const mockResponse = {
        data: {
          schemaVersion: '1.0.0',
          pairs: [mockPair],
        },
      };

      httpService.get.mockReturnValue(of(mockResponse));

      const result = await service.getPairInfo(pairAddress);

      expect(result).toEqual(mockPair);
      expect(httpService.get).toHaveBeenCalledWith(
        `https://api.dexscreener.com/latest/dex/pairs/${pairAddress}`,
        expect.objectContaining({
          timeout: 30000,
        })
      );
    });

    it('should return null when pair not found', async () => {
      const pairAddress = '0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640';
      const mockResponse = {
        data: {
          schemaVersion: '1.0.0',
          pairs: [],
        },
      };

      httpService.get.mockReturnValue(of(mockResponse));

      const result = await service.getPairInfo(pairAddress);

      expect(result).toBeNull();
    });
  });

  describe('analyzePair', () => {
    it('should analyze pair with comprehensive metrics', async () => {
      const pairAddress = '0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640';
      const mockResponse = {
        data: {
          schemaVersion: '1.0.0',
          pairs: [mockPair],
        },
      };

      httpService.get.mockReturnValue(of(mockResponse));

      const result = await service.analyzePair(pairAddress);

      expect(result).toBeDefined();
      expect(result?.pairAddress).toBe(pairAddress);
      expect(result?.chainId).toBe('ethereum');
      expect(result?.dexId).toBe('uniswap');
      expect(result?.priceData.currentPriceUsd).toBe(2.5);
      expect(result?.volumeData.volume24h).toBe(150000);
      expect(result?.liquidityData.totalLiquidityUsd).toBe(250000);
      expect(result?.tradingActivity.transactions24h).toBe(1400); // 800 + 600
      expect(result?.riskMetrics.liquidityRisk).toBe('medium'); // 250k liquidity
      expect(result?.metadata.pairAge).toBe(30); // 30 days old
    });

    it('should return null when pair analysis fails', async () => {
      const pairAddress = '0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640';
      const error = new Error('Network error');

      httpService.get.mockReturnValue(throwError(() => error));

      const result = await service.analyzePair(pairAddress);

      expect(result).toBeNull();
    });
  });

  describe('analyzeLiquidity', () => {
    it('should analyze token liquidity across DEXes', async () => {
      const tokenAddress = '0xA0b86a33E6441e6e80A0c4C7596C5C0B6b8b8b8b';
      const mockResponse = {
        data: {
          schemaVersion: '1.0.0',
          pairs: [mockPair],
        },
      };

      httpService.get.mockReturnValue(of(mockResponse));

      const result = await service.analyzeLiquidity(tokenAddress);

      expect(result).toBeDefined();
      expect(result.tokenAddress).toBe(tokenAddress);
      expect(result.totalPairs).toBe(1);
      expect(result.totalLiquidityUsd).toBe(250000);
      expect(result.liquidityDistribution).toHaveLength(1);
      expect(result.liquidityDistribution[0].dexId).toBe('uniswap');
      expect(result.liquidityDistribution[0].liquidityShare).toBe(100);
      expect(result.liquidityMetrics.concentrationRisk).toBe(100); // Single pool
      expect(result.liquidityMetrics.liquidityStability).toBe('volatile');
      expect(result.liquidityMetrics.averageSlippage).toBe(1.0); // 250k liquidity
      expect(result.liquidityMetrics.impermanentLossRisk).toBe('medium');
    });

    it('should filter by chain when specified', async () => {
      const tokenAddress = '0xA0b86a33E6441e6e80A0c4C7596C5C0B6b8b8b8b';
      const chainId = 'ethereum';
      const mockResponse = {
        data: {
          schemaVersion: '1.0.0',
          pairs: [mockPair],
        },
      };

      httpService.get.mockReturnValue(of(mockResponse));

      const result = await service.analyzeLiquidity(tokenAddress, chainId);

      expect(result.chainId).toBe(chainId);
      expect(result.totalPairs).toBe(1);
    });
  });

  describe('risk calculations', () => {
    it('should calculate liquidity score correctly', () => {
      // Access private method through any cast for testing
      const serviceAny = service as any;
      
      expect(serviceAny.calculateLiquidityScore(1500000)).toBe(100); // >= 1M
      expect(serviceAny.calculateLiquidityScore(750000)).toBe(80);   // >= 500k
      expect(serviceAny.calculateLiquidityScore(150000)).toBe(60);   // >= 100k
      expect(serviceAny.calculateLiquidityScore(75000)).toBe(40);    // >= 50k
      expect(serviceAny.calculateLiquidityScore(25000)).toBe(20);    // >= 10k
      expect(serviceAny.calculateLiquidityScore(5000)).toBe(10);     // < 10k
    });

    it('should calculate buy pressure correctly', () => {
      const serviceAny = service as any;
      
      expect(serviceAny.calculateBuyPressure({ buys: 80, sells: 20 })).toBe(80);
      expect(serviceAny.calculateBuyPressure({ buys: 50, sells: 50 })).toBe(50);
      expect(serviceAny.calculateBuyPressure({ buys: 20, sells: 80 })).toBe(20);
      expect(serviceAny.calculateBuyPressure({ buys: 0, sells: 0 })).toBe(50);
    });

    it('should assess liquidity risk correctly', () => {
      const serviceAny = service as any;
      
      expect(serviceAny.assessLiquidityRisk(750000)).toBe('low');     // >= 500k
      expect(serviceAny.assessLiquidityRisk(250000)).toBe('medium');  // >= 100k
      expect(serviceAny.assessLiquidityRisk(50000)).toBe('high');     // >= 10k
      expect(serviceAny.assessLiquidityRisk(5000)).toBe('extreme');   // < 10k
    });

    it('should assess trading risk correctly', () => {
      const serviceAny = service as any;
      
      expect(serviceAny.assessTradingRisk({ buys: 100, sells: 50 }, 75000)).toBe('low');
      expect(serviceAny.assessTradingRisk({ buys: 60, sells: 40 }, 25000)).toBe('medium');
      expect(serviceAny.assessTradingRisk({ buys: 15, sells: 10 }, 5000)).toBe('high');
      expect(serviceAny.assessTradingRisk({ buys: 5, sells: 3 }, 500)).toBe('extreme');
    });
  });

  describe('helper methods', () => {
    it('should calculate volume change correctly', () => {
      const serviceAny = service as any;
      
      const volume = { h24: 120000, h6: 100000 };
      expect(serviceAny.calculateVolumeChange(volume)).toBe(20); // 20% increase
      
      const volumeDecrease = { h24: 80000, h6: 100000 };
      expect(serviceAny.calculateVolumeChange(volumeDecrease)).toBe(-20); // 20% decrease
      
      const volumeZero = { h24: 100000, h6: 0 };
      expect(serviceAny.calculateVolumeChange(volumeZero)).toBe(0); // No change when h6 is 0
    });

    it('should calculate pair age correctly', () => {
      const serviceAny = service as any;
      
      const thirtyDaysAgo = Math.floor(Date.now() / 1000) - (86400 * 30);
      expect(serviceAny.calculatePairAge(thirtyDaysAgo)).toBe(30);
      
      expect(serviceAny.calculatePairAge(undefined)).toBe(0);
    });

    it('should estimate slippage correctly', () => {
      const serviceAny = service as any;
      
      expect(serviceAny.estimateSlippage(1500000)).toBe(0.1);  // >= 1M
      expect(serviceAny.estimateSlippage(750000)).toBe(0.3);   // >= 500k
      expect(serviceAny.estimateSlippage(150000)).toBe(1.0);   // >= 100k
      expect(serviceAny.estimateSlippage(75000)).toBe(3.0);    // >= 50k
      expect(serviceAny.estimateSlippage(25000)).toBe(10.0);   // >= 10k
      expect(serviceAny.estimateSlippage(5000)).toBe(25.0);    // < 10k
    });
  });
});
