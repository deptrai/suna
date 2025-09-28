import {
  Controller,
  Get,
  Post,
  Delete,
  Put,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { ApiKeyAuthGuard } from '../guards/api-key-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { RequireAccess } from '../decorators/require-permissions.decorator';
import { CurrentUser } from '../decorators/current-user.decorator';
import { ApiKeyService, CreateApiKeyDto } from '../services/api-key.service';
import { UserContext } from '../interfaces/user-context.interface';

@ApiTags('API Keys')
@Controller('api-keys')
@ApiBearerAuth()
export class ApiKeyController {
  constructor(private apiKeyService: ApiKeyService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequireAccess({ minimumTier: 'pro' })
  @ApiOperation({ summary: 'Generate a new API key' })
  @ApiResponse({ status: 201, description: 'API key generated successfully' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async generateApiKey(
    @CurrentUser() user: UserContext,
    @Body() createApiKeyDto: Omit<CreateApiKeyDto, 'userId'>,
  ) {
    const result = await this.apiKeyService.generateApiKey({
      ...createApiKeyDto,
      userId: user.sub,
    });

    return {
      success: true,
      data: {
        apiKey: result.apiKey,
        keyData: {
          id: result.keyData.id,
          name: result.keyData.name,
          keyPrefix: result.keyData.keyPrefix,
          permissions: result.keyData.permissions,
          createdAt: result.keyData.createdAt,
          expiresAt: result.keyData.expiresAt,
        },
        message: 'API key generated successfully. Store this key securely - it will not be shown again.',
      },
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0',
      },
    };
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequireAccess({ minimumTier: 'pro' })
  @ApiOperation({ summary: 'List user API keys' })
  @ApiResponse({ status: 200, description: 'API keys retrieved successfully' })
  async listApiKeys(@CurrentUser() user: UserContext) {
    const apiKeys = await this.apiKeyService.listApiKeys(user.sub);

    return {
      success: true,
      data: {
        apiKeys: apiKeys.map(key => ({
          id: key.id,
          name: key.name,
          keyPrefix: key.keyPrefix,
          permissions: key.permissions,
          active: key.active,
          createdAt: key.createdAt,
          lastUsedAt: key.lastUsedAt,
          expiresAt: key.expiresAt,
        })),
        total: apiKeys.length,
      },
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0',
      },
    };
  }

  @Delete(':keyId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequireAccess({ minimumTier: 'pro' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke an API key' })
  @ApiResponse({ status: 204, description: 'API key revoked successfully' })
  @ApiResponse({ status: 404, description: 'API key not found' })
  async revokeApiKey(
    @CurrentUser() user: UserContext,
    @Param('keyId') keyId: string,
  ) {
    await this.apiKeyService.revokeApiKey(user.sub, keyId);
  }

  @Put(':keyId/rotate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequireAccess({ minimumTier: 'pro' })
  @ApiOperation({ summary: 'Rotate an API key' })
  @ApiResponse({ status: 200, description: 'API key rotated successfully' })
  @ApiResponse({ status: 404, description: 'API key not found' })
  async rotateApiKey(
    @CurrentUser() user: UserContext,
    @Param('keyId') keyId: string,
    @Body() body: { name?: string },
  ) {
    const result = await this.apiKeyService.rotateApiKey(user.sub, keyId, body.name);

    return {
      success: true,
      data: {
        apiKey: result.apiKey,
        keyData: {
          id: result.keyData.id,
          name: result.keyData.name,
          keyPrefix: result.keyData.keyPrefix,
          permissions: result.keyData.permissions,
          createdAt: result.keyData.createdAt,
          expiresAt: result.keyData.expiresAt,
        },
        message: 'API key rotated successfully. Store this new key securely - it will not be shown again.',
      },
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0',
      },
    };
  }

  @Get('test')
  @UseGuards(ApiKeyAuthGuard)
  @ApiOperation({ summary: 'Test API key authentication' })
  @ApiResponse({ status: 200, description: 'API key authentication successful' })
  @ApiResponse({ status: 401, description: 'Invalid API key' })
  async testApiKey(@CurrentUser() user: UserContext) {
    return {
      success: true,
      data: {
        message: 'API key authentication successful',
        user: {
          id: user.sub,
          email: user.email,
          role: user.role,
          tier: user.tier,
          apiKey: user.apiKey,
          keyId: user.keyId,
        },
        timestamp: new Date().toISOString(),
      },
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0',
      },
    };
  }
}
