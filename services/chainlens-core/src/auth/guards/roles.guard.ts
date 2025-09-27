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

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private authService: AuthService,
    private logger: LoggerService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    // Get required roles from decorator
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>('roles', [
      context.getHandler(),
      context.getClass(),
    ]);

    // Get required permissions from decorator
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>('permissions', [
      context.getHandler(),
      context.getClass(),
    ]);

    // Get required tiers from decorator
    const requiredTiers = this.reflector.getAllAndOverride<string[]>('tiers', [
      context.getHandler(),
      context.getClass(),
    ]);

    // If no roles, permissions or tiers required, allow access
    if (!requiredRoles && !requiredPermissions && !requiredTiers) {
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

    // Check role requirements (primary check)
    if (requiredRoles && requiredRoles.length > 0) {
      const userRole = user.role;
      const hasRole = requiredRoles.includes(userRole);

      if (!hasRole) {
        this.logger.warn('RolesGuard: Insufficient role permissions', {
          userId: user.id,
          userRole,
          requiredRoles,
          path: request.url,
          method: request.method,
        });
        throw new UnauthorizedException(`Access requires one of these roles: ${requiredRoles.join(', ')}`);
      }
    }

    // Check tier requirements
    if (requiredTiers && requiredTiers.length > 0) {
      if (!requiredTiers.includes(user.tier)) {
        this.logger.warn('RolesGuard: Insufficient tier permissions', {
          userId: user.id,
          userTier: user.tier,
          requiredTiers,
          path: request.url,
          method: request.method,
        });
        throw new ForbiddenException(`Access requires one of these tiers: ${requiredTiers.join(', ')}`);
      }
    }

    // Check permission requirements
    if (requiredPermissions && requiredPermissions.length > 0) {
      // Convert UserContext to User for compatibility
      const userForPermissionCheck = {
        ...user,
        permissions: [], // Default empty permissions for now
      };
      const hasPermission = this.authService.hasAllPermissions(userForPermissionCheck, requiredPermissions);

      if (!hasPermission) {
        this.logger.warn('RolesGuard: Insufficient permissions', {
          userId: user.id,
          requiredPermissions,
          path: request.url,
          method: request.method,
        });
        throw new ForbiddenException(`Insufficient permissions. Required: ${requiredPermissions.join(', ')}`);
      }
    }

    this.logger.debug('RolesGuard: Access granted', {
      userId: user.id,
      userRole: user.role,
      userTier: user.tier,
      requiredRoles,
      requiredTiers,
      requiredPermissions,
      path: request.url,
      method: request.method,
    });

    return true;
  }
}
