import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { AuthService, User } from './auth.service';
import { AuthGuard } from './guards/auth.guard';
import { Public } from './decorators/public.decorator';
import { GetUser } from './decorators/get-user.decorator';

class TokenValidationDto {
  token: string;
}

class TokenResponse {
  valid: boolean;
  user?: User;
  internalToken?: string;
}

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('validate')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Validate Supabase token and get internal token' })
  @ApiBody({ type: TokenValidationDto })
  @ApiResponse({ 
    status: 200, 
    description: 'Token validation successful',
    type: TokenResponse,
  })
  @ApiResponse({ status: 401, description: 'Invalid token' })
  async validateToken(@Body() body: TokenValidationDto): Promise<TokenResponse> {
    try {
      const user = await this.authService.validateSupabaseToken(body.token);
      const internalToken = await this.authService.generateInternalToken(user);
      
      return {
        valid: true,
        user,
        internalToken,
      };
    } catch (error) {
      return {
        valid: false,
      };
    }
  }

  @Get('me')
  @UseGuards(AuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get current user information' })
  @ApiResponse({ 
    status: 200, 
    description: 'User information retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getCurrentUser(@GetUser() user: User): Promise<User> {
    return user;
  }

  @Post('refresh')
  @UseGuards(AuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh internal token' })
  @ApiResponse({ 
    status: 200, 
    description: 'Token refreshed successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async refreshToken(@GetUser() user: User): Promise<{ token: string }> {
    const token = await this.authService.generateInternalToken(user);
    
    return { token };
  }

  @Get('permissions')
  @UseGuards(AuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get user permissions' })
  @ApiResponse({ 
    status: 200, 
    description: 'Permissions retrieved successfully',
  })
  async getPermissions(@GetUser() user: User): Promise<{
    permissions: string[];
    tier: string;
  }> {
    return {
      permissions: user.permissions,
      tier: user.tier,
    };
  }

  @Post('check-permission')
  @UseGuards(AuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check if user has specific permission' })
  @ApiBody({ 
    schema: {
      type: 'object',
      properties: {
        permission: { type: 'string' },
      },
      required: ['permission'],
    },
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Permission check completed',
  })
  async checkPermission(
    @GetUser() user: User,
    @Body() body: { permission: string },
  ): Promise<{ hasPermission: boolean }> {
    const hasPermission = this.authService.hasPermission(user, body.permission);
    
    return { hasPermission };
  }
}
