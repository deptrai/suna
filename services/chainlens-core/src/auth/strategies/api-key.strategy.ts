import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-custom';
import { Request } from 'express';
import { AuthService, User } from '../auth.service';

@Injectable()
export class ApiKeyStrategy extends PassportStrategy(Strategy, 'api-key') {
  constructor(private authService: AuthService) {
    super();
  }

  async validate(req: Request): Promise<User> {
    try {
      // Extract API key from header
      const apiKey = this.extractApiKey(req);
      
      if (!apiKey) {
        throw new UnauthorizedException('API key required');
      }

      // Validate API key
      const user = await this.authService.validateApiKey(apiKey);
      
      if (!user) {
        throw new UnauthorizedException('Invalid API key');
      }

      return user;
    } catch (error) {
      throw new UnauthorizedException('API key validation failed');
    }
  }

  private extractApiKey(req: Request): string | null {
    // Check Authorization header with Bearer scheme
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      // Check if it's an API key (starts with cl_)
      if (token.startsWith('cl_')) {
        return token;
      }
    }

    // Check X-API-Key header
    const apiKeyHeader = req.headers['x-api-key'] as string;
    if (apiKeyHeader) {
      return apiKeyHeader;
    }

    // Check query parameter (less secure, for development only)
    const apiKeyQuery = req.query.api_key as string;
    if (apiKeyQuery && process.env.NODE_ENV === 'development') {
      return apiKeyQuery;
    }

    return null;
  }
}
