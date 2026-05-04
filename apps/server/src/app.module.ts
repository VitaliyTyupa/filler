import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';
import { GameGateway } from './game/game.gateway';
import { SessionManager } from './game/session-manager.service';
import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { StatsModule } from './stats/stats.module';

@Module({
  imports: [DatabaseModule, AuthModule, StatsModule],
  controllers: [HealthController],
  providers: [GameGateway, SessionManager]
})
export class AppModule {}
