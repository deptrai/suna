import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { SupabaseStrategy } from './strategies/supabase.strategy';
import { ApiKeyStrategy } from './strategies/api-key.strategy';
import { AuthGuard } from './guards/auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { ApiKeyGuard } from './guards/api-key.guard';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>('JWT_EXPIRES_IN', '1h'),
          issuer: 'chainlens-core',
          audience: 'chainlens-services',
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    SupabaseStrategy,
    ApiKeyStrategy,
    AuthGuard,
    RolesGuard,
    ApiKeyGuard,
  ],
  exports: [
    AuthService,
    AuthGuard,
    RolesGuard,
    ApiKeyGuard,
    PassportModule,
    JwtModule,
  ],
})
export class AuthModule {}
