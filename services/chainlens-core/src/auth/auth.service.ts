import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { LoggerService } from '../common/services/logger.service';

export interface User {
  id: string;
  email: string;
  tier: 'free' | 'pro' | 'enterprise';
  permissions: string[];
  metadata?: any;
}

export interface JWTPayload {
  sub: string;
  email: string;
  tier: 'free' | 'pro' | 'enterprise';
  permissions: string[];
  iat: number;
  exp: number;
  iss: string;
  aud: string;
}

@Injectable()
export class AuthService {
  private supabase: SupabaseClient;

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    private logger: LoggerService,
  ) {
    // Initialize Supabase client
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_ANON_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase configuration missing');
    }

    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  async validateSupabaseToken(token: string): Promise<User> {
    try {
      // Verify token with Supabase
      const { data: { user }, error } = await this.supabase.auth.getUser(token);
      
      if (error || !user) {
        throw new UnauthorizedException('Invalid Supabase token');
      }

      // Get user profile from database
      const { data: profile, error: profileError } = await this.supabase
        .from('user_profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (profileError) {
        this.logger.warn(`Failed to fetch user profile: ${profileError.message}`, 'AuthService');
        // Create default profile if not exists
        const defaultProfile = {
          id: user.id,
          email: user.email,
          tier: 'free',
          preferences: {},
        };

        const { error: insertError } = await this.supabase
          .from('user_profiles')
          .insert(defaultProfile);

        if (insertError) {
          this.logger.error(`Failed to create user profile: ${insertError.message}`, 'AuthService');
        }

        return {
          id: user.id,
          email: user.email || '',
          tier: 'free',
          permissions: this.getTierPermissions('free'),
        };
      }

      return {
        id: user.id,
        email: user.email || '',
        tier: profile.tier || 'free',
        permissions: this.getTierPermissions(profile.tier || 'free'),
        metadata: profile.preferences,
      };
    } catch (error) {
      this.logger.error('Supabase token validation failed', error.stack, 'AuthService');
      throw new UnauthorizedException('Token validation failed');
    }
  }

  async validateApiKey(apiKey: string): Promise<User> {
    try {
      // Query API keys table
      const { data: keyData, error } = await this.supabase
        .from('api_keys')
        .select(`
          *,
          user_profiles (
            id,
            email,
            tier,
            preferences
          )
        `)
        .eq('key_hash', this.hashApiKey(apiKey))
        .eq('is_active', true)
        .single();

      if (error || !keyData) {
        throw new UnauthorizedException('Invalid API key');
      }

      // Check if key is expired
      if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
        throw new UnauthorizedException('API key expired');
      }

      // Update last used timestamp
      await this.supabase
        .from('api_keys')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', keyData.id);

      const userProfile = keyData.user_profiles;
      
      return {
        id: userProfile.id,
        email: userProfile.email,
        tier: userProfile.tier || 'free',
        permissions: keyData.permissions || this.getTierPermissions(userProfile.tier || 'free'),
        metadata: {
          ...userProfile.preferences,
          apiKeyId: keyData.id,
          apiKeyName: keyData.name,
        },
      };
    } catch (error) {
      this.logger.error('API key validation failed', error.stack, 'AuthService');
      throw new UnauthorizedException('API key validation failed');
    }
  }

  async generateInternalToken(user: User): Promise<string> {
    const payload: JWTPayload = {
      sub: user.id,
      email: user.email,
      tier: user.tier,
      permissions: user.permissions,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour
      iss: 'chainlens-core',
      aud: 'chainlens-services',
    };

    return this.jwtService.sign(payload);
  }

  async validateInternalToken(token: string): Promise<User> {
    try {
      const payload = this.jwtService.verify(token) as JWTPayload;
      
      return {
        id: payload.sub,
        email: payload.email,
        tier: payload.tier,
        permissions: payload.permissions,
      };
    } catch (error) {
      this.logger.error('Internal token validation failed', error.stack, 'AuthService');
      throw new UnauthorizedException('Invalid internal token');
    }
  }

  hasPermission(user: User, requiredPermission: string): boolean {
    return user.permissions.includes(requiredPermission);
  }

  hasAnyPermission(user: User, requiredPermissions: string[]): boolean {
    return requiredPermissions.some(permission => user.permissions.includes(permission));
  }

  hasAllPermissions(user: User, requiredPermissions: string[]): boolean {
    return requiredPermissions.every(permission => user.permissions.includes(permission));
  }

  /**
   * Check if user has required role or higher in hierarchy
   */
  hasRole(user: User, requiredRole: string): boolean {
    const { isHigherRole } = require('./constants/permissions.constants');
    return user.tier === requiredRole || isHigherRole(user.tier, requiredRole);
  }

  /**
   * Check if user has any of the required roles
   */
  hasAnyRole(user: User, requiredRoles: string[]): boolean {
    return requiredRoles.some(role => this.hasRole(user, role));
  }

  /**
   * Check if user tier meets minimum requirement
   */
  hasTierAccess(userTier: string, requiredTier: string): boolean {
    const { PERMISSION_HIERARCHY } = require('./constants/permissions.constants');
    const tierHierarchy = PERMISSION_HIERARCHY.TIER_HIERARCHY;
    const userIndex = tierHierarchy.indexOf(userTier);
    const requiredIndex = tierHierarchy.indexOf(requiredTier);

    return userIndex >= requiredIndex;
  }

  /**
   * Get user's effective permissions based on role and tier
   */
  getUserEffectivePermissions(user: User): string[] {
    const { getRolePermissions } = require('./constants/permissions.constants');
    return getRolePermissions(user.tier);
  }

  checkRateLimit(user: User, resource: string): boolean {
    // Rate limiting logic based on user tier
    const limits = this.getRateLimits(user.tier);
    // Implementation would check against Redis or database
    // For now, return true (no limit exceeded)
    return true;
  }

  private getTierPermissions(tier: string): string[] {
    // Import permission constants
    const { ROLE_PERMISSIONS_COMPLETE, ROLES } = require('./constants/permissions.constants');

    // Map tier to role for permission lookup
    const tierToRole = {
      free: ROLES.FREE,
      pro: ROLES.PRO,
      enterprise: ROLES.ENTERPRISE,
      admin: ROLES.ADMIN,
    };

    const role = tierToRole[tier] || ROLES.FREE;
    return ROLE_PERMISSIONS_COMPLETE[role] || ROLE_PERMISSIONS_COMPLETE[ROLES.FREE];
  }

  private getRateLimits(tier: string): { perMinute: number; perHour: number; perDay: number } {
    const limits = {
      free: { perMinute: 10, perHour: 100, perDay: 1000 },
      pro: { perMinute: 100, perHour: 1000, perDay: 10000 },
      enterprise: { perMinute: 1000, perHour: 10000, perDay: 100000 },
    };

    return limits[tier] || limits.free;
  }

  private hashApiKey(apiKey: string): string {
    // In production, use bcrypt or similar
    // For now, simple hash
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(apiKey).digest('hex');
  }
}
