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

export interface NotebookConversion {
  ok: boolean;
  script_filename?: string;
  script_path?: string;
  warnings: CodeWarning[];
  pip_packages: string[];
}

export interface ZipNotebookConversion {
  original: string;
  script: string | null;
  ok: boolean;
  warnings: CodeWarning[];
  pip_packages: string[];
}

export interface UploadResponse {
  filename: string;
  path: string;
  s3_uri: string;
  size: number;
  /** Set when a .ipynb was uploaded: the auto-converted runnable script. */
  conversion?: NotebookConversion | null;
  /** Set when a .zip contained notebooks: one entry per converted notebook. */
  notebook_conversions?: ZipNotebookConversion[];
}

export interface CodeWarning {
  code: string;
  message: string;
  severity: 'warn' | 'info';
  line_no: number | null;
  snippet: string | null;
}

export interface AnalyzeResponse {
  entry_script: string;
  warnings: CodeWarning[];
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

  analyzeFile(
    projectId: string,
    path: string,
    entryScript: string = '',
  ): Observable<AnalyzeResponse> {
    return this.http.post<AnalyzeResponse>(
      `${this.apiUrl}/projects/${projectId}/files/analyze`,
      { path, entry_script: entryScript },
    );
  }
}
