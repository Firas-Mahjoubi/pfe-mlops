import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Project, ProjectCreate } from '../models/project.model';

export interface ProjectStats {
  project_id: string;
  runs: number;
  experiments: number;
  models: number;
  deployments: number;
}

@Injectable({ providedIn: 'root' })
export class ProjectService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiBaseUrl}/projects`;

  list(): Observable<Project[]> {
    // Trailing slash matters: FastAPI registers the collection route as `/`
    // and 307-redirects `/projects` → `/projects/`. The redirect's Location
    // header loses the original https scheme (TLS terminated at Cloudflare),
    // and browsers refuse to follow an http:// redirect from an https:// page.
    return this.http.get<Project[]>(`${this.apiUrl}/`);
  }

  stats(): Observable<ProjectStats[]> {
    return this.http.get<ProjectStats[]>(`${this.apiUrl}/stats`);
  }

  get(id: string): Observable<Project> {
    return this.http.get<Project>(`${this.apiUrl}/${id}`);
  }

  create(data: ProjectCreate): Observable<Project> {
    return this.http.post<Project>(`${this.apiUrl}/`, data);
  }

  update(id: string, data: Partial<ProjectCreate>): Observable<Project> {
    return this.http.put<Project>(`${this.apiUrl}/${id}`, data);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }
}
