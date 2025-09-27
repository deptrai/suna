import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService, User } from '../auth.service';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private authService: AuthService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
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

    // If no permissions or tiers required, allow access
    if (!requiredPermissions && !requiredTiers) {
      return true;
    }

    // Get user from request
    const request = context.switchToHttp().getRequest();
    const user: User = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    // Check tier requirements
    if (requiredTiers && requiredTiers.length > 0) {
      if (!requiredTiers.includes(user.tier)) {
        throw new ForbiddenException(`Access requires one of these tiers: ${requiredTiers.join(', ')}`);
      }
    }

    // Check permission requirements
    if (requiredPermissions && requiredPermissions.length > 0) {
      const hasPermission = this.authService.hasAllPermissions(user, requiredPermissions);
      
      if (!hasPermission) {
        throw new ForbiddenException(`Insufficient permissions. Required: ${requiredPermissions.join(', ')}`);
      }
    }

    return true;
  }
}
