import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserDto } from '../dto';

interface RequestWithUser extends Request {
  user: UserDto;
}

const getCurrentUserByContext = (context: ExecutionContext): UserDto => {
  return context.switchToHttp().getRequest<RequestWithUser>().user;
};

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    getCurrentUserByContext(context),
);
