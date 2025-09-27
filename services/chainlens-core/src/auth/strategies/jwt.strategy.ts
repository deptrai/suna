import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { JWT_CONSTANTS, JwtPayload, UserContext } from '../constants/jwt.constants';
import { LoggerService } from '../../common/services/logger.service';
import { SupabaseService } from '../services/supabase.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private configService: ConfigService,
    private logger: LoggerService,
    private supabaseService: SupabaseService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET', JWT_CONSTANTS.SECRET),
      algorithms: ['HS256'],
    });
  }

  async validate(payload: JwtPayload): Promise<UserContext> {
    try {
      this.logger.debug('Validating JWT payload', { userId: payload.sub });

      // Validate payload structure
      if (!payload.sub || !payload.email) {
        this.logger.warn('Invalid JWT payload structure', { payload });
        throw new UnauthorizedException('Invalid token payload');
      }

      // Try to get user from Supabase for enhanced validation
      let supabaseUser = null;
      try {
        supabaseUser = await this.supabaseService.getUserProfile(payload.sub);
      } catch (error) {
        this.logger.debug('Could not fetch Supabase user profile, using JWT payload', {
          userId: payload.sub,
          error: error.message
        });
      }

      // Use Supabase data if available, otherwise fall back to JWT payload
      const role = supabaseUser?.role || payload.role || JWT_CONSTANTS.ROLES.FREE;
      const tier = supabaseUser?.tier || payload.tier || 'free';

      // Get rate limit configuration for user tier
      const rateLimit = JWT_CONSTANTS.RATE_LIMITS[tier.toUpperCase() as keyof typeof JWT_CONSTANTS.RATE_LIMITS]
        || JWT_CONSTANTS.RATE_LIMITS.FREE;

      const userContext: UserContext = {
        id: payload.sub,
        email: payload.email,
        role,
        tier,
        rateLimit,
        metadata: supabaseUser || {},
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
