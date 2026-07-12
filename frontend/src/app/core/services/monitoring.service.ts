import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface ServingBucket {
  t: string;
  count: number;
  errors: number;
  avg_latency_ms: number | null;
}

export interface ServingSource {
  source: string; // 'app' (in-platform tester) | 'public' (public API)
  count: number;
  errors: number;
}

export interface ServingDeploymentRow {
  deployment_id: string;
  name: string;
  status: string;
  count: number;
  errors: number;
  error_rate: number;
  avg_latency_ms: number | null;
  p95_latency_ms: number | null;
  last_at: string | null;
}

export interface ServingStats {
  window_hours: number;
  bucket_unit: 'hour' | 'day';
  total: number;
  errors: number;
  error_rate: number;
  avg_latency_ms: number | null;
  p95_latency_ms: number | null;
  last_at: string | null;
  buckets: ServingBucket[];
  by_source: ServingSource[];
  deployments: ServingDeploymentRow[];
}

@Injectable({ providedIn: 'root' })
export class MonitoringService {
  private http = inject(HttpClient);
  private apiUrl = environment.apiBaseUrl;

  getServing(projectId: string, hours = 24): Observable<ServingStats> {
    return this.http.get<ServingStats>(
      `${this.apiUrl}/monitoring/project/${projectId}/serving`,
      { params: new HttpParams().set('hours', hours) },
    );
  }
}
