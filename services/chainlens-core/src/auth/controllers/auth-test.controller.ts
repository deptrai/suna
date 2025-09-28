import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { ApiKeyAuthGuard } from '../guards/api-key-auth.guard';
import { Public } from '../decorators/public.decorator';
import { Roles } from '../decorators/roles.decorator';
import { User } from '../decorators/user.decorator';
import { CurrentUser } from '../decorators/current-user.decorator';
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

  // ===== RBAC TEST ENDPOINTS =====

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('pro', 'enterprise', 'admin')
  @Get('pro-only')
  @ApiOperation({ summary: 'Pro tier and above only' })
  @ApiResponse({ status: 200, description: 'Pro content accessed' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async getProContent(@CurrentUser() user: UserContext) {
    return {
      message: 'This content is available for Pro tier and above',
      userTier: user.tier,
      timestamp: new Date().toISOString(),
    };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('enterprise', 'admin')
  @Get('enterprise-only')
  @ApiOperation({ summary: 'Enterprise tier and above only' })
  @ApiResponse({ status: 200, description: 'Enterprise content accessed' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async getEnterpriseContent(@CurrentUser() user: UserContext) {
    return {
      message: 'This content is available for Enterprise tier and above',
      userTier: user.tier,
      timestamp: new Date().toISOString(),
    };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Get('admin-only')
  @ApiOperation({ summary: 'Admin only' })
  @ApiResponse({ status: 200, description: 'Admin content accessed' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async getAdminContent(@CurrentUser() user: UserContext) {
    return {
      message: 'This content is available for Admin only',
      userTier: user.tier,
      timestamp: new Date().toISOString(),
    };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get('user-info')
  @ApiOperation({ summary: 'Get current user information with permissions' })
  @ApiResponse({ status: 200, description: 'User information retrieved' })
  async getUserInfo(@CurrentUser() user: UserContext) {
    return {
      message: 'User information retrieved successfully',
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        tier: user.tier,
        rateLimit: user.rateLimit,
      },
      timestamp: new Date().toISOString(),
    };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get('tier-features')
  @ApiOperation({ summary: 'Get available features for current tier' })
  @ApiResponse({ status: 200, description: 'Tier features retrieved' })
  async getTierFeatures(@CurrentUser() user: UserContext) {
    // This would normally call UserService.getUserTierInfo()
    const tierFeatures = {
      free: ['basic_dashboard', 'csv_export', 'basic_analysis'],
      pro: ['advanced_dashboard', 'csv_export', 'pdf_export', 'alerts', 'historical_data'],
      enterprise: ['custom_dashboard', 'all_exports', 'team_collaboration', 'api_access', 'webhooks'],
      admin: ['admin_dashboard', 'system_monitoring', 'user_management', 'all_features'],
    };

    return {
      message: 'Tier features retrieved successfully',
      currentTier: user.tier,
      availableFeatures: tierFeatures[user.tier] || tierFeatures.free,
      timestamp: new Date().toISOString(),
    };
  }
}
