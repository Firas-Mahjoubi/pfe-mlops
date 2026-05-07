import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { interval, Subscription } from 'rxjs';
import { ProjectService } from '../../core/services/project.service';
import { PipelineService, PipelineRun, RunMetrics } from '../../core/services/pipeline.service';
import { DeploymentService, Deployment, DeploymentMetrics } from '../../core/services/deployment.service';
import { Project } from '../../core/models/project.model';
import { IconComponent, IconName } from '../../shared/ui/icon/icon.component';
import { BtnComponent } from '../../shared/ui/btn/btn.component';
import { CardComponent } from '../../shared/ui/card/card.component';
import { StatusComponent } from '../../shared/ui/status/status.component';
import { SparklineComponent } from '../../shared/ui/sparkline/sparkline.component';
import { BarsComponent } from '../../shared/ui/bars/bars.component';

interface ActivityItem {
  t: string;
  who: string;
  what: string;
  obj: string;
  ctx: string;
  tone: 'info' | 'ok' | 'warn' | 'bad' | 'muted';
}

interface LiveRun {
  id: string;
  shortId: string;
  kfpRunId: string;
  label: string;
  pipelineType: string;
  dur: string;
  startedAt: Date | null;
  metrics: RunMetrics | null;
}

interface UtilStat {
  label: string;
  value: string;
  sub: string;
  pct: number;
  color: string;
}

interface ClusterSeries {
  path: string;
  color: string;
  opacity: number;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    IconComponent,
    BtnComponent,
    CardComponent,
    StatusComponent,
    SparklineComponent,
    BarsComponent,
  ],
  template: `
    <div class="p-4 space-y-4">
      <!-- Hero KPI strip -->
      <div class="grid grid-cols-12 gap-3">
        <div class="col-span-3 bg-card border border-line rounded-lg p-3.5 flex flex-col justify-between min-h-[108px] shadow-card">
          <div class="flex items-start justify-between">
            <div>
              <div class="text-[11px] font-semibold tracking-[0.08em] text-ink3 uppercase">Active Projects</div>
              <div class="mt-1.5 flex items-baseline gap-2">
                <span class="text-[28px] font-semibold tracking-tight leading-none">{{ activeProjects }}</span>
                <span class="text-[11px] text-good">+{{ projectsDelta }}</span>
              </div>
              <div class="text-[11px] text-ink3 mt-1">{{ projectsTotal }} total</div>
            </div>
            <div class="opacity-90"><app-sparkline [data]="projectsSpark" [w]="160" [h]="36"></app-sparkline></div>
          </div>
        </div>

        <div class="col-span-3 bg-card border border-line rounded-lg p-3.5 flex flex-col justify-between min-h-[108px] shadow-card">
          <div class="flex items-start justify-between">
            <div>
              <div class="text-[11px] font-semibold tracking-[0.08em] text-ink3 uppercase">Experiments · 7d</div>
              <div class="mt-1.5 flex items-baseline gap-2">
                <span class="text-[28px] font-semibold tracking-tight leading-none">119</span>
                <span class="text-[11px] text-good">+18</span>
              </div>
            </div>
            <div class="opacity-90"><app-bars [data]="expBars" [w]="160" [h]="36"></app-bars></div>
          </div>
        </div>

        <div class="col-span-3 bg-card border border-line rounded-lg p-3.5 flex flex-col justify-between min-h-[108px] shadow-card">
          <div class="flex items-start justify-between">
            <div>
              <div class="text-[11px] font-semibold tracking-[0.08em] text-ink3 uppercase">Models Registered</div>
              <div class="mt-1.5 flex items-baseline gap-2">
                <span class="text-[28px] font-semibold tracking-tight leading-none">39</span>
                <span class="text-[11px] text-good">+3</span>
              </div>
              <div class="text-[11px] text-ink3 mt-1">6 in production</div>
            </div>
            <div class="opacity-90"><app-sparkline [data]="modelsSpark" [w]="160" [h]="36" color="#85F4FF"></app-sparkline></div>
          </div>
        </div>

        <div class="col-span-3 bg-card border border-line rounded-lg p-3.5 flex flex-col justify-between min-h-[108px] shadow-card">
          <div class="flex items-start justify-between">
            <div>
              <div class="text-[11px] font-semibold tracking-[0.08em] text-ink3 uppercase">Deployments</div>
              <div class="mt-1.5 flex items-baseline gap-2">
                <span class="text-[28px] font-semibold tracking-tight leading-none">6</span>
                <span class="text-[11px] text-warn">1 degraded</span>
              </div>
              <div class="text-[11px] text-ink3 mt-1">4 prod · 1 staging · 1 stopped</div>
            </div>
            <div class="opacity-90"><app-sparkline [data]="deploySpark" [w]="160" [h]="36" color="#B8FFF9"></app-sparkline></div>
          </div>
        </div>
      </div>

      <!-- 2-col: live + activity -->
      <div class="grid grid-cols-12 gap-3">
        <div class="col-span-8 space-y-3">
          <!-- Running now -->
          <app-card [dense]="true">
            <div class="flex items-center justify-between px-3 h-9 hairline">
              <div class="text-[12px] font-semibold tracking-[0.04em] text-ink2 uppercase">
                Running now <span class="mono text-cyan3 ml-1">{{ liveRuns.length + activeDeployments.length }}</span>
              </div>
              <div class="flex items-center gap-2">
                <app-btn variant="ghost" size="sm">
                  <app-icon name="refresh" className="w-3.5 h-3.5"></app-icon>Auto-refresh · 5s
                </app-btn>
                <app-btn variant="ghost" size="sm" (click)="goTo('projects')">
                  View all<app-icon name="chevron" className="w-3 h-3"></app-icon>
                </app-btn>
              </div>
            </div>
            <div class="divide-y divide-white/5">
              @if (runsLoading && deploymentsLoading) {
                <div class="p-4 flex gap-3 items-center">
                  <div class="h-2 w-16 rounded bg-white/5 animate-pulse"></div>
                  <div class="h-2 flex-1 rounded bg-white/5 animate-pulse"></div>
                </div>
              }
              @for (r of liveRuns; track r.id) {
                <div class="px-3 py-3 row group transition-colors">
                  <div class="flex items-center gap-3 mb-2">
                    <div class="mono text-[12px] text-cyan3 w-20 shrink-0">{{ r.shortId }}</div>
                    <div class="flex-1 min-w-0 flex items-center gap-2">
                      <span class="text-[12.5px] font-medium truncate">{{ r.label }}</span>
                      <span class="mono text-[10px] text-ink3 shrink-0 px-1 py-px bg-white/5 rounded">pipeline</span>
                    </div>
                    <div class="mono text-[11px] text-ink2 shrink-0">{{ r.dur }}</div>
                    <app-status s="running"></app-status>
                  </div>
                  <div class="ml-[92px] grid grid-cols-3 gap-3">
                    <div>
                      <div class="flex justify-between mb-1">
                        <span class="text-[10px] text-ink3">CPU</span>
                        <span class="mono text-[10px] text-ink">{{ fmtCpu(r.metrics?.cpu_usage_m) }}</span>
                      </div>
                      <div class="h-1 rounded-full bg-white/5 overflow-hidden"><div class="h-full w-full run-bar"></div></div>
                    </div>
                    <div>
                      <div class="flex justify-between mb-1">
                        <span class="text-[10px] text-ink3">RAM</span>
                        <span class="mono text-[10px] text-ink">{{ fmtMem(r.metrics?.mem_usage_mi) }}</span>
                      </div>
                      <div class="h-1 rounded-full bg-white/5 overflow-hidden"><div class="h-full w-full run-bar"></div></div>
                    </div>
                    <div>
                      <div class="flex justify-between mb-1">
                        <span class="text-[10px] text-ink3">Type</span>
                        <span class="mono text-[10px] text-ink">{{ r.pipelineType }}</span>
                      </div>
                    </div>
                  </div>
                </div>
              }
              @for (d of activeDeployments; track d.id) {
                <div class="px-3 py-3 row group transition-colors">
                  <div class="flex items-center gap-3 mb-2">
                    <div class="mono text-[12px] text-good w-20 shrink-0 truncate">{{ d.inference_service_name.slice(0, 8) }}</div>
                    <div class="flex-1 min-w-0 flex items-center gap-2">
                      <span class="text-[12.5px] font-medium truncate">{{ d.inference_service_name }}</span>
                      <span class="mono text-[10px] text-ink3 shrink-0 px-1 py-px bg-white/5 rounded">kserve</span>
                    </div>
                    <div class="mono text-[11px] text-ink2 shrink-0">{{ deploymentAge(d) }}</div>
                    <app-status [s]="d.status === 'READY' ? 'active' : 'running'"></app-status>
                  </div>
                  <div class="ml-[92px] grid grid-cols-3 gap-3">
                    <!-- CPU -->
                    <div>
                      <div class="flex justify-between mb-1">
                        <span class="text-[10px] text-ink3">CPU</span>
                        <span class="mono text-[10px] text-ink">
                          {{ deploymentMetrics[d.id]?.cpu_pct != null ? (deploymentMetrics[d.id].cpu_pct + '%') : '—' }}
                        </span>
                      </div>
                      <div class="h-1 rounded-full bg-white/5 overflow-hidden">
                        @if (deploymentMetrics[d.id]?.cpu_pct != null) {
                          <div class="h-full rounded-full bg-cyan3/70" [style.width.%]="deploymentMetrics[d.id].cpu_pct"></div>
                        } @else {
                          <div class="h-full w-1/4 rounded-full bg-white/10"></div>
                        }
                      </div>
                    </div>
                    <!-- RAM -->
                    <div>
                      <div class="flex justify-between mb-1">
                        <span class="text-[10px] text-ink3">RAM</span>
                        <span class="mono text-[10px] text-ink">
                          {{ deploymentMetrics[d.id] ? (deploymentMetrics[d.id].mem_used_mi + ' Mi / ' + deploymentMetrics[d.id].mem_limit_gi + ' Gi') : '—' }}
                        </span>
                      </div>
                      <div class="h-1 rounded-full bg-white/5 overflow-hidden">
                        @if (deploymentMetrics[d.id]) {
                          <div class="h-full rounded-full bg-cyan2/70" [style.width.%]="deploymentMetrics[d.id].mem_pct"></div>
                        } @else {
                          <div class="h-full w-1/4 rounded-full bg-white/10"></div>
                        }
                      </div>
                    </div>
                    <!-- GPU -->
                    <div>
                      <div class="flex justify-between mb-1">
                        <span class="text-[10px] text-ink3">GPU</span>
                        <span class="mono text-[10px] text-ink">
                          {{ deploymentMetrics[d.id]?.gpu ? (deploymentMetrics[d.id].gpu + '×') : '—' }}
                        </span>
                      </div>
                      <div class="h-1 rounded-full bg-white/5 overflow-hidden">
                        @if (deploymentMetrics[d.id]?.gpu) {
                          <div class="h-full w-full rounded-full bg-violet/70"></div>
                        }
                      </div>
                    </div>
                  </div>
                </div>
              }
              @if (liveRuns.length === 0 && activeDeployments.length === 0 && !runsLoading && !deploymentsLoading) {
                <div class="p-6 text-center text-ink3 text-[13px]">No runs or deployments active.</div>
              }
            </div>
          </app-card>

          <!-- Cluster utilization -->
          <app-card title="Cluster utilization · last 60 min" [dense]="true">
            <div right class="flex items-center gap-3 text-[11px] text-ink3">
              <span class="inline-flex items-center gap-1.5"><span class="w-2 h-2 rounded-sm" style="background:#42C2FF"></span>CPU</span>
              <span class="inline-flex items-center gap-1.5"><span class="w-2 h-2 rounded-sm" style="background:#85F4FF"></span>GPU</span>
              <span class="inline-flex items-center gap-1.5"><span class="w-2 h-2 rounded-sm" style="background:#B8FFF9"></span>Memory</span>
            </div>
            <div class="p-3">
              <div class="relative">
                <svg width="100%" [attr.viewBox]="'0 0 760 140'" preserveAspectRatio="none" class="block h-[160px]">
                  <defs>
                    <linearGradient id="gcpu" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stop-color="#42C2FF" stop-opacity="0.22"/>
                      <stop offset="100%" stop-color="#42C2FF" stop-opacity="0"/>
                    </linearGradient>
                    <pattern id="grid" width="95" height="35" patternUnits="userSpaceOnUse">
                      <path d="M 95 0 L 0 0 0 35" fill="none" stroke="rgba(255,255,255,0.04)" stroke-width="1"/>
                    </pattern>
                  </defs>
                  <rect width="760" height="140" fill="url(#grid)"/>
                  <path [attr.d]="cpuAreaPath" fill="url(#gcpu)"/>
                  @for (s of clusterSeries; track $index) {
                    <path [attr.d]="s.path" [attr.stroke]="s.color" stroke-width="1.25" fill="none" [attr.opacity]="s.opacity"/>
                  }
                </svg>
                <div class="absolute top-1 right-1 mono text-[10px] text-ink3">100%</div>
                <div class="absolute bottom-1 right-1 mono text-[10px] text-ink3">0%</div>
              </div>
              <div class="grid grid-cols-4 gap-3 mt-3">
                @for (u of utilStats; track u.label) {
                  <div>
                    <div class="flex items-center justify-between">
                      <div class="text-[11px] text-ink3">{{ u.label }}</div>
                      <div class="mono text-[12px]">{{ u.value }}</div>
                    </div>
                    <div class="mt-1 h-1 rounded-full bg-white/5 overflow-hidden">
                      <div class="h-full" [style.width.%]="u.pct" [style.background]="u.color" [style.opacity]="0.85"></div>
                    </div>
                    <div class="mt-1 text-[10.5px] text-ink3">{{ u.sub }}</div>
                  </div>
                }
              </div>
            </div>
          </app-card>
        </div>

        <!-- Right column -->
        <div class="col-span-4 space-y-3">
          <app-card title="Quick actions" [dense]="true">
            <div class="p-2 grid grid-cols-1 gap-1">
              @for (q of quickActions; track q.label) {
                <button (click)="quickAction(q.action)" [class]="'group flex items-center gap-2.5 h-9 px-2 rounded-md text-left transition-colors duration-150 ' + (q.tone === 'primary' ? 'hover:bg-cyan3/10' : 'hover:bg-white/[0.04]')">
                  <span [class]="'w-7 h-7 rounded-md flex items-center justify-center ' + (q.tone === 'primary' ? 'bg-cyan3/15 text-cyan3 group-hover:bg-cyan3/20' : 'bg-white/[0.04] text-ink2 group-hover:text-ink')">
                    <app-icon [name]="q.icon" className="w-3.5 h-3.5"></app-icon>
                  </span>
                  <span class="text-[13px] text-ink flex-1">{{ q.label }}</span>
                  @if (q.hint) {
                    <span class="mono text-[10px] text-ink3 group-hover:text-ink2">{{ q.hint }}</span>
                  }
                </button>
              }
            </div>
          </app-card>

          <app-card title="Activity" [dense]="true">
            <div right>
              <app-btn variant="ghost" size="sm">Filter<app-icon name="filter" className="w-3 h-3"></app-icon></app-btn>
            </div>
            <div class="px-3 py-2 max-h-[380px] overflow-y-auto">
              @for (a of activity; track $index) {
                <div class="flex gap-2.5 py-1.5">
                  <div class="relative pt-1.5 flex flex-col items-center">
                    <div [class]="'w-1.5 h-1.5 rounded-full ' + dotTone(a.tone)"></div>
                    <div class="w-px flex-1 bg-white/5 mt-1"></div>
                  </div>
                  <div class="flex-1 pb-1.5">
                    <div class="text-[12.5px] leading-snug">
                      <span [class]="textTone(a.tone)">{{ a.who }}</span>
                      <span class="text-ink3"> {{ a.what }} </span>
                      <span class="mono text-cyan3">{{ a.obj }}</span>
                    </div>
                    @if (a.ctx) {
                      <div class="text-[11px] text-ink3 mt-0.5">{{ a.ctx }}</div>
                    }
                  </div>
                  <div class="mono text-[10.5px] text-ink3 pt-1.5">{{ a.t }}</div>
                </div>
              }
            </div>
          </app-card>
        </div>
      </div>
    </div>
  `,
})
export class DashboardComponent implements OnInit, OnDestroy {
  private projectService = inject(ProjectService);
  private pipelineService = inject(PipelineService);
  private deploymentService = inject(DeploymentService);
  private router = inject(Router);
  private subs: Subscription[] = [];

  projects: Project[] = [];
  activeProjects = 0;
  projectsTotal = 0;
  projectsDelta = 2;

  projectsSpark = [3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 8];
  expBars = [8, 12, 14, 9, 22, 18, 36];
  modelsSpark = [30, 31, 31, 33, 34, 35, 36, 37, 37, 38, 38, 39];
  deploySpark = [1180, 1210, 1240, 1190, 1400, 1520, 1480, 1600, 1580, 1620, 1700, 1760];

  liveRuns: LiveRun[] = [];
  runsLoading = true;
  activeDeployments: Deployment[] = [];
  deploymentsLoading = true;
  deploymentMetrics: Record<string, DeploymentMetrics> = {};

  utilStats: UtilStat[] = [
    { label: 'CPU avg', value: '38%', sub: 'peak 62%', pct: 38, color: '#42C2FF' },
    { label: 'GPU avg', value: '71%', sub: 'peak 94%', pct: 71, color: '#85F4FF' },
    { label: 'Memory', value: '54%', sub: 'peak 68%', pct: 54, color: '#B8FFF9' },
    { label: 'Queue',  value: '3',   sub: 'avg wait 42s', pct: 30, color: '#42C2FF' },
  ];

  activity: ActivityItem[] = [
    { t: '2m',  who: 'firas.m', what: 'started run',     obj: 'd83bb58a',            ctx: 'red-wine / pipelines',     tone: 'info'  },
    { t: '14m', who: 'firas.m', what: 'promoted model',  obj: 'wine-quality-gbm:v14', ctx: 'staging → production',    tone: 'ok'    },
    { t: '22m', who: 'bot',     what: 'auto-registered', obj: 'exp_0240',            ctx: 'rf-baseline',              tone: 'muted' },
    { t: '1h',  who: 'm.chen',  what: 'pushed',          obj: 'commit 4f3c',         ctx: 'defect-vision / code',     tone: 'info'  },
    { t: '1h',  who: 'l.sousa', what: 'deployed',        obj: 'two-tower-recs:v4',   ctx: 'staging',                  tone: 'info'  },
    { t: '2h',  who: 'bot',     what: 'alert — drift',   obj: 'churn-logistic',      ctx: 'PSI 0.31 on feature age',  tone: 'warn'  },
    { t: '3h',  who: 'a.patel', what: 'created project', obj: 'demand-forecast',     ctx: '',                         tone: 'info'  },
    { t: '5h',  who: 'firas.m', what: 'run failed',      obj: 'f019e8c2',            ctx: 'train_v3.ipynb · OOM',     tone: 'bad'   },
  ];

  quickActions: Array<{ icon: IconName; label: string; hint?: string; tone?: 'primary'; action: string; }> = [
    { icon: 'plus',   label: 'Create project',      hint: '⌘N', tone: 'primary', action: 'projects' },
    { icon: 'upload', label: 'Upload code to run',  hint: '.zip · .py · .ipynb',  action: 'projects' },
    { icon: 'beaker', label: 'Compare experiments', hint: '⌘E', action: 'runs/compare' },
    { icon: 'model',  label: 'Open model registry', hint: '⌘M', action: 'models' },
    { icon: 'rocket', label: 'Deploy a model',      action: 'deployments' },
  ];

  clusterSeries: ClusterSeries[] = [];
  cpuAreaPath = '';

  /* rolling history buffers for the live chart */
  private cpuHistory: number[] = [];
  private gpuHistory: number[] = [];
  private memHistory: number[] = [];
  private cpuCur = 38; private gpuCur = 71; private memCur = 54;

  ngOnInit(): void {
    this.projectService.list().subscribe({
      next: (rows) => {
        this.projects = rows || [];
        this.projectsTotal = this.projects.length;
        this.activeProjects = this.projects.length;
      },
    });

    this.initClusterHistory();
    this.buildClusterChart();

    this.fetchRunning();
    this.fetchDeployments();

    /* auto-refresh every 5s: update durations + refresh runs + tick cluster */
    this.subs.push(
      interval(5000).subscribe(() => {
        this.tickDurations();
        this.fetchRunning();
        this.fetchDeployments();
        this.tickCluster();
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
  }

  private fetchDeployments(): void {
    this.deploymentService.listActiveDeployments().subscribe({
      next: ({ deployments }) => {
        this.deploymentsLoading = false;
        this.activeDeployments = deployments;
        deployments.forEach(d => this.fetchMetrics(d.id));
      },
      error: () => { this.deploymentsLoading = false; },
    });
  }

  private fetchMetrics(deploymentId: string): void {
    this.deploymentService.getMetrics(deploymentId).subscribe({
      next: (m) => { this.deploymentMetrics = { ...this.deploymentMetrics, [deploymentId]: m }; },
      error: () => {},
    });
  }

  deploymentAge(d: Deployment): string {
    if (!d.created_at) return '—';
    return this.elapsedFrom(new Date(d.created_at));
  }

  private fetchRunning(): void {
    this.pipelineService.listRunning().subscribe({
      next: ({ runs }) => {
        this.runsLoading = false;
        this.liveRuns = runs.map(r => ({
          id: r.id,
          shortId: r.id.slice(0, 8),
          kfpRunId: r.kfp_run_id ?? '',
          label: r.parameters?.['entry_script'] || r.parameters?.['dataset_name'] || r.pipeline_type,
          pipelineType: r.parameters?.['model_type'] || r.pipeline_type,
          dur: this.elapsed(r.started_at),
          startedAt: r.started_at ? new Date(r.started_at) : null,
          metrics: r.metrics ?? null,
        }));
      },
      error: () => { this.runsLoading = false; },
    });
  }

  private tickDurations(): void {
    this.liveRuns = this.liveRuns.map(r => ({
      ...r,
      dur: r.startedAt ? this.elapsedFrom(r.startedAt) : r.dur,
    }));
  }

  fmtCpu(milliCores: number | undefined): string {
    if (!milliCores) return '—';
    return milliCores >= 1000 ? `${(milliCores / 1000).toFixed(1)} CPU` : `${milliCores}m`;
  }

  fmtMem(mi: number | undefined): string {
    if (!mi) return '—';
    return mi >= 1024 ? `${(mi / 1024).toFixed(1)} Gi` : `${mi} Mi`;
  }

  elapsed(startedAt: string | null): string {
    if (!startedAt) return '—';
    return this.elapsedFrom(new Date(startedAt));
  }

  elapsedFrom(start: Date): string {
    const s = Math.floor((Date.now() - start.getTime()) / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  }

  goTo(path: string): void {
    this.router.navigate(['/' + path]);
  }

  quickAction(action: string): void {
    this.router.navigateByUrl('/' + action);
  }

  dotTone(tone: ActivityItem['tone']): string {
    return { info: 'bg-cyan3', ok: 'bg-good', warn: 'bg-warn', bad: 'bg-bad', muted: 'bg-ink3' }[tone];
  }

  textTone(tone: ActivityItem['tone']): string {
    return { info: 'text-ink', ok: 'text-good', warn: 'text-warn', bad: 'text-bad', muted: 'text-ink3' }[tone];
  }

  private initClusterHistory(): void {
    const n = 60;
    const mk = (seed: number) => { let x = seed; return () => { x = (x * 9301 + 49297) % 233280; return x / 233280; }; };
    const r1 = mk(11), r2 = mk(22), r3 = mk(33);
    let a = 38, b = 71, c = 54;
    for (let i = 0; i < n; i++) {
      a = Math.max(10, Math.min(80, a + (r1() - 0.5) * 6));
      b = Math.max(30, Math.min(98, b + (r2() - 0.5) * 5));
      c = Math.max(30, Math.min(75, c + (r3() - 0.5) * 3));
      this.cpuHistory.push(a); this.gpuHistory.push(b); this.memHistory.push(c);
    }
    this.cpuCur = a; this.gpuCur = b; this.memCur = c;
  }

  private tickCluster(): void {
    this.cpuCur = Math.max(10, Math.min(80, this.cpuCur + (Math.random() - 0.5) * 6));
    this.gpuCur = Math.max(30, Math.min(98, this.gpuCur + (Math.random() - 0.5) * 5));
    this.memCur = Math.max(30, Math.min(75, this.memCur + (Math.random() - 0.5) * 3));
    this.cpuHistory = [...this.cpuHistory.slice(1), this.cpuCur];
    this.gpuHistory = [...this.gpuHistory.slice(1), this.gpuCur];
    this.memHistory = [...this.memHistory.slice(1), this.memCur];
    this.utilStats = [
      { label: 'CPU avg', value: `${Math.round(this.cpuCur)}%`, sub: `peak ${Math.round(Math.max(...this.cpuHistory.slice(-10)))}%`, pct: this.cpuCur, color: '#42C2FF' },
      { label: 'GPU avg', value: `${Math.round(this.gpuCur)}%`, sub: `peak ${Math.round(Math.max(...this.gpuHistory.slice(-10)))}%`, pct: this.gpuCur, color: '#85F4FF' },
      { label: 'Memory',  value: `${Math.round(this.memCur)}%`, sub: `peak ${Math.round(Math.max(...this.memHistory.slice(-10)))}%`, pct: this.memCur, color: '#B8FFF9' },
      { label: 'Queue',   value: `${this.liveRuns.length}`, sub: 'active runs', pct: Math.min(this.liveRuns.length * 10, 100), color: '#42C2FF' },
    ];
    this.buildClusterChart();
  }

  private buildClusterChart(): void {
    const w = 760, h = 140;
    const lineFor = (data: number[]) => {
      const step = w / (data.length - 1);
      return data.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(h - (v / 100) * (h - 8) - 4).toFixed(1)}`).join(' ');
    };
    const cpuPath = lineFor(this.cpuHistory);
    this.cpuAreaPath = `${cpuPath} L${w},${h} L0,${h} Z`;
    this.clusterSeries = [
      { path: cpuPath,                       color: '#42C2FF', opacity: 1    },
      { path: lineFor(this.gpuHistory),      color: '#85F4FF', opacity: 0.85 },
      { path: lineFor(this.memHistory),      color: '#B8FFF9', opacity: 0.85 },
    ];
  }
}
