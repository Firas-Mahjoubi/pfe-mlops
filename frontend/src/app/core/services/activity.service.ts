import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type ActivityTone = 'info' | 'ok' | 'warn' | 'bad' | 'muted';

export interface ActivityEntry {
  t_iso: string;
  who: string;
  what: string;
  obj: string;
  ctx: string;
  tone: ActivityTone;
}

@Injectable({ providedIn: 'root' })
export class ActivityService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiBaseUrl}/activity`;

  list(limit = 20): Observable<ActivityEntry[]> {
    return this.http.get<ActivityEntry[]>(`${this.apiUrl}/`, {
      params: { limit: String(limit) },
    });
  }
}
