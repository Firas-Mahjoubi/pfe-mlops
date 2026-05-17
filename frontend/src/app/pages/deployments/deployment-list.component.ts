import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { interval, Subscription } from 'rxjs';
import { DeploymentService, Deployment, DeploymentMetrics } from '../../core/services/deployment.service';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { StatusComponent, StatusKey } from '../../shared/ui/status/status.component';
import { ConfirmDialogComponent } from '../../shared/ui/confirm-dialog/confirm-dialog.component';

@Component({
  selector: 'app-deployment-list',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent, StatusComponent, ConfirmDialogComponent],
  template: `
    <div class="p-4 space-y-3">
      <div class="flex items-start justify-between gap-4">
        <div>
          <h1 class="text-[22px] font-semibold tracking-tight">Deployments</h1>
          <p class="text-[12.5px] text-ink3">
            {{ filtered.length }} of {{ deployments.length }} active KServe deployments
          </p>
        </div>
        <button (click)="refresh()" class="h-8 px-3 rounded-md bg-raised/50 border border-white/5 hover:border-white/10 text-[12.5px] text-ink2 hover:text-ink flex items-center gap-1.5">
          <app-icon name="refresh" className="w-3.5 h-3.5"></app-icon>Refresh
        </button>
      </div>

      <div class="flex items-center gap-2 bg-card border border-line rounded-lg p-2">
        <div class="flex items-center gap-2 px-2 h-8 rounded-md bg-raised/50 border border-white/5 flex-1 max-w-[360px] focus-within:border-cyan3/40">
          <app-icon name="search" className="w-3.5 h-3.5 text-ink3"></app-icon>
          <input [(ngModel)]="q" (ngModelChange)="apply()" placeholder="Filter by service name" class="bg-transparent outline-none text-[12.5px] flex-1 placeholder:text-ink3 text-ink" />
        </div>
      </div>

      @if (loading) {
        <div class="text-center text-ink3 py-12 text-[13px]">Loading deployments...</div>
      } @else if (error) {
        <div class="bg-bad/10 border border-bad/30 rounded-lg p-4 text-bad text-[12.5px]">{{ error }}</div>
      } @else if (filtered.length === 0) {
        <div class="bg-card border border-line rounded-lg p-12 text-center">
          <div class="w-10 h-10 mx-auto mb-3 rounded-full bg-raised/50 flex items-center justify-center">
            <app-icon name="rocket" className="w-5 h-5 text-ink3"></app-icon>
          </div>
          <div class="text-[13px] text-ink2">No active deployments</div>
          <div class="text-[11.5px] text-ink3 mt-1">Deploy a model from a project to see it here</div>
        </div>
      } @else {
        <div class="space-y-2">
          @for (d of filtered; track d.id) {
            <div class="bg-card border border-line rounded-lg p-3">
              <div class="flex items-center justify-between gap-3">
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <app-status [s]="mapStatus(d.status)"></app-status>
                    <span class="text-[13px] font-medium text-ink truncate">{{ d.inference_service_name }}</span>
                  </div>
                  <div class="mt-1 flex items-center gap-3 text-[11px] text-ink3">
                    <span>replicas: <span class="text-ink2">{{ d.replicas }}</span></span>
                    <span>age: <span class="text-ink2">{{ age(d) }}</span></span>
                    @if (d.endpoint_url) {
                      <button (click)="copy(d.endpoint_url!)" class="flex items-center gap-1 text-ink3 hover:text-cyan3 transition-colors">
                        <app-icon name="file" className="w-3 h-3"></app-icon>
                        Copy endpoint
                      </button>
                    }
                  </div>
                </div>
                <button (click)="promptDelete(d)" class="h-7 px-2 rounded bg-bad/10 border border-bad/20 text-bad text-[11.5px] hover:bg-bad/20 shrink-0">Delete</button>
              </div>

              <div class="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <div class="flex justify-between mb-1">
                    <span class="text-[10px] text-ink3">CPU</span>
                    <span class="mono text-[10px] text-ink">{{ metrics[d.id]?.cpu_pct != null ? metrics[d.id].cpu_pct + '%' : '—' }}</span>
                  </div>
                  <div class="h-1 rounded-full bg-white/5 overflow-hidden">
                    @if (metrics[d.id]?.cpu_pct != null) {
                      <div class="h-full rounded-full bg-cyan3/70" [style.width.%]="metrics[d.id].cpu_pct"></div>
                    }
                  </div>
                </div>
                <div>
                  <div class="flex justify-between mb-1">
                    <span class="text-[10px] text-ink3">RAM</span>
                    <span class="mono text-[10px] text-ink">{{ metrics[d.id]?.mem_pct != null ? metrics[d.id].mem_pct + '%' : '—' }}</span>
                  </div>
                  <div class="h-1 rounded-full bg-white/5 overflow-hidden">
                    @if (metrics[d.id]?.mem_pct != null) {
                      <div class="h-full rounded-full bg-cyan3/70" [style.width.%]="metrics[d.id].mem_pct"></div>
                    }
                  </div>
                </div>
                <div>
                  <div class="flex justify-between mb-1">
                    <span class="text-[10px] text-ink3">GPU</span>
                    <span class="mono text-[10px] text-ink">{{ metrics[d.id]?.gpu != null ? metrics[d.id].gpu : '—' }}</span>
                  </div>
                  <div class="h-1 rounded-full bg-white/5 overflow-hidden"></div>
                </div>
              </div>
            </div>
          }
        </div>
      }
    </div>

    @if (confirmOpen) {
      <app-confirm-dialog
        title="Delete deployment"
        [message]="'Delete ' + pendingDelete?.inference_service_name + '? This cannot be undone.'"
        confirmLabel="Delete"
        (confirmed)="doDelete()"
        (dismissed)="confirmOpen = false"
      ></app-confirm-dialog>
    }
  `,
})
export class DeploymentListComponent implements OnInit, OnDestroy {
  private deploymentService = inject(DeploymentService);

  deployments: Deployment[] = [];
  filtered: Deployment[] = [];
  metrics: Record<string, DeploymentMetrics> = {};
  loading = false;
  error = '';
  q = '';

  confirmOpen = false;
  pendingDelete: Deployment | null = null;

  private sub?: Subscription;

  ngOnInit(): void {
    this.refresh();
    this.sub = interval(5000).subscribe(() => {
      this.refresh(true);
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  refresh(silent = false): void {
    if (!silent) this.loading = true;
    this.deploymentService.listActiveDeployments().subscribe({
      next: ({ deployments }) => {
        this.deployments = deployments || [];
        this.apply();
        this.loading = false;
        deployments.forEach((d) => this.fetchMetrics(d.id));
      },
      error: (e) => {
        if (!silent) this.error = e?.error?.detail || 'Failed to load deployments';
        this.loading = false;
      },
    });
  }

  private fetchMetrics(id: string): void {
    this.deploymentService.getMetrics(id).subscribe({
      next: (m) => { this.metrics = { ...this.metrics, [id]: m }; },
      error: () => {},
    });
  }

  apply(): void {
    const q = this.q.trim().toLowerCase();
    this.filtered = !q
      ? this.deployments
      : this.deployments.filter((d) => d.inference_service_name.toLowerCase().includes(q));
  }

  age(d: Deployment): string {
    if (!d.created_at) return '—';
    const ms = Date.now() - new Date(d.created_at).getTime();
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ${m % 60}m`;
    return `${Math.floor(h / 24)}d`;
  }

  mapStatus(s: Deployment['status']): StatusKey {
    switch (s) {
      case 'READY': return 'active';
      case 'CREATING': return 'running';
      case 'FAILED': return 'failed';
      case 'DELETED': return 'archived';
      default: return 'idle';
    }
  }

  copy(text: string): void {
    navigator.clipboard?.writeText(text).catch(() => {});
  }

  promptDelete(d: Deployment): void {
    this.pendingDelete = d;
    this.confirmOpen = true;
  }

  doDelete(): void {
    if (!this.pendingDelete) return;
    const id = this.pendingDelete.id;
    this.confirmOpen = false;
    this.deploymentService.delete(id).subscribe({
      next: () => this.refresh(),
      error: (e) => (this.error = e?.error?.detail || 'Failed to delete deployment'),
    });
  }
}
