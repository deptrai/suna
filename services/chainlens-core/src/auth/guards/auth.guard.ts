import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard as PassportAuthGuard } from '@nestjs/passport';
import { Request } from 'express';

@Injectable()
export class AuthGuard extends PassportAuthGuard(['supabase', 'jwt', 'api-key']) implements CanActivate {
  constructor(private reflector: Reflector) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if route is marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    // Get request object
    const request = context.switchToHttp().getRequest<Request>();
    
    // Determine which strategy to use based on the request
    const strategy = this.determineStrategy(request);
    
    try {
      // Use the determined strategy
      const result = await super.canActivate(context);
      return result as boolean;
    } catch (error) {
      throw new UnauthorizedException('Authentication failed');
    }
  }

  private determineStrategy(request: Request): string {
    const authHeader = request.headers.authorization;
    
    if (authHeader) {
      if (authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        
        // Check if it's an API key
        if (token.startsWith('cl_')) {
          return 'api-key';
        }
        
        // Try to determine if it's a Supabase token or internal JWT
        try {
          const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
          
          // Check issuer to determine token type
          if (payload.iss && payload.iss.includes('supabase')) {
            return 'supabase';
          } else if (payload.iss === 'chainlens-core') {
            return 'jwt';
          }
        } catch (error) {
          // If we can't parse, try Supabase first
          return 'supabase';
        }
      }
    }

    // Check for API key in other headers
    if (request.headers['x-api-key']) {
      return 'api-key';
    }

    // Default to Supabase
    return 'supabase';
  }

  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    if (err || !user) {
      throw err || new UnauthorizedException('Authentication failed');
    }
    
    return user;
  }
}
