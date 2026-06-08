import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AdminService, AdminOverview } from '../../core/services/admin.service';

@Component({
  selector: 'app-admin-overview',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="p-4 space-y-4">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-[22px] font-semibold tracking-tight">Administration</h1>
          <p class="text-[12.5px] text-ink3 mt-0.5">Platform-wide overview and management.</p>
        </div>
        <div class="flex items-center gap-2">
          <a routerLink="/admin/users" class="h-8 px-3 rounded-md bg-raised/60 border border-white/5 hover:border-white/10 text-[12.5px] flex items-center">Users</a>
          <a routerLink="/admin/resources" class="h-8 px-3 rounded-md bg-raised/60 border border-white/5 hover:border-white/10 text-[12.5px] flex items-center">Resources</a>
        </div>
      </div>

      @if (loading) {
        <div class="text-ink3 text-[13px] py-10 text-center">Loading overview…</div>
      } @else if (ov) {
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          @for (c of cards; track c.label) {
            <div class="bg-card border border-line rounded-lg p-4">
              <div class="text-[10.5px] font-semibold tracking-[0.08em] uppercase text-ink3">{{ c.label }}</div>
              <div class="mt-2 text-[28px] font-semibold tracking-tight leading-none">{{ c.value }}</div>
            </div>
          }
        </div>

        <div class="bg-card border border-line rounded-lg p-4">
          <div class="text-[11px] font-semibold tracking-[0.08em] uppercase text-ink3 mb-2">Cluster health</div>
          <div class="flex items-center gap-2">
            <span class="w-2 h-2 rounded-full" [class]="ov.cluster_healthy ? 'bg-good' : 'bg-bad'"></span>
            <span class="text-[13px]" [class]="ov.cluster_healthy ? 'text-good' : 'text-bad'">
              {{ ov.cluster_healthy ? 'Healthy' : 'Attention needed' }}
            </span>
            <span class="text-[12.5px] text-ink3">— {{ ov.cluster_advice }}</span>
          </div>
        </div>
      } @else {
        <div class="text-bad text-[13px] py-10 text-center">Failed to load overview.</div>
      }
    </div>
  `,
})
export class AdminOverviewComponent implements OnInit {
  private admin = inject(AdminService);
  loading = true;
  ov: AdminOverview | null = null;
  cards: { label: string; value: number }[] = [];

  ngOnInit(): void {
    this.admin.getOverview().subscribe({
      next: (ov) => {
        this.ov = ov;
        this.cards = [
          { label: 'Users', value: ov.users },
          { label: 'Admins', value: ov.admins },
          { label: 'Projects', value: ov.projects },
          { label: 'Pipeline runs', value: ov.pipeline_runs },
          { label: 'Models', value: ov.models },
          { label: 'Deployments', value: ov.active_deployments },
        ];
        this.loading = false;
      },
      error: () => { this.loading = false; },
    });
  }
}
