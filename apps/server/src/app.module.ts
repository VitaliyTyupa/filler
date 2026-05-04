import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';
import { GameGateway } from './game/game.gateway';
import { SessionManager } from './game/session-manager.service';

@Module({
  imports: [],
  controllers: [HealthController],
  providers: [GameGateway, SessionManager]
})
export class AppModule {}
