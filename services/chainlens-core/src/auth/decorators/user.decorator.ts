import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserContext } from '../constants/jwt.constants';

export const User = createParamDecorator(
  (data: keyof UserContext | undefined, ctx: ExecutionContext): UserContext | any => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as UserContext;

    return data ? user?.[data] : user;
  },
);
