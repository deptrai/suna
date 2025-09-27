import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { AuthTestController } from './controllers/auth-test.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
// import { SupabaseStrategy } from './strategies/supabase.strategy';
// import { ApiKeyStrategy } from './strategies/api-key.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { ApiKeyAuthGuard } from './guards/api-key-auth.guard';
import { JWT_CONSTANTS } from './constants/jwt.constants';
import { LoggerModule } from '../common/logger/logger.module';
import { SupabaseService } from './services/supabase.service';
import supabaseConfig from '../config/supabase.config';

@Module({
  imports: [
    LoggerModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET', JWT_CONSTANTS.SECRET),
        signOptions: {
          expiresIn: configService.get<string>('JWT_EXPIRES_IN', JWT_CONSTANTS.EXPIRES_IN),
          issuer: 'chainlens-core',
          audience: 'chainlens-services',
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController, AuthTestController],
  providers: [
    AuthService,
    SupabaseService,
    JwtStrategy,
    // SupabaseStrategy,
    // ApiKeyStrategy,
    JwtAuthGuard,
    ApiKeyAuthGuard,
  ],
  exports: [
    AuthService,
    SupabaseService,
    JwtStrategy,
    JwtAuthGuard,
    ApiKeyAuthGuard,
    PassportModule,
    JwtModule,
  ],
})
export class AuthModule {}
