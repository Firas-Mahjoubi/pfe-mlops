import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type ModelStage = 'None' | 'Staging' | 'Production' | 'Archived';

export interface ModelVersion {
  db_id?: string;
  name: string;
  version: string;
  stage: ModelStage;
  run_id?: string;
  source?: string;
  creation_timestamp?: number;
  last_updated_timestamp?: number;
  status?: string;
  metrics?: Record<string, number>;
}

export interface ProjectModelsResponse {
  model_name: string;
  versions: ModelVersion[];
}

export interface GlobalModelEntry {
  name: string;
  project_id: string;
  project_name: string;
  versions: ModelVersion[];
}

@Injectable({ providedIn: 'root' })
export class ModelService {
  private http = inject(HttpClient);
  private apiUrl = environment.apiBaseUrl;

  listAll(): Observable<{ models: GlobalModelEntry[] }> {
    return this.http.get<{ models: GlobalModelEntry[] }>(`${this.apiUrl}/models/`);
  }

  listProjectModels(projectId: string): Observable<ProjectModelsResponse> {
    return this.http.get<ProjectModelsResponse>(
      `${this.apiUrl}/models/project/${projectId}`
    );
  }

  listVersions(modelName: string): Observable<{ versions: ModelVersion[] }> {
    return this.http.get<{ versions: ModelVersion[] }>(
      `${this.apiUrl}/models/${encodeURIComponent(modelName)}/versions`
    );
  }

  register(projectId: string, runId: string, modelName?: string): Observable<{
    name: string;
    version: string;
    stage: string;
    run_id: string;
    source?: string;
  }> {
    return this.http.post<{ name: string; version: string; stage: string; run_id: string; source?: string }>(
      `${this.apiUrl}/models/register`,
      { project_id: projectId, run_id: runId, model_name: modelName }
    );
  }

  promote(modelName: string, version: string, stage: ModelStage): Observable<any> {
    return this.http.post(
      `${this.apiUrl}/models/${encodeURIComponent(modelName)}/versions/${version}/promote`,
      { stage }
    );
  }

  deleteVersion(modelName: string, version: string): Observable<void> {
    return this.http.delete<void>(
      `${this.apiUrl}/models/${encodeURIComponent(modelName)}/versions/${version}`
    );
  }
}
