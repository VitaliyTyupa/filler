import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Collection } from 'mongodb';
import { DatabaseService } from '../database/database.service';
import { OpenGameListItem, OpenGameStatus } from '@shared';

interface OpenGameDocument extends OpenGameListItem {
  hostCountry?: string;
  guestCountry?: string;
  updatedAt: string;
}

type ClosedGameResultType = 'finished' | 'interrupted';

interface ClosedGameDocument {
  sessionId: string;
  mode: 'online';
  hostName: string;
  guestName?: string;
  board: {
    cols: number;
    rows: number;
  };
  paletteSize: number;
  resultType: ClosedGameResultType;
  winner: 1 | 2 | 0 | null;
  score1: number;
  score2: number;
  movesCount: number;
  startedAt?: string;
  endedAt: string;
  durationSeconds: number;
  hostCountry?: string;
  guestCountry?: string;
}

@Injectable()
export class OpenGamesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OpenGamesService.name);

  constructor(@Inject(DatabaseService) private readonly databaseService: DatabaseService) {}

  async onModuleInit(): Promise<void> {
    await this.openGamesCollection().createIndex({ sessionId: 1 }, { unique: true, name: 'open_games_session_id_unique' });
    await this.openGamesCollection().createIndex({ updatedAt: -1 }, { name: 'open_games_updated_at_idx' });

    const purgeResult = await this.openGamesCollection().deleteMany({});
    if (purgeResult.deletedCount) {
      this.logger.warn(`Purged ${purgeResult.deletedCount} stale open games on startup`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.openGamesCollection().deleteMany({});
  }

  async listOpenGames(): Promise<OpenGameListItem[]> {
    return this.openGamesCollection()
      .find({}, { sort: { createdAt: -1 } })
      .project<OpenGameListItem>({
        _id: 0,
        sessionId: 1,
        mode: 1,
        hostName: 1,
        guestName: 1,
        cols: 1,
        rows: 1,
        paletteSize: 1,
        status: 1,
        createdAt: 1
      })
      .toArray();
  }

  async publishGame(input: Omit<OpenGameDocument, 'updatedAt'>): Promise<void> {
    await this.openGamesCollection().updateOne(
      { sessionId: input.sessionId },
      {
        $set: {
          ...input,
          updatedAt: input.createdAt
        }
      },
      { upsert: true }
    );
  }

  async removeOpenGamesExcept(sessionIds: readonly string[]): Promise<number> {
    const result = sessionIds.length
      ? await this.openGamesCollection().deleteMany({ sessionId: { $nin: Array.from(sessionIds) } })
      : await this.openGamesCollection().deleteMany({});

    return result.deletedCount ?? 0;
  }

  async removeOpenGamesByHostName(hostName: string, exceptSessionId?: string): Promise<number> {
    const result = await this.openGamesCollection().deleteMany({
      hostName,
      ...(exceptSessionId ? { sessionId: { $ne: exceptSessionId } } : {})
    });

    return result.deletedCount ?? 0;
  }

  async touchOpenGame(sessionId: string): Promise<void> {
    await this.openGamesCollection().updateOne(
      { sessionId },
      {
        $set: {
          updatedAt: new Date().toISOString()
        }
      }
    );
  }

  async setJoining(sessionId: string, guestName: string, guestCountry?: string): Promise<boolean> {
    const result = await this.openGamesCollection().updateOne(
      { sessionId, status: 'free' },
      {
        $set: {
          status: 'joining',
          guestName,
          guestCountry,
          updatedAt: new Date().toISOString()
        }
      }
    );

    return result.modifiedCount === 1;
  }

  async confirmJoin(sessionId: string): Promise<boolean> {
    const result = await this.openGamesCollection().updateOne(
      { sessionId, status: 'joining' },
      {
        $set: {
          status: 'confirmed',
          updatedAt: new Date().toISOString()
        }
      }
    );

    return result.modifiedCount === 1;
  }

  async resetToFree(sessionId: string): Promise<boolean> {
    const result = await this.openGamesCollection().updateOne(
      { sessionId, status: { $in: ['joining', 'confirmed'] } },
      {
        $set: {
          status: 'free',
          updatedAt: new Date().toISOString()
        },
        $unset: {
          guestName: '',
          guestCountry: ''
        }
      }
    );

    return result.modifiedCount === 1;
  }

  async removeOpenGame(sessionId: string): Promise<void> {
    await this.openGamesCollection().deleteOne({ sessionId });
  }

  async getOpenGame(sessionId: string): Promise<OpenGameListItem | null> {
    return this.openGamesCollection().findOne(
      { sessionId },
      {
        projection: {
          _id: 0,
          sessionId: 1,
          mode: 1,
          hostName: 1,
          guestName: 1,
          cols: 1,
          rows: 1,
          paletteSize: 1,
          status: 1,
          createdAt: 1
        }
      }
    );
  }

  async archiveClosedGame(doc: ClosedGameDocument): Promise<void> {
    await this.closedGamesCollection().insertOne(doc);
  }

  private openGamesCollection(): Collection<OpenGameDocument> {
    return this.databaseService.db.collection<OpenGameDocument>('open_games');
  }

  private closedGamesCollection(): Collection<ClosedGameDocument> {
    return this.databaseService.db.collection<ClosedGameDocument>('closed_games');
  }
}
