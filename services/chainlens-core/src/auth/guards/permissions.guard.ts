import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { LoggerService } from '../../common/services/logger.service';
import { 
  Permission, 
  Role, 
  UserTier,
  hasPermission, 
  getRolePermissions,
  isHigherRole,
  PERMISSION_HIERARCHY 
} from '../constants/permissions.constants';
import { UserContext } from '../constants/jwt.constants';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private logger: LoggerService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    // Get required permissions from decorator
    const requiredPermissions = this.reflector.getAllAndOverride<Permission[]>('permissions', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user: UserContext = request.user;

    if (!user) {
      this.logger.warn('PermissionsGuard: No user found in request', {
        path: request.url,
        method: request.method,
        requiredPermissions,
      });
      throw new UnauthorizedException('Authentication required');
    }

    const userRole = user.role as Role;
    const userPermissions = getRolePermissions(userRole);

    // Check if user has all required permissions
    const missingPermissions = requiredPermissions.filter(
      permission => !userPermissions.includes(permission)
    );

    if (missingPermissions.length > 0) {
      this.logger.warn('PermissionsGuard: Insufficient permissions', {
        userId: user.id,
        userRole,
        userPermissions: userPermissions.length,
        requiredPermissions,
        missingPermissions,
        path: request.url,
        method: request.method,
      });
      
      throw new ForbiddenException(
        `Access denied. Missing permissions: ${missingPermissions.join(', ')}`
      );
    }

    this.logger.debug('PermissionsGuard: Access granted', {
      userId: user.id,
      userRole,
      requiredPermissions,
      path: request.url,
      method: request.method,
    });

    return true;
  }
}

/**
 * Tier-based access control guard
 * Controls access based on user subscription tier
 */
@Injectable()
export class TierGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private logger: LoggerService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    // Get required tier from decorator
    const requiredTier = this.reflector.getAllAndOverride<UserTier>('tier', [
      context.getHandler(),
      context.getClass(),
    ]);

    // Get minimum tier from decorator (alternative approach)
    const minimumTier = this.reflector.getAllAndOverride<UserTier>('minimumTier', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredTier && !minimumTier) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user: UserContext = request.user;

    if (!user) {
      this.logger.warn('TierGuard: No user found in request', {
        path: request.url,
        method: request.method,
        requiredTier,
        minimumTier,
      });
      throw new UnauthorizedException('Authentication required');
    }

    const userTier = user.tier as UserTier;

    // Check exact tier requirement
    if (requiredTier && userTier !== requiredTier) {
      this.logger.warn('TierGuard: Exact tier requirement not met', {
        userId: user.id,
        userTier,
        requiredTier,
        path: request.url,
        method: request.method,
      });
      
      throw new ForbiddenException(
        `Access denied. Required tier: ${requiredTier}, current tier: ${userTier}`
      );
    }

    // Check minimum tier requirement
    if (minimumTier) {
      const tierHierarchy = PERMISSION_HIERARCHY.TIER_HIERARCHY;
      const userTierIndex = tierHierarchy.indexOf(userTier);
      const minimumTierIndex = tierHierarchy.indexOf(minimumTier);

      if (userTierIndex < minimumTierIndex) {
        this.logger.warn('TierGuard: Minimum tier requirement not met', {
          userId: user.id,
          userTier,
          minimumTier,
          userTierIndex,
          minimumTierIndex,
          path: request.url,
          method: request.method,
        });
        
        throw new ForbiddenException(
          `Access denied. Minimum tier required: ${minimumTier}, current tier: ${userTier}`
        );
      }
    }

    this.logger.debug('TierGuard: Access granted', {
      userId: user.id,
      userTier,
      requiredTier,
      minimumTier,
      path: request.url,
      method: request.method,
    });

    return true;
  }
}

/**
 * Combined guard that checks roles, permissions, and tiers
 * Use this for comprehensive access control
 */
@Injectable()
export class ComprehensiveGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private logger: LoggerService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user: UserContext = request.user;

    if (!user) {
      this.logger.warn('ComprehensiveGuard: No user found in request', {
        path: request.url,
        method: request.method,
      });
      throw new UnauthorizedException('Authentication required');
    }

    // Get all requirements
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>('roles', [
      context.getHandler(),
      context.getClass(),
    ]);

    const requiredPermissions = this.reflector.getAllAndOverride<Permission[]>('permissions', [
      context.getHandler(),
      context.getClass(),
    ]);

    const requiredTier = this.reflector.getAllAndOverride<UserTier>('tier', [
      context.getHandler(),
      context.getClass(),
    ]);

    const minimumTier = this.reflector.getAllAndOverride<UserTier>('minimumTier', [
      context.getHandler(),
      context.getClass(),
    ]);

    // If no requirements, allow access
    if (!requiredRoles && !requiredPermissions && !requiredTier && !minimumTier) {
      return true;
    }

    const userRole = user.role as Role;
    const userTier = user.tier as UserTier;

    // Check role requirements
    if (requiredRoles && requiredRoles.length > 0) {
      const hasRequiredRole = requiredRoles.some(role => 
        userRole === role || isHigherRole(userRole, role)
      );

      if (!hasRequiredRole) {
        this.logger.warn('ComprehensiveGuard: Role requirement not met', {
          userId: user.id,
          userRole,
          requiredRoles,
          path: request.url,
          method: request.method,
        });
        
        throw new ForbiddenException(
          `Access denied. Required role: ${requiredRoles.join(' or ')}`
        );
      }
    }

    // Check permission requirements
    if (requiredPermissions && requiredPermissions.length > 0) {
      const userPermissions = getRolePermissions(userRole);
      const missingPermissions = requiredPermissions.filter(
        permission => !userPermissions.includes(permission)
      );

      if (missingPermissions.length > 0) {
        this.logger.warn('ComprehensiveGuard: Permission requirement not met', {
          userId: user.id,
          userRole,
          requiredPermissions,
          missingPermissions,
          path: request.url,
          method: request.method,
        });
        
        throw new ForbiddenException(
          `Access denied. Missing permissions: ${missingPermissions.join(', ')}`
        );
      }
    }

    // Check tier requirements
    if (requiredTier && userTier !== requiredTier) {
      this.logger.warn('ComprehensiveGuard: Tier requirement not met', {
        userId: user.id,
        userTier,
        requiredTier,
        path: request.url,
        method: request.method,
      });
      
      throw new ForbiddenException(
        `Access denied. Required tier: ${requiredTier}`
      );
    }

    // Check minimum tier requirements
    if (minimumTier) {
      const tierHierarchy = PERMISSION_HIERARCHY.TIER_HIERARCHY;
      const userTierIndex = tierHierarchy.indexOf(userTier);
      const minimumTierIndex = tierHierarchy.indexOf(minimumTier);

      if (userTierIndex < minimumTierIndex) {
        this.logger.warn('ComprehensiveGuard: Minimum tier requirement not met', {
          userId: user.id,
          userTier,
          minimumTier,
          path: request.url,
          method: request.method,
        });
        
        throw new ForbiddenException(
          `Access denied. Minimum tier required: ${minimumTier}`
        );
      }
    }

    this.logger.debug('ComprehensiveGuard: All requirements met', {
      userId: user.id,
      userRole,
      userTier,
      requiredRoles,
      requiredPermissions,
      requiredTier,
      minimumTier,
      path: request.url,
      method: request.method,
    });

    return true;
  }
}
