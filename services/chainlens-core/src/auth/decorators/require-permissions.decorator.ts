import { SetMetadata } from '@nestjs/common';
import { Permission, Role, UserTier } from '../constants/permissions.constants';

/**
 * Decorator to require specific permissions for accessing an endpoint
 * @param permissions - Array of required permissions
 * 
 * @example
 * @RequirePermissions([PERMISSIONS.ANALYSIS.ONCHAIN_CREATE, PERMISSIONS.ANALYSIS.SENTIMENT_READ])
 * @Get('/advanced-analysis')
 * async getAdvancedAnalysis() { ... }
 */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata('permissions', permissions);

/**
 * Decorator to require specific roles for accessing an endpoint
 * @param roles - Array of required roles
 * 
 * @example
 * @RequireRoles([ROLES.PRO, ROLES.ENTERPRISE])
 * @Post('/premium-feature')
 * async premiumFeature() { ... }
 */
export const RequireRoles = (...roles: string[]) =>
  SetMetadata('roles', roles);

/**
 * Decorator to require a specific tier for accessing an endpoint
 * @param tier - Required tier
 * 
 * @example
 * @RequireTier(USER_TIERS.ENTERPRISE)
 * @Get('/enterprise-only')
 * async enterpriseOnlyFeature() { ... }
 */
export const RequireTier = (tier: string) =>
  SetMetadata('tier', tier);

/**
 * Decorator to require a minimum tier for accessing an endpoint
 * @param minimumTier - Minimum required tier
 *
 * @example
 * @RequireMinimumTier('pro')
 * @Get('/pro-and-above')
 * async proAndAboveFeature() { ... }
 */
export const RequireMinimumTier = (minimumTier: string) =>
  SetMetadata('minimumTier', minimumTier);

/**
 * Decorator to require admin access
 * Shorthand for @RequireRoles([ROLES.ADMIN])
 * 
 * @example
 * @RequireAdmin()
 * @Delete('/users/:id')
 * async deleteUser() { ... }
 */
export const RequireAdmin = () => 
  SetMetadata('roles', ['admin']);

/**
 * Decorator to require enterprise tier or above
 * Shorthand for @RequireMinimumTier(USER_TIERS.ENTERPRISE)
 * 
 * @example
 * @RequireEnterprise()
 * @Get('/enterprise-analytics')
 * async enterpriseAnalytics() { ... }
 */
export const RequireEnterprise = () => 
  SetMetadata('minimumTier', 'enterprise');

/**
 * Decorator to require pro tier or above
 * Shorthand for @RequireMinimumTier(USER_TIERS.PRO)
 * 
 * @example
 * @RequirePro()
 * @Post('/advanced-analysis')
 * async advancedAnalysis() { ... }
 */
export const RequirePro = () => 
  SetMetadata('minimumTier', 'pro');

/**
 * Decorator for analysis-related permissions
 * Common combinations for analysis endpoints
 */
export const RequireAnalysisRead = () =>
  RequirePermissions(
    'analysis:onchain:read',
    'analysis:sentiment:read',
    'analysis:tokenomics:read',
    'analysis:team:read'
  );

export const RequireAnalysisCreate = () =>
  RequirePermissions(
    'analysis:onchain:create',
    'analysis:sentiment:create',
    'analysis:tokenomics:create',
    'analysis:team:create'
  );

export const RequireAnalysisAdvanced = () =>
  RequirePermissions(
    'analysis:onchain:advanced',
    'analysis:sentiment:advanced',
    'analysis:tokenomics:advanced',
    'analysis:team:advanced'
  );

/**
 * Decorator for user management permissions
 */
export const RequireUserManagement = () =>
  RequirePermissions(
    'admin:users:read',
    'admin:users:create',
    'admin:users:update'
  );

export const RequireUserDelete = () =>
  RequirePermissions('admin:users:delete');

/**
 * Decorator for system administration permissions
 */
export const RequireSystemAdmin = () =>
  RequirePermissions(
    'admin:system:health',
    'admin:system:metrics',
    'admin:system:logs',
    'admin:system:config'
  );

/**
 * Decorator for API management permissions
 */
export const RequireApiManagement = () =>
  RequirePermissions(
    'user:api:keys:read',
    'user:api:keys:create',
    'user:api:keys:delete'
  );

/**
 * Combined decorator for comprehensive access control
 * @param options - Object containing roles, permissions, tier, and minimumTier requirements
 * 
 * @example
 * @RequireAccess({
 *   roles: [ROLES.PRO, ROLES.ENTERPRISE],
 *   permissions: [PERMISSIONS.ANALYSIS.ONCHAIN_ADVANCED],
 *   minimumTier: USER_TIERS.PRO
 * })
 * @Get('/premium-advanced-analysis')
 * async premiumAdvancedAnalysis() { ... }
 */
export const RequireAccess = (options: {
  roles?: string[];
  permissions?: string[];
  tier?: string;
  minimumTier?: string;
}) => {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    if (options.roles) {
      SetMetadata('roles', options.roles)(target, propertyKey, descriptor);
    }
    if (options.permissions) {
      SetMetadata('permissions', options.permissions)(target, propertyKey, descriptor);
    }
    if (options.tier) {
      SetMetadata('tier', options.tier)(target, propertyKey, descriptor);
    }
    if (options.minimumTier) {
      SetMetadata('minimumTier', options.minimumTier)(target, propertyKey, descriptor);
    }
  };
};

/**
 * Decorator to mark an endpoint as public (no authentication required)
 * This overrides any guards that might be applied at the controller level
 * 
 * @example
 * @Public()
 * @Get('/health')
 * async healthCheck() { ... }
 */
export const Public = () => SetMetadata('isPublic', true);

/**
 * Decorator to allow access for authenticated users regardless of role/tier
 * User must be authenticated but no specific permissions are required
 * 
 * @example
 * @AuthenticatedOnly()
 * @Get('/profile')
 * async getProfile() { ... }
 */
export const AuthenticatedOnly = () => SetMetadata('authenticatedOnly', true);
