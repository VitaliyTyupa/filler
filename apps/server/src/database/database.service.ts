import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Db, MongoClient } from 'mongodb';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private client?: MongoClient;
  private database?: Db;

  get db(): Db {
    if (!this.database) {
      throw new Error('Database is not initialized');
    }
    return this.database;
  }

  async onModuleInit(): Promise<void> {
    const uri = process.env['MONGODB_URI'];
    if (!uri) {
      throw new Error('MONGODB_URI is required. Check .env.development/.env.production or container environment.');
    }

    this.client = new MongoClient(uri);
    await this.client.connect();
    this.database = this.client.db();
    this.logger.log('MongoDB connected');
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.close();
  }
}
