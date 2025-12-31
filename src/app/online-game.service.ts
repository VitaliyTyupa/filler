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

  connect(): void {
    if (this.socket) {
      return;
    }

    this.socket = io(environment.onlineServerUrl, { transports: ['websocket'] });

    this.socket.on('connect', () => console.log('[online] connected'));
    this.socket.on('disconnect', () => console.log('[online] disconnected'));
    this.socket.on('connect_error', (error) => console.error('[online] connect_error', error));

    this.socket.on('room:created', (data) => this.roomCreatedSubject.next(data));
    this.socket.on('room:joined', (data) => this.roomJoinedSubject.next(data));
    this.socket.on('room:update', (data) => this.roomUpdateSubject.next(data));
    this.socket.on('game:state', (data) => this.gameStateSubject.next(data));
    this.socket.on('game:over', (data) => this.gameOverSubject.next(data));
    this.socket.on('error', (data) => this.errorSubject.next(data));
  }

  disconnect(): void {
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = undefined;
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
}
