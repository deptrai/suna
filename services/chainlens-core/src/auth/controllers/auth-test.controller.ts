import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { ApiKeyAuthGuard } from '../guards/api-key-auth.guard';
import { Public } from '../decorators/public.decorator';
import { Roles } from '../decorators/roles.decorator';
import { User } from '../decorators/user.decorator';
import { UserContext, JWT_CONSTANTS } from '../constants/jwt.constants';
import { LoggerService } from '../../common/services/logger.service';

@ApiTags('Authentication')
@Controller('auth')
export class AuthTestController {
  constructor(
    private jwtService: JwtService,
    private logger: LoggerService,
  ) {}

  @Public()
  @Post('test-token')
  @ApiOperation({ summary: 'Generate test JWT token for development' })
  @ApiResponse({ status: 200, description: 'Test token generated successfully' })
  async generateTestToken(@Body() body: { email?: string; tier?: string; role?: string }) {
    const payload = {
      sub: 'test-user-123',
      email: body.email || 'test@chainlens.com',
      role: body.role || JWT_CONSTANTS.ROLES.FREE,
      tier: body.tier || 'free',
      iat: Math.floor(Date.now() / 1000),
    };

    const token = this.jwtService.sign(payload);

    this.logger.debug('Test token generated', { 
      userId: payload.sub, 
      email: payload.email,
      tier: payload.tier 
    });

    return {
      access_token: token,
      token_type: 'Bearer',
      expires_in: JWT_CONSTANTS.EXPIRES_IN,
      user: payload,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'User profile retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getProfile(@User() user: UserContext) {
    this.logger.debug('Profile accessed', { userId: user.id });

    return {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        tier: user.tier,
        rateLimit: user.rateLimit,
      },
      message: 'Profile retrieved successfully',
    };
  }

  @UseGuards(JwtAuthGuard)
  @Roles(JWT_CONSTANTS.ROLES.PRO, JWT_CONSTANTS.ROLES.ENTERPRISE)
  @Get('premium')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Premium endpoint (Pro/Enterprise only)' })
  @ApiResponse({ status: 200, description: 'Premium content accessed' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async getPremiumContent(@User() user: UserContext) {
    this.logger.debug('Premium content accessed', { 
      userId: user.id, 
      tier: user.tier 
    });

    return {
      message: 'Welcome to premium content!',
      tier: user.tier,
      features: user.tier === 'enterprise' 
        ? ['Advanced Analytics', 'API Access', 'Priority Support', 'Custom Reports']
        : ['Advanced Analytics', 'Priority Support'],
    };
  }

  @UseGuards(ApiKeyAuthGuard)
  @Get('api-key-test')
  @ApiOperation({ summary: 'Test API key authentication' })
  @ApiResponse({ status: 200, description: 'API key authentication successful' })
  @ApiResponse({ status: 401, description: 'Invalid API key' })
  async testApiKey(@User() user: UserContext) {
    this.logger.debug('API key test accessed', { 
      userId: user.id, 
      tier: user.tier 
    });

    return {
      message: 'API key authentication successful',
      user: {
        id: user.id,
        email: user.email,
        tier: user.tier,
        rateLimit: user.rateLimit,
      },
    };
  }

  @Public()
  @Get('public')
  @ApiOperation({ summary: 'Public endpoint (no authentication required)' })
  @ApiResponse({ status: 200, description: 'Public content accessed' })
  async getPublicContent() {
    return {
      message: 'This is public content, no authentication required',
      timestamp: new Date().toISOString(),
    };
  }
}
