import { Body, Controller, Get, Inject, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { StatsService } from './stats.service';
import { GameStatsRecordInput } from './stats.types';

type RequestWithUser = Request & {
  user: {
    id: string;
    username: string;
  };
};

@Controller('stats')
@UseGuards(JwtAuthGuard)
export class StatsController {
  constructor(@Inject(StatsService) private readonly statsService: StatsService) {}

  @Post('games')
  async recordGame(
    @Req() request: RequestWithUser,
    @Body() input: GameStatsRecordInput
  ) {
    return this.statsService.recordGame(request.user, input);
  }

  @Get('me')
  async getMyStats(@Req() request: RequestWithUser) {
    return this.statsService.getMyStats(request.user);
  }
}
