import { Injectable, ExecutionContext, Logger } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';

@Injectable()
export class ApiKeyAuthGuard extends AuthGuard('api-key') {
  private readonly logger = new Logger(ApiKeyAuthGuard.name);

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();

    this.logger.debug('API Key guard activated', {
      path: request.path,
      method: request.method,
      ip: request.ip,
    });

    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();

    if (err || !user) {
      this.logger.warn('API Key authentication failed', {
        error: err?.message || 'No user returned',
        info: info?.message,
        path: request.path,
        ip: request.ip,
      });
      throw err || new Error('API Key authentication failed');
    }

    this.logger.debug('API Key authentication successful', {
      userId: user.sub,
      tier: user.tier,
      role: user.role,
      path: request.path,
    });

    return user;
  }
}
