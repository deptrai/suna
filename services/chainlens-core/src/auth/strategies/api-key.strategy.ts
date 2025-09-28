import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-custom';
import { Request } from 'express';
import { AuthService } from '../auth.service';
import { UserService } from '../services/user.service';
import { UserContext } from '../interfaces/user-context.interface';

@Injectable()
export class ApiKeyStrategy extends PassportStrategy(Strategy, 'api-key') {
  private readonly logger = new Logger(ApiKeyStrategy.name);

  constructor(
    private authService: AuthService,
    private userService: UserService,
  ) {
    super();
  }

  async validate(req: Request): Promise<UserContext> {
    this.logger.debug('API Key authentication attempt', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path,
      method: req.method,
    });

    // Extract API key from headers
    const apiKey = this.extractApiKey(req);
    if (!apiKey) {
      this.logger.warn('API key not provided', {
        ip: req.ip,
        path: req.path,
      });
      throw new UnauthorizedException('API key required');
    }

    try {
      // Validate API key format
      if (!this.isValidApiKeyFormat(apiKey)) {
        this.logger.warn('Invalid API key format', {
          ip: req.ip,
          path: req.path,
          keyPrefix: apiKey.substring(0, 8) + '...',
        });
        throw new UnauthorizedException('Invalid API key format');
      }

      // Validate API key and get user context
      const userContext = await this.validateApiKey(apiKey);

      this.logger.debug('API key authentication successful', {
        userId: userContext.sub,
        tier: userContext.tier,
        role: userContext.role,
        path: req.path,
      });

      return userContext;
    } catch (error) {
      this.logger.error('API key authentication failed', {
        error: error.message,
        ip: req.ip,
        path: req.path,
        keyPrefix: apiKey ? apiKey.substring(0, 8) + '...' : 'none',
      });

      if (error instanceof UnauthorizedException) {
        throw error;
      }

      throw new UnauthorizedException('Invalid API key');
    }
  }

  private extractApiKey(req: Request): string | null {
    // Check Authorization header: "Bearer sk-chainlens-..."
    const authHeader = req.get('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      if (token.startsWith('sk-chainlens-')) {
        return token;
      }
    }

    // Check X-API-Key header
    const apiKeyHeader = req.get('X-API-Key');
    if (apiKeyHeader && apiKeyHeader.startsWith('sk-chainlens-')) {
      return apiKeyHeader;
    }

    // Check query parameter (less secure, for testing only)
    const queryApiKey = req.query.api_key as string;
    if (queryApiKey && queryApiKey.startsWith('sk-chainlens-')) {
      return queryApiKey;
    }

    return null;
  }

  private isValidApiKeyFormat(apiKey: string): boolean {
    // API key format: sk-chainlens-{40-char-hex}
    const apiKeyRegex = /^sk-chainlens-[a-f0-9]{40}$/;
    return apiKeyRegex.test(apiKey);
  }

  private async validateApiKey(apiKey: string): Promise<UserContext> {
    // Extract key ID from API key
    const keyId = apiKey.replace('sk-chainlens-', '');

    // For now, we'll use a simple mapping for testing
    // In production, this would query a database
    const apiKeyData = await this.getApiKeyData(keyId);

    if (!apiKeyData) {
      throw new UnauthorizedException('API key not found');
    }

    if (!apiKeyData.active) {
      throw new UnauthorizedException('API key is disabled');
    }

    if (apiKeyData.expiresAt && new Date() > apiKeyData.expiresAt) {
      throw new UnauthorizedException('API key has expired');
    }

    // Get user information (mock data for testing)
    const user = await this.getMockUserData(apiKeyData.userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Create user context
    const userContext: UserContext = {
      sub: user.id,
      email: user.email,
      role: user.role,
      tier: user.tier,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60), // 24 hours
      aud: 'chainlens-services',
      iss: 'chainlens-core',
      apiKey: true, // Flag to indicate API key authentication
      keyId: keyId,
    };

    // Update last used timestamp
    await this.updateApiKeyLastUsed(keyId);

    return userContext;
  }

  private async getApiKeyData(keyId: string): Promise<any> {
    // Mock API key data for testing
    // In production, this would query the database
    const mockApiKeys = {
      // Enterprise user API key
      'a1b2c3d4e5f6789012345678901234567890abcd': {
        id: 'a1b2c3d4e5f6789012345678901234567890abcd',
        userId: 'enterprise-user-123',
        name: 'Enterprise API Key',
        active: true,
        createdAt: new Date('2024-01-01'),
        lastUsedAt: null,
        expiresAt: null, // No expiration
      },
      // Pro user API key
      'b2c3d4e5f6789012345678901234567890abcdef': {
        id: 'b2c3d4e5f6789012345678901234567890abcdef',
        userId: 'pro-user-123',
        name: 'Pro API Key',
        active: true,
        createdAt: new Date('2024-01-01'),
        lastUsedAt: null,
        expiresAt: new Date('2025-12-31'), // Expires end of 2025
      },
      // Disabled API key
      'c3d4e5f6789012345678901234567890abcdef12': {
        id: 'c3d4e5f6789012345678901234567890abcdef12',
        userId: 'test-user-123',
        name: 'Disabled API Key',
        active: false,
        createdAt: new Date('2024-01-01'),
        lastUsedAt: null,
        expiresAt: null,
      },
    };

    return mockApiKeys[keyId] || null;
  }

  private async updateApiKeyLastUsed(keyId: string): Promise<void> {
    // In production, this would update the database
    this.logger.debug('Updated API key last used timestamp', { keyId });
  }

  private async getMockUserData(userId: string): Promise<any> {
    // Mock user data for testing API keys
    const mockUsers = {
      'enterprise-user-123': {
        id: 'enterprise-user-123',
        email: 'enterprise@chainlens.com',
        role: 'user',
        tier: 'enterprise',
        created_at: new Date('2024-01-01'),
        updated_at: new Date('2024-01-01'),
      },
      'pro-user-123': {
        id: 'pro-user-123',
        email: 'pro@chainlens.com',
        role: 'user',
        tier: 'pro',
        created_at: new Date('2024-01-01'),
        updated_at: new Date('2024-01-01'),
      },
      'test-user-123': {
        id: 'test-user-123',
        email: 'test@chainlens.com',
        role: 'user',
        tier: 'free',
        created_at: new Date('2024-01-01'),
        updated_at: new Date('2024-01-01'),
      },
    };

    return mockUsers[userId] || null;
  }
}
