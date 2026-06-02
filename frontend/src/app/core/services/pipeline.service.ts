import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface RunMetrics {
  cpu_usage_m: number;
  cpu_limit_m: number;
  cpu_pct: number | null;
  mem_usage_mi: number;
  mem_limit_mi: number;
  mem_pct: number | null;
  gpu: number;
}

export interface PodInfo {
  name: string;
  phase: string;
  cpu_pct: number | null;
  mem_pct: number | null;
  gpu_limit: number;
}

export interface PipelineRun {
  id: string;
  project_id: string;
  project_name?: string;
  kfp_run_id: string | null;
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  pipeline_type: string;
  parameters: Record<string, any>;
  started_at: string | null;
  finished_at: string | null;
  metrics?: RunMetrics;
  pods?: PodInfo[];
}

export interface TriggerRequest {
  project_id: string;
  dataset_name: string;
  model_type: string;
  n_estimators: number;
  max_depth: number;
  test_size: number;
  accuracy_threshold: number;
}

export interface TriggerResponse {
  id: string;
  kfp_run_id: string;
  status: string;
  message: string;
}

export interface RunLogs {
  run_id: string;
  kfp_run_id: string;
  status: string;
  logs: string[];
  /** Same content as `logs` but with Argo executor / KFP driver / pod-spec
   *  noise stripped, leaving only `[platform]` lines and the
   *  `=== STDOUT/STDERR ===` blocks. Backend may omit on older deployments. */
  user_script_logs?: string[];
}

export interface CustomCodeTriggerRequest {
  project_id: string;
  code_minio_path: string;
  dataset_minio_path?: string;
  entry_script?: string;
}

@Injectable({ providedIn: 'root' })
export class PipelineService {
  private http = inject(HttpClient);
  private apiUrl = environment.apiBaseUrl;

  trigger(data: TriggerRequest): Observable<TriggerResponse> {
    return this.http.post<TriggerResponse>(`${this.apiUrl}/pipelines/trigger`, data);
  }

  triggerCustom(data: CustomCodeTriggerRequest): Observable<TriggerResponse> {
    return this.http.post<TriggerResponse>(`${this.apiUrl}/pipelines/trigger-custom`, data);
  }

  listRunning(): Observable<{ runs: PipelineRun[] }> {
    return this.http.get<{ runs: PipelineRun[] }>(`${this.apiUrl}/pipelines/running`);
  }

  listAll(): Observable<{ runs: PipelineRun[] }> {
    return this.http.get<{ runs: PipelineRun[] }>(`${this.apiUrl}/pipelines/`);
  }

  listRuns(projectId: string): Observable<{ runs: PipelineRun[] }> {
    return this.http.get<{ runs: PipelineRun[] }>(
      `${this.apiUrl}/pipelines/project/${projectId}`
    );
  }

  getRunStatus(runId: string): Observable<PipelineRun> {
    return this.http.get<PipelineRun>(`${this.apiUrl}/pipelines/${runId}`);
  }

  getLogs(runId: string): Observable<RunLogs> {
    return this.http.get<RunLogs>(`${this.apiUrl}/pipelines/${runId}/logs`);
  }

  deleteRun(runId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/pipelines/${runId}`);
  }
}
