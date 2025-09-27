export const JWT_CONSTANTS = {
  // JWT Configuration
  SECRET: process.env.JWT_SECRET || 'chainlens-core-jwt-secret-key-development',
  EXPIRES_IN: process.env.JWT_EXPIRES_IN || '24h',
  REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  
  // Supabase Configuration
  SUPABASE_URL: process.env.SUPABASE_URL || 'https://your-project.supabase.co',
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || 'your-anon-key',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || 'your-service-role-key',
  
  // Rate Limiting by User Tier
  RATE_LIMITS: {
    FREE: {
      requests: 10,
      window: 3600, // 1 hour in seconds
    },
    PRO: {
      requests: 100,
      window: 3600, // 1 hour in seconds
    },
    ENTERPRISE: {
      requests: 1000,
      window: 3600, // 1 hour in seconds (effectively unlimited)
    },
  },
  
  // User Roles
  ROLES: {
    FREE: 'free',
    PRO: 'pro',
    ENTERPRISE: 'enterprise',
    ADMIN: 'admin',
  },
  
  // JWT Claims
  CLAIMS: {
    USER_ID: 'sub',
    EMAIL: 'email',
    ROLE: 'role',
    TIER: 'tier',
    ISSUED_AT: 'iat',
    EXPIRES_AT: 'exp',
  },
} as const;

export type UserRole = typeof JWT_CONSTANTS.ROLES[keyof typeof JWT_CONSTANTS.ROLES];
export type UserTier = 'free' | 'pro' | 'enterprise';

export interface JwtPayload {
  sub: string; // User ID
  email: string;
  role: UserRole;
  tier: UserTier;
  iat?: number;
  exp?: number;
}

export interface UserContext {
  id: string;
  email: string;
  role: UserRole;
  tier: UserTier;
  rateLimit: {
    requests: number;
    window: number;
  };
}
