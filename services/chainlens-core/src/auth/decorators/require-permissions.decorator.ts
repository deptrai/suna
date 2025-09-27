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
export const RequirePermissions = (...permissions: Permission[]) => 
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
export const RequireRoles = (...roles: Role[]) => 
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
export const RequireTier = (tier: UserTier) => 
  SetMetadata('tier', tier);

/**
 * Decorator to require a minimum tier for accessing an endpoint
 * @param minimumTier - Minimum required tier
 * 
 * @example
 * @RequireMinimumTier(USER_TIERS.PRO)
 * @Get('/pro-and-above')
 * async proAndAboveFeature() { ... }
 */
export const RequireMinimumTier = (minimumTier: UserTier) => 
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
    'analysis:onchain:read' as Permission,
    'analysis:sentiment:read' as Permission,
    'analysis:tokenomics:read' as Permission,
    'analysis:team:read' as Permission
  );

export const RequireAnalysisCreate = () =>
  RequirePermissions(
    'analysis:onchain:create' as Permission,
    'analysis:sentiment:create' as Permission,
    'analysis:tokenomics:create' as Permission,
    'analysis:team:create' as Permission
  );

export const RequireAnalysisAdvanced = () =>
  RequirePermissions(
    'analysis:onchain:advanced' as Permission,
    'analysis:sentiment:advanced' as Permission,
    'analysis:tokenomics:advanced' as Permission,
    'analysis:team:advanced' as Permission
  );

/**
 * Decorator for user management permissions
 */
export const RequireUserManagement = () =>
  RequirePermissions(
    'admin:users:read' as Permission,
    'admin:users:create' as Permission,
    'admin:users:update' as Permission
  );

export const RequireUserDelete = () =>
  RequirePermissions('admin:users:delete' as Permission);

/**
 * Decorator for system administration permissions
 */
export const RequireSystemAdmin = () =>
  RequirePermissions(
    'admin:system:health' as Permission,
    'admin:system:metrics' as Permission,
    'admin:system:logs' as Permission,
    'admin:system:config' as Permission
  );

/**
 * Decorator for API management permissions
 */
export const RequireApiManagement = () =>
  RequirePermissions(
    'user:api:keys:read' as Permission,
    'user:api:keys:create' as Permission,
    'user:api:keys:delete' as Permission
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
  roles?: Role[];
  permissions?: Permission[];
  tier?: UserTier;
  minimumTier?: UserTier;
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
