/**
 * ChainLens Permission System
 * Comprehensive permission constants for role-based access control
 */

// ===== PERMISSION CATEGORIES =====

export const PERMISSIONS = {
  // === ANALYSIS PERMISSIONS ===
  ANALYSIS: {
    // OnChain Analysis
    ONCHAIN_READ: 'analysis:onchain:read',
    ONCHAIN_CREATE: 'analysis:onchain:create',
    ONCHAIN_ADVANCED: 'analysis:onchain:advanced',
    
    // Sentiment Analysis
    SENTIMENT_READ: 'analysis:sentiment:read',
    SENTIMENT_CREATE: 'analysis:sentiment:create',
    SENTIMENT_ADVANCED: 'analysis:sentiment:advanced',
    
    // Tokenomics Analysis
    TOKENOMICS_READ: 'analysis:tokenomics:read',
    TOKENOMICS_CREATE: 'analysis:tokenomics:create',
    TOKENOMICS_ADVANCED: 'analysis:tokenomics:advanced',
    
    // Team Analysis
    TEAM_READ: 'analysis:team:read',
    TEAM_CREATE: 'analysis:team:create',
    TEAM_ADVANCED: 'analysis:team:advanced',
    
    // Analysis Management
    ANALYSIS_HISTORY: 'analysis:history:read',
    ANALYSIS_EXPORT: 'analysis:export',
    ANALYSIS_SHARE: 'analysis:share',
    ANALYSIS_DELETE: 'analysis:delete',
  },

  // === USER MANAGEMENT PERMISSIONS ===
  USER: {
    // Profile Management
    PROFILE_READ: 'user:profile:read',
    PROFILE_UPDATE: 'user:profile:update',
    PROFILE_DELETE: 'user:profile:delete',
    
    // Account Management
    ACCOUNT_SETTINGS: 'user:account:settings',
    ACCOUNT_BILLING: 'user:account:billing',
    ACCOUNT_SUBSCRIPTION: 'user:account:subscription',
    
    // API Management
    API_KEYS_READ: 'user:api:keys:read',
    API_KEYS_CREATE: 'user:api:keys:create',
    API_KEYS_DELETE: 'user:api:keys:delete',
    API_USAGE_STATS: 'user:api:usage:stats',
  },

  // === ADMINISTRATIVE PERMISSIONS ===
  ADMIN: {
    // User Administration
    USERS_READ: 'admin:users:read',
    USERS_CREATE: 'admin:users:create',
    USERS_UPDATE: 'admin:users:update',
    USERS_DELETE: 'admin:users:delete',
    USERS_IMPERSONATE: 'admin:users:impersonate',
    
    // System Administration
    SYSTEM_HEALTH: 'admin:system:health',
    SYSTEM_METRICS: 'admin:system:metrics',
    SYSTEM_LOGS: 'admin:system:logs',
    SYSTEM_CONFIG: 'admin:system:config',
    
    // Service Management
    SERVICES_RESTART: 'admin:services:restart',
    SERVICES_DEPLOY: 'admin:services:deploy',
    SERVICES_MONITOR: 'admin:services:monitor',
    SYSTEM_MAINTENANCE: 'admin:system:maintenance',
  },

  // === API ACCESS PERMISSIONS ===
  API: {
    // Rate Limiting Tiers
    RATE_LIMIT_FREE: 'api:rate:free',        // 10 requests/hour
    RATE_LIMIT_PRO: 'api:rate:pro',          // 100 requests/hour
    RATE_LIMIT_ENTERPRISE: 'api:rate:enterprise', // 1000 requests/hour
    RATE_LIMIT_UNLIMITED: 'api:rate:unlimited',   // No limits
    
    // API Features
    BATCH_REQUESTS: 'api:batch:requests',
    WEBHOOK_ACCESS: 'api:webhook:access',
    REAL_TIME_DATA: 'api:realtime:data',
    HISTORICAL_DATA: 'api:historical:data',
  },

  // === FEATURE ACCESS PERMISSIONS ===
  FEATURES: {
    // Dashboard Features
    DASHBOARD_BASIC: 'features:dashboard:basic',
    DASHBOARD_ADVANCED: 'features:dashboard:advanced',
    DASHBOARD_CUSTOM: 'features:dashboard:custom',
    
    // Export Features
    EXPORT_CSV: 'features:export:csv',
    EXPORT_PDF: 'features:export:pdf',
    EXPORT_API: 'features:export:api',
    
    // Collaboration Features
    TEAM_SHARING: 'features:team:sharing',
    TEAM_COLLABORATION: 'features:team:collaboration',
    TEAM_MANAGEMENT: 'features:team:management',
    
    // Advanced Features
    CUSTOM_ALERTS: 'features:alerts:custom',
    PORTFOLIO_TRACKING: 'features:portfolio:tracking',
    RISK_ANALYSIS: 'features:risk:analysis',
  },
} as const;

// ===== ROLE DEFINITIONS =====

export const ROLES = {
  FREE: 'free',
  PRO: 'pro', 
  ENTERPRISE: 'enterprise',
  ADMIN: 'admin',
} as const;

export const USER_TIERS = {
  FREE: 'free',
  PRO: 'pro',
  ENTERPRISE: 'enterprise',
} as const;

// ===== ROLE-PERMISSION MAPPING =====

// Define base permissions first
const FREE_PERMISSIONS = [
  // Basic Analysis (Limited)
  PERMISSIONS.ANALYSIS.ONCHAIN_READ,
  PERMISSIONS.ANALYSIS.SENTIMENT_READ,
  PERMISSIONS.ANALYSIS.TOKENOMICS_READ,
  PERMISSIONS.ANALYSIS.TEAM_READ,

  // Basic User Management
  PERMISSIONS.USER.PROFILE_READ,
  PERMISSIONS.USER.PROFILE_UPDATE,
  PERMISSIONS.USER.ACCOUNT_SETTINGS,

  // Basic API Access
  PERMISSIONS.API.RATE_LIMIT_FREE,

  // Basic Features
  PERMISSIONS.FEATURES.DASHBOARD_BASIC,
  PERMISSIONS.FEATURES.EXPORT_CSV,
] as const;

export const ROLE_PERMISSIONS = {
  [ROLES.FREE]: FREE_PERMISSIONS,

  [ROLES.PRO]: [
    // All Free permissions
    ...FREE_PERMISSIONS,
    
    // Enhanced Analysis
    PERMISSIONS.ANALYSIS.ONCHAIN_CREATE,
    PERMISSIONS.ANALYSIS.SENTIMENT_CREATE,
    PERMISSIONS.ANALYSIS.TOKENOMICS_CREATE,
    PERMISSIONS.ANALYSIS.TEAM_CREATE,
    PERMISSIONS.ANALYSIS.ANALYSIS_HISTORY,
    PERMISSIONS.ANALYSIS.ANALYSIS_EXPORT,
    
    // Enhanced User Management
    PERMISSIONS.USER.ACCOUNT_BILLING,
    PERMISSIONS.USER.API_KEYS_READ,
    PERMISSIONS.USER.API_KEYS_CREATE,
    PERMISSIONS.USER.API_USAGE_STATS,
    
    // Enhanced API Access
    PERMISSIONS.API.RATE_LIMIT_PRO,
    PERMISSIONS.API.HISTORICAL_DATA,
    
    // Enhanced Features
    PERMISSIONS.FEATURES.DASHBOARD_ADVANCED,
    PERMISSIONS.FEATURES.EXPORT_PDF,
    PERMISSIONS.FEATURES.CUSTOM_ALERTS,
    PERMISSIONS.FEATURES.PORTFOLIO_TRACKING,
  ] as const,
} as const;

// Define PRO permissions separately to avoid circular reference
const PRO_PERMISSIONS = [
  ...FREE_PERMISSIONS,
  // Enhanced Analysis
  PERMISSIONS.ANALYSIS.ONCHAIN_CREATE,
  PERMISSIONS.ANALYSIS.SENTIMENT_CREATE,
  PERMISSIONS.ANALYSIS.TOKENOMICS_CREATE,
  PERMISSIONS.ANALYSIS.TEAM_CREATE,
  PERMISSIONS.ANALYSIS.ANALYSIS_HISTORY,
  PERMISSIONS.ANALYSIS.ANALYSIS_EXPORT,

  // Enhanced User Management
  PERMISSIONS.USER.ACCOUNT_BILLING,
  PERMISSIONS.USER.API_KEYS_READ,
  PERMISSIONS.USER.API_KEYS_CREATE,
  PERMISSIONS.USER.API_USAGE_STATS,

  // Enhanced API Access
  PERMISSIONS.API.RATE_LIMIT_PRO,
  PERMISSIONS.API.HISTORICAL_DATA,

  // Enhanced Features
  PERMISSIONS.FEATURES.DASHBOARD_ADVANCED,
  PERMISSIONS.FEATURES.EXPORT_PDF,
  PERMISSIONS.FEATURES.CUSTOM_ALERTS,
  PERMISSIONS.FEATURES.PORTFOLIO_TRACKING,
] as const;

// Update ROLE_PERMISSIONS with proper structure
export const ROLE_PERMISSIONS_COMPLETE = {
  [ROLES.FREE]: FREE_PERMISSIONS,
  [ROLES.PRO]: PRO_PERMISSIONS,
  [ROLES.ENTERPRISE]: [
    // All Pro permissions
    ...PRO_PERMISSIONS,
    
    // Advanced Analysis
    PERMISSIONS.ANALYSIS.ONCHAIN_ADVANCED,
    PERMISSIONS.ANALYSIS.SENTIMENT_ADVANCED,
    PERMISSIONS.ANALYSIS.TOKENOMICS_ADVANCED,
    PERMISSIONS.ANALYSIS.TEAM_ADVANCED,
    PERMISSIONS.ANALYSIS.ANALYSIS_SHARE,
    
    // Advanced User Management
    PERMISSIONS.USER.ACCOUNT_SUBSCRIPTION,
    PERMISSIONS.USER.API_KEYS_DELETE,
    
    // Advanced API Access
    PERMISSIONS.API.RATE_LIMIT_ENTERPRISE,
    PERMISSIONS.API.BATCH_REQUESTS,
    PERMISSIONS.API.WEBHOOK_ACCESS,
    PERMISSIONS.API.REAL_TIME_DATA,
    
    // Advanced Features
    PERMISSIONS.FEATURES.DASHBOARD_CUSTOM,
    PERMISSIONS.FEATURES.EXPORT_API,
    PERMISSIONS.FEATURES.TEAM_SHARING,
    PERMISSIONS.FEATURES.TEAM_COLLABORATION,
    PERMISSIONS.FEATURES.TEAM_MANAGEMENT,
    PERMISSIONS.FEATURES.RISK_ANALYSIS,
  ],

  [ROLES.ADMIN]: [
    // All Enterprise permissions
    ...PRO_PERMISSIONS,
    // Advanced Analysis
    PERMISSIONS.ANALYSIS.ONCHAIN_ADVANCED,
    PERMISSIONS.ANALYSIS.SENTIMENT_ADVANCED,
    PERMISSIONS.ANALYSIS.TOKENOMICS_ADVANCED,
    PERMISSIONS.ANALYSIS.TEAM_ADVANCED,
    PERMISSIONS.ANALYSIS.ANALYSIS_SHARE,

    // Advanced User Management
    PERMISSIONS.USER.ACCOUNT_SUBSCRIPTION,
    PERMISSIONS.USER.API_KEYS_DELETE,

    // Advanced API Access
    PERMISSIONS.API.RATE_LIMIT_ENTERPRISE,
    PERMISSIONS.API.BATCH_REQUESTS,
    PERMISSIONS.API.WEBHOOK_ACCESS,
    PERMISSIONS.API.REAL_TIME_DATA,

    // Advanced Features
    PERMISSIONS.FEATURES.DASHBOARD_CUSTOM,
    PERMISSIONS.FEATURES.EXPORT_API,
    PERMISSIONS.FEATURES.TEAM_SHARING,
    PERMISSIONS.FEATURES.TEAM_COLLABORATION,
    PERMISSIONS.FEATURES.TEAM_MANAGEMENT,
    PERMISSIONS.FEATURES.RISK_ANALYSIS,
    
    // Administrative Analysis
    PERMISSIONS.ANALYSIS.ANALYSIS_DELETE,
    
    // Administrative User Management
    PERMISSIONS.USER.PROFILE_DELETE,
    
    // Full Administrative Access
    PERMISSIONS.ADMIN.USERS_READ,
    PERMISSIONS.ADMIN.USERS_CREATE,
    PERMISSIONS.ADMIN.USERS_UPDATE,
    PERMISSIONS.ADMIN.USERS_DELETE,
    PERMISSIONS.ADMIN.USERS_IMPERSONATE,
    PERMISSIONS.ADMIN.SYSTEM_HEALTH,
    PERMISSIONS.ADMIN.SYSTEM_METRICS,
    PERMISSIONS.ADMIN.SYSTEM_LOGS,
    PERMISSIONS.ADMIN.SYSTEM_CONFIG,
    PERMISSIONS.ADMIN.SERVICES_RESTART,
    PERMISSIONS.ADMIN.SERVICES_DEPLOY,
    PERMISSIONS.ADMIN.SERVICES_MONITOR,
    
    // Unlimited API Access
    PERMISSIONS.API.RATE_LIMIT_UNLIMITED,
  ],
} as const;

// ===== PERMISSION HIERARCHY =====

export const PERMISSION_HIERARCHY = {
  // Role hierarchy (higher roles inherit lower role permissions)
  ROLE_HIERARCHY: [ROLES.FREE, ROLES.PRO, ROLES.ENTERPRISE, ROLES.ADMIN],
  
  // Tier hierarchy for features
  TIER_HIERARCHY: [USER_TIERS.FREE, USER_TIERS.PRO, USER_TIERS.ENTERPRISE],
  
  // Permission groups for easier management
  PERMISSION_GROUPS: {
    ANALYSIS_BASIC: [
      PERMISSIONS.ANALYSIS.ONCHAIN_READ,
      PERMISSIONS.ANALYSIS.SENTIMENT_READ,
      PERMISSIONS.ANALYSIS.TOKENOMICS_READ,
      PERMISSIONS.ANALYSIS.TEAM_READ,
    ],
    ANALYSIS_CREATE: [
      PERMISSIONS.ANALYSIS.ONCHAIN_CREATE,
      PERMISSIONS.ANALYSIS.SENTIMENT_CREATE,
      PERMISSIONS.ANALYSIS.TOKENOMICS_CREATE,
      PERMISSIONS.ANALYSIS.TEAM_CREATE,
    ],
    ANALYSIS_ADVANCED: [
      PERMISSIONS.ANALYSIS.ONCHAIN_ADVANCED,
      PERMISSIONS.ANALYSIS.SENTIMENT_ADVANCED,
      PERMISSIONS.ANALYSIS.TOKENOMICS_ADVANCED,
      PERMISSIONS.ANALYSIS.TEAM_ADVANCED,
    ],
    USER_BASIC: [
      PERMISSIONS.USER.PROFILE_READ,
      PERMISSIONS.USER.PROFILE_UPDATE,
      PERMISSIONS.USER.ACCOUNT_SETTINGS,
    ],
    ADMIN_FULL: [
      PERMISSIONS.ADMIN.USERS_READ,
      PERMISSIONS.ADMIN.USERS_CREATE,
      PERMISSIONS.ADMIN.USERS_UPDATE,
      PERMISSIONS.ADMIN.USERS_DELETE,
      PERMISSIONS.ADMIN.SYSTEM_HEALTH,
      PERMISSIONS.ADMIN.SYSTEM_METRICS,
    ],
  },
} as const;

// ===== UTILITY TYPES =====

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS][keyof typeof PERMISSIONS[keyof typeof PERMISSIONS]];
export type Role = typeof ROLES[keyof typeof ROLES];
export type UserTier = typeof USER_TIERS[keyof typeof USER_TIERS];

// ===== HELPER FUNCTIONS =====

/**
 * Check if a role has a specific permission
 */
export function hasPermission(role: Role, permission: Permission): boolean {
  const rolePermissions = ROLE_PERMISSIONS_COMPLETE[role] || [];
  return rolePermissions.includes(permission);
}

/**
 * Get all permissions for a role
 */
export function getRolePermissions(role: Role): Permission[] {
  return [...(ROLE_PERMISSIONS_COMPLETE[role] || [])] as Permission[];
}

/**
 * Check if a role is higher than another role in hierarchy
 */
export function isHigherRole(role1: Role, role2: Role): boolean {
  const hierarchy = PERMISSION_HIERARCHY.ROLE_HIERARCHY;
  return hierarchy.indexOf(role1) > hierarchy.indexOf(role2);
}

/**
 * Get the highest role from a list of roles
 */
export function getHighestRole(roles: Role[]): Role {
  const hierarchy = PERMISSION_HIERARCHY.ROLE_HIERARCHY;
  return roles.reduce((highest, current) => 
    hierarchy.indexOf(current) > hierarchy.indexOf(highest) ? current : highest
  );
}
