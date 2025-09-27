import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';
import { SupabaseService } from '../services/supabase.service';
import { LoggerService } from '../../common/services/logger.service';
import { JwtPayload, UserContext } from '../constants/jwt.constants';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let supabaseService: jest.Mocked<SupabaseService>;
  let loggerService: jest.Mocked<LoggerService>;
  let configService: jest.Mocked<ConfigService>;

  const mockJwtPayload: JwtPayload = {
    sub: 'test-user-id',
    email: 'test@chainlens.com',
    role: 'free',
    tier: 'free',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    iss: 'chainlens-core',
    aud: 'chainlens-users',
  };

  const mockSupabaseUser = {
    id: 'test-user-id',
    email: 'test@chainlens.com',
    role: 'free',
    tier: 'free',
    isActive: true,
    metadata: {},
  };

  beforeEach(async () => {
    const mockSupabaseService = {
      getUserProfile: jest.fn(),
    };

    const mockLoggerService = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    const mockConfigService = {
      get: jest.fn().mockImplementation((key: string) => {
        switch (key) {
          case 'JWT_SECRET':
            return 'test-secret';
          case 'JWT_EXPIRES_IN':
            return '24h';
          default:
            return undefined;
        }
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        {
          provide: SupabaseService,
          useValue: mockSupabaseService,
        },
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    strategy = module.get<JwtStrategy>(JwtStrategy);
    supabaseService = module.get(SupabaseService);
    loggerService = module.get(LoggerService);
    configService = module.get(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validate', () => {
    it('should validate JWT payload successfully with Supabase user', async () => {
      // Arrange
      supabaseService.getUserProfile.mockResolvedValue(mockSupabaseUser);

      // Act
      const result = await strategy.validate(mockJwtPayload);

      // Assert
      expect(result).toEqual({
        id: mockJwtPayload.sub,
        email: mockJwtPayload.email,
        role: mockSupabaseUser.role,
        tier: mockSupabaseUser.tier,
        rateLimit: {
          requests: 10,
          window: 3600,
        },
        metadata: mockSupabaseUser,
      });
      expect(supabaseService.getUserProfile).toHaveBeenCalledWith(mockJwtPayload.sub);
      expect(loggerService.debug).toHaveBeenCalledWith(
        'Validating JWT payload',
        { userId: mockJwtPayload.sub }
      );
    });

    it('should validate JWT payload with fallback when Supabase fails', async () => {
      // Arrange
      supabaseService.getUserProfile.mockRejectedValue(new Error('Supabase error'));

      // Act
      const result = await strategy.validate(mockJwtPayload);

      // Assert
      expect(result).toEqual({
        id: mockJwtPayload.sub,
        email: mockJwtPayload.email,
        role: mockJwtPayload.role,
        tier: mockJwtPayload.tier,
        rateLimit: {
          requests: 10,
          window: 3600,
        },
        metadata: {},
      });
      expect(loggerService.debug).toHaveBeenCalledWith(
        'Could not fetch Supabase user profile, using JWT payload',
        expect.objectContaining({
          userId: mockJwtPayload.sub,
          error: 'Supabase error'
        })
      );
    });

    it('should throw UnauthorizedException for missing sub', async () => {
      // Arrange
      const invalidPayload = { ...mockJwtPayload, sub: undefined };

      // Act & Assert
      await expect(strategy.validate(invalidPayload as any)).rejects.toThrow(
        UnauthorizedException
      );
      expect(loggerService.error).toHaveBeenCalledWith(
        'JWT validation failed',
        expect.any(String),
        'JwtStrategy',
        expect.objectContaining({ userId: undefined })
      );
    });

    it('should throw UnauthorizedException for missing email', async () => {
      // Arrange
      const invalidPayload = { ...mockJwtPayload, email: undefined };

      // Act & Assert
      await expect(strategy.validate(invalidPayload as any)).rejects.toThrow(
        UnauthorizedException
      );
    });

    it('should validate expired token (no expiration check in strategy)', async () => {
      // Arrange
      const expiredPayload = {
        ...mockJwtPayload,
        exp: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
      };
      supabaseService.getUserProfile.mockRejectedValue(new Error('Supabase error'));

      // Act
      const result = await strategy.validate(expiredPayload);

      // Assert - Strategy doesn't check expiration, JWT middleware does
      expect(result).toBeDefined();
      expect(result.id).toBe(expiredPayload.sub);
    });

    it('should handle different user tiers correctly', async () => {
      // Arrange
      const proUser = { ...mockSupabaseUser, role: 'pro' as const, tier: 'pro' as const };
      const proPayload = { ...mockJwtPayload, role: 'pro' as const, tier: 'pro' as const };
      supabaseService.getUserProfile.mockResolvedValue(proUser);

      // Act
      const result = await strategy.validate(proPayload);

      // Assert
      expect(result.role).toBe('pro');
      expect(result.tier).toBe('pro');
      expect(result.rateLimit.requests).toBe(100); // Pro tier rate limit
    });

    it('should handle enterprise tier correctly', async () => {
      // Arrange
      const enterpriseUser = { ...mockSupabaseUser, role: 'enterprise' as const, tier: 'enterprise' as const };
      const enterprisePayload = { ...mockJwtPayload, role: 'enterprise' as const, tier: 'enterprise' as const };
      supabaseService.getUserProfile.mockResolvedValue(enterpriseUser);

      // Act
      const result = await strategy.validate(enterprisePayload);

      // Assert
      expect(result.role).toBe('enterprise');
      expect(result.tier).toBe('enterprise');
      expect(result.rateLimit.requests).toBe(1000); // Enterprise tier rate limit
    });

    it('should handle inactive user from Supabase', async () => {
      // Arrange
      const inactiveUser = { ...mockSupabaseUser, isActive: false };
      supabaseService.getUserProfile.mockResolvedValue(inactiveUser);

      // Act
      const result = await strategy.validate(mockJwtPayload);

      // Assert
      expect(result.metadata.isActive).toBe(false);
    });

    it('should log validation success', async () => {
      // Arrange
      supabaseService.getUserProfile.mockResolvedValue(mockSupabaseUser);

      // Act
      await strategy.validate(mockJwtPayload);

      // Assert
      expect(loggerService.debug).toHaveBeenCalledWith(
        'JWT validation successful',
        expect.objectContaining({
          userId: mockJwtPayload.sub,
          role: mockSupabaseUser.role,
          tier: mockSupabaseUser.tier,
        })
      );
    });

    it('should handle malformed JWT payload gracefully', async () => {
      // Arrange
      const malformedPayload = {
        sub: 'test-user-id',
        // Missing required fields
      };

      // Act & Assert
      await expect(strategy.validate(malformedPayload as any)).rejects.toThrow(
        UnauthorizedException
      );
    });
  });
});
