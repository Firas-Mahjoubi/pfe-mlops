import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface UploadedFile {
  name: string;
  path: string;
  size: number;
  last_modified: string | null;
}

export interface UploadResponse {
  filename: string;
  path: string;
  s3_uri: string;
  size: number;
}

@Injectable({ providedIn: 'root' })
export class UploadService {
  private http = inject(HttpClient);
  private apiUrl = environment.apiBaseUrl;

  upload(projectId: string, file: File): Observable<UploadResponse> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<UploadResponse>(
      `${this.apiUrl}/projects/${projectId}/upload`,
      formData
    );
  }

  listFiles(projectId: string): Observable<{ files: UploadedFile[] }> {
    return this.http.get<{ files: UploadedFile[] }>(
      `${this.apiUrl}/projects/${projectId}/files`
    );
  }

  deleteFile(projectId: string, filePath: string): Observable<void> {
    return this.http.delete<void>(
      `${this.apiUrl}/projects/${projectId}/files/${encodeURIComponent(filePath)}`
    );
  }
}
