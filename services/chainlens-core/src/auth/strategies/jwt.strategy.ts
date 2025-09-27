import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { JWT_CONSTANTS, JwtPayload, UserContext } from '../constants/jwt.constants';
import { LoggerService } from '../../common/services/logger.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  private supabase: SupabaseClient;

  constructor(
    private configService: ConfigService,
    private logger: LoggerService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET', JWT_CONSTANTS.SECRET),
      algorithms: ['HS256'],
    });

    // Initialize Supabase client
    this.supabase = createClient(
      configService.get<string>('SUPABASE_URL', JWT_CONSTANTS.SUPABASE_URL),
      configService.get<string>('SUPABASE_ANON_KEY', JWT_CONSTANTS.SUPABASE_ANON_KEY),
    );
  }

  async validate(payload: JwtPayload): Promise<UserContext> {
    try {
      this.logger.debug('Validating JWT payload', { userId: payload.sub });

      // Validate payload structure
      if (!payload.sub || !payload.email) {
        this.logger.warn('Invalid JWT payload structure', { payload });
        throw new UnauthorizedException('Invalid token payload');
      }

      // For development, we'll create a mock user context
      // In production, verify user exists in Supabase
      const role = payload.role || JWT_CONSTANTS.ROLES.FREE;
      const tier = payload.tier || 'free';

      // Get rate limit configuration for user tier
      const rateLimit = JWT_CONSTANTS.RATE_LIMITS[tier.toUpperCase() as keyof typeof JWT_CONSTANTS.RATE_LIMITS]
        || JWT_CONSTANTS.RATE_LIMITS.FREE;

      const userContext: UserContext = {
        id: payload.sub,
        email: payload.email,
        role,
        tier,
        rateLimit,
      };

      this.logger.debug('JWT validation successful', {
        userId: userContext.id,
        role: userContext.role,
        tier: userContext.tier
      });

      return userContext;
    } catch (error) {
      this.logger.error('JWT validation failed', error.stack, 'JwtStrategy', { userId: payload.sub });

      if (error instanceof UnauthorizedException) {
        throw error;
      }

      throw new UnauthorizedException('Token validation failed');
    }
  }

  /**
   * Alternative validation for API keys (Enterprise users)
   */
  async validateApiKey(apiKey: string): Promise<UserContext | null> {
    try {
      this.logger.debug('Validating API key');

      // For development, create mock API key validation
      // In production, query Supabase for API key
      if (apiKey === 'test-api-key-enterprise') {
        const userContext: UserContext = {
          id: 'api-user-1',
          email: 'enterprise@chainlens.com',
          role: JWT_CONSTANTS.ROLES.ENTERPRISE,
          tier: 'enterprise',
          rateLimit: JWT_CONSTANTS.RATE_LIMITS.ENTERPRISE,
        };

        this.logger.debug('API key validation successful', {
          userId: userContext.id,
          tier: userContext.tier
        });

        return userContext;
      }

      this.logger.warn('Invalid API key');
      return null;
    } catch (error) {
      this.logger.error('API key validation failed', error);
      return null;
    }
  }
}
