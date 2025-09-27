import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { LoggerService } from '../../common/services/logger.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { UserContext, UserRole } from '../constants/jwt.constants';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private reflector: Reflector,
    private logger: LoggerService,
  ) {
    super();
  }

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    // Check if route is marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    return super.canActivate(context);
  }

  handleRequest<TUser = UserContext>(
    err: any,
    user: TUser,
    info: any,
    context: ExecutionContext,
  ): TUser {
    const request = context.switchToHttp().getRequest();
    
    // Log authentication attempt
    this.logger.debug('Authentication attempt', {
      path: request.url,
      method: request.method,
      userAgent: request.headers['user-agent'],
      ip: request.ip,
    });

    if (err || !user) {
      this.logger.warn('Authentication failed', {
        error: err?.message,
        info: info?.message,
        path: request.url,
      });
      
      throw err || new UnauthorizedException('Authentication required');
    }

    // Check role-based access
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (requiredRoles && requiredRoles.length > 0) {
      const userContext = user as UserContext;
      const hasRole = requiredRoles.includes(userContext.role);
      
      if (!hasRole) {
        this.logger.warn('Insufficient permissions', {
          userId: userContext.id,
          userRole: userContext.role,
          requiredRoles,
          path: request.url,
        });
        
        throw new UnauthorizedException('Insufficient permissions');
      }
    }

    this.logger.debug('Authentication successful', {
      userId: (user as UserContext).id,
      role: (user as UserContext).role,
      tier: (user as UserContext).tier,
      path: request.url,
    });

    return user;
  }
}
