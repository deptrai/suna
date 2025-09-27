import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from './supabase.service';
import { LoggerService } from '../../common/services/logger.service';

export interface CreateUserDto {
  email: string;
  password: string;
  role?: 'free' | 'pro' | 'enterprise';
  tier?: 'free' | 'pro' | 'enterprise';
  metadata?: any;
}

export interface UpdateUserDto {
  role?: 'free' | 'pro' | 'enterprise';
  tier?: 'free' | 'pro' | 'enterprise';
  metadata?: any;
  isActive?: boolean;
}

export interface UserProfile {
  id: string;
  email: string;
  role: string;
  tier: string;
  isActive: boolean;
  metadata?: any;
  created_at: string;
  updated_at: string;
  last_sign_in_at?: string;
}

@Injectable()
export class UserService {
  constructor(
    private supabaseService: SupabaseService,
    private configService: ConfigService,
    private logger: LoggerService,
  ) {}

  /**
   * Create a new user with Supabase
   */
  async createUser(createUserDto: CreateUserDto): Promise<UserProfile> {
    try {
      this.logger.debug('Creating new user', { email: createUserDto.email });

      // Check if user already exists
      const existingUser = await this.supabaseService.getUserByEmail(createUserDto.email);
      if (existingUser) {
        throw new ConflictException('User already exists');
      }

      // Create user in Supabase
      const authResponse = await this.supabaseService.createUser(
        createUserDto.email,
        createUserDto.password,
        {
          role: createUserDto.role || 'free',
          tier: createUserDto.tier || 'free',
          metadata: createUserDto.metadata || {},
        }
      );

      if (authResponse.error || !authResponse.user) {
        this.logger.error('Failed to create user in Supabase', authResponse.error?.message || 'Unknown error', 'UserService', { email: createUserDto.email });
        throw new BadRequestException('Failed to create user');
      }

      this.logger.log('User created successfully', { userId: authResponse.user.id, email: authResponse.user.email });

      return {
        id: authResponse.user.id,
        email: authResponse.user.email,
        role: authResponse.user.role,
        tier: authResponse.user.tier,
        isActive: true,
        metadata: authResponse.user.metadata,
        created_at: authResponse.user.created_at,
        updated_at: authResponse.user.updated_at,
      };
    } catch (error) {
      if (error instanceof ConflictException || error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error('Error creating user', error.stack, 'UserService', { email: createUserDto.email });
      throw new BadRequestException('Failed to create user');
    }
  }

  /**
   * Get user profile by ID
   */
  async getUserById(userId: string): Promise<UserProfile> {
    try {
      this.logger.debug('Getting user by ID', { userId });

      const user = await this.supabaseService.getUserProfile(userId);
      if (!user) {
        throw new NotFoundException('User not found');
      }

      return {
        id: user.id,
        email: user.email,
        role: user.role || 'free',
        tier: user.tier || 'free',
        isActive: user.is_active !== false,
        metadata: user.metadata || {},
        created_at: user.created_at,
        updated_at: user.updated_at,
        last_sign_in_at: user.last_sign_in_at,
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error('Error getting user by ID', error.stack, 'UserService', { userId });
      throw new NotFoundException('User not found');
    }
  }

  /**
   * Get user profile by email
   */
  async getUserByEmail(email: string): Promise<UserProfile | null> {
    try {
      this.logger.debug('Getting user by email', { email });

      const user = await this.supabaseService.getUserByEmail(email);
      if (!user) {
        return null;
      }

      return {
        id: user.id,
        email: user.email,
        role: user.role || 'free',
        tier: user.tier || 'free',
        isActive: true, // Default to active if not specified
        metadata: user.metadata || {},
        created_at: user.created_at,
        updated_at: user.updated_at,
      };
    } catch (error) {
      this.logger.error('Error getting user by email', error.stack, 'UserService', { email });
      return null;
    }
  }

  /**
   * Update user profile
   */
  async updateUser(userId: string, updateUserDto: UpdateUserDto): Promise<UserProfile> {
    try {
      this.logger.debug('Updating user', { userId, updates: Object.keys(updateUserDto) });

      // Get current user to ensure they exist
      const currentUser = await this.getUserById(userId);
      if (!currentUser) {
        throw new NotFoundException('User not found');
      }

      // Prepare update data
      const updateData = {
        role: updateUserDto.role || currentUser.role,
        tier: updateUserDto.tier || currentUser.tier,
        metadata: updateUserDto.metadata || currentUser.metadata,
        is_active: updateUserDto.isActive !== undefined ? updateUserDto.isActive : currentUser.isActive,
        updated_at: new Date().toISOString(),
      };

      // Update user profile in Supabase
      const updatedUser = await this.supabaseService.upsertUserProfile(userId, updateData);

      this.logger.log('User updated successfully', { userId, updatedFields: Object.keys(updateUserDto) });

      return {
        id: updatedUser.id,
        email: updatedUser.email || currentUser.email,
        role: updatedUser.role,
        tier: updatedUser.tier,
        isActive: updatedUser.is_active,
        metadata: updatedUser.metadata,
        created_at: updatedUser.created_at || currentUser.created_at,
        updated_at: updatedUser.updated_at,
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error('Error updating user', error.stack, 'UserService', { userId });
      throw new BadRequestException('Failed to update user');
    }
  }

  /**
   * Deactivate user (soft delete)
   */
  async deactivateUser(userId: string): Promise<void> {
    try {
      this.logger.debug('Deactivating user', { userId });

      await this.updateUser(userId, { isActive: false });

      this.logger.log('User deactivated successfully', { userId });
    } catch (error) {
      this.logger.error('Error deactivating user', error.stack, 'UserService', { userId });
      throw new BadRequestException('Failed to deactivate user');
    }
  }

  /**
   * Activate user
   */
  async activateUser(userId: string): Promise<void> {
    try {
      this.logger.debug('Activating user', { userId });

      await this.updateUser(userId, { isActive: true });

      this.logger.log('User activated successfully', { userId });
    } catch (error) {
      this.logger.error('Error activating user', error.stack, 'UserService', { userId });
      throw new BadRequestException('Failed to activate user');
    }
  }

  /**
   * Upgrade user tier
   */
  async upgradeUserTier(userId: string, newTier: 'pro' | 'enterprise'): Promise<UserProfile> {
    try {
      this.logger.debug('Upgrading user tier', { userId, newTier });

      const updatedUser = await this.updateUser(userId, { 
        tier: newTier,
        role: newTier, // Sync role with tier
      });

      this.logger.log('User tier upgraded successfully', { userId, newTier });

      return updatedUser;
    } catch (error) {
      this.logger.error('Error upgrading user tier', error.stack, 'UserService', { userId, newTier });
      throw new BadRequestException('Failed to upgrade user tier');
    }
  }

  /**
   * Downgrade user tier
   */
  async downgradeUserTier(userId: string): Promise<UserProfile> {
    try {
      this.logger.debug('Downgrading user tier', { userId });

      const updatedUser = await this.updateUser(userId, { 
        tier: 'free',
        role: 'free',
      });

      this.logger.log('User tier downgraded successfully', { userId });

      return updatedUser;
    } catch (error) {
      this.logger.error('Error downgrading user tier', error.stack, 'UserService', { userId });
      throw new BadRequestException('Failed to downgrade user tier');
    }
  }

  /**
   * Check if Supabase service is healthy
   */
  async isHealthy(): Promise<boolean> {
    try {
      // Simple check - try to get Supabase client
      const client = this.supabaseService.getClient();
      return !!client;
    } catch (error) {
      this.logger.error('UserService health check failed', error.stack, 'UserService');
      return false;
    }
  }
}
