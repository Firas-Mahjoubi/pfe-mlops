import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface MlflowRun {
  info: {
    run_id: string;
    run_name: string;
    experiment_id: string;
    status: string;
    start_time: number;
    end_time: number;
    lifecycle_stage: string;
  };
  data: {
    metrics: { key: string; value: number; timestamp: number; step: number }[];
    params: { key: string; value: string }[];
    tags: { key: string; value: string }[];
  };
}

export interface ExperimentRunsResponse {
  runs: MlflowRun[];
  experiment: any;
}

export type MlflowRunWithProject = MlflowRun & {
  project_id: string;
  project_name: string;
};

export interface RunArtifact {
  name: string;
  rel_path: string;
  is_dir: boolean;
  size: number;
  is_image: boolean;
}

@Injectable({ providedIn: 'root' })
export class ExperimentService {
  private http = inject(HttpClient);
  private apiUrl = environment.apiBaseUrl;

  listAll(): Observable<{ runs: MlflowRunWithProject[] }> {
    return this.http.get<{ runs: MlflowRunWithProject[] }>(
      `${this.apiUrl}/experiments/`
    );
  }

  listRuns(projectId: string): Observable<ExperimentRunsResponse> {
    return this.http.get<ExperimentRunsResponse>(
      `${this.apiUrl}/experiments/project/${projectId}`
    );
  }

  getRun(runId: string): Observable<MlflowRun> {
    return this.http.get<MlflowRun>(
      `${this.apiUrl}/experiments/run/${runId}`
    );
  }

  compareRuns(runIds: string[]): Observable<{ runs: MlflowRun[] }> {
    return this.http.get<{ runs: MlflowRun[] }>(
      `${this.apiUrl}/experiments/compare`,
      { params: { run_ids: runIds.join(',') } }
    );
  }

  deleteRun(runId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/experiments/run/${runId}`);
  }

  listArtifacts(runId: string, path = ''): Observable<{ path: string; files: RunArtifact[] }> {
    return this.http.get<{ path: string; files: RunArtifact[] }>(
      `${this.apiUrl}/experiments/run/${runId}/artifacts`,
      { params: { path } }
    );
  }

  getArtifactBlob(runId: string, path: string): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/experiments/run/${runId}/artifact`, {
      params: { path },
      responseType: 'blob',
    });
  }
}
