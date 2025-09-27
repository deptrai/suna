import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService, User } from '../auth.service';

@Injectable()
export class SupabaseStrategy extends PassportStrategy(Strategy, 'supabase') {
  constructor(
    private configService: ConfigService,
    private authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('SUPABASE_JWT_SECRET'),
      issuer: configService.get<string>('SUPABASE_URL'),
    });
  }

  async validate(payload: any): Promise<User> {
    try {
      // Extract token from request
      const token = ExtractJwt.fromAuthHeaderAsBearerToken();
      
      // Validate with Supabase
      const user = await this.authService.validateSupabaseToken(payload.token || payload);
      
      if (!user) {
        throw new UnauthorizedException('Invalid user');
      }

      return user;
    } catch (error) {
      throw new UnauthorizedException('Token validation failed');
    }
  }
}
