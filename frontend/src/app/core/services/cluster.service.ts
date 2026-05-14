import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface ClusterMetrics {
  cpu_pct: number | null;
  memory_pct: number | null;
  gpu_pct: number | null;
  gpu_total: number;
  node_count: number;
  cpu_used_cores: number | null;
  cpu_total_cores: number;
  memory_used_gi: number | null;
  memory_total_gi: number;
  queue_count: number;
}

@Injectable({ providedIn: 'root' })
export class ClusterService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiBaseUrl}/cluster`;

  metrics(): Observable<ClusterMetrics> {
    return this.http.get<ClusterMetrics>(`${this.apiUrl}/metrics`);
  }
}
