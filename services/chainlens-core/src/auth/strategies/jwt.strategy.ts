import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService, User, JWTPayload } from '../auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private configService: ConfigService,
    private authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'),
      issuer: 'chainlens-core',
      audience: 'chainlens-services',
    });
  }

  async validate(payload: JWTPayload): Promise<User> {
    try {
      // Validate internal JWT token
      const user: User = {
        id: payload.sub,
        email: payload.email,
        tier: payload.tier,
        permissions: payload.permissions,
      };

      // Additional validation if needed
      if (!user.id || !user.email) {
        throw new UnauthorizedException('Invalid token payload');
      }

      return user;
    } catch (error) {
      throw new UnauthorizedException('Token validation failed');
    }
  }
}
