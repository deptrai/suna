import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService, User } from '../auth.service';
import { UserRole, UserContext } from '../constants/jwt.constants';
import { LoggerService } from '../../common/services/logger.service';
import {
  ROLES,
  USER_TIERS,
  hasPermission,
  isHigherRole,
  getRolePermissions,
  Permission
} from '../constants/permissions.constants';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private authService: AuthService,
    private logger: LoggerService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    // Get all requirements from decorators
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>('roles', [
      context.getHandler(),
      context.getClass(),
    ]);

    const requiredPermissions = this.reflector.getAllAndOverride<Permission[]>('permissions', [
      context.getHandler(),
      context.getClass(),
    ]);

    const requiredTiers = this.reflector.getAllAndOverride<string[]>('tiers', [
      context.getHandler(),
      context.getClass(),
    ]);

    const minimumTier = this.reflector.getAllAndOverride<string>('minimumTier', [
      context.getHandler(),
      context.getClass(),
    ]);

    const requireAll = this.reflector.getAllAndOverride<boolean>('requireAll', [
      context.getHandler(),
      context.getClass(),
    ]) || false;

    // Check if endpoint is public
    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    // If no requirements specified, allow access for authenticated users
    if (!requiredRoles && !requiredPermissions && !requiredTiers && !minimumTier) {
      return true;
    }

    // Get user from request
    const request = context.switchToHttp().getRequest();
    const user: UserContext = request.user;

    if (!user) {
      this.logger.warn('RolesGuard: No user found in request', {
        path: request.url,
        method: request.method,
      });
      throw new UnauthorizedException('Authentication required');
    }

    // Collect all access checks
    const accessChecks = {
      roleCheck: false,
      permissionCheck: false,
      tierCheck: false,
      minimumTierCheck: false,
    };

    // Check role requirements with hierarchy support
    if (requiredRoles && requiredRoles.length > 0) {
      const userRole = user.role;
      accessChecks.roleCheck = requiredRoles.some(role =>
        userRole === role || isHigherRole(userRole, role)
      );

      if (!accessChecks.roleCheck) {
        this.logger.warn('RolesGuard: Insufficient role permissions', {
          userId: user.id,
          userRole,
          requiredRoles,
          path: request.url,
          method: request.method,
        });

        if (requireAll) {
          throw new ForbiddenException(`Access requires one of these roles: ${requiredRoles.join(', ')}`);
        }
      }
    } else {
      accessChecks.roleCheck = true; // No role requirement
    }

    // Check permission requirements
    if (requiredPermissions && requiredPermissions.length > 0) {
      const userPermissions = getRolePermissions(user.role);
      accessChecks.permissionCheck = requiredPermissions.every(permission =>
        userPermissions.includes(permission)
      );

      if (!accessChecks.permissionCheck) {
        this.logger.warn('RolesGuard: Insufficient permissions', {
          userId: user.id,
          userRole: user.role,
          userPermissions: userPermissions.slice(0, 5), // Log first 5 for brevity
          requiredPermissions,
          path: request.url,
          method: request.method,
        });

        if (requireAll) {
          throw new ForbiddenException(`Insufficient permissions. Required: ${requiredPermissions.join(', ')}`);
        }
      }
    } else {
      accessChecks.permissionCheck = true; // No permission requirement
    }

    // Check tier requirements (exact match)
    if (requiredTiers && requiredTiers.length > 0) {
      accessChecks.tierCheck = requiredTiers.includes(user.tier);

      if (!accessChecks.tierCheck) {
        this.logger.warn('RolesGuard: Insufficient tier permissions', {
          userId: user.id,
          userTier: user.tier,
          requiredTiers,
          path: request.url,
          method: request.method,
        });

        if (requireAll) {
          throw new ForbiddenException(`Access requires one of these tiers: ${requiredTiers.join(', ')}`);
        }
      }
    } else {
      accessChecks.tierCheck = true; // No tier requirement
    }

    // Check minimum tier requirement (hierarchy)
    if (minimumTier) {
      accessChecks.minimumTierCheck = this.authService.hasTierAccess(user.tier, minimumTier);

      if (!accessChecks.minimumTierCheck) {
        this.logger.warn('RolesGuard: Below minimum tier requirement', {
          userId: user.id,
          userTier: user.tier,
          minimumTier,
          path: request.url,
          method: request.method,
        });

        if (requireAll) {
          throw new ForbiddenException(`Access requires minimum tier: ${minimumTier}`);
        }
      }
    } else {
      accessChecks.minimumTierCheck = true; // No minimum tier requirement
    }

    // Final access decision
    // When requireAll is false, we still need ALL specified requirements to pass
    // The requireAll flag is for when multiple requirement types are specified
    const hasAccess = Object.values(accessChecks).every(check => check);

    if (!hasAccess) {
      this.logger.warn('RolesGuard: Access denied - insufficient privileges', {
        userId: user.id,
        userRole: user.role,
        userTier: user.tier,
        accessChecks,
        requireAll,
        requiredRoles,
        requiredTiers,
        requiredPermissions,
        minimumTier,
        path: request.url,
        method: request.method,
      });

      throw new ForbiddenException('Access denied - insufficient privileges');
    }

    this.logger.debug('RolesGuard: Access granted', {
      userId: user.id,
      userRole: user.role,
      userTier: user.tier,
      accessChecks,
      requireAll,
      path: request.url,
      method: request.method,
    });

    return true;
  }
}
