import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface PurgeResult {
  ok: boolean;
  deleted: { projects: number; runs: number; models: number; deployments: number };
}

export interface AdminUser {
  id: string;
  email: string;
  full_name: string;
  role: 'user' | 'admin';
  is_active: boolean;
  created_at: string;
  project_count: number;
}

export interface AdminOverview {
  users: number;
  admins: number;
  projects: number;
  pipeline_runs: number;
  models: number;
  deployments: number;
  active_deployments: number;
  cluster_healthy: boolean;
  cluster_advice: string;
}

export interface AdminProjectRow {
  id: string;
  name: string;
  owner_email: string;
  created_at: string | null;
}

export interface AdminDeploymentRow {
  id: string;
  inference_service_name: string;
  status: string;
  owner_email: string;
  project_name: string;
  endpoint_url: string | null;
}

export interface AdminPipelineRow {
  id: string;
  pipeline_type: string;
  status: string;
  owner_email: string;
  project_name: string;
  started_at: string | null;
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

  getOverview(): Observable<AdminOverview> {
    return this.http.get<AdminOverview>(`${this.apiUrl}/admin/overview`);
  }

  listUsers(): Observable<AdminUser[]> {
    return this.http.get<AdminUser[]>(`${this.apiUrl}/admin/users`);
  }

  updateUser(id: string, body: { is_active?: boolean; role?: 'user' | 'admin' }): Observable<AdminUser> {
    return this.http.patch<AdminUser>(`${this.apiUrl}/admin/users/${id}`, body);
  }

  deleteUser(id: string): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${this.apiUrl}/admin/users/${id}`);
  }

  purgeUser(id: string): Observable<{ ok: boolean; deleted: Record<string, number> }> {
    return this.http.post<{ ok: boolean; deleted: Record<string, number> }>(
      `${this.apiUrl}/admin/users/${id}/purge`, {}
    );
  }

  listProjects(): Observable<AdminProjectRow[]> {
    return this.http.get<AdminProjectRow[]>(`${this.apiUrl}/admin/projects`);
  }

  listDeployments(): Observable<AdminDeploymentRow[]> {
    return this.http.get<AdminDeploymentRow[]>(`${this.apiUrl}/admin/deployments`);
  }

  listPipelines(): Observable<AdminPipelineRow[]> {
    return this.http.get<AdminPipelineRow[]>(`${this.apiUrl}/admin/pipelines`);
  }
}
