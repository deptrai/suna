import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes, createHash } from 'crypto';
import { UserService } from './user.service';

export interface CreateApiKeyDto {
  name: string;
  userId: string;
  permissions?: string[];
  expiresAt?: Date;
}

export interface ApiKeyData {
  id: string;
  name: string;
  keyPrefix: string; // First 8 chars for display
  userId: string;
  permissions: string[];
  active: boolean;
  createdAt: Date;
  lastUsedAt?: Date;
  expiresAt?: Date;
}

@Injectable()
export class ApiKeyService {
  private readonly logger = new Logger(ApiKeyService.name);

  constructor(
    private userService: UserService,
    private configService: ConfigService,
  ) {}

  /**
   * Generate a new API key for a user
   */
  async generateApiKey(createApiKeyDto: CreateApiKeyDto): Promise<{ apiKey: string; keyData: ApiKeyData }> {
    try {
      this.logger.debug('Generating API key', {
        userId: createApiKeyDto.userId,
        name: createApiKeyDto.name,
      });

      // Verify user exists
      const user = await this.userService.findById(createApiKeyDto.userId);
      if (!user) {
        throw new NotFoundException('User not found');
      }

      // Generate API key
      const keyId = randomBytes(16).toString('hex'); // 32 char hex string
      const apiKey = `sk-chainlens-${keyId}`;
      const keyPrefix = apiKey.substring(0, 16) + '...'; // sk-chainlens-abc...

      // Create key data
      const keyData: ApiKeyData = {
        id: keyId,
        name: createApiKeyDto.name,
        keyPrefix,
        userId: createApiKeyDto.userId,
        permissions: createApiKeyDto.permissions || this.getDefaultPermissions(user.tier),
        active: true,
        createdAt: new Date(),
        lastUsedAt: undefined,
        expiresAt: createApiKeyDto.expiresAt,
      };

      // In production, this would save to database
      await this.saveApiKeyToStorage(keyData);

      this.logger.debug('API key generated successfully', {
        userId: createApiKeyDto.userId,
        keyId,
        keyPrefix,
      });

      return { apiKey, keyData };
    } catch (error) {
      this.logger.error('Failed to generate API key', {
        error: error.message,
        userId: createApiKeyDto.userId,
      });
      throw error;
    }
  }

  /**
   * List API keys for a user
   */
  async listApiKeys(userId: string): Promise<ApiKeyData[]> {
    try {
      this.logger.debug('Listing API keys', { userId });

      // In production, this would query database
      const apiKeys = await this.getApiKeysFromStorage(userId);

      return apiKeys.map(key => ({
        ...key,
        // Don't return the full key, only metadata
      }));
    } catch (error) {
      this.logger.error('Failed to list API keys', {
        error: error.message,
        userId,
      });
      throw error;
    }
  }

  /**
   * Revoke an API key
   */
  async revokeApiKey(userId: string, keyId: string): Promise<void> {
    try {
      this.logger.debug('Revoking API key', { userId, keyId });

      // Verify user owns the key
      const apiKey = await this.getApiKeyFromStorage(keyId);
      if (!apiKey || apiKey.userId !== userId) {
        throw new NotFoundException('API key not found');
      }

      // Mark as inactive
      await this.updateApiKeyStatus(keyId, false);

      this.logger.debug('API key revoked successfully', { userId, keyId });
    } catch (error) {
      this.logger.error('Failed to revoke API key', {
        error: error.message,
        userId,
        keyId,
      });
      throw error;
    }
  }

  /**
   * Rotate an API key (generate new key, revoke old one)
   */
  async rotateApiKey(userId: string, keyId: string, newName?: string): Promise<{ apiKey: string; keyData: ApiKeyData }> {
    try {
      this.logger.debug('Rotating API key', { userId, keyId });

      // Get existing key
      const existingKey = await this.getApiKeyFromStorage(keyId);
      if (!existingKey || existingKey.userId !== userId) {
        throw new NotFoundException('API key not found');
      }

      // Generate new key with same permissions
      const newApiKey = await this.generateApiKey({
        name: newName || `${existingKey.name} (rotated)`,
        userId,
        permissions: existingKey.permissions,
        expiresAt: existingKey.expiresAt,
      });

      // Revoke old key
      await this.updateApiKeyStatus(keyId, false);

      this.logger.debug('API key rotated successfully', {
        userId,
        oldKeyId: keyId,
        newKeyId: newApiKey.keyData.id,
      });

      return newApiKey;
    } catch (error) {
      this.logger.error('Failed to rotate API key', {
        error: error.message,
        userId,
        keyId,
      });
      throw error;
    }
  }

  /**
   * Get default permissions for a user tier
   */
  private getDefaultPermissions(tier: string): string[] {
    const permissionMap = {
      free: ['read:basic'],
      pro: ['read:basic', 'read:advanced', 'write:basic'],
      enterprise: ['read:basic', 'read:advanced', 'write:basic', 'write:advanced', 'admin:basic'],
      admin: ['*'], // All permissions
    };

    return permissionMap[tier] || permissionMap.free;
  }

  /**
   * Mock storage methods - in production these would use database
   */
  private async saveApiKeyToStorage(keyData: ApiKeyData): Promise<void> {
    // Mock implementation - in production would save to database
    this.logger.debug('Saving API key to storage', { keyId: keyData.id });
  }

  private async getApiKeysFromStorage(userId: string): Promise<ApiKeyData[]> {
    // Mock implementation - in production would query database
    return [];
  }

  private async getApiKeyFromStorage(keyId: string): Promise<ApiKeyData | null> {
    // Mock implementation - in production would query database
    return null;
  }

  private async updateApiKeyStatus(keyId: string, active: boolean): Promise<void> {
    // Mock implementation - in production would update database
    this.logger.debug('Updating API key status', { keyId, active });
  }
}
