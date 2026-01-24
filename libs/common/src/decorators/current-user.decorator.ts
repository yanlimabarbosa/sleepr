import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { UserDocument } from "../../../../apps/auth/src/users/models/user.schema";

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => getCurrentUserByContext(ctx),
);

function getCurrentUserByContext(ctx: ExecutionContext): UserDocument {
  return ctx.switchToHttp().getRequest().user;
}