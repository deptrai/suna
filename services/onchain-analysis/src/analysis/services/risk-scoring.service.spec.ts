import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RiskScoringService, TokenRiskData } from './risk-scoring.service';
import { MetricsService } from '../../metrics/metrics.service';

describe('RiskScoringService', () => {
  let service: RiskScoringService;
  let configService: jest.Mocked<ConfigService>;
  let metricsService: jest.Mocked<MetricsService>;

  beforeEach(async () => {
    const mockConfigService = {
      get: jest.fn(),
    };

    const mockMetricsService = {
      recordExternalApiCall: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RiskScoringService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: MetricsService,
          useValue: mockMetricsService,
        },
      ],
    }).compile();

    service = module.get<RiskScoringService>(RiskScoringService);
    configService = module.get(ConfigService);
    metricsService = module.get(MetricsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('calculateRiskScore', () => {
    it('should calculate low risk score for high-quality token', async () => {
      const tokenData: TokenRiskData = {
        tokenAddress: '0xA0b86a33E6441e6e80A0c4C7596C5C0B6b8b8b8b',
        chainId: 'ethereum',
        liquidityUsd: 5000000, // $5M liquidity
        volume24h: 2000000, // $2M volume
        priceChange24h: 0.02, // 2% change
        priceChange7d: 0.05, // 5% weekly change
        marketCap: 500000000, // $500M market cap
        holders: 15000, // 15K holders
        topHolderPercentage: 0.08, // 8% top holder
        contractAge: 500, // 500 days old
        isVerified: true,
        auditScore: 95,
        transactionCount24h: 5000,
        uniqueTraders24h: 2000,
        liquidityConcentration: 0.25, // 25% concentration
        slippageEstimate: 0.01, // 1% slippage
      };

      const result = await service.calculateRiskScore(tokenData);

      expect(result.riskCategory).toBe('low');
      expect(result.overallScore).toBeLessThan(25);
      expect(result.confidence).toBeGreaterThan(0.8);
      expect(result.factors.length).toBeGreaterThan(5);
      expect(result.recommendations).toContain('Relatively low risk - suitable for most investment strategies');
      expect(metricsService.recordExternalApiCall).toHaveBeenCalledWith(
        'risk-scoring',
        'calculate',
        'success',
        expect.any(Number),
      );
    });

    it('should calculate high risk score for low-quality token', async () => {
      const tokenData: TokenRiskData = {
        tokenAddress: '0xBadToken123456789',
        chainId: 'ethereum',
        liquidityUsd: 5000, // $5K liquidity (very low)
        volume24h: 1000, // $1K volume (very low)
        priceChange24h: 0.45, // 45% change (extreme)
        priceChange7d: 1.2, // 120% weekly change (extreme)
        marketCap: 50000, // $50K market cap (micro)
        holders: 50, // 50 holders (very few)
        topHolderPercentage: 0.75, // 75% top holder (extreme concentration)
        contractAge: 5, // 5 days old (very new)
        isVerified: false,
        auditScore: 20,
        transactionCount24h: 10,
        uniqueTraders24h: 5,
        liquidityConcentration: 0.95, // 95% concentration (extreme)
        slippageEstimate: 0.25, // 25% slippage (extreme)
      };

      const result = await service.calculateRiskScore(tokenData);

      expect(result.riskCategory).toBe('extreme');
      expect(result.overallScore).toBeGreaterThan(75);
      expect(result.factors.length).toBeGreaterThan(5);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.recommendations).toContain('Extreme caution advised - consider avoiding this token');
    });

    it('should calculate medium risk score for moderate token', async () => {
      const tokenData: TokenRiskData = {
        tokenAddress: '0xModerateToken123',
        chainId: 'ethereum',
        liquidityUsd: 250000, // $250K liquidity
        volume24h: 75000, // $75K volume
        priceChange24h: 0.12, // 12% change
        priceChange7d: 0.25, // 25% weekly change
        marketCap: 5000000, // $5M market cap
        holders: 800, // 800 holders
        topHolderPercentage: 0.35, // 35% top holder
        contractAge: 120, // 120 days old
        isVerified: true,
        auditScore: 65,
        transactionCount24h: 500,
        uniqueTraders24h: 200,
        liquidityConcentration: 0.55, // 55% concentration
        slippageEstimate: 0.05, // 5% slippage
      };

      const result = await service.calculateRiskScore(tokenData);

      expect(result.riskCategory).toBe('medium');
      expect(result.overallScore).toBeGreaterThan(25);
      expect(result.overallScore).toBeLessThan(75);
      expect(result.recommendations).toContain('Moderate risk - suitable for experienced investors');
    });

    it('should handle missing data gracefully', async () => {
      const tokenData: TokenRiskData = {
        tokenAddress: '0xIncompleteData123',
        chainId: 'ethereum',
        liquidityUsd: 100000, // Only liquidity data available
      };

      const result = await service.calculateRiskScore(tokenData);

      expect(result).toBeDefined();
      expect(result.overallScore).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThan(0.5); // Low confidence due to missing data
      expect(result.factors.length).toBeGreaterThan(0);
    });

    it('should handle errors and record metrics', async () => {
      // Mock an error in the service
      const originalCalculateBreakdown = (service as any).calculateBreakdown;
      (service as any).calculateBreakdown = jest.fn().mockImplementation(() => {
        throw new Error('Test error');
      });

      const tokenData: TokenRiskData = {
        tokenAddress: '0xErrorToken123',
        chainId: 'ethereum',
        liquidityUsd: 100000,
      };

      await expect(service.calculateRiskScore(tokenData)).rejects.toThrow('Test error');

      expect(metricsService.recordExternalApiCall).toHaveBeenCalledWith(
        'risk-scoring',
        'calculate',
        'error',
        expect.any(Number),
      );

      // Restore original method
      (service as any).calculateBreakdown = originalCalculateBreakdown;
    });
  });

  describe('risk factor calculations', () => {
    it('should calculate liquidity risk factors correctly', () => {
      const serviceAny = service as any;

      // Test high liquidity (low risk)
      const highLiquidityData: TokenRiskData = {
        tokenAddress: '0xTest',
        chainId: 'ethereum',
        liquidityUsd: 2000000,
        liquidityConcentration: 0.2,
      };

      const highLiquidityFactors = serviceAny.calculateLiquidityRisk(highLiquidityData);
      expect(highLiquidityFactors).toHaveLength(2);
      expect(highLiquidityFactors[0].name).toBe('Liquidity Depth');
      expect(highLiquidityFactors[0].description).toContain('Excellent');
      expect(highLiquidityFactors[1].name).toBe('Liquidity Concentration');
      expect(highLiquidityFactors[1].description).toContain('Well-distributed');

      // Test low liquidity (high risk)
      const lowLiquidityData: TokenRiskData = {
        tokenAddress: '0xTest',
        chainId: 'ethereum',
        liquidityUsd: 5000,
        liquidityConcentration: 0.9,
      };

      const lowLiquidityFactors = serviceAny.calculateLiquidityRisk(lowLiquidityData);
      expect(lowLiquidityFactors[0].description).toContain('Very low');
      expect(lowLiquidityFactors[1].description).toContain('Extremely concentrated');
    });

    it('should calculate volatility risk factors correctly', () => {
      const serviceAny = service as any;

      // Test low volatility (low risk)
      const lowVolatilityData: TokenRiskData = {
        tokenAddress: '0xTest',
        chainId: 'ethereum',
        priceChange24h: 0.03, // 3%
        priceChange7d: 0.08, // 8%
      };

      const lowVolatilityFactors = serviceAny.calculateVolatilityRisk(lowVolatilityData);
      expect(lowVolatilityFactors).toHaveLength(2);
      expect(lowVolatilityFactors[0].description).toContain('Low price volatility');
      expect(lowVolatilityFactors[1].description).toContain('Stable weekly trend');

      // Test high volatility (high risk)
      const highVolatilityData: TokenRiskData = {
        tokenAddress: '0xTest',
        chainId: 'ethereum',
        priceChange24h: 0.5, // 50%
        priceChange7d: 1.5, // 150%
      };

      const highVolatilityFactors = serviceAny.calculateVolatilityRisk(highVolatilityData);
      expect(highVolatilityFactors[0].description).toContain('Extreme price volatility');
      expect(highVolatilityFactors[1].description).toContain('Extreme weekly volatility');
    });

    it('should calculate holder risk factors correctly', () => {
      const serviceAny = service as any;

      // Test good holder distribution (low risk)
      const goodHolderData: TokenRiskData = {
        tokenAddress: '0xTest',
        chainId: 'ethereum',
        holders: 20000,
        topHolderPercentage: 0.05, // 5%
      };

      const goodHolderFactors = serviceAny.calculateHolderRisk(goodHolderData);
      expect(goodHolderFactors).toHaveLength(2);
      expect(goodHolderFactors[0].description).toContain('Large holder base');
      expect(goodHolderFactors[1].description).toContain('Well-distributed ownership');

      // Test poor holder distribution (high risk)
      const poorHolderData: TokenRiskData = {
        tokenAddress: '0xTest',
        chainId: 'ethereum',
        holders: 50,
        topHolderPercentage: 0.8, // 80%
      };

      const poorHolderFactors = serviceAny.calculateHolderRisk(poorHolderData);
      expect(poorHolderFactors[0].description).toContain('Very small holder base');
      expect(poorHolderFactors[1].description).toContain('Extreme ownership concentration');
    });

    it('should calculate market risk factors correctly', () => {
      const serviceAny = service as any;

      // Test strong market metrics (low risk)
      const strongMarketData: TokenRiskData = {
        tokenAddress: '0xTest',
        chainId: 'ethereum',
        volume24h: 5000000,
        marketCap: 200000000,
        uniqueTraders24h: 3000,
      };

      const strongMarketFactors = serviceAny.calculateMarketRisk(strongMarketData);
      expect(strongMarketFactors).toHaveLength(3);
      expect(strongMarketFactors[0].description).toContain('High trading volume');
      expect(strongMarketFactors[1].description).toContain('Large market cap');
      expect(strongMarketFactors[2].description).toContain('High trader activity');

      // Test weak market metrics (high risk)
      const weakMarketData: TokenRiskData = {
        tokenAddress: '0xTest',
        chainId: 'ethereum',
        volume24h: 1000,
        marketCap: 100000,
        uniqueTraders24h: 10,
      };

      const weakMarketFactors = serviceAny.calculateMarketRisk(weakMarketData);
      expect(weakMarketFactors[0].description).toContain('Very low trading volume');
      expect(weakMarketFactors[1].description).toContain('Micro market cap');
      expect(weakMarketFactors[2].description).toContain('Very low trader activity');
    });

    it('should calculate technical risk factors correctly', () => {
      const serviceAny = service as any;

      // Test good technical metrics (low risk)
      const goodTechnicalData: TokenRiskData = {
        tokenAddress: '0xTest',
        chainId: 'ethereum',
        contractAge: 400, // Over 1 year
        isVerified: true,
        auditScore: 92,
      };

      const goodTechnicalFactors = serviceAny.calculateTechnicalRisk(goodTechnicalData);
      expect(goodTechnicalFactors).toHaveLength(3);
      expect(goodTechnicalFactors[0].description).toContain('Mature contract');
      expect(goodTechnicalFactors[1].description).toContain('Contract verified');
      expect(goodTechnicalFactors[2].description).toContain('Excellent audit score');

      // Test poor technical metrics (high risk)
      const poorTechnicalData: TokenRiskData = {
        tokenAddress: '0xTest',
        chainId: 'ethereum',
        contractAge: 10, // Very new
        isVerified: false,
        auditScore: 30,
      };

      const poorTechnicalFactors = serviceAny.calculateTechnicalRisk(poorTechnicalData);
      expect(poorTechnicalFactors[0].description).toContain('Very new contract');
      expect(poorTechnicalFactors[1].description).toContain('Contract not verified');
      expect(poorTechnicalFactors[2].description).toContain('Poor audit score');
    });
  });

  describe('helper methods', () => {
    it('should determine risk category correctly', () => {
      const serviceAny = service as any;

      expect(serviceAny.determineRiskCategory(15)).toBe('low');
      expect(serviceAny.determineRiskCategory(35)).toBe('medium');
      expect(serviceAny.determineRiskCategory(65)).toBe('high');
      expect(serviceAny.determineRiskCategory(85)).toBe('extreme');
    });

    it('should calculate confidence correctly', () => {
      const serviceAny = service as any;

      const highConfidenceFactors = [
        { confidence: 0.9 },
        { confidence: 0.8 },
        { confidence: 0.9 },
        { confidence: 0.85 },
        { confidence: 0.9 },
      ];

      const confidence = serviceAny.calculateConfidence(highConfidenceFactors);
      expect(confidence).toBeGreaterThan(0.4);
      expect(confidence).toBeLessThan(0.95);

      // Test with no factors
      expect(serviceAny.calculateConfidence([])).toBe(0.1);
    });

    it('should generate appropriate recommendations', () => {
      const serviceAny = service as any;

      const mockFactors = [
        { category: 'liquidity', value: 80 },
        { category: 'volatility', value: 75 },
      ];

      const extremeRecommendations = serviceAny.generateRecommendations(mockFactors, 'extreme');
      expect(extremeRecommendations).toContain('Extreme caution advised - consider avoiding this token');

      const lowRecommendations = serviceAny.generateRecommendations(mockFactors, 'low');
      expect(lowRecommendations).toContain('Relatively low risk - suitable for most investment strategies');
    });

    it('should generate appropriate warnings', () => {
      const serviceAny = service as any;

      const highRiskFactors = [
        { category: 'liquidity', value: 95, description: 'Very low liquidity' },
        { category: 'holder', value: 92, description: 'Extreme concentration' },
      ];

      const warnings = serviceAny.generateWarnings(highRiskFactors, 'extreme');
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings.some(w => w.includes('CRITICAL'))).toBe(true);
      expect(warnings.some(w => w.includes('EXTREME RISK'))).toBe(true);
    });
  });
});
