import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

interface AuthBody {
  username: string;
  password: string;
}

type RequestWithUser = Request & {
  user: {
    id: string;
    username: string;
  };
};

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() body: AuthBody) {
    return this.authService.register(body.username, body.password);
  }

  @Post('login')
  async login(@Body() body: AuthBody) {
    return this.authService.login(body.username, body.password);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@Req() request: RequestWithUser) {
    return this.authService.getPublicUserById(request.user.id);
  }
}
