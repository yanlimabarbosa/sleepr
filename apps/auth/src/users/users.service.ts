import { Injectable, UnauthorizedException } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UsersRepository } from './users.repository';
import * as bcrypt from 'bcryptjs';
import { GetUserDto } from './dto/get-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) { }

  async createUser(createUserDto: CreateUserDto) {
    const user = await this.usersRepository.create({
      ...createUserDto,
      password: await bcrypt.hash(createUserDto.password, 10),
    });
    return user;
  }

  async validateUser(email: string, password: string) {
    const user = await this.usersRepository.findOne({ email });
    const passwordMatches = await bcrypt.compare(password, user.password);

    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return user;
  }

  async getUser(getUserDto: GetUserDto) {
    return this.usersRepository.findOne(getUserDto);
  }
}
