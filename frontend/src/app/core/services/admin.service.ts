import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface PurgeResult {
  ok: boolean;
  deleted: { projects: number; runs: number; models: number; deployments: number };
}

@Injectable({ providedIn: 'root' })
export class AdminService {
  private http = inject(HttpClient);
  private apiUrl = environment.apiBaseUrl;

  purgeAll(): Observable<PurgeResult> {
    return this.http.post<PurgeResult>(`${this.apiUrl}/admin/purge-all`, {
      confirm_phrase: 'DELETE EVERYTHING',
    });
  }
}
