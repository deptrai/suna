import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient, User, Session } from '@supabase/supabase-js';
import { LoggerService } from '../../common/services/logger.service';

export interface SupabaseUser {
  id: string;
  email: string;
  role: string;
  tier: string;
  metadata?: any;
  created_at: string;
  updated_at: string;
}

export interface AuthResponse {
  user: SupabaseUser | null;
  session: Session | null;
  error?: any;
}

@Injectable()
export class SupabaseService implements OnModuleInit {
  private supabase: SupabaseClient;
  private adminClient: SupabaseClient;

  constructor(
    private configService: ConfigService,
    private logger: LoggerService,
  ) {}

  onModuleInit() {
    const supabaseUrl = this.configService.get<string>('supabase.url');
    const anonKey = this.configService.get<string>('supabase.anonKey');
    const serviceRoleKey = this.configService.get<string>('supabase.serviceRoleKey');

    if (!supabaseUrl || !anonKey) {
      this.logger.warn('Supabase configuration missing, using mock client');
      return;
    }

    // Public client for user operations
    this.supabase = createClient(supabaseUrl, anonKey, {
      auth: {
        autoRefreshToken: this.configService.get<boolean>('supabase.auth.autoRefreshToken', true),
        persistSession: this.configService.get<boolean>('supabase.auth.persistSession', false),
        detectSessionInUrl: this.configService.get<boolean>('supabase.auth.detectSessionInUrl', false),
      },
    });

    // Admin client for administrative operations
    if (serviceRoleKey) {
      this.adminClient = createClient(supabaseUrl, serviceRoleKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });
    }

    this.logger.log('Supabase client initialized successfully');
  }

  /**
   * Get public Supabase client
   */
  getClient(): SupabaseClient {
    return this.supabase;
  }

  /**
   * Get admin Supabase client
   */
  getAdminClient(): SupabaseClient {
    if (!this.adminClient) {
      throw new Error('Admin client not configured');
    }
    return this.adminClient;
  }

  /**
   * Verify JWT token and get user
   */
  async verifyToken(token: string): Promise<SupabaseUser | null> {
    try {
      const { data: { user }, error } = await this.supabase.auth.getUser(token);
      
      if (error || !user) {
        this.logger.debug('Token verification failed', { error: error?.message });
        return null;
      }

      // Get user profile from custom table
      const profile = await this.getUserProfile(user.id);
      
      return {
        id: user.id,
        email: user.email || '',
        role: profile?.role || 'free',
        tier: profile?.tier || 'free',
        metadata: user.user_metadata,
        created_at: user.created_at,
        updated_at: user.updated_at || user.created_at,
      };
    } catch (error) {
      this.logger.error('Error verifying token', error.stack, 'SupabaseService', { token: token.substring(0, 20) + '...' });
      return null;
    }
  }

  /**
   * Get user profile from profiles table
   */
  async getUserProfile(userId: string): Promise<any> {
    try {
      const { data, error } = await this.supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        this.logger.debug('Profile not found, using defaults', { userId, error: error.message });
        return { role: 'free', tier: 'free' };
      }

      return data;
    } catch (error) {
      this.logger.error('Error fetching user profile', error.stack, 'SupabaseService', { userId });
      return { role: 'free', tier: 'free' };
    }
  }

  /**
   * Create or update user profile
   */
  async upsertUserProfile(userId: string, profileData: Partial<SupabaseUser>): Promise<any> {
    try {
      const { data, error } = await this.supabase
        .from('profiles')
        .upsert({
          id: userId,
          ...profileData,
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) {
        this.logger.error('Error upserting user profile', error.stack, 'SupabaseService', { userId });
        throw error;
      }

      this.logger.debug('User profile upserted successfully', { userId });
      return data;
    } catch (error) {
      this.logger.error('Error in upsertUserProfile', error.stack, 'SupabaseService', { userId });
      throw error;
    }
  }

  /**
   * Get user by email (admin operation)
   */
  async getUserByEmail(email: string): Promise<SupabaseUser | null> {
    try {
      if (!this.adminClient) {
        throw new Error('Admin client not available');
      }

      // Note: Supabase doesn't have getUserByEmail, we'll use listUsers and filter
      const { data, error } = await this.adminClient.auth.admin.listUsers();
      
      if (error) {
        this.logger.error('Error getting user by email', error.stack, 'SupabaseService', { email });
        throw error;
      }

      // Find user by email
      const user = data.users.find(u => u.email === email);

      if (!user) {
        return null;
      }

      return {
        id: user.id,
        email: user.email,
        role: user.user_metadata?.role || 'free',
        tier: user.user_metadata?.tier || 'free',
        created_at: user.created_at,
        last_sign_in_at: user.last_sign_in_at,
      };
    } catch (error) {
      this.logger.error('Error getting user by email', error.stack, 'SupabaseService', { email });
      return null;
    }
  }

  /**
   * Create user (admin operation)
   */
  async createUser(email: string, password: string, userData: any = {}): Promise<AuthResponse> {
    try {
      if (!this.adminClient) {
        throw new Error('Admin client not available');
      }

      const { data, error } = await this.adminClient.auth.admin.createUser({
        email,
        password,
        user_metadata: userData,
        email_confirm: true,
      });

      if (error) {
        this.logger.error('Error creating user', error.stack, 'SupabaseService', { email });
        return { user: null, session: null, error };
      }

      // Create profile
      if (data.user) {
        await this.upsertUserProfile(data.user.id, {
          email,
          role: userData.role || 'free',
          tier: userData.tier || 'free',
        });
      }

      this.logger.log('User created successfully', { email, userId: data.user?.id });
      
      return {
        user: data.user ? {
          id: data.user.id,
          email: data.user.email || '',
          role: userData.role || 'free',
          tier: userData.tier || 'free',
          metadata: data.user.user_metadata,
          created_at: data.user.created_at,
          updated_at: data.user.updated_at || data.user.created_at,
        } : null,
        // session: data.session, // Remove session as it's not available in admin API
        error: null,
      };
    } catch (error) {
      this.logger.error('Error in createUser', error.stack, 'SupabaseService', { email });
      return { user: null, error };
    }
  }

  /**
   * Health check for Supabase connection
   */
  async healthCheck(): Promise<boolean> {
    try {
      const { data, error } = await this.supabase
        .from('profiles')
        .select('count')
        .limit(1);

      return !error;
    } catch (error) {
      this.logger.error('Supabase health check failed', error.message);
      return false;
    }
  }
}
