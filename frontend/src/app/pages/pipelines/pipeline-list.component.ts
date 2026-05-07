import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PipelineService, PipelineRun } from '../../core/services/pipeline.service';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { StatusComponent, StatusKey } from '../../shared/ui/status/status.component';

@Component({
  selector: 'app-pipeline-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, IconComponent, StatusComponent],
  template: `
    <div class="p-4 space-y-3">
      <div class="flex items-start justify-between gap-4">
        <div>
          <h1 class="text-[22px] font-semibold tracking-tight">Pipelines</h1>
          <p class="text-[12.5px] text-ink3">
            {{ filtered.length }} of {{ runs.length }} pipeline runs across all projects
          </p>
        </div>
        <button (click)="refresh()" class="h-8 px-3 rounded-md bg-raised/50 border border-white/5 hover:border-white/10 text-[12.5px] text-ink2 hover:text-ink flex items-center gap-1.5">
          <app-icon name="refresh" className="w-3.5 h-3.5"></app-icon>Refresh
        </button>
      </div>

      <div class="flex items-center gap-2 bg-card border border-line rounded-lg p-2">
        <div class="flex items-center gap-2 px-2 h-8 rounded-md bg-raised/50 border border-white/5 flex-1 max-w-[360px] focus-within:border-cyan3/40">
          <app-icon name="search" className="w-3.5 h-3.5 text-ink3"></app-icon>
          <input [(ngModel)]="q" (ngModelChange)="apply()" placeholder="Filter by id, project or status" class="bg-transparent outline-none text-[12.5px] flex-1 placeholder:text-ink3 text-ink" />
        </div>
        <select [(ngModel)]="statusFilter" (ngModelChange)="apply()" class="appearance-none h-8 px-3 rounded-md bg-raised/50 border border-white/5 text-[12.5px] text-ink2 outline-none">
          <option value="all" class="bg-card">All statuses</option>
          <option value="RUNNING" class="bg-card">Running</option>
          <option value="SUCCEEDED" class="bg-card">Succeeded</option>
          <option value="FAILED" class="bg-card">Failed</option>
          <option value="PENDING" class="bg-card">Pending</option>
        </select>
      </div>

      @if (loading) {
        <div class="text-center text-ink3 py-12 text-[13px]">Loading pipelines...</div>
      } @else if (error) {
        <div class="bg-bad/10 border border-bad/30 rounded-lg p-4 text-bad text-[12.5px]">{{ error }}</div>
      } @else if (filtered.length === 0) {
        <div class="bg-card border border-line rounded-lg p-12 text-center">
          <div class="w-10 h-10 mx-auto mb-3 rounded-full bg-raised/50 flex items-center justify-center">
            <app-icon name="pipeline" className="w-5 h-5 text-ink3"></app-icon>
          </div>
          <div class="text-[13px] text-ink2">No pipeline runs</div>
          <div class="text-[11.5px] text-ink3 mt-1">Trigger a pipeline from a project to see it here</div>
        </div>
      } @else {
        <div class="bg-card border border-line rounded-lg overflow-hidden">
          <table class="w-full text-[12.5px]">
            <thead class="bg-raised/40 text-[10.5px] font-semibold tracking-[0.08em] uppercase text-ink3">
              <tr>
                <th class="text-left px-3 py-2">ID</th>
                <th class="text-left px-3 py-2">Project</th>
                <th class="text-left px-3 py-2">Type</th>
                <th class="text-left px-3 py-2">Status</th>
                <th class="text-left px-3 py-2">Started</th>
                <th class="text-left px-3 py-2">Duration</th>
              </tr>
            </thead>
            <tbody>
              @for (r of filtered; track r.id) {
                <tr class="border-t border-line hover:bg-white/[0.02]">
                  <td class="px-3 py-2 mono text-[11px] text-ink">{{ shortId(r.id) }}</td>
                  <td class="px-3 py-2">
                    <a [routerLink]="['/projects', r.project_id]" class="text-cyan3 hover:underline">{{ r.project_name || '—' }}</a>
                  </td>
                  <td class="px-3 py-2 text-ink2">{{ r.pipeline_type }}</td>
                  <td class="px-3 py-2"><app-status [s]="mapStatus(r.status)"></app-status></td>
                  <td class="px-3 py-2 mono text-[11px] text-ink2">{{ formatTime(r.started_at) }}</td>
                  <td class="px-3 py-2 mono text-[11px] text-ink2">{{ duration(r) }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
})
export class PipelineListComponent implements OnInit {
  private pipelineService = inject(PipelineService);

  runs: PipelineRun[] = [];
  filtered: PipelineRun[] = [];
  loading = false;
  error = '';
  q = '';
  statusFilter: 'all' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'PENDING' = 'all';

  ngOnInit(): void {
    this.refresh();
  }

  refresh(): void {
    this.loading = true;
    this.error = '';
    this.pipelineService.listAll().subscribe({
      next: (resp) => {
        this.runs = resp.runs || [];
        this.apply();
        this.loading = false;
      },
      error: (e) => {
        this.error = e?.error?.detail || 'Failed to load pipelines';
        this.loading = false;
      },
    });
  }

  apply(): void {
    const q = this.q.trim().toLowerCase();
    this.filtered = this.runs.filter((r) => {
      if (this.statusFilter !== 'all' && r.status !== this.statusFilter) return false;
      if (!q) return true;
      return (
        r.id.toLowerCase().includes(q) ||
        (r.project_name || '').toLowerCase().includes(q) ||
        r.status.toLowerCase().includes(q) ||
        r.pipeline_type.toLowerCase().includes(q)
      );
    });
  }

  shortId(id: string): string {
    return id ? id.substring(0, 8) : '';
  }

  formatTime(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleString();
  }

  duration(r: PipelineRun): string {
    if (!r.started_at) return '—';
    const end = r.finished_at ? new Date(r.finished_at).getTime() : Date.now();
    const ms = end - new Date(r.started_at).getTime();
    if (ms < 0) return '—';
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ${s % 60}s`;
    return `${Math.floor(m / 60)}h ${m % 60}m`;
  }

  mapStatus(s: PipelineRun['status']): StatusKey {
    switch (s) {
      case 'RUNNING': return 'running';
      case 'SUCCEEDED': return 'success';
      case 'FAILED': return 'failed';
      case 'PENDING': return 'queued';
      default: return 'idle';
    }
  }
}
