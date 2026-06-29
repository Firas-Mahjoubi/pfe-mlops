import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartData } from 'chart.js';
import { ExperimentService, MlflowRun } from '../../../core/services/experiment.service';

@Component({
  selector: 'app-run-compare',
  standalone: true,
  imports: [CommonModule, BaseChartDirective],
  template: `
    <div class="max-w-screen-xl mx-auto">

      <!-- Page header -->
      <div class="flex items-center gap-3 mb-6">
        <button
          (click)="goBack()"
          class="w-8 h-8 flex items-center justify-center rounded-lg bg-card border border-line text-ink3 hover:text-ink hover:border-white/20 transition-colors"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
          </svg>
        </button>
        <div>
          <h2 class="text-[18px] font-semibold text-ink">Compare Runs</h2>
          <p class="text-[12px] text-ink3">{{ runs.length }} runs · side-by-side comparison</p>
        </div>
      </div>

      @if (loading) {
        <div class="flex items-center justify-center py-24">
          <div class="w-6 h-6 border-2 border-cyan3 border-t-transparent rounded-full animate-spin"></div>
        </div>
      } @else if (runs.length < 2) {
        <div class="flex items-center gap-3 px-4 py-3 bg-bad/10 border border-bad/30 rounded-lg text-[13px] text-bad">
          <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          </svg>
          Select at least 2 runs to compare.
        </div>
      } @else {

        <!-- Overall winner banner -->
        @if (winner(); as w) {
          <div class="relative overflow-hidden rounded-xl border p-4 mb-5" [style.border-color]="w.color">
            <div class="absolute -top-10 -right-10 w-36 h-36 rounded-full blur-3xl pointer-events-none opacity-20" [style.background]="w.color"></div>
            <div class="relative flex items-center gap-3.5">
              <div class="w-11 h-11 rounded-xl bg-amber-400/15 border border-amber-400/30 flex items-center justify-center shrink-0">
                <svg class="w-5 h-5 text-amber-300" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                </svg>
              </div>
              <div class="min-w-0">
                <div class="text-[10.5px] font-semibold tracking-[0.1em] uppercase text-ink3">Overall winner</div>
                <div class="text-[15px] font-semibold text-ink truncate" [style.color]="w.color">{{ w.name }}</div>
              </div>
              <div class="ml-auto text-right shrink-0">
                <div class="mono text-[15px] font-semibold text-ink">{{ w.wins }} / {{ w.total }}</div>
                <div class="text-[10.5px] text-ink3">metrics won</div>
              </div>
            </div>
          </div>
        }

        <!-- Run identity cards -->
        <div class="grid gap-3 mb-5" [style.grid-template-columns]="'auto repeat(' + runs.length + ', 1fr)'">
          <div></div>
          @for (run of runs; track run.info.run_id; let i = $index) {
            <div class="bg-card border rounded-xl p-3.5" [style.border-color]="runColor(i)">
              <div class="flex items-center gap-2 mb-2">
                <div class="w-2.5 h-2.5 rounded-full shrink-0" [style.background]="runColor(i)"></div>
                <span class="text-[13px] font-semibold text-ink truncate">{{ run.info.run_name || run.info.run_id.substring(0, 8) }}</span>
              </div>
              <div class="mono text-[10.5px] text-ink3 mb-2">{{ run.info.run_id.substring(0, 20) }}…</div>
              <span [class]="statusClass(run.info.status)" class="text-[11px]">{{ run.info.status }}</span>
            </div>
          }
        </div>

        <!-- Chart card -->
        @if (allMetricKeys.length > 0) {
          <div class="bg-card border border-line rounded-xl p-5 mb-5">
            <div class="flex items-center justify-between mb-4">
              <div class="text-[11px] font-semibold tracking-[0.08em] uppercase text-ink3">Metrics Comparison</div>
              <div class="flex items-center gap-3">
                @for (run of runs; track run.info.run_id; let i = $index) {
                  <div class="flex items-center gap-1.5">
                    <div class="w-2.5 h-2.5 rounded-sm" [style.background]="runColor(i)"></div>
                    <span class="text-[11px] text-ink2 truncate max-w-[120px]">{{ run.info.run_name || run.info.run_id.substring(0,8) }}</span>
                  </div>
                }
              </div>
            </div>
            <div class="h-64">
              <canvas
                baseChart
                [data]="metricsChartData"
                [options]="chartOptions"
                [type]="chartType"
              ></canvas>
            </div>
          </div>
        }

        <!-- Metrics table (best starred + inline delta from best) -->
        @if (allMetricKeys.length > 0) {
          <div class="bg-card border border-line rounded-xl overflow-hidden mb-4">
            <div class="px-5 h-10 flex items-center justify-between border-b border-line">
              <div class="text-[11px] font-semibold tracking-[0.08em] uppercase text-ink3">Metrics</div>
              @if (allMetricKeys.length > headlineMetricKeys().length) {
                <button (click)="showAllMetrics = !showAllMetrics"
                  class="text-[11px] text-ink3 hover:text-cyan3 transition-colors inline-flex items-center gap-1">
                  {{ showAllMetrics ? 'Key metrics only' : 'All metrics (' + allMetricKeys.length + ')' }}
                </button>
              }
            </div>
            <table class="w-full">
              <thead>
                <tr class="border-b border-line">
                  <th class="text-left px-5 py-2.5 text-[10.5px] font-semibold tracking-[0.07em] uppercase text-ink3 w-40">Metric</th>
                  @for (run of runs; track run.info.run_id; let i = $index) {
                    <th class="text-right px-5 py-2.5 text-[10.5px] font-semibold tracking-[0.07em] uppercase" [style.color]="runColor(i)">
                      {{ run.info.run_name || run.info.run_id.substring(0, 8) }}
                    </th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (metric of shownMetricKeys(); track metric) {
                  <tr class="border-b border-line/50 hover:bg-white/[0.015] transition-colors">
                    <td class="px-5 py-3 text-[12.5px] text-ink2 font-medium">{{ metricRowLabel(metric) }}</td>
                    @for (run of runs; track run.info.run_id) {
                      <td class="px-5 py-3 text-right">
                        @if (getMetricValue(run, metric) !== null) {
                          <div class="inline-flex items-center gap-1.5 justify-end">
                            @if (isBest(metric, getMetricValue(run, metric))) {
                              <svg class="w-3 h-3 text-good shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                              </svg>
                            } @else if (runs.length >= 2 && formatDelta(metric, getMetricValue(run, metric)) !== '—') {
                              <span class="mono text-[10.5px] px-1 py-0.5 rounded" [class]="deltaClass(metric, getMetricValue(run, metric))">
                                {{ formatDelta(metric, getMetricValue(run, metric)) }}
                              </span>
                            }
                            <span class="mono text-[12.5px] font-medium" [class]="isBest(metric, getMetricValue(run, metric)) ? 'text-good' : 'text-ink'">
                              {{ getMetricValue(run, metric)!.toFixed(4) }}
                            </span>
                          </div>
                        } @else {
                          <span class="text-ink3 text-[12px]">—</span>
                        }
                      </td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }

        <!-- Parameters table (key hyperparameters by default) -->
        @if (allParamKeys.length > 0) {
          <div class="bg-card border border-line rounded-xl overflow-hidden">
            <div class="px-5 h-10 flex items-center justify-between border-b border-line">
              <div class="text-[11px] font-semibold tracking-[0.08em] uppercase text-ink3">Parameters</div>
              @if (allParamKeys.length > keyParamKeys().length) {
                <button (click)="showAllParams = !showAllParams"
                  class="text-[11px] text-ink3 hover:text-cyan3 transition-colors inline-flex items-center gap-1">
                  {{ showAllParams ? 'Key parameters only' : 'All parameters (' + allParamKeys.length + ')' }}
                </button>
              }
            </div>
            <table class="w-full">
              <thead>
                <tr class="border-b border-line">
                  <th class="text-left px-5 py-2.5 text-[10.5px] font-semibold tracking-[0.07em] uppercase text-ink3 w-40">Parameter</th>
                  @for (run of runs; track run.info.run_id; let i = $index) {
                    <th class="text-right px-5 py-2.5 text-[10.5px] font-semibold tracking-[0.07em] uppercase" [style.color]="runColor(i)">
                      {{ run.info.run_name || run.info.run_id.substring(0, 8) }}
                    </th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (param of shownParamKeys(); track param) {
                  <tr class="border-b border-line/50 hover:bg-white/[0.015] transition-colors">
                    <td class="px-5 py-3 text-[12.5px] text-ink2 font-medium">{{ paramLabel(param) }}</td>
                    @for (run of runs; track run.info.run_id) {
                      <td class="px-5 py-3 mono text-[12px] text-ink text-right">
                        {{ getParamValue(run, param) || '—' }}
                      </td>
                    }
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
export class RunCompareComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private experimentService = inject(ExperimentService);

  runs: MlflowRun[] = [];
  loading = true;
  allMetricKeys: string[] = [];
  allParamKeys: string[] = [];
  showAllMetrics = false;
  showAllParams = false;

  chartType: 'bar' = 'bar';
  metricsChartData: ChartData<'bar'> = { labels: [], datasets: [] };

  chartOptions: ChartConfiguration<'bar'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        ticks: { color: '#7a8a99', font: { size: 11 } },
        grid: { color: 'rgba(255,255,255,0.04)' },
        border: { color: 'rgba(255,255,255,0.06)' },
      },
      y: {
        ticks: { color: '#7a8a99', font: { size: 11 } },
        grid: { color: 'rgba(255,255,255,0.04)' },
        border: { color: 'rgba(255,255,255,0.06)' },
        beginAtZero: true,
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(10,20,30,0.92)',
        borderColor: 'rgba(66,194,255,0.2)',
        borderWidth: 1,
        titleColor: '#c8d8e8',
        bodyColor: '#7a8a99',
        padding: 10,
      },
    },
  };

  private readonly palette = [
    { bg: 'rgba(66,194,255,0.75)',  border: 'rgba(66,194,255,1)',  solid: '#42C2FF' },
    { bg: 'rgba(139,92,246,0.75)',  border: 'rgba(139,92,246,1)',  solid: '#8B5CF6' },
    { bg: 'rgba(245,158,11,0.75)',  border: 'rgba(245,158,11,1)',  solid: '#F59E0B' },
    { bg: 'rgba(52,211,153,0.75)',  border: 'rgba(52,211,153,1)',  solid: '#34D399' },
    { bg: 'rgba(248,113,113,0.75)', border: 'rgba(248,113,113,1)', solid: '#F87171' },
  ];

  // The only metrics surfaced by default: eval keys preferred, training_* hidden.
  private readonly HEADLINE: { label: string; keys: string[] }[] = [
    { label: 'Accuracy', keys: ['accuracy', 'accuracy_score', 'accuracy_score_X_test', 'test_accuracy', 'val_accuracy'] },
    { label: 'F1', keys: ['f1_score', 'f1', 'f1_score_X_test', 'test_f1_score', 'val_f1'] },
    { label: 'ROC-AUC', keys: ['roc_auc', 'roc_auc_score', 'roc_auc_X_test', 'auc'] },
  ];

  // Meaningful sklearn hyperparameters, matched after stripping the estimator
  // prefix autolog adds (clf__, model__, …). Everything else hides behind a toggle.
  private readonly KEY_PARAMS = new Set([
    'n_estimators', 'max_depth', 'learning_rate', 'c', 'kernel', 'gamma',
    'criterion', 'max_features', 'min_samples_split', 'min_samples_leaf',
    'penalty', 'solver', 'max_iter', 'n_neighbors', 'subsample', 'num_leaves',
    'alpha', 'l1_ratio', 'random_state', 'class_weight',
  ]);
  private readonly ESTIMATOR_PARAMS = new Set(['clf', 'model', 'estimator', 'classifier', 'regressor']);
  private readonly PARAM_PREFIXES = ['clf__', 'model__', 'estimator__', 'classifier__', 'regressor__'];

  private stripParamPrefix(key: string): string {
    for (const p of this.PARAM_PREFIXES) {
      if (key.startsWith(p)) return key.slice(p.length);
    }
    return key;
  }

  // Display name for a param: drop the estimator prefix autolog adds.
  paramLabel(key: string): string {
    return this.stripParamPrefix(key);
  }

  // The logged metric keys that match a headline metric (preserves raw keys so
  // isBest/formatDelta keep working). Falls back to all keys if none match.
  headlineMetricKeys(): string[] {
    const out: string[] = [];
    for (const spec of this.HEADLINE) {
      for (const k of spec.keys) {
        if (this.allMetricKeys.includes(k)) { out.push(k); break; }
      }
    }
    return out.length > 0 ? out : this.allMetricKeys;
  }

  // The metric rows shown in the table/chart, honoring the "show all" toggle.
  shownMetricKeys(): string[] {
    return this.showAllMetrics ? this.allMetricKeys : this.headlineMetricKeys();
  }

  metricRowLabel(key: string): string {
    const spec = this.HEADLINE.find((h) => h.keys.includes(key));
    return spec ? spec.label : key;
  }

  // Key hyperparameters: the estimator descriptor + whitelisted params.
  keyParamKeys(): string[] {
    return this.allParamKeys.filter((k) => {
      const bare = this.stripParamPrefix(k).toLowerCase();
      return this.ESTIMATOR_PARAMS.has(k.toLowerCase()) || this.KEY_PARAMS.has(bare);
    });
  }

  shownParamKeys(): string[] {
    if (this.showAllParams) return this.allParamKeys;
    const key = this.keyParamKeys();
    return key.length > 0 ? key : this.allParamKeys;
  }

  ngOnInit(): void {
    const runIdsParam = this.route.snapshot.queryParamMap.get('run_ids');
    if (!runIdsParam) { this.loading = false; return; }
    const ids = runIdsParam.split(',').filter((x) => x);
    if (ids.length < 2) { this.loading = false; return; }

    this.experimentService.compareRuns(ids).subscribe({
      next: (res) => {
        this.runs = res.runs;
        this.buildKeys();
        this.buildChart();
        this.loading = false;
      },
      error: () => { this.loading = false; },
    });
  }

  runColor(idx: number): string {
    return this.palette[idx % this.palette.length].solid;
  }

  // The run that is best on the most headline metrics (Accuracy/F1/ROC-AUC).
  // Scoring on eval metrics — not the inflated training_* ones — keeps this
  // consistent with the Experiments leaderboard champion. Ties count for no one.
  winner(): { name: string; color: string; wins: number; total: number } | null {
    if (this.runs.length < 2) return null;
    const metrics = this.headlineMetricKeys();
    if (metrics.length === 0) return null;
    const wins = this.runs.map(() => 0);
    for (const metric of metrics) {
      const values = this.runs.map((r) => this.getMetricValue(r, metric));
      const present = values.filter((v): v is number => v !== null);
      if (present.length < 2) continue;
      const lowerIsBetter = /loss|error|rmse|mae/i.test(metric);
      const best = lowerIsBetter ? Math.min(...present) : Math.max(...present);
      const leaders = values.reduce<number[]>((acc, v, i) => {
        if (v === best) acc.push(i);
        return acc;
      }, []);
      if (leaders.length === 1) wins[leaders[0]]++; // sole leader only
    }
    let topIdx = 0;
    for (let i = 1; i < wins.length; i++) if (wins[i] > wins[topIdx]) topIdx = i;
    if (wins[topIdx] === 0) return null;
    const run = this.runs[topIdx];
    return {
      name: run.info.run_name || run.info.run_id.substring(0, 8),
      color: this.runColor(topIdx),
      wins: wins[topIdx],
      total: metrics.length,
    };
  }

  private buildKeys(): void {
    const metricSet = new Set<string>();
    const paramSet = new Set<string>();
    for (const run of this.runs) {
      (run.data.metrics || []).forEach((m) => metricSet.add(m.key));
      (run.data.params || []).forEach((p) => paramSet.add(p.key));
    }
    this.allMetricKeys = Array.from(metricSet).sort();
    this.allParamKeys = Array.from(paramSet).sort();
  }

  private buildChart(): void {
    // Chart only the headline metrics → a few clean bar groups, not a wall.
    const keys = this.headlineMetricKeys();
    this.metricsChartData = {
      labels: keys.map((k) => this.metricRowLabel(k)),
      datasets: this.runs.map((run, idx) => ({
        label: run.info.run_name || run.info.run_id.substring(0, 8),
        data: keys.map((k) => this.getMetricValue(run, k) ?? 0),
        backgroundColor: this.palette[idx % this.palette.length].bg,
        borderColor: this.palette[idx % this.palette.length].border,
        borderWidth: 1,
        borderRadius: 3,
      })),
    };
  }

  getMetricValue(run: MlflowRun, key: string): number | null {
    const m = (run.data.metrics || []).find((x) => x.key === key);
    return m ? m.value : null;
  }

  getParamValue(run: MlflowRun, key: string): string | null {
    const p = (run.data.params || []).find((x) => x.key === key);
    return p ? p.value : null;
  }

  isBest(metric: string, value: number | null): boolean {
    if (value === null) return false;
    const values = this.runs
      .map((r) => this.getMetricValue(r, metric))
      .filter((v): v is number => v !== null);
    if (values.length < 2) return false;
    const lowerIsBetter = /loss|error|rmse|mae/i.test(metric);
    const best = lowerIsBetter ? Math.min(...values) : Math.max(...values);
    return value === best;
  }

  formatDelta(metric: string, value: number | null): string {
    if (value === null) return '—';
    const values = this.runs
      .map((r) => this.getMetricValue(r, metric))
      .filter((v): v is number => v !== null);
    if (values.length < 2) return value.toFixed(4);
    const lowerIsBetter = /loss|error|rmse|mae/i.test(metric);
    const best = lowerIsBetter ? Math.min(...values) : Math.max(...values);
    const delta = value - best;
    if (delta === 0) return '—';
    return (delta > 0 ? '+' : '') + delta.toFixed(4);
  }

  deltaClass(metric: string, value: number | null): string {
    if (value === null) return 'text-ink3';
    const values = this.runs
      .map((r) => this.getMetricValue(r, metric))
      .filter((v): v is number => v !== null);
    if (values.length < 2) return 'text-ink2';
    const lowerIsBetter = /loss|error|rmse|mae/i.test(metric);
    const best = lowerIsBetter ? Math.min(...values) : Math.max(...values);
    const delta = value - best;
    if (delta === 0) return 'text-ink3';
    const isWorse = lowerIsBetter ? delta < 0 : delta < 0;
    return isWorse ? 'text-bad' : 'text-good';
  }

  statusClass(status: string): string {
    switch (status) {
      case 'FINISHED': return 'inline-flex items-center px-2 py-0.5 rounded text-[10.5px] font-medium bg-good/10 border border-good/30 text-good';
      case 'RUNNING':  return 'inline-flex items-center px-2 py-0.5 rounded text-[10.5px] font-medium bg-cyan3/10 border border-cyan3/30 text-cyan3';
      case 'FAILED':   return 'inline-flex items-center px-2 py-0.5 rounded text-[10.5px] font-medium bg-bad/10 border border-bad/30 text-bad';
      default:         return 'inline-flex items-center px-2 py-0.5 rounded text-[10.5px] font-medium bg-white/[0.05] border border-line text-ink2';
    }
  }

  goBack(): void {
    window.history.back();
  }
}
