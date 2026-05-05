import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { Collection } from 'mongodb';
import { DatabaseService } from '../database/database.service';
import { GameStatsDocument, GameStatsRecordInput } from './stats.types';

@Injectable()
export class StatsService {
  constructor(@Inject(DatabaseService) private readonly databaseService: DatabaseService) {}

  async recordGame(user: { id: string; username: string }, input: GameStatsRecordInput): Promise<{ success: true }> {
    const opponentName = input.opponentName.trim();
    if (!opponentName) {
      throw new BadRequestException('Opponent name is required');
    }

    const localScore = input.localPlayerId === 1 ? input.result.score1 : input.result.score2;
    const won = input.result.winner === input.localPlayerId;

    const doc: GameStatsDocument = {
      userId: user.id,
      username: user.username,
      playedAt: input.playedAt ?? new Date().toISOString(),
      durationSeconds: Math.max(0, Math.floor(input.durationSeconds ?? 0)),
      mode: input.mode,
      localPlayerId: input.localPlayerId,
      opponentName,
      won,
      pointsWon: won ? localScore : 0,
      winner: input.result.winner,
      score1: input.result.score1,
      score2: input.result.score2,
      gameConfig: input.gameConfig
    };

    await this.statsCollection().insertOne(doc);
    return { success: true };
  }

  async getMyStats(user: { id: string; username: string }) {
    const collection = this.statsCollection();
    const docs = await collection.find({ userId: user.id }).toArray();
    const leaderboardRaw = await collection.aggregate<{
      userId: string;
      username: string;
      gamesPlayed: number;
      wins: number;
      totalPoints: number;
    }>([
      {
        $group: {
          _id: '$userId',
          username: { $first: '$username' },
          gamesPlayed: { $sum: 1 },
          totalPoints: { $sum: '$pointsWon' },
          wins: {
            $sum: {
              $cond: ['$won', 1, 0]
            }
          }
        }
      },
      {
        $project: {
          _id: 0,
          userId: '$_id',
          username: 1,
          gamesPlayed: 1,
          wins: 1,
          totalPoints: 1
        }
      },
      {
        $sort: {
          wins: -1,
          totalPoints: -1,
          gamesPlayed: -1,
          username: 1
        }
      },
      {
        $limit: 5
      }
    ]).toArray();

    const gamesPlayed = docs.length;
    const wins = docs.filter((item) => item.won).length;
    const totalPointsWon = docs.reduce((sum, item) => sum + item.pointsWon, 0);
    const bestSingleGamePoints = docs.reduce((max, item) => Math.max(max, item.pointsWon), 0);

    return {
      user: {
        id: user.id,
        username: user.username
      },
      summary: {
        gamesPlayed,
        wins,
        totalPointsWon,
        bestSingleGamePoints
      },
      leaderboard: leaderboardRaw.map((item, index) => ({
        place: index + 1,
        username: item.username,
        gamesPlayed: item.gamesPlayed,
        wins: item.wins,
        totalPoints: item.totalPoints
      })),
      recentGames: docs
        .sort((a, b) => b.playedAt.localeCompare(a.playedAt))
        .slice(0, 20)
    };
  }

  private statsCollection(): Collection<GameStatsDocument> {
    const collection = this.databaseService.db.collection<GameStatsDocument>('game_stats');
    void collection.createIndex({ userId: 1, playedAt: -1 });
    return collection;
  }
}
