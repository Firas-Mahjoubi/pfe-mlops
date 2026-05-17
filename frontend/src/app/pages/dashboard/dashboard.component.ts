import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { interval, Subscription } from 'rxjs';
import { ProjectService } from '../../core/services/project.service';
import { PipelineService, PipelineRun, RunMetrics } from '../../core/services/pipeline.service';
import { DeploymentService, Deployment, DeploymentMetrics } from '../../core/services/deployment.service';
import { ExperimentService, MlflowRunWithProject } from '../../core/services/experiment.service';
import { ModelService, GlobalModelEntry, ModelVersion } from '../../core/services/model.service';
import { ActivityService, ActivityEntry, ActivityTone } from '../../core/services/activity.service';
import { ClusterService, ClusterMetrics } from '../../core/services/cluster.service';
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
                @if (projectsDelta > 0) {
                  <span class="text-[11px] text-good">+{{ projectsDelta }} this week</span>
                }
              </div>
              <div class="text-[11px] text-ink3 mt-1">{{ projectsTotal }} total</div>
            </div>
            <div class="opacity-90"><app-sparkline [data]="projectsSpark" [w]="160" [h]="36"></app-sparkline></div>
          </div>
        </div>

        <div class="col-span-3 bg-card border border-line rounded-lg p-3.5 flex flex-col justify-between min-h-[108px] shadow-card">
          <div class="flex items-start justify-between">
            <div>
              <div class="text-[11px] font-semibold tracking-[0.08em] text-ink3 uppercase">Experiments</div>
              <div class="mt-1.5 flex items-baseline gap-2">
                <span class="text-[28px] font-semibold tracking-tight leading-none">{{ experimentsTotal }}</span>
                @if (experimentsLast7 > 0) {
                  <span class="text-[11px] text-good">+{{ experimentsLast7 }} this week</span>
                }
              </div>
              <div class="text-[11px] text-ink3 mt-1">
                @if (experimentsTodayDelta > 0) {
                  {{ experimentsTodayDelta }} today
                } @else {
                  all-time runs
                }
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
                <span class="text-[28px] font-semibold tracking-tight leading-none">{{ modelsTotal }}</span>
                @if (modelsLast7Delta > 0) {
                  <span class="text-[11px] text-good">+{{ modelsLast7Delta }} this week</span>
                }
              </div>
              <div class="text-[11px] text-ink3 mt-1">{{ modelsInProduction }} in production</div>
            </div>
            <div class="opacity-90"><app-sparkline [data]="modelsSpark" [w]="160" [h]="36" color="#85F4FF"></app-sparkline></div>
          </div>
        </div>

        <div class="col-span-3 bg-card border border-line rounded-lg p-3.5 flex flex-col justify-between min-h-[108px] shadow-card">
          <div class="flex items-start justify-between">
            <div>
              <div class="text-[11px] font-semibold tracking-[0.08em] text-ink3 uppercase">Deployments</div>
              <div class="mt-1.5 flex items-baseline gap-2">
                <span class="text-[28px] font-semibold tracking-tight leading-none">{{ deploymentsTotal }}</span>
                @if (deploymentsFailed > 0) {
                  <span class="text-[11px] text-warn">{{ deploymentsFailed }} failed</span>
                } @else if (deploymentsCreating > 0) {
                  <span class="text-[11px] text-cyan3">{{ deploymentsCreating }} creating</span>
                }
              </div>
              <div class="text-[11px] text-ink3 mt-1">{{ deploymentsReady }} ready · {{ deploymentsCreating }} creating · {{ deploymentsFailed }} failed</div>
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
                  @if (deploymentMetrics[d.id]) {
                    <div class="ml-[92px] grid grid-cols-3 gap-3">
                      <!-- CPU -->
                      <div>
                        <div class="flex justify-between mb-1">
                          <span class="text-[10px] text-ink3">CPU</span>
                          <span class="mono text-[10px] text-ink">
                            {{ deploymentMetrics[d.id].cpu_pct != null ? (deploymentMetrics[d.id].cpu_pct + '%') : '—' }}
                          </span>
                        </div>
                        <div class="h-1 rounded-full bg-white/5 overflow-hidden">
                          @if (deploymentMetrics[d.id].cpu_pct != null) {
                            <div class="h-full rounded-full bg-cyan3/70" [style.width.%]="deploymentMetrics[d.id].cpu_pct"></div>
                          }
                        </div>
                      </div>
                      <!-- RAM -->
                      <div>
                        <div class="flex justify-between mb-1">
                          <span class="text-[10px] text-ink3">RAM</span>
                          <span class="mono text-[10px] text-ink">
                            {{ deploymentMetrics[d.id].mem_used_mi }} Mi / {{ deploymentMetrics[d.id].mem_limit_gi }} Gi
                          </span>
                        </div>
                        <div class="h-1 rounded-full bg-white/5 overflow-hidden">
                          <div class="h-full rounded-full bg-cyan2/70" [style.width.%]="deploymentMetrics[d.id].mem_pct"></div>
                        </div>
                      </div>
                      <!-- GPU -->
                      <div>
                        <div class="flex justify-between mb-1">
                          <span class="text-[10px] text-ink3">GPU</span>
                          <span class="mono text-[10px] text-ink">
                            {{ deploymentMetrics[d.id].gpu ? (deploymentMetrics[d.id].gpu + '×') : '—' }}
                          </span>
                        </div>
                        <div class="h-1 rounded-full bg-white/5 overflow-hidden">
                          @if (deploymentMetrics[d.id].gpu) {
                            <div class="h-full w-full rounded-full bg-violet/70"></div>
                          }
                        </div>
                      </div>
                    </div>
                  } @else {
                    <div class="ml-[92px] flex items-center gap-2 text-[11px] text-ink3">
                      <app-icon name="help" className="w-3 h-3 text-ink3"></app-icon>
                      <span>Live metrics unavailable — pod may still be starting or metrics-server has no sample yet.</span>
                    </div>
                  }
                </div>
              }
              @if (liveRuns.length === 0 && activeDeployments.length === 0 && !runsLoading && !deploymentsLoading) {
                <div class="p-6 text-center text-ink3 text-[13px]">No runs or deployments active.</div>
              }
            </div>
          </app-card>

          <!-- Cluster utilization (live, from metrics-server) -->
          <app-card title="Cluster utilization · live" [dense]="true">
            <div right class="flex items-center gap-2 text-[11px] text-ink3">
              @if (clusterReachable) {
                <app-icon name="refresh" className="w-3 h-3"></app-icon>
                <span>{{ clusterMetrics?.node_count ?? '—' }} node{{ (clusterMetrics?.node_count ?? 0) === 1 ? '' : 's' }} · refresh 5s</span>
              } @else {
                <span class="text-ink3">Local-dev mode</span>
              }
            </div>
            <div class="p-4">
              @if (clusterReachable) {
                <div class="grid grid-cols-4 gap-4">
                  @for (u of utilStats; track u.label) {
                    <div>
                      <div class="flex items-center justify-between">
                        <div class="text-[11px] text-ink3">{{ u.label }}</div>
                        <div class="mono text-[13px] text-ink">{{ u.value }}</div>
                      </div>
                      <div class="mt-1.5 h-1.5 rounded-full bg-white/5 overflow-hidden">
                        <div class="h-full transition-all duration-500" [style.width.%]="u.pct" [style.background]="u.color" [style.opacity]="0.85"></div>
                      </div>
                      <div class="mt-1 text-[10.5px] text-ink3">{{ u.sub }}</div>
                    </div>
                  }
                </div>
              } @else {
                <div class="flex items-start gap-3 px-2 py-3">
                  <div class="w-8 h-8 rounded-lg bg-cyan3/10 border border-cyan3/30 flex items-center justify-center shrink-0">
                    <app-icon name="help" className="w-4 h-4 text-cyan3"></app-icon>
                  </div>
                  <div class="flex-1">
                    <div class="text-[13px] font-medium text-ink mb-0.5">No Kubernetes cluster connected</div>
                    <div class="text-[12px] text-ink3 leading-relaxed">
                      Backend is running in Docker Compose mode without access to a cluster.
                      Live CPU / Memory / GPU metrics require an AKS, KinD or minikube cluster
                      with <span class="mono text-ink2">metrics-server</span> installed and the
                      kubeconfig mounted at <span class="mono text-ink2">/root/.kube/config</span>.
                    </div>
                  </div>
                  <div class="text-right shrink-0">
                    <div class="text-[10.5px] text-ink3 uppercase tracking-wider">Queue</div>
                    <div class="mono text-[18px] text-ink mt-0.5">{{ clusterMetrics?.queue_count ?? liveRuns.length }}</div>
                    <div class="text-[10.5px] text-ink3 mt-0.5">active runs</div>
                  </div>
                </div>
              }
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
  private experimentService = inject(ExperimentService);
  private modelService = inject(ModelService);
  private activityService = inject(ActivityService);
  private clusterService = inject(ClusterService);
  private router = inject(Router);
  private subs: Subscription[] = [];

  clusterMetrics: ClusterMetrics | null = null;
  clusterReachable = false;

  projects: Project[] = [];
  activeProjects = 0;
  projectsTotal = 0;
  projectsDelta = 0;

  // Experiments KPI
  allRuns: MlflowRunWithProject[] = [];
  experimentsTotal = 0;
  experimentsLast7 = 0;
  experimentsTodayDelta = 0;

  // Models KPI
  allModels: GlobalModelEntry[] = [];
  modelsTotal = 0;
  modelsInProduction = 0;
  modelsLast7Delta = 0;

  // Deployments KPI breakdown (independent of activeDeployments which is the running list)
  deploymentsTotal = 0;
  deploymentsReady = 0;
  deploymentsCreating = 0;
  deploymentsFailed = 0;

  // Sparklines — recomputed from real data; default to flat zeros until data arrives
  projectsSpark: number[] = Array(7).fill(0);
  expBars: number[] = Array(7).fill(0);
  modelsSpark: number[] = Array(7).fill(0);
  deploySpark: number[] = Array(7).fill(0);

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

  activity: ActivityItem[] = [];

  quickActions: Array<{ icon: IconName; label: string; hint?: string; tone?: 'primary'; action: string; }> = [
    { icon: 'plus',   label: 'Create project',      hint: '⌘N', tone: 'primary', action: 'projects' },
    { icon: 'upload', label: 'Upload code to run',  hint: '.zip · .py · .ipynb',  action: 'projects' },
    { icon: 'beaker', label: 'Compare experiments', hint: '⌘E', action: 'runs/compare' },
    { icon: 'model',  label: 'Open model registry', hint: '⌘M', action: 'models' },
    { icon: 'rocket', label: 'Deploy a model',      action: 'deployments' },
  ];

  // (Synthetic chart fields removed — replaced by real cluster fetch.)

  ngOnInit(): void {
    this.fetchProjects();
    this.fetchExperiments();
    this.fetchModels();
    this.fetchActivity();

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

    /* heavier refresh every 30s: experiments + models KPIs + activity feed */
    this.subs.push(
      interval(30000).subscribe(() => {
        this.fetchExperiments();
        this.fetchModels();
        this.fetchActivity();
      })
    );
  }

  private fetchActivity(): void {
    this.activityService.list(20).subscribe({
      next: (entries) => {
        this.activity = (entries || []).map(e => ({
          t: this.timeAgoIso(e.t_iso),
          who: e.who,
          what: e.what,
          obj: e.obj,
          ctx: e.ctx,
          tone: e.tone,
        }));
      },
      error: () => { /* keep last known activity */ },
    });
  }

  private timeAgoIso(iso: string): string {
    if (!iso) return '';
    const ms = Date.now() - +new Date(iso);
    if (isNaN(ms) || ms < 0) return '';
    const min = Math.floor(ms / 60000);
    if (min < 1) return 'now';
    if (min < 60) return `${min}m`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h}h`;
    const d = Math.floor(h / 24);
    return `${d}d`;
  }

  private fetchProjects(): void {
    this.projectService.list().subscribe({
      next: (rows) => {
        this.projects = rows || [];
        this.projectsTotal = this.projects.length;
        this.activeProjects = this.projects.length;
        this.computeProjectsKpi();
      },
    });
  }

  private fetchExperiments(): void {
    this.experimentService.listAll().subscribe({
      next: (res) => {
        this.allRuns = res.runs || [];
        this.computeExperimentsKpi();
      },
      error: () => { /* keep last known values */ },
    });
  }

  private fetchModels(): void {
    this.modelService.listAll().subscribe({
      next: (res) => {
        this.allModels = res.models || [];
        this.computeModelsKpi();
      },
      error: () => { /* keep last known values */ },
    });
  }

  /** Bucket a list of epoch-millisecond timestamps by day, oldest → newest. */
  private bucketByDay(timestampsMs: number[], days = 7): number[] {
    const now = Date.now();
    const buckets = Array(days).fill(0);
    for (const t of timestampsMs) {
      const ageDays = Math.floor((now - t) / 86400000);
      if (ageDays >= 0 && ageDays < days) {
        buckets[days - 1 - ageDays]++;
      }
    }
    return buckets;
  }

  /** Cumulative count by day — useful for "growth" sparklines. */
  private cumulativeByDay(timestampsMs: number[], days = 7): number[] {
    const buckets = this.bucketByDay(timestampsMs, days);
    let total = 0;
    return buckets.map(c => (total += c));
  }

  private computeProjectsKpi(): void {
    const created = this.projects
      .map(p => +new Date((p as any).created_at))
      .filter(t => !isNaN(t));
    this.projectsSpark = this.cumulativeByDay(created, 12);
    // Delta = projects created in last 7 days
    const cutoff = Date.now() - 7 * 86400000;
    this.projectsDelta = created.filter(t => t >= cutoff).length;
  }

  private computeExperimentsKpi(): void {
    const starts = this.allRuns
      .map(r => Number(r.info?.start_time))
      .filter(t => Number.isFinite(t) && t > 0);
    this.experimentsTotal = starts.length;
    const today = Date.now() - 86400000;
    const last7 = Date.now() - 7 * 86400000;
    this.experimentsLast7 = starts.filter(t => t >= last7).length;
    this.experimentsTodayDelta = starts.filter(t => t >= today).length;
    // Sparkline: if there was activity this week, show daily bars over 7 days.
    // Otherwise widen the lens to weekly bars over 12 weeks so old data still shows.
    if (this.experimentsLast7 > 0) {
      this.expBars = this.bucketByDay(starts, 7);
    } else {
      this.expBars = this.bucketByWeek(starts, 12);
    }
  }

  /** Bucket epoch-ms timestamps by week, oldest -> newest. */
  private bucketByWeek(timestampsMs: number[], weeks = 12): number[] {
    const now = Date.now();
    const buckets = Array(weeks).fill(0);
    const weekMs = 7 * 86400000;
    for (const t of timestampsMs) {
      const ageWeeks = Math.floor((now - t) / weekMs);
      if (ageWeeks >= 0 && ageWeeks < weeks) {
        buckets[weeks - 1 - ageWeeks]++;
      }
    }
    return buckets;
  }

  private computeModelsKpi(): void {
    const allVersions: ModelVersion[] = this.allModels.flatMap(m => m.versions || []);
    this.modelsTotal = allVersions.length;
    this.modelsInProduction = allVersions.filter(v => v.stage === 'Production').length;
    const stamps = allVersions
      .map(v => Number(v.creation_timestamp))
      .filter(t => Number.isFinite(t) && t > 0);
    const last7 = Date.now() - 7 * 86400000;
    this.modelsLast7Delta = stamps.filter(t => t >= last7).length;
    this.modelsSpark = this.cumulativeByDay(stamps, 12);
  }

  private computeDeploymentsKpi(): void {
    this.deploymentsTotal = this.activeDeployments.length;
    this.deploymentsReady = this.activeDeployments.filter(d => d.status === 'READY').length;
    this.deploymentsCreating = this.activeDeployments.filter(d => d.status === 'CREATING').length;
    this.deploymentsFailed = this.activeDeployments.filter(d => d.status === 'FAILED').length;
    const stamps = this.activeDeployments
      .map(d => +new Date(d.created_at || ''))
      .filter(t => !isNaN(t));
    this.deploySpark = this.cumulativeByDay(stamps, 12);
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
  }

  private fetchDeployments(): void {
    this.deploymentService.listActiveDeployments().subscribe({
      next: ({ deployments }) => {
        this.deploymentsLoading = false;
        this.activeDeployments = deployments;
        this.computeDeploymentsKpi();
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

  /** Initial cluster fetch — gives us non-empty utilStats as soon as the page loads. */
  private initClusterHistory(): void {
    this.fetchClusterMetrics();
  }

  /** Pulled by ngOnInit before fetchClusterMetrics returns. Kept as a no-op
      so the existing template doesn't break. */
  private buildClusterChart(): void { /* noop — real chart removed */ }

  /** Renamed from the old synthetic ticker. Now just refreshes from backend. */
  private tickCluster(): void {
    this.fetchClusterMetrics();
  }

  private fetchClusterMetrics(): void {
    this.clusterService.metrics().subscribe({
      next: (m) => {
        this.clusterMetrics = m;
        // Treat as "reachable" only if metrics-server actually returned numbers.
        this.clusterReachable = m.cpu_pct != null || m.memory_pct != null;
        const cpu = m.cpu_pct ?? 0;
        const mem = m.memory_pct ?? 0;
        const gpu = m.gpu_pct;
        const cpuSub = m.cpu_used_cores != null
          ? `${m.cpu_used_cores} / ${m.cpu_total_cores} cores`
          : 'metrics-server unreachable';
        const memSub = m.memory_used_gi != null
          ? `${m.memory_used_gi} / ${m.memory_total_gi} Gi`
          : 'metrics-server unreachable';
        const gpuSub = m.gpu_total > 0
          ? `${m.gpu_total} GPU${m.gpu_total === 1 ? '' : 's'} available`
          : 'no GPU on cluster';
        this.utilStats = [
          { label: 'CPU',    value: m.cpu_pct != null ? `${m.cpu_pct}%` : '—',     sub: cpuSub, pct: cpu, color: '#42C2FF' },
          { label: 'Memory', value: m.memory_pct != null ? `${m.memory_pct}%` : '—', sub: memSub, pct: mem, color: '#B8FFF9' },
          { label: 'GPU',    value: gpu != null ? `${gpu}%` : '—',                 sub: gpuSub, pct: gpu ?? 0, color: '#85F4FF' },
          { label: 'Queue',  value: `${m.queue_count}`, sub: 'active runs', pct: Math.min(m.queue_count * 10, 100), color: '#42C2FF' },
        ];
      },
      error: () => {
        // Backend either has no kubeconfig, or k8s API is unreachable.
        // Show the friendly "no cluster" empty state instead of fake bars.
        this.clusterReachable = false;
        this.clusterMetrics = null;
      },
    });
  }
}
