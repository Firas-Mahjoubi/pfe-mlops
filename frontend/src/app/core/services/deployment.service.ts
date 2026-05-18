import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type DeploymentStatus = 'CREATING' | 'READY' | 'FAILED' | 'DELETED';

export interface Deployment {
  id: string;
  project_id: string;
  model_id: string;
  inference_service_name: string;
  endpoint_url: string | null;
  status: DeploymentStatus;
  replicas: number;
  created_at: string | null;
  updated_at: string | null;
}

export interface DeploymentsResponse {
  deployments: Deployment[];
}

export interface DeploymentMetrics {
  cpu_pct: number | null;
  mem_pct: number;
  mem_used_mi: number;
  mem_limit_gi: number;
  gpu: number | null;
}

export interface PredictResponse {
  predictions?: unknown;
  [key: string]: unknown;
}

export interface ApiKey {
  id: string;
  deployment_id: string;
  prefix: string;
  name: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

/** Returned ONLY by POST /api-keys -- includes the plaintext `key`. */
export interface ApiKeyCreated extends ApiKey {
  key: string;
}

@Injectable({ providedIn: 'root' })
export class DeploymentService {
  private http = inject(HttpClient);
  private apiUrl = environment.apiBaseUrl;

  listActiveDeployments(): Observable<DeploymentsResponse> {
    return this.http.get<DeploymentsResponse>(`${this.apiUrl}/deployments/active`);
  }

  getMetrics(deploymentId: string): Observable<DeploymentMetrics> {
    return this.http.get<DeploymentMetrics>(`${this.apiUrl}/deployments/${deploymentId}/metrics`);
  }

  listProjectDeployments(projectId: string): Observable<DeploymentsResponse> {
    return this.http.get<DeploymentsResponse>(
      `${this.apiUrl}/deployments/project/${projectId}`
    );
  }

  create(modelId: string, replicas: number = 1): Observable<Deployment> {
    return this.http.post<Deployment>(`${this.apiUrl}/deployments/`, {
      model_id: modelId,
      replicas,
    });
  }

  get(deploymentId: string): Observable<Deployment> {
    return this.http.get<Deployment>(`${this.apiUrl}/deployments/${deploymentId}`);
  }

  delete(deploymentId: string): Observable<Deployment> {
    return this.http.delete<Deployment>(`${this.apiUrl}/deployments/${deploymentId}`);
  }

  predict(deploymentId: string, instances: unknown[]): Observable<PredictResponse> {
    return this.http.post<PredictResponse>(
      `${this.apiUrl}/deployments/${deploymentId}/predict`,
      { instances }
    );
  }

  fixKserveWebhook(): Observable<{ ok: boolean; message: string }> {
    return this.http.post<{ ok: boolean; message: string }>(
      `${this.apiUrl}/deployments/kserve-fix-webhook`, {}
    );
  }

  kserveHealth(): Observable<{ webhook_ok: boolean; pods: { name: string; phase: string; ready: boolean }[]; advice: string }> {
    return this.http.get<any>(`${this.apiUrl}/deployments/kserve-health`);
  }

  listApiKeys(deploymentId: string): Observable<ApiKey[]> {
    return this.http.get<ApiKey[]>(`${this.apiUrl}/deployments/${deploymentId}/api-keys`);
  }

  createApiKey(deploymentId: string, name: string): Observable<ApiKeyCreated> {
    return this.http.post<ApiKeyCreated>(
      `${this.apiUrl}/deployments/${deploymentId}/api-keys`,
      { name }
    );
  }

  revokeApiKey(deploymentId: string, keyId: string): Observable<{ revoked: boolean }> {
    return this.http.delete<{ revoked: boolean }>(
      `${this.apiUrl}/deployments/${deploymentId}/api-keys/${keyId}`
    );
  }
}
