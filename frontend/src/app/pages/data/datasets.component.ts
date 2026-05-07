import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { ProjectService } from '../../core/services/project.service';
import { UploadService, UploadedFile } from '../../core/services/upload.service';
import { IconComponent } from '../../shared/ui/icon/icon.component';

interface ProjectFiles {
  project_id: string;
  project_name: string;
  files: UploadedFile[];
}

@Component({
  selector: 'app-datasets',
  standalone: true,
  imports: [CommonModule, RouterLink, IconComponent],
  template: `
    <div class="p-4 space-y-3">
      <div>
        <h1 class="text-[22px] font-semibold tracking-tight">Datasets</h1>
        <p class="text-[12.5px] text-ink3">Files uploaded to projects — stored in MinIO</p>
      </div>

      @if (loading) {
        <div class="text-center text-ink3 py-12 text-[13px]">Loading datasets...</div>
      } @else if (totalFiles === 0) {
        <div class="bg-card border border-line rounded-lg p-12 text-center">
          <div class="w-10 h-10 mx-auto mb-3 rounded-full bg-raised/50 flex items-center justify-center">
            <app-icon name="file" className="w-5 h-5 text-ink3"></app-icon>
          </div>
          <div class="text-[13px] text-ink2">No datasets uploaded</div>
          <div class="text-[11.5px] text-ink3 mt-1">Upload files from any project's Code tab</div>
        </div>
      } @else {
        <div class="text-[11.5px] text-ink3 mb-1">{{ totalFiles }} file{{ totalFiles === 1 ? '' : 's' }} across {{ projectFiles.length }} project{{ projectFiles.length === 1 ? '' : 's' }}</div>
        @for (p of projectFiles; track p.project_id) {
          <div class="bg-card border border-line rounded-lg overflow-hidden">
            <div class="px-3 py-2 bg-raised/40 border-b border-line flex items-center justify-between">
              <a [routerLink]="['/projects', p.project_id]" class="text-[13px] font-medium text-cyan3 hover:underline">{{ p.project_name }}</a>
              <span class="text-[10.5px] text-ink3 mono">{{ p.files.length }} file{{ p.files.length === 1 ? '' : 's' }}</span>
            </div>
            <table class="w-full text-[12.5px]">
              <tbody>
                @for (f of p.files; track f.path) {
                  <tr class="border-t border-line hover:bg-white/[0.02]">
                    <td class="px-3 py-2">
                      <div class="flex items-center gap-2">
                        <app-icon name="file" className="w-3.5 h-3.5 text-ink3"></app-icon>
                        <span class="text-ink">{{ f.name }}</span>
                      </div>
                    </td>
                    <td class="px-3 py-2 mono text-[10.5px] text-ink3">{{ fmtSize(f.size) }}</td>
                    <td class="px-3 py-2 mono text-[10.5px] text-ink3 text-right">{{ fmtDate(f.last_modified) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      }
    </div>
  `,
})
export class DatasetsComponent implements OnInit {
  private projectService = inject(ProjectService);
  private uploadService = inject(UploadService);

  projectFiles: ProjectFiles[] = [];
  totalFiles = 0;
  loading = true;

  ngOnInit(): void {
    this.projectService.list().subscribe({
      next: (projects) => {
        if (projects.length === 0) {
          this.loading = false;
          return;
        }
        forkJoin(
          projects.map((p) =>
            this.uploadService.listFiles(p.id).pipe(
              map((resp): ProjectFiles => ({ project_id: p.id, project_name: p.name, files: resp.files || [] })),
              catchError(() => of<ProjectFiles>({ project_id: p.id, project_name: p.name, files: [] })),
            ),
          ),
        ).subscribe({
          next: (results) => {
            this.projectFiles = results.filter((r) => r.files.length > 0);
            this.totalFiles = this.projectFiles.reduce((n, r) => n + r.files.length, 0);
            this.loading = false;
          },
          error: () => { this.loading = false; },
        });
      },
      error: () => { this.loading = false; },
    });
  }

  fmtSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  }

  fmtDate(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString();
  }
}
