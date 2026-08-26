import {
  Injectable,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UsersRepository } from './users.repository';
import * as argon2 from 'argon2';
import { GetUserDto } from './dto/get-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async create(createUserDto: CreateUserDto) {
    await this.validateCreateUserDto(createUserDto);
    return this.usersRepository.create({
      ...createUserDto,
      password: await argon2.hash(createUserDto.password),
    });
  }

  private async validateCreateUserDto({ email }: CreateUserDto) {
    const existing = await this.usersRepository
      .findOne({ email })
      .catch(() => null);

    if (existing) {
      throw new UnprocessableEntityException('Email already exists');
    }
  }

  async verifyUser(email: string, password: string) {
    const user = await this.usersRepository
      .findOne({ email })
      .catch(() => null);

    const credentialsValid =
      user && (await argon2.verify(user.password, password));

    if (!credentialsValid) {
      throw new UnauthorizedException('Credentials are not valid');
    }

    return user;
  }

  async getUser(getUserDto: GetUserDto) {
    return this.usersRepository.findOne(getUserDto);
  }
}
