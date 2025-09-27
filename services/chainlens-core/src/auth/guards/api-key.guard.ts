import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class ApiKeyGuard extends AuthGuard('api-key') implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const result = await super.canActivate(context);
      return result as boolean;
    } catch (error) {
      throw new UnauthorizedException('Valid API key required');
    }
  }

  handleRequest(err: any, user: any, info: any) {
    if (err || !user) {
      throw err || new UnauthorizedException('Invalid API key');
    }
    
    return user;
  }
}
