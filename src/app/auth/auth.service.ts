import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { AuthResponse, AuthUser } from './auth.models';

const TOKEN_KEY = 'filler_auth_token';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly apiUrl = ((globalThis as { __FILLER_API_URL__?: string }).__FILLER_API_URL__ || 'http://localhost:8080').replace(/\/$/, '');
  private readonly tokenSubject = new BehaviorSubject<string | null>(this.loadToken());
  private readonly userSubject = new BehaviorSubject<AuthUser | null>(null);

  readonly token$ = this.tokenSubject.asObservable();
  readonly user$ = this.userSubject.asObservable();

  constructor(private readonly http: HttpClient) {}

  get token(): string | null {
    return this.tokenSubject.value;
  }

  get user(): AuthUser | null {
    return this.userSubject.value;
  }

  get isAuthenticated(): boolean {
    return !!this.token;
  }

  initialize(): Observable<AuthUser> | null {
    if (!this.token) {
      return null;
    }
    return this.http.get<AuthUser>(`${this.apiUrl}/auth/me`).pipe(
      tap({
        next: (user) => this.userSubject.next(user),
        error: () => this.logout()
      })
    );
  }

  login(username: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/auth/login`, { username, password }).pipe(
      tap((response) => this.setSession(response))
    );
  }

  register(username: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/auth/register`, { username, password }).pipe(
      tap((response) => this.setSession(response))
    );
  }

  logout(): void {
    this.tokenSubject.next(null);
    this.userSubject.next(null);
    localStorage.removeItem(TOKEN_KEY);
  }

  private setSession(response: AuthResponse): void {
    this.tokenSubject.next(response.accessToken);
    this.userSubject.next(response.user);
    localStorage.setItem(TOKEN_KEY, response.accessToken);
  }

  private loadToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }
}
