import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Observable, Subject } from 'rxjs';
import { environment } from '../environment';
import { PlayerId } from './game-session.service';

export interface PlayersView {
  1?: { name: string };
  2?: { name: string };
}

@Injectable({
  providedIn: 'root'
})
export class OnlineGameService {
  private socket?: Socket;
  private listenersRegistered = false;

  private readonly roomCreatedSubject = new Subject<{ roomId: string; players?: PlayersView; status?: string }>();
  private readonly roomJoinedSubject = new Subject<{ roomId: string; players?: PlayersView; status?: string }>();
  private readonly roomUpdateSubject = new Subject<{ roomId: string; players?: PlayersView; status?: string }>();
  private readonly gameStateSubject = new Subject<any>();
  private readonly gameOverSubject = new Subject<any>();
  private readonly errorSubject = new Subject<any>();

  readonly roomCreated$: Observable<{ roomId: string; players?: PlayersView; status?: string }> =
    this.roomCreatedSubject.asObservable();
  readonly roomJoined$: Observable<{ roomId: string; players?: PlayersView; status?: string }> =
    this.roomJoinedSubject.asObservable();
  readonly roomUpdate$: Observable<{ roomId: string; players?: PlayersView; status?: string }> =
    this.roomUpdateSubject.asObservable();
  readonly gameState$: Observable<any> = this.gameStateSubject.asObservable();
  readonly gameOver$: Observable<any> = this.gameOverSubject.asObservable();
  readonly error$: Observable<any> = this.errorSubject.asObservable();

  connect(): Promise<void> {
    if (this.socket?.connected) {
      return Promise.resolve();
    }

    if (!this.socket) {
      this.socket = io(environment.onlineServerUrl, { transports: ['websocket'] });
      this.registerListeners();
    }

    return new Promise((resolve, reject) => {
      const onConnect = () => {
        cleanup();
        resolve();
      };

      const onError = (error: any) => {
        cleanup();
        reject(error);
      };

      const cleanup = () => {
        this.socket?.off('connect', onConnect);
        this.socket?.off('connect_error', onError);
      };

      this.socket!.once('connect', onConnect);
      this.socket!.once('connect_error', onError);

      if (this.socket!.connected) {
        cleanup();
        resolve();
      }
    });
  }

  disconnect(): void {
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = undefined;
    this.listenersRegistered = false;
  }

  isConnected(): boolean {
    return !!this.socket?.connected;
  }

  createRoom(payload: {
    name: string;
    settings: { cols: number; rows: number; paletteSize: 5 | 7 | 10 };
  }): void {
    this.socket?.emit('room:create', payload);
  }

  joinRoom(payload: { roomId: string; name: string }): void {
    this.socket?.emit('room:join', payload);
  }

  startRoom(payload: { roomId: string }): void {
    this.socket?.emit('room:start', payload);
  }

  pickColor(payload: { roomId: string; colorIndex: number; playerId?: PlayerId }): void {
    this.socket?.emit('game:pickColor', payload);
  }

  private registerListeners(): void {
    if (!this.socket || this.listenersRegistered) {
      return;
    }

    this.listenersRegistered = true;

    this.socket.on('connect', () => console.log('[online] connected'));
    this.socket.on('disconnect', (reason) => console.log('[online] disconnected', reason));
    this.socket.on('connect_error', (error) => console.error('[online] connect_error', error));

    this.socket.on('room:created', (data) => this.roomCreatedSubject.next(data));
    this.socket.on('room:joined', (data) => this.roomJoinedSubject.next(data));
    this.socket.on('room:update', (data) => this.roomUpdateSubject.next(data));
    this.socket.on('game:state', (data) => this.gameStateSubject.next(data));
    this.socket.on('game:over', (data) => this.gameOverSubject.next(data));
    this.socket.on('error', (data) => this.errorSubject.next(data));
  }
}
