import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtStrategy } from '../strategies/jwt.strategy';
import { LoggerService } from '../../common/services/logger.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { UserContext, UserRole } from '../constants/jwt.constants';

@Injectable()
export class ApiKeyAuthGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private jwtStrategy: JwtStrategy,
    private logger: LoggerService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if route is marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const apiKey = this.extractApiKey(request);

    if (!apiKey) {
      this.logger.warn('API key missing', {
        path: request.url,
        method: request.method,
      });
      throw new UnauthorizedException('API key required');
    }

    try {
      const user = await this.jwtStrategy.validateApiKey(apiKey);
      
      if (!user) {
        this.logger.warn('Invalid API key', {
          path: request.url,
          method: request.method,
        });
        throw new UnauthorizedException('Invalid API key');
      }

      // Check role-based access
      const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);

      if (requiredRoles && requiredRoles.length > 0) {
        const hasRole = requiredRoles.includes(user.role);
        
        if (!hasRole) {
          this.logger.warn('Insufficient permissions for API key', {
            userId: user.id,
            userRole: user.role,
            requiredRoles,
            path: request.url,
          });
          
          throw new UnauthorizedException('Insufficient permissions');
        }
      }

      // Attach user to request
      request.user = user;

      this.logger.debug('API key authentication successful', {
        userId: user.id,
        tier: user.tier,
        path: request.url,
      });

      return true;
    } catch (error) {
      this.logger.error('API key authentication failed', error.stack, 'ApiKeyAuthGuard', {
        path: request.url,
      });
      
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      
      throw new UnauthorizedException('Authentication failed');
    }
  }

  private extractApiKey(request: any): string | null {
    // Check Authorization header: Bearer <api-key>
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // Check X-API-Key header
    const apiKeyHeader = request.headers['x-api-key'];
    if (apiKeyHeader) {
      return apiKeyHeader;
    }

    // Check query parameter
    const apiKeyQuery = request.query.api_key;
    if (apiKeyQuery) {
      return apiKeyQuery;
    }

    return null;
  }
}
