import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { RecordGameStatsRequest, UserStatsResponse } from './stats.models';

@Injectable({ providedIn: 'root' })
export class StatsService {
  private readonly apiUrl = ((globalThis as { __FILLER_API_URL__?: string }).__FILLER_API_URL__ || 'http://localhost:8080').replace(/\/$/, '');

  constructor(private readonly http: HttpClient) {}

  recordGame(payload: RecordGameStatsRequest): Observable<{ success: true }> {
    return this.http.post<{ success: true }>(`${this.apiUrl}/stats/games`, payload);
  }

  getMyStats(): Observable<UserStatsResponse> {
    return this.http.get<UserStatsResponse>(`${this.apiUrl}/stats/me`);
  }
}
