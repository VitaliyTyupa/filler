import { BadRequestException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { Collection } from 'mongodb';
import { DatabaseService } from '../database/database.service';
import { AuthPayload, AuthResponse, AuthUser } from './auth.types';

@Injectable()
export class AuthService {
  constructor(
    @Inject(JwtService) private readonly jwtService: JwtService,
    @Inject(DatabaseService) private readonly databaseService: DatabaseService
  ) {}

  async register(usernameRaw: string, passwordRaw: string): Promise<AuthResponse> {
    const users = this.usersCollection();
    const username = this.normalizeUsername(usernameRaw);
    const password = this.validatePassword(passwordRaw);

    const existing = await users.findOne({ username });
    if (existing) {
      throw new BadRequestException('Username is already taken');
    }

    const user: AuthUser = {
      id: randomUUID(),
      username,
      passwordHash: this.hashPassword(password),
      createdAt: new Date().toISOString()
    };
    await users.insertOne(user);

    return this.buildAuthResponse(user);
  }

  async login(usernameRaw: string, passwordRaw: string): Promise<AuthResponse> {
    const users = this.usersCollection();
    const username = this.normalizeUsername(usernameRaw);
    const password = this.validatePassword(passwordRaw);
    const user = await users.findOne({ username });
    if (!user || !this.verifyPassword(password, user.passwordHash)) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.buildAuthResponse(user);
  }

  verifyAccessToken(token: string): AuthPayload {
    try {
      return this.jwtService.verify<AuthPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  async getPublicUserById(userId: string): Promise<{ id: string; username: string }> {
    const users = this.usersCollection();
    const user = await users.findOne({ id: userId });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return { id: user.id, username: user.username };
  }

  private buildAuthResponse(user: AuthUser): AuthResponse {
    const payload: AuthPayload = {
      sub: user.id,
      username: user.username
    };

    const accessToken = this.jwtService.sign(payload);
    return {
      accessToken,
      user: {
        id: user.id,
        username: user.username
      }
    };
  }

  private usersCollection(): Collection<AuthUser> {
    const collection = this.databaseService.db.collection<AuthUser>('users');
    void collection.createIndex({ username: 1 }, { unique: true });
    return collection;
  }

  private normalizeUsername(value: string): string {
    const username = value.trim();
    if (username.length < 3 || username.length > 30) {
      throw new BadRequestException('Username must be between 3 and 30 characters');
    }
    return username;
  }

  private validatePassword(value: string): string {
    const password = value.trim();
    if (password.length < 6 || password.length > 128) {
      throw new BadRequestException('Password must be between 6 and 128 characters');
    }
    return password;
  }

  private hashPassword(password: string): string {
    const salt = randomUUID();
    const hash = scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${hash}`;
  }

  private verifyPassword(password: string, encoded: string): boolean {
    const [salt, storedHash] = encoded.split(':');
    if (!salt || !storedHash) {
      return false;
    }
    const incomingHash = scryptSync(password, salt, 64).toString('hex');
    return timingSafeEqual(Buffer.from(incomingHash, 'hex'), Buffer.from(storedHash, 'hex'));
  }
}
