import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  AdminService, AdminProjectRow, AdminDeploymentRow, AdminPipelineRow,
} from '../../core/services/admin.service';

type Tab = 'projects' | 'deployments' | 'pipelines';

@Component({
  selector: 'app-admin-resources',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="p-4 space-y-4">
      <div>
        <h1 class="text-[22px] font-semibold tracking-tight">Resources</h1>
        <p class="text-[12.5px] text-ink3 mt-0.5">Every project, deployment, and pipeline run across all users.</p>
      </div>

      <div class="inline-flex items-center rounded-md bg-raised/40 border border-white/5 p-0.5">
        @for (t of tabs; track t) {
          <button (click)="select(t)"
            [class]="'h-7 px-3 rounded text-[12.5px] capitalize transition-colors ' + (tab === t ? 'bg-cyan3/15 text-cyan2' : 'text-ink2 hover:text-ink')">
            {{ t }}
          </button>
        }
      </div>

      @if (loading) {
        <div class="text-ink3 text-[13px] py-10 text-center">Loading…</div>
      } @else {
        <div class="bg-card border border-line rounded-lg overflow-x-auto">
          @switch (tab) {
            @case ('projects') {
              <table class="w-full min-w-[640px] text-[13px]">
                <thead><tr class="border-b border-line text-left text-ink3">
                  <th class="px-4 py-2.5 font-medium">Project</th>
                  <th class="px-4 py-2.5 font-medium">Owner</th>
                  <th class="px-4 py-2.5 font-medium text-right">Created</th>
                </tr></thead>
                <tbody class="divide-y divide-line">
                  @for (p of projects; track p.id) {
                    <tr class="hover:bg-white/[0.02]">
                      <td class="px-4 py-2.5 text-ink">{{ p.name }}</td>
                      <td class="px-4 py-2.5 text-ink2">{{ p.owner_email }}</td>
                      <td class="px-4 py-2.5 text-right text-ink3 mono text-[11.5px]">{{ p.created_at ? (p.created_at | date:'MMM d, y') : '—' }}</td>
                    </tr>
                  } @empty { <tr><td colspan="3" class="px-4 py-8 text-center text-ink3">No projects.</td></tr> }
                </tbody>
              </table>
            }
            @case ('deployments') {
              <table class="w-full min-w-[760px] text-[13px]">
                <thead><tr class="border-b border-line text-left text-ink3">
                  <th class="px-4 py-2.5 font-medium">Service</th>
                  <th class="px-4 py-2.5 font-medium">Project</th>
                  <th class="px-4 py-2.5 font-medium">Owner</th>
                  <th class="px-4 py-2.5 font-medium">Status</th>
                </tr></thead>
                <tbody class="divide-y divide-line">
                  @for (d of deployments; track d.id) {
                    <tr class="hover:bg-white/[0.02]">
                      <td class="px-4 py-2.5 text-ink mono text-[11.5px]">{{ d.inference_service_name }}</td>
                      <td class="px-4 py-2.5 text-ink2">{{ d.project_name }}</td>
                      <td class="px-4 py-2.5 text-ink2">{{ d.owner_email }}</td>
                      <td class="px-4 py-2.5"><span class="mono text-[10.5px] px-1.5 py-0.5 rounded bg-white/5 text-ink2">{{ d.status }}</span></td>
                    </tr>
                  } @empty { <tr><td colspan="4" class="px-4 py-8 text-center text-ink3">No deployments.</td></tr> }
                </tbody>
              </table>
            }
            @case ('pipelines') {
              <table class="w-full min-w-[760px] text-[13px]">
                <thead><tr class="border-b border-line text-left text-ink3">
                  <th class="px-4 py-2.5 font-medium">Run</th>
                  <th class="px-4 py-2.5 font-medium">Type</th>
                  <th class="px-4 py-2.5 font-medium">Project</th>
                  <th class="px-4 py-2.5 font-medium">Owner</th>
                  <th class="px-4 py-2.5 font-medium">Status</th>
                </tr></thead>
                <tbody class="divide-y divide-line">
                  @for (r of pipelines; track r.id) {
                    <tr class="hover:bg-white/[0.02]">
                      <td class="px-4 py-2.5 text-ink mono text-[11.5px]">{{ r.id.substring(0, 8) }}</td>
                      <td class="px-4 py-2.5 text-ink2">{{ r.pipeline_type }}</td>
                      <td class="px-4 py-2.5 text-ink2">{{ r.project_name }}</td>
                      <td class="px-4 py-2.5 text-ink2">{{ r.owner_email }}</td>
                      <td class="px-4 py-2.5"><span class="mono text-[10.5px] px-1.5 py-0.5 rounded bg-white/5 text-ink2">{{ r.status }}</span></td>
                    </tr>
                  } @empty { <tr><td colspan="5" class="px-4 py-8 text-center text-ink3">No pipeline runs.</td></tr> }
                </tbody>
              </table>
            }
          }
        </div>
      }
    </div>
  `,
})
export class AdminResourcesComponent implements OnInit {
  private admin = inject(AdminService);
  tabs: Tab[] = ['projects', 'deployments', 'pipelines'];
  tab: Tab = 'projects';
  loading = true;

  projects: AdminProjectRow[] = [];
  deployments: AdminDeploymentRow[] = [];
  pipelines: AdminPipelineRow[] = [];
  private loaded: Record<Tab, boolean> = { projects: false, deployments: false, pipelines: false };

  ngOnInit(): void { this.select('projects'); }

  select(t: Tab): void {
    this.tab = t;
    if (this.loaded[t]) { this.loading = false; return; }
    this.loading = true;
    const done = () => { this.loaded[t] = true; this.loading = false; };
    if (t === 'projects') this.admin.listProjects().subscribe({ next: (r) => { this.projects = r; done(); }, error: done });
    else if (t === 'deployments') this.admin.listDeployments().subscribe({ next: (r) => { this.deployments = r; done(); }, error: done });
    else this.admin.listPipelines().subscribe({ next: (r) => { this.pipelines = r; done(); }, error: done });
  }
}
