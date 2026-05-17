import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ExperimentService, MlflowRunWithProject } from '../../core/services/experiment.service';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { StatusComponent, StatusKey } from '../../shared/ui/status/status.component';

@Component({
  selector: 'app-experiment-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, IconComponent, StatusComponent],
  template: `
    <div class="p-4 space-y-3">
      <div class="flex items-start justify-between gap-4">
        <div>
          <h1 class="text-[22px] font-semibold tracking-tight">Experiments</h1>
          <p class="text-[12.5px] text-ink3">
            {{ filtered.length }} of {{ runs.length }} MLflow runs across all projects
          </p>
        </div>
        <button (click)="refresh()" class="h-8 px-3 rounded-md bg-raised/50 border border-white/5 hover:border-white/10 text-[12.5px] text-ink2 hover:text-ink flex items-center gap-1.5">
          <app-icon name="refresh" className="w-3.5 h-3.5"></app-icon>Refresh
        </button>
      </div>

      <div class="flex items-center gap-2 bg-card border border-line rounded-lg p-2">
        <div class="flex items-center gap-2 px-2 h-8 rounded-md bg-raised/50 border border-white/5 flex-1 max-w-[360px] focus-within:border-cyan3/40">
          <app-icon name="search" className="w-3.5 h-3.5 text-ink3"></app-icon>
          <input [(ngModel)]="q" (ngModelChange)="apply()" placeholder="Filter by run or project" class="bg-transparent outline-none text-[12.5px] flex-1 placeholder:text-ink3 text-ink" />
        </div>
      </div>

      @if (loading) {
        <div class="text-center text-ink3 py-12 text-[13px]">Loading runs...</div>
      } @else if (error) {
        <div class="bg-bad/10 border border-bad/30 rounded-lg p-4 text-bad text-[12.5px]">{{ error }}</div>
      } @else if (filtered.length === 0) {
        <div class="bg-card border border-line rounded-lg p-12 text-center">
          <div class="w-10 h-10 mx-auto mb-3 rounded-full bg-raised/50 flex items-center justify-center">
            <app-icon name="beaker" className="w-5 h-5 text-ink3"></app-icon>
          </div>
          <div class="text-[13px] text-ink2">No experiment runs yet</div>
          <div class="text-[11.5px] text-ink3 mt-1">Trigger a pipeline from a project to see runs here</div>
        </div>
      } @else {
        <div class="bg-card border border-line rounded-lg overflow-x-auto">
          <table class="w-full min-w-[760px] text-[12.5px]">
            <thead class="bg-raised/40 text-[10.5px] font-semibold tracking-[0.08em] uppercase text-ink3">
              <tr>
                <th class="text-left px-3 py-2">Run</th>
                <th class="text-left px-3 py-2">Project</th>
                <th class="text-left px-3 py-2">Status</th>
                <th class="text-left px-3 py-2">Started</th>
                <th class="text-left px-3 py-2">Top metric</th>
                <th class="w-8"></th>
              </tr>
            </thead>
            <tbody>
              @for (r of filtered; track r.info.run_id) {
                <tr class="border-t border-line hover:bg-white/[0.02]">
                  <td class="px-3 py-2">
                    <div class="font-medium text-ink">{{ r.info.run_name || shortId(r.info.run_id) }}</div>
                    <div class="mono text-[10.5px] text-ink3">{{ shortId(r.info.run_id) }}</div>
                  </td>
                  <td class="px-3 py-2">
                    <a [routerLink]="['/projects', r.project_id]" class="text-cyan3 hover:underline">{{ r.project_name }}</a>
                  </td>
                  <td class="px-3 py-2"><app-status [s]="mapStatus(r.info.status)"></app-status></td>
                  <td class="px-3 py-2 mono text-[11px] text-ink2">{{ formatTime(r.info.start_time) }}</td>
                  <td class="px-3 py-2 mono text-[11px] text-ink2">{{ topMetric(r) }}</td>
                  <td class="px-3 py-2">
                    <a [routerLink]="['/projects', r.project_id]" class="text-ink3 hover:text-ink">
                      <app-icon name="chevron" className="w-3.5 h-3.5"></app-icon>
                    </a>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
})
export class ExperimentListComponent implements OnInit {
  private expService = inject(ExperimentService);
  private router = inject(Router);

  runs: MlflowRunWithProject[] = [];
  filtered: MlflowRunWithProject[] = [];
  loading = false;
  error = '';
  q = '';

  ngOnInit(): void {
    this.refresh();
  }

  refresh(): void {
    this.loading = true;
    this.error = '';
    this.expService.listAll().subscribe({
      next: (resp) => {
        this.runs = resp.runs || [];
        this.apply();
        this.loading = false;
      },
      error: (e) => {
        this.error = e?.error?.detail || 'Failed to load experiments';
        this.loading = false;
      },
    });
  }

  apply(): void {
    const q = this.q.trim().toLowerCase();
    this.filtered = !q
      ? this.runs
      : this.runs.filter(
          (r) =>
            (r.info.run_name || '').toLowerCase().includes(q) ||
            r.info.run_id.toLowerCase().includes(q) ||
            (r.project_name || '').toLowerCase().includes(q),
        );
  }

  shortId(id: string): string {
    return id ? id.substring(0, 8) : '';
  }

  formatTime(ts: number): string {
    if (!ts) return '—';
    return new Date(ts).toLocaleString();
  }

  mapStatus(s: string): StatusKey {
    switch ((s || '').toUpperCase()) {
      case 'FINISHED': return 'success';
      case 'RUNNING': return 'running';
      case 'FAILED': return 'failed';
      case 'KILLED': return 'canceled';
      case 'SCHEDULED': return 'queued';
      default: return 'idle';
    }
  }

  topMetric(r: MlflowRunWithProject): string {
    const metrics = r.data?.metrics || [];
    if (metrics.length === 0) return '—';
    const priority = ['accuracy', 'f1_score', 'roc_auc', 'r2_score', 'rmse'];
    for (const k of priority) {
      const m = metrics.find((x) => x.key === k);
      if (m) return `${m.key}=${m.value.toFixed(4)}`;
    }
    const m = metrics[0];
    return `${m.key}=${m.value.toFixed(4)}`;
  }
}
