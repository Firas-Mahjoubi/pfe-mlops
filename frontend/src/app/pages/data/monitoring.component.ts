import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IconComponent } from '../../shared/ui/icon/icon.component';

@Component({
  selector: 'app-monitoring',
  standalone: true,
  imports: [CommonModule, IconComponent],
  template: `
    <div class="p-4 space-y-3">
      <div>
        <h1 class="text-[22px] font-semibold tracking-tight">Monitoring</h1>
        <p class="text-[12.5px] text-ink3">Cluster health, pipeline runs, and deployment metrics</p>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <a href="http://localhost:8080" target="_blank" rel="noopener" class="group bg-card border border-line rounded-lg p-5 hover:border-cyan3/40 transition-colors">
          <div class="flex items-start gap-3">
            <div class="w-10 h-10 rounded-lg bg-cyan3/10 flex items-center justify-center shrink-0">
              <app-icon name="pipeline" className="w-5 h-5 text-cyan3"></app-icon>
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="text-[13.5px] font-medium text-ink">Kubeflow Pipelines UI</span>
                <app-icon name="chevron" className="w-3 h-3 text-ink3 group-hover:text-cyan3 transition-colors"></app-icon>
              </div>
              <p class="text-[12px] text-ink3 mt-1">Argo workflow DAGs, pod logs, run history</p>
              <div class="mt-2 mono text-[10.5px] text-ink3">localhost:8080</div>
            </div>
          </div>
        </a>

        <a href="http://localhost:3000" target="_blank" rel="noopener" class="group bg-card border border-line rounded-lg p-5 hover:border-cyan3/40 transition-colors">
          <div class="flex items-start gap-3">
            <div class="w-10 h-10 rounded-lg bg-cyan3/10 flex items-center justify-center shrink-0">
              <app-icon name="activity" className="w-5 h-5 text-cyan3"></app-icon>
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="text-[13.5px] font-medium text-ink">Grafana</span>
                <app-icon name="chevron" className="w-3 h-3 text-ink3 group-hover:text-cyan3 transition-colors"></app-icon>
              </div>
              <p class="text-[12px] text-ink3 mt-1">Cluster CPU/RAM dashboards, Prometheus metrics</p>
              <div class="mt-2 mono text-[10.5px] text-ink3">localhost:3000 <span class="text-ink3">(if configured)</span></div>
            </div>
          </div>
        </a>
      </div>

      <div class="bg-card border border-line rounded-lg p-5">
        <div class="flex items-center justify-between mb-4">
          <div class="text-[11px] font-semibold tracking-[0.08em] uppercase text-ink3">What lives here today</div>
          <span class="mono text-[10px] text-ink3">integrated in sidebar + dashboard</span>
        </div>
        <ul class="space-y-2.5 text-[12.5px] text-ink2">
          <li class="flex items-start gap-2">
            <app-icon name="check" className="w-3.5 h-3.5 text-good shrink-0 mt-0.5"></app-icon>
            <span><span class="text-ink font-medium">Cluster CPU / GPU / MEM</span> — live gauges in the sidebar footer</span>
          </li>
          <li class="flex items-start gap-2">
            <app-icon name="check" className="w-3.5 h-3.5 text-good shrink-0 mt-0.5"></app-icon>
            <span><span class="text-ink font-medium">Running pipeline runs</span> — polled every 5 s from the Dashboard "Running Now" panel</span>
          </li>
          <li class="flex items-start gap-2">
            <app-icon name="check" className="w-3.5 h-3.5 text-good shrink-0 mt-0.5"></app-icon>
            <span><span class="text-ink font-medium">Deployment CPU / RAM</span> — per-pod metrics in the Deployments page</span>
          </li>
          <li class="flex items-start gap-2">
            <app-icon name="check" className="w-3.5 h-3.5 text-good shrink-0 mt-0.5"></app-icon>
            <span><span class="text-ink font-medium">Serving monitoring: request volume, error rate, p95 latency, per-deployment &amp; public API usage</span> — each project's <span class="text-ink font-medium">Monitoring</span> tab</span>
          </li>
          <li class="flex items-start gap-2">
            <app-icon name="dot" className="w-3.5 h-3.5 text-ink3 shrink-0 mt-0.5"></app-icon>
            <span class="text-ink3"><span class="text-ink2 font-medium">Data & concept drift</span> — planned for v3 on top of the prediction telemetry</span>
          </li>
        </ul>
      </div>
    </div>
  `,
})
export class MonitoringComponent {}
