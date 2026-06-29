import { AfterViewChecked, Component, ElementRef, ViewChild, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartData } from 'chart.js';
import { ProjectService } from '../../../core/services/project.service';
import { UploadService, UploadedFile, CodeWarning } from '../../../core/services/upload.service';
import { ExperimentService, MlflowRun } from '../../../core/services/experiment.service';
import { PipelineService, PipelineRun, RunLogs, RunError } from '../../../core/services/pipeline.service';
import { ModelService, ModelVersion, ModelStage } from '../../../core/services/model.service';
import {
  DeploymentService,
  Deployment,
  DeploymentStatus,
  ApiKey,
} from '../../../core/services/deployment.service';
import { Project } from '../../../core/models/project.model';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { BtnComponent } from '../../../shared/ui/btn/btn.component';
import { StatusComponent } from '../../../shared/ui/status/status.component';
import { ConfirmDialogComponent } from '../../../shared/ui/confirm-dialog/confirm-dialog.component';
import { environment } from '../../../../environments/environment';

type LogLevel = 'platform' | 'info' | 'warn' | 'error' | 'success' | 'banner' | 'blank';

interface LogLine {
  n: number;
  raw: string;
  level: LogLevel;
  ts?: string;
  source?: string;
  message: string;
}

// A "model" (logical experiment) groups all the runs that trained the same
// algorithm so they can be ranked against each other instead of listed flat.
interface ExperimentGroup {
  key: string;          // model-family label, e.g. "XGBoost"
  runs: MlflowRun[];    // sorted: best primary metric first
  bestRun: MlflowRun;   // the leading run inside this group
  primaryKey: string;   // metric used to rank, e.g. "f1_score"
  primaryValue: number; // best value of that metric in the group
  lowerIsBetter: boolean;
  rank: number;         // 1-based, assigned after sorting groups
}

@Component({
  selector: 'app-project-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, BaseChartDirective, IconComponent, BtnComponent, StatusComponent, ConfirmDialogComponent],
  template: `
    <div class="p-4 space-y-4">
      <!-- Header -->
      <div class="flex items-start justify-between gap-4">
        <div class="flex items-start gap-3 min-w-0">
          <a routerLink="/projects"
             class="mt-1.5 w-7 h-7 rounded-md bg-raised/50 border border-white/5 hover:border-white/10 flex items-center justify-center text-ink2 hover:text-ink">
            <app-icon name="chevronLeft" className="w-3.5 h-3.5"></app-icon>
          </a>
          @if (project) {
            <div class="min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <h1 class="text-[22px] font-semibold tracking-tight">{{ project.name }}</h1>
                <app-status s="active"></app-status>
                <span class="mono text-[11px] text-ink3">prj_{{ project.id.slice(0, 8) }}</span>
              </div>
              <p class="text-[12.5px] text-ink3 mt-0.5">{{ project.description || 'No description' }}</p>
              <div class="flex items-center gap-4 mt-1.5 text-[11.5px] text-ink3">
                <span>Created <span class="text-ink2">{{ project.created_at | date: 'MMM d, y' }}</span></span>
                <span>Updated <span class="text-ink2">{{ timeAgo(project.updated_at) }}</span></span>
                <span class="inline-flex items-center gap-1"><app-icon name="gitBranch" className="w-3 h-3"></app-icon><span class="mono text-ink2">main</span></span>
                @if (project.mlflow_experiment_id) {
                  <span class="flex items-center gap-1"><app-icon name="beaker" className="w-3 h-3"></app-icon><span class="mono text-ink2">exp {{ project.mlflow_experiment_id }}</span></span>
                }
              </div>
            </div>
          }
        </div>
        @if (project) {
          <div class="flex items-center gap-2 shrink-0">
            <app-btn variant="outline" size="md" (click)="activeTab = 'code'">
              <app-icon name="gear" className="w-3.5 h-3.5"></app-icon>Settings
            </app-btn>
            <app-btn variant="outline" size="md" (click)="activeTab = 'code'">
              <app-icon name="upload" className="w-3.5 h-3.5"></app-icon>Import
            </app-btn>
            <app-btn variant="primary" size="md" (click)="activeTab = 'pipelines'">
              <app-icon name="play" className="w-3.5 h-3.5"></app-icon>Run code
            </app-btn>
          </div>
        }
      </div>

      <!-- Tabs -->
      <div class="hairline flex items-center gap-0 -mb-px overflow-x-auto -mx-4 px-4">
        @for (tab of tabs; track tab.id) {
          <button
            (click)="activeTab = tab.id"
            [class]="'h-10 px-3.5 text-[13px] transition-colors inline-flex items-center gap-2 shrink-0 ' + (activeTab === tab.id ? 'tab-active' : 'text-ink2 hover:text-ink')"
          >
            <span>{{ tab.label }}</span>
            @if (tabCount(tab.id) != null) {
              <span class="mono text-[10px] px-1.5 py-[1px] rounded bg-white/5 text-ink3">{{ tabCount(tab.id) }}</span>
            }
          </button>
        }
      </div>

      <!-- Tab Content -->
      @switch (activeTab) {
        @case ('overview') {
          <div class="grid grid-cols-12 gap-4">
            <!-- LEFT COLUMN -->
            <div class="col-span-12 lg:col-span-8 space-y-4">
              <!-- Best Model card -->
              <div class="bg-card border border-line rounded-lg p-4">
                <div class="flex items-center justify-between mb-4">
                  <div class="text-[11px] font-semibold tracking-[0.08em] uppercase text-ink3">Best Model</div>
                  <button (click)="activeTab = 'models'" class="text-[12px] text-ink2 hover:text-cyan3 inline-flex items-center gap-1">
                    Open registry
                    <app-icon name="chevron" className="w-3 h-3"></app-icon>
                  </button>
                </div>
                @if (championVersion()) {
                  <div class="grid grid-cols-12 gap-4">
                    <div class="col-span-12 sm:col-span-6 lg:col-span-3 flex flex-col justify-between">
                      <div class="text-[10.5px] font-semibold tracking-[0.08em] uppercase text-ink3">Current Champion</div>
                      <div class="mt-2">
                        <div class="text-[15px] font-medium text-ink break-all leading-tight">{{ championVersion()!.name }}:v{{ championVersion()!.version }}</div>
                        <div class="mt-2 flex items-center gap-2">
                          <app-status s="production"></app-status>
                          <span class="mono text-[10.5px] text-ink3">{{ championFramework() }}</span>
                        </div>
                      </div>
                    </div>
                    <div class="col-span-6 sm:col-span-6 lg:col-span-3">
                      <div class="text-[10.5px] font-semibold tracking-[0.08em] uppercase text-ink3">{{ championMetric().label }}</div>
                      <div class="mt-2 text-[28px] font-semibold tracking-tight leading-none">{{ championMetric().value }}</div>
                      <div class="mt-2 text-[11px] text-good">{{ championMetric().sub }}</div>
                    </div>
                    <div class="col-span-6 sm:col-span-6 lg:col-span-3">
                      <div class="text-[10.5px] font-semibold tracking-[0.08em] uppercase text-ink3">Total Runs</div>
                      <div class="mt-2 text-[28px] font-semibold tracking-tight leading-none">{{ runs.length }}</div>
                      <div class="mt-2 text-[11px] text-ink3">{{ finishedRunsCount() }} finished</div>
                    </div>
                    <div class="col-span-6 sm:col-span-6 lg:col-span-3">
                      <div class="text-[10.5px] font-semibold tracking-[0.08em] uppercase text-ink3">Versions</div>
                      <div class="mt-2 text-[28px] font-semibold tracking-tight leading-none">{{ modelVersions.length }}</div>
                      <div class="mt-2 text-[11px] text-ink3">{{ modelName || 'no model' }}</div>
                    </div>
                  </div>
                } @else {
                  <div class="py-6 text-center">
                    <div class="text-[12.5px] text-ink2">No production model yet</div>
                    <div class="text-[11px] text-ink3 mt-1">Promote a model version to Production to see it here</div>
                    <button (click)="activeTab = 'models'" class="mt-3 text-[12px] text-cyan3 hover:underline">Go to Models →</button>
                  </div>
                }
              </div>

              <!-- Recent Experiments -->
              <div class="bg-card border border-line rounded-lg">
                <div class="px-4 h-10 flex items-center justify-between border-b border-line">
                  <div class="text-[11px] font-semibold tracking-[0.08em] uppercase text-ink3">Recent Experiments</div>
                  <button (click)="activeTab = 'experiments'" class="text-[12px] text-ink2 hover:text-cyan3 inline-flex items-center gap-1">
                    View all
                    <app-icon name="chevron" className="w-3 h-3"></app-icon>
                  </button>
                </div>
                @if (recentRuns().length === 0) {
                  <div class="py-10 text-center text-[12.5px] text-ink3">No runs yet</div>
                } @else {
                  <div class="divide-y divide-line">
                    @for (r of recentRuns(); track r.info.run_id) {
                      <button (click)="activeTab = 'experiments'" class="w-full flex items-center gap-4 px-4 py-2.5 hover:bg-white/[0.02] text-left">
                        <span class="mono text-[11px] text-cyan3 w-20 shrink-0">{{ shortRunId(r.info.run_id) }}</span>
                        <span class="text-[12.5px] text-ink truncate flex-1">{{ r.info.run_name || 'unnamed' }}</span>
                        <span class="text-[11px] text-ink3 w-24 text-right shrink-0">{{ mapRunStatus(r.info.status) }}</span>
                        <span class="mono text-[11px] text-ink2 w-28 text-right shrink-0">{{ topRunMetric(r) }}</span>
                        <span class="mono text-[11px] text-ink3 w-14 text-right shrink-0">{{ timeAgoMs(r.info.start_time) }}</span>
                      </button>
                    }
                  </div>
                }
              </div>
            </div>

            <!-- RIGHT COLUMN -->
            <div class="col-span-12 lg:col-span-4 space-y-4">
              <!-- Run volume chart -->
              <div class="bg-card border border-line rounded-lg p-4">
                <div class="flex items-center justify-between">
                  <div class="text-[11px] font-semibold tracking-[0.08em] uppercase text-ink3">Run Volume</div>
                  <div class="mono text-[10px] text-ink3">14 days</div>
                </div>
                <div class="mt-4 flex items-end gap-1 h-24">
                  @for (d of runVolumeBars(); track d.label) {
                    <div class="flex-1 flex flex-col justify-end items-stretch h-full" [title]="d.label + ': ' + d.count + ' runs'">
                      <div class="rounded-sm bg-cyan3/60 hover:bg-cyan3 transition-colors" [style.height.%]="d.pct || 3"></div>
                    </div>
                  }
                </div>
                <div class="mt-2 flex items-center justify-between mono text-[10px] text-ink3">
                  <span>{{ runVolumeBars()[0]?.label || '' }}</span>
                  <span>{{ runVolumeBars()[runVolumeBars().length - 1]?.label || '' }}</span>
                </div>
              </div>

              <!-- Contributors -->
              <div class="bg-card border border-line rounded-lg">
                <div class="px-4 h-10 flex items-center border-b border-line">
                  <div class="text-[11px] font-semibold tracking-[0.08em] uppercase text-ink3">Contributors</div>
                </div>
                @if (contributors().length === 0) {
                  <div class="py-8 text-center text-[12.5px] text-ink3">No contributors yet</div>
                } @else {
                  <div class="divide-y divide-line">
                    @for (c of contributors(); track c.name) {
                      <div class="flex items-center gap-2.5 px-4 py-2.5">
                        <div class="w-6 h-6 rounded bg-gradient-to-br from-cyan3 to-cyan2 text-[#06121A] text-[10.5px] font-bold flex items-center justify-center shrink-0">
                          {{ c.initial }}
                        </div>
                        <span class="text-[12.5px] text-ink flex-1 truncate">{{ c.name }}</span>
                        <span class="mono text-[11px] text-ink3">{{ c.runs }} runs</span>
                      </div>
                    }
                  </div>
                }
              </div>
            </div>
          </div>
        }

        @case ('code') {
          <!-- Code Upload Tab -->
          <div>
            <!-- Drag and Drop Zone -->
            <div
              class="border-2 border-dashed rounded-xl p-10 text-center transition mb-6"
              [class]="isDragging
                ? 'border-indigo-500 bg-indigo-500/10'
                : 'border-slate-600 hover:border-slate-500'"
              (dragover)="onDragOver($event)"
              (dragleave)="isDragging = false"
              (drop)="onDrop($event)"
            >
              <svg class="w-12 h-12 text-slate-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
              </svg>
              <p class="text-slate-300 mb-2">Drag and drop your files here</p>
              <p class="text-xs text-slate-500 mb-4">Supports .py, .zip, .ipynb, .csv</p>
              <label class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition cursor-pointer">
                Browse Files
                <input type="file" class="hidden" (change)="onFileSelect($event)" multiple />
              </label>
            </div>

            @if (uploading) {
              <div class="bg-slate-800 rounded-xl p-4 border border-slate-700 mb-6">
                <div class="flex items-center gap-3">
                  <div class="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                  <span class="text-sm text-slate-300">Uploading {{ uploadingFileName }}...</span>
                </div>
              </div>
            }

            @if (uploadSuccess) {
              <div class="bg-green-500/10 border border-green-500/50 text-green-400 px-4 py-3 rounded-lg mb-6 text-sm">
                File uploaded successfully!
              </div>
            }

            <!-- Pre-flight code analysis -->
            @if (analyzingCode) {
              <div class="bg-slate-800 rounded-xl p-4 border border-slate-700 mb-6">
                <div class="flex items-center gap-3">
                  <div class="w-4 h-4 border-2 border-cyan3 border-t-transparent rounded-full animate-spin"></div>
                  <span class="text-sm text-slate-300">Analyzing {{ analyzedFileName }}...</span>
                </div>
              </div>
            } @else if (analyzedFileName) {
              @if (codeWarnings.length === 0) {
                <div class="bg-good/5 border border-good/30 rounded-lg px-4 py-3 mb-6 flex items-start gap-3">
                  <div class="mt-0.5 w-5 h-5 rounded-full bg-good/20 text-good flex items-center justify-center shrink-0 text-[12px] font-bold">✓</div>
                  <div class="text-[13px] text-ink2">
                    <span class="text-good font-medium">{{ analyzedFileName }}</span> looks good — no issues detected.
                  </div>
                </div>
              } @else {
                <div class="bg-amber-500/5 border border-amber-500/30 rounded-xl mb-6">
                  <div class="px-4 py-3 border-b border-amber-500/20 flex items-center justify-between">
                    <div class="flex items-center gap-2">
                      <div class="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-[12px] font-bold">!</div>
                      <div class="text-[13px] font-semibold text-amber-300">
                        {{ codeWarnings.length }} warning{{ codeWarnings.length === 1 ? '' : 's' }} for {{ analyzedFileName }}
                      </div>
                    </div>
                    <div class="text-[11px] text-ink3">advisory · you can still run</div>
                  </div>
                  <ul class="divide-y divide-amber-500/10">
                    @for (w of codeWarnings; track w.code + (w.line_no ?? 0) + (w.snippet ?? '')) {
                      <li class="px-4 py-3">
                        <div class="flex items-start gap-3">
                          <span class="mono text-[10.5px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 shrink-0 mt-0.5">{{ w.code }}</span>
                          <div class="flex-1 min-w-0">
                            <div class="text-[13px] text-ink2 leading-relaxed">{{ w.message }}</div>
                            @if (w.line_no || w.snippet) {
                              <div class="mt-1 text-[11.5px] text-ink3 mono truncate">
                                @if (w.line_no) { <span>line {{ w.line_no }}</span> }
                                @if (w.line_no && w.snippet) { <span class="text-ink3/60"> · </span> }
                                @if (w.snippet) { <span>{{ w.snippet }}</span> }
                              </div>
                            }
                          </div>
                        </div>
                      </li>
                    }
                  </ul>
                </div>
              }
            }

            <!-- File List -->
            <h3 class="text-lg font-semibold text-white mb-4">Uploaded Files</h3>
            @if (files.length === 0) {
              <p class="text-sm text-slate-500 text-center py-8">No files uploaded yet.</p>
            } @else {
              <div class="bg-slate-800 rounded-xl border border-slate-700 overflow-x-auto">
                <table class="w-full min-w-[760px]">
                  <thead>
                    <tr class="border-b border-slate-700">
                      <th class="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Name</th>
                      <th class="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Path</th>
                      <th class="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">Size</th>
                      <th class="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">Modified</th>
                      <th class="w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (file of files; track file.path) {
                      <tr class="border-b border-slate-700/50 hover:bg-slate-700/30">
                        <td class="px-4 py-3 text-sm text-white font-medium">{{ file.name }}</td>
                        <td class="px-4 py-3 text-sm text-slate-400 font-mono text-xs">{{ file.path }}</td>
                        <td class="px-4 py-3 text-sm text-slate-400 text-right">{{ formatSize(file.size) }}</td>
                        <td class="px-4 py-3 text-sm text-slate-400 text-right">{{ file.last_modified | date:'short' }}</td>
                        <td class="px-4 py-3 text-right">
                          <button (click)="promptDeleteFile(file.path, file.name)"
                            class="text-slate-500 hover:text-red-400 transition-colors p-1">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                            </svg>
                          </button>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </div>
        }

        @case ('experiments') {
          <!-- Experiments Tab -->
          <div>
            @if (runs.length === 0) {
              <div class="text-center py-20">
                <div class="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-card border border-line mb-4">
                  <svg class="w-7 h-7 text-ink3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
                  </svg>
                </div>
                <h3 class="text-[14px] font-semibold text-ink mb-1">No experiment runs yet</h3>
                <p class="text-[12.5px] text-ink3">Upload your training code and trigger a pipeline to see results here.</p>
              </div>
            } @else {
              <!-- Register toasts -->
              @if (registerMessage) {
                <div class="flex items-center gap-2 mb-4 px-4 py-3 bg-good/10 border border-good/30 text-good text-[12.5px] rounded-lg">
                  <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                  <span class="flex-1">{{ registerMessage }}</span>
                  <button (click)="activeTab = 'models'" class="underline hover:text-good/80 transition-colors">View in Models</button>
                  <button (click)="registerMessage = ''" class="text-good/60 hover:text-good transition-colors">✕</button>
                </div>
              }
              @if (registerError) {
                <div class="flex items-center gap-2 mb-4 px-4 py-3 bg-bad/10 border border-bad/30 text-bad text-[12.5px] rounded-lg">
                  <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                  <span class="flex-1">{{ registerError }}</span>
                  <button (click)="registerError = ''" class="text-bad/60 hover:text-bad transition-colors">✕</button>
                </div>
              }

              <!-- Champion banner: highest-ranked model -->
              @if (bestGroup(); as best) {
                <div class="relative overflow-hidden rounded-xl border border-cyan3/30 bg-gradient-to-br from-cyan3/[0.07] via-card to-violet/[0.06] p-5 mb-5">
                  <div class="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-cyan3/10 blur-3xl pointer-events-none"></div>
                  <div class="relative flex items-center justify-between gap-5 flex-wrap">
                    <div class="flex items-center gap-4 min-w-0">
                      <div class="w-12 h-12 rounded-xl bg-amber-400/15 border border-amber-400/30 flex items-center justify-center shrink-0">
                        <svg class="w-6 h-6 text-amber-300" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                        </svg>
                      </div>
                      <div class="min-w-0">
                        <div class="text-[10.5px] font-semibold tracking-[0.1em] uppercase text-cyan3">Best model</div>
                        <div class="text-[20px] font-semibold text-ink leading-tight truncate">{{ best.key }}</div>
                        <div class="flex items-center gap-2 mt-1">
                          <div class="flex items-center gap-0.5">
                            @for (s of [1,2,3,4,5]; track s) {
                              <svg class="w-3.5 h-3.5" [class]="s <= groupStars(best) ? 'text-amber-300' : 'text-ink3/25'" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                              </svg>
                            }
                          </div>
                          <span class="text-[11.5px] text-ink3">· best of {{ best.runs.length }} run{{ best.runs.length !== 1 ? 's' : '' }}</span>
                        </div>
                      </div>
                    </div>
                    <div class="flex items-center gap-5">
                      <div class="text-right">
                        <div class="text-[28px] font-semibold mono text-ink leading-none">{{ best.primaryValue.toFixed(4) }}</div>
                        <div class="text-[11px] text-ink3 mt-1.5">{{ metricLabel(best.primaryKey) }}</div>
                      </div>
                      <div class="flex items-center gap-2">
                        <button (click)="selectedRun = best.bestRun"
                          class="inline-flex items-center gap-1.5 px-3.5 py-2 text-[12.5px] font-medium rounded-lg bg-white/[0.04] border border-line text-ink2 hover:text-ink hover:border-white/20 transition-colors">
                          View best run
                        </button>
                        @if (isRegistered(best.bestRun)) {
                          <span class="inline-flex items-center gap-1.5 px-3.5 py-2 text-[12.5px] font-medium rounded-lg bg-good/10 border border-good/30 text-good">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                            Registered v{{ registeredVersion(best.bestRun) }}
                          </span>
                        } @else {
                          <button (click)="promptRegister(best.bestRun)"
                            class="inline-flex items-center gap-1.5 px-3.5 py-2 text-[12.5px] font-medium rounded-lg bg-cyan3/10 border border-cyan3/40 text-cyan3 hover:bg-cyan3/20 transition-colors">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 8h14M5 8a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v1a2 2 0 01-2 2M5 8v9a2 2 0 002 2h10a2 2 0 002-2V8"/></svg>
                            Register best run
                          </button>
                        }
                      </div>
                    </div>
                  </div>
                  <div class="relative text-[11.5px] text-ink3 mt-3.5 pt-3.5 border-t border-white/5">
                    {{ experimentGroups.length }} model{{ experimentGroups.length !== 1 ? 's' : '' }} ·
                    {{ runs.length }} run{{ runs.length !== 1 ? 's' : '' }} ·
                    {{ finishedRunsCount() }} finished
                  </div>
                </div>
              }

              <!-- Best-metrics-by-model chart -->
              @if (experimentsChartData.datasets.length > 0) {
                <div class="bg-card border border-line rounded-xl p-5 mb-5">
                  <div class="flex items-center justify-between mb-4 gap-4 flex-wrap">
                    <div>
                      <div class="text-[11px] font-semibold tracking-[0.08em] uppercase text-ink3">Best Metrics by Model</div>
                      <div class="text-[12px] text-ink2 mt-0.5">Each bar is a model's best value across its runs</div>
                    </div>
                    <div class="flex items-center gap-3 flex-wrap">
                      @for (ds of experimentsChartData.datasets; track ds.label) {
                        <div class="flex items-center gap-1.5">
                          <div class="w-2.5 h-2.5 rounded-sm" [style.background]="ds.backgroundColor?.toString()"></div>
                          <span class="text-[11px] text-ink2">{{ ds.label }}</span>
                        </div>
                      }
                    </div>
                  </div>
                  <div class="h-56">
                    <canvas
                      baseChart
                      [data]="experimentsChartData"
                      [options]="experimentsChartOptions"
                      [type]="experimentsChartType"
                    ></canvas>
                  </div>
                </div>
              }

              <!-- Leaderboard header bar -->
              <div class="flex items-center justify-between mb-3 gap-3 flex-wrap">
                <div class="flex items-center gap-2">
                  <span class="text-[13px] font-semibold text-ink">Leaderboard</span>
                  <span class="text-[12px] text-ink3">{{ experimentGroups.length }} model{{ experimentGroups.length !== 1 ? 's' : '' }}, ranked by best score</span>
                  @if (selectedRunIds.size > 0) {
                    <span class="mono text-[11px] px-2 py-0.5 rounded bg-cyan3/10 border border-cyan3/30 text-cyan3">
                      {{ selectedRunIds.size }} selected
                    </span>
                  }
                </div>
                <button
                  (click)="openCompare()"
                  [disabled]="selectedRunIds.size < 2"
                  class="inline-flex items-center gap-2 px-3.5 py-1.5 text-[12.5px] font-medium rounded-lg transition"
                  [class]="selectedRunIds.size >= 2
                    ? 'bg-cyan3/10 border border-cyan3/40 text-cyan3 hover:bg-cyan3/20'
                    : 'bg-white/[0.03] border border-line text-ink3 cursor-not-allowed'"
                >
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"/>
                  </svg>
                  Compare{{ selectedRunIds.size >= 2 ? ' (' + selectedRunIds.size + ')' : '' }}
                </button>
              </div>

              <!-- Ranked model groups (collapsible) -->
              <div class="space-y-2.5">
                @for (group of experimentGroups; track group.key) {
                  <div class="bg-card border rounded-xl overflow-hidden transition-colors"
                    [ngClass]="group.rank === 1 ? 'border-cyan3/30' : 'border-line'">
                    <!-- Group header -->
                    <button (click)="toggleGroup(group.key)"
                      class="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.015] text-left transition-colors">
                      <span class="inline-flex items-center justify-center w-7 h-7 rounded-lg border text-[12px] font-bold mono shrink-0"
                        [ngClass]="rankBadgeClass(group.rank)">{{ group.rank }}</span>
                      <div class="min-w-0 flex-1">
                        <div class="flex items-center gap-2 flex-wrap">
                          <span class="text-[14px] font-semibold text-ink truncate">{{ group.key }}</span>
                          @if (group.rank === 1) {
                            <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wide bg-amber-400/15 border border-amber-400/30 text-amber-300">BEST</span>
                          }
                          <span class="mono text-[10.5px] px-1.5 py-0.5 rounded bg-white/[0.04] border border-line text-ink3">
                            {{ group.runs.length }} run{{ group.runs.length !== 1 ? 's' : '' }}
                          </span>
                        </div>
                        @if (group.primaryKey) {
                          <div class="flex items-center gap-0.5 mt-1">
                            @for (s of [1,2,3,4,5]; track s) {
                              <svg class="w-3 h-3" [class]="s <= groupStars(group) ? 'text-amber-300' : 'text-ink3/25'" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                              </svg>
                            }
                          </div>
                        }
                      </div>
                      <div class="text-right shrink-0">
                        @if (group.primaryKey) {
                          <div class="mono text-[15px] font-semibold text-ink">{{ group.primaryValue.toFixed(4) }}</div>
                          <div class="text-[10.5px] text-ink3">{{ metricLabel(group.primaryKey) }}</div>
                        } @else {
                          <div class="text-[11px] text-ink3">no metrics</div>
                        }
                      </div>
                      <svg class="w-4 h-4 text-ink3 transition-transform shrink-0" [class.rotate-90]="expandedGroups.has(group.key)" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                      </svg>
                    </button>

                    <!-- Group runs -->
                    @if (expandedGroups.has(group.key)) {
                      <div class="border-t border-line overflow-x-auto">
                        <table class="w-full min-w-[760px]">
                          <thead>
                            <tr class="border-b border-line/60">
                              <th class="px-4 py-2 w-10"></th>
                              <th class="text-left px-4 py-2 text-[10.5px] font-semibold tracking-[0.07em] uppercase text-ink3">Run</th>
                              <th class="text-left px-4 py-2 text-[10.5px] font-semibold tracking-[0.07em] uppercase text-ink3">Status</th>
                              <th class="text-left px-4 py-2 text-[10.5px] font-semibold tracking-[0.07em] uppercase text-ink3">Top Metrics</th>
                              <th class="text-right px-4 py-2 text-[10.5px] font-semibold tracking-[0.07em] uppercase text-ink3">Duration</th>
                              <th class="text-right px-4 py-2 text-[10.5px] font-semibold tracking-[0.07em] uppercase text-ink3">Started</th>
                              <th class="w-10"></th>
                            </tr>
                          </thead>
                          <tbody>
                            @for (run of group.runs; track run.info.run_id) {
                              <tr class="border-b border-line/40 last:border-0 hover:bg-white/[0.015] cursor-pointer transition-colors group/row" (click)="selectedRun = run">
                                <td class="px-4 py-3" (click)="$event.stopPropagation()">
                                  <input
                                    type="checkbox"
                                    [checked]="selectedRunIds.has(run.info.run_id)"
                                    (change)="toggleRunSelection(run.info.run_id)"
                                    class="w-3.5 h-3.5 rounded bg-raised border-line text-cyan3 focus:ring-cyan3 focus:ring-1 focus:ring-offset-0"
                                  />
                                </td>
                                <td class="px-4 py-3">
                                  <div class="flex items-center gap-1.5">
                                    @if (run.info.run_id === group.bestRun.info.run_id && group.primaryKey) {
                                      <svg class="w-3.5 h-3.5 text-amber-300 shrink-0" fill="currentColor" viewBox="0 0 20 20" title="Best run in this model">
                                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                                      </svg>
                                    }
                                    <div class="min-w-0">
                                      <div class="flex items-center gap-1.5">
                                        <span class="text-[13px] font-medium text-ink leading-tight truncate">
                                          {{ run.info.run_name || run.info.run_id.substring(0, 8) }}
                                        </span>
                                        @if (isRegistered(run)) {
                                          <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-good/10 border border-good/30 text-good shrink-0">
                                            <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>
                                            v{{ registeredVersion(run) }}
                                          </span>
                                        }
                                      </div>
                                      <div class="mono text-[10.5px] text-ink3 mt-0.5">{{ run.info.run_id.substring(0, 12) }}</div>
                                    </div>
                                  </div>
                                </td>
                                <td class="px-4 py-3">
                                  <span [class]="getStatusClass(run.info.status)" class="text-[11px]">
                                    {{ run.info.status }}
                                  </span>
                                </td>
                                <td class="px-4 py-3">
                                  <div class="flex flex-wrap gap-1.5">
                                    @for (metric of headlineMetrics(run); track metric.label) {
                                      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white/[0.04] border border-line text-[11px]">
                                        <span class="text-ink3">{{ metric.label }}</span>
                                        <span class="mono text-ink font-medium">{{ metric.value.toFixed(4) }}</span>
                                      </span>
                                    }
                                  </div>
                                </td>
                                <td class="px-4 py-3 mono text-[12px] text-ink2 text-right">
                                  {{ getDuration(run) }}
                                </td>
                                <td class="px-4 py-3 text-[12px] text-ink3 text-right whitespace-nowrap">
                                  {{ run.info.start_time | date:'MMM d, HH:mm' }}
                                </td>
                                <td class="px-4 py-3" (click)="$event.stopPropagation()">
                                  <div class="flex items-center justify-end gap-1">
                                    @if (run.info.status === 'FINISHED' && !isRegistered(run)) {
                                      <button (click)="promptRegister(run)" title="Register as a model"
                                        class="opacity-0 group-hover/row:opacity-100 inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] text-cyan3 hover:bg-cyan3/10 transition-all">
                                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 8h14M5 8a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v1a2 2 0 01-2 2M5 8v9a2 2 0 002 2h10a2 2 0 002-2V8"/></svg>
                                        Register
                                      </button>
                                    }
                                    <button (click)="promptDeleteExpRun(run.info.run_id, run.info.run_name)" title="Delete run"
                                      class="opacity-0 group-hover/row:opacity-100 text-ink3 hover:text-bad transition-all p-1">
                                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                                      </svg>
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            }
                          </tbody>
                        </table>
                      </div>
                    }
                  </div>
                }
              </div>
            }

            <!-- Run Detail Drawer -->
            @if (selectedRun) {
              <div class="fixed inset-0 bg-black/60 z-50 flex justify-end backdrop-blur-sm" (click)="selectedRun = null">
                <div class="w-full max-w-md bg-base border-l border-line overflow-y-auto" (click)="$event.stopPropagation()">
                  <!-- Drawer header -->
                  <div class="sticky top-0 bg-base/95 backdrop-blur border-b border-line px-5 h-14 flex items-center justify-between z-10">
                    <div>
                      <div class="text-[13px] font-semibold text-ink">Run Details</div>
                      <div class="mono text-[10.5px] text-ink3">{{ selectedRun.info.run_id.substring(0, 16) }}…</div>
                    </div>
                    <button (click)="selectedRun = null" class="w-7 h-7 flex items-center justify-center rounded-md hover:bg-raised text-ink3 hover:text-ink transition-colors">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                      </svg>
                    </button>
                  </div>

                  <div class="p-5 space-y-5">
                    <!-- Run info -->
                    <div class="bg-card border border-line rounded-lg p-4 space-y-2.5">
                      <div class="flex items-center justify-between">
                        <span class="text-[10.5px] font-semibold tracking-[0.07em] uppercase text-ink3">Run Name</span>
                        <span class="text-[12.5px] text-ink font-medium">{{ selectedRun.info.run_name || '—' }}</span>
                      </div>
                      <div class="flex items-center justify-between">
                        <span class="text-[10.5px] font-semibold tracking-[0.07em] uppercase text-ink3">Status</span>
                        <span [class]="getStatusClass(selectedRun.info.status)" class="text-[11px]">{{ selectedRun.info.status }}</span>
                      </div>
                      <div class="flex items-center justify-between">
                        <span class="text-[10.5px] font-semibold tracking-[0.07em] uppercase text-ink3">Duration</span>
                        <span class="mono text-[12px] text-ink2">{{ getDuration(selectedRun) }}</span>
                      </div>
                      <div class="flex items-center justify-between">
                        <span class="text-[10.5px] font-semibold tracking-[0.07em] uppercase text-ink3">Started</span>
                        <span class="text-[12px] text-ink2">{{ selectedRun.info.start_time | date:'MMM d, y HH:mm' }}</span>
                      </div>
                    </div>

                    <!-- Metrics -->
                    <div>
                      <div class="text-[10.5px] font-semibold tracking-[0.07em] uppercase text-ink3 mb-2.5">Key Metrics</div>
                      @if (selectedRun.data.metrics.length === 0) {
                        <div class="text-[12.5px] text-ink3 py-3 text-center">No metrics logged</div>
                      } @else {
                        <div class="grid grid-cols-3 gap-2">
                          @for (metric of headlineMetrics(selectedRun); track metric.label) {
                            <div class="bg-card border border-line rounded-lg px-3 py-2.5 text-center">
                              <div class="mono text-[15px] font-semibold text-ink leading-none">{{ metric.value.toFixed(4) }}</div>
                              <div class="text-[10.5px] text-ink3 mt-1.5">{{ metric.label }}</div>
                            </div>
                          }
                        </div>
                        <!-- Full raw metric list (autolog included) -->
                        <button (click)="showAllMetrics = !showAllMetrics" type="button"
                          class="mt-2.5 flex items-center gap-1.5 text-[11.5px] text-ink3 hover:text-ink2 transition-colors">
                          <svg class="w-3 h-3 transition-transform" [class.rotate-90]="showAllMetrics" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                          </svg>
                          All metrics ({{ selectedRun.data.metrics.length }})
                        </button>
                        @if (showAllMetrics) {
                          <div class="mt-2 bg-card border border-line rounded-lg divide-y divide-line">
                            @for (metric of selectedRun.data.metrics; track metric.key) {
                              <div class="flex items-center justify-between px-3.5 py-2">
                                <span class="text-[12px] text-ink2">{{ metric.key }}</span>
                                <span class="mono text-[12px] text-ink font-medium">{{ metric.value.toFixed(6) }}</span>
                              </div>
                            }
                          </div>
                        }
                      }
                    </div>

                    <!-- Parameters -->
                    <div>
                      <div class="text-[10.5px] font-semibold tracking-[0.07em] uppercase text-ink3 mb-2.5">Parameters</div>
                      @if (selectedRun.data.params.length === 0) {
                        <div class="text-[12.5px] text-ink3 py-3 text-center">No parameters logged</div>
                      } @else {
                        <div class="bg-card border border-line rounded-lg divide-y divide-line">
                          @for (param of selectedRun.data.params; track param.key) {
                            <div class="flex items-center justify-between px-3.5 py-2.5">
                              <span class="text-[12.5px] text-ink2">{{ param.key }}</span>
                              <span class="mono text-[12px] text-ink">{{ param.value }}</span>
                            </div>
                          }
                        </div>
                      }
                    </div>
                  </div>
                </div>
              </div>
            }

            <!-- Register-as-model confirmation -->
            @if (registerTarget) {
              <app-confirm-dialog
                title="Register as model"
                [message]="'Register ' + (registerTarget.info.run_name || registerTarget.info.run_id.substring(0,8)) + ' as a new version of ' + projectModelName() + '? You can then promote it to Staging/Production and deploy it.'"
                [confirmLabel]="registering ? 'Registering…' : 'Register'"
                (confirmed)="doRegister()"
                (dismissed)="registerTarget = null"
              ></app-confirm-dialog>
            }
          </div>
        }

        @case ('pipelines') {
          <div>
            <!-- Custom Code Panel -->
              <div class="bg-slate-800 rounded-xl border border-slate-700 mb-6 overflow-hidden">
                <!-- Header -->
                <div class="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
                  <div>
                    <h3 class="text-base font-semibold text-white">Run Your Code</h3>
                    <p class="text-xs text-slate-400 mt-0.5">Upload any Python script, notebook, or zip — the platform handles the rest</p>
                  </div>
                  <div class="flex items-center gap-1.5 flex-wrap justify-end">
                    @for (fw of ['sklearn','XGBoost','LightGBM','PyTorch','TensorFlow']; track fw) {
                      <span class="px-2 py-0.5 bg-violet-500/10 border border-violet-500/30 text-violet-300 rounded text-xs font-mono">{{ fw }}</span>
                    }
                  </div>
                </div>

                <div class="p-6 space-y-5">
                  <!-- File selectors — 2 columns -->
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <!-- Code file -->
                    <div>
                      <label class="block text-xs font-medium text-slate-300 mb-1.5">
                        Code File
                        <span class="text-slate-500 font-normal ml-1">.zip · .py · .ipynb</span>
                      </label>
                      @if (codeFiles.length === 0) {
                        <div class="flex items-center gap-2 px-3 py-2.5 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                          <svg class="w-4 h-4 text-amber-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                          </svg>
                          <span class="text-xs text-amber-300">No code files — upload a .zip or .py in the Code tab first</span>
                        </div>
                      } @else {
                        <select [(ngModel)]="selectedCodePath" [ngModelOptions]="{standalone:true}"
                          class="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500">
                          <option value="">Select file...</option>
                          @for (f of codeFiles; track f.path) {
                            <option [value]="f.path">{{ f.name }}</option>
                          }
                        </select>
                      }
                    </div>

                    <!-- Dataset -->
                    <div>
                      <div class="flex items-center justify-between mb-1.5">
                        <label class="text-xs font-medium text-slate-300">
                          Dataset <span class="text-slate-500 font-normal">optional CSV</span>
                        </label>
                        <label class="flex items-center gap-1 text-xs cursor-pointer transition-colors"
                          [class.text-slate-500]="uploadingDataset"
                          [class.text-violet-400]="!uploadingDataset"
                          [class.hover:text-violet-300]="!uploadingDataset">
                          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
                          </svg>
                          @if (uploadingDataset) { uploading... } @else { Upload CSV }
                          <input type="file" accept=".csv" class="hidden"
                            (change)="onDatasetFileSelect($event)" [disabled]="uploadingDataset" />
                        </label>
                      </div>
                      <select [(ngModel)]="selectedDatasetPath" [ngModelOptions]="{standalone:true}"
                        class="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500">
                        <option value="">— included in zip —</option>
                        @for (f of datasetFiles; track f.path) {
                          <option [value]="f.path">{{ f.name }}</option>
                        }
                      </select>
                      <p class="text-xs text-slate-500 mt-1">Path available as <code class="text-violet-300">DATASET_PATH</code> env var</p>
                    </div>
                  </div>

                  <!-- Advanced toggle -->
                  <div>
                    <button (click)="showAdvanced=!showAdvanced" type="button"
                      class="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors">
                      <svg class="w-3.5 h-3.5 transition-transform" [class.rotate-90]="showAdvanced" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                      </svg>
                      Advanced
                    </button>
                    @if (showAdvanced) {
                      <div class="mt-3">
                        <label class="block text-xs font-medium text-slate-300 mb-1.5">
                          Entry Script Override
                          <span class="text-slate-500 font-normal ml-1">auto-detected if blank</span>
                        </label>
                        <input [(ngModel)]="customEntryScript" [ngModelOptions]="{standalone:true}"
                          placeholder="e.g. src/train.py"
                          class="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500" />
                        <p class="text-xs text-slate-500 mt-1">Detection order: train.py → main.py → run.py → any .ipynb → any .py</p>
                      </div>
                    }
                  </div>

                  <!-- Info box -->
                  <div class="bg-slate-900/60 border border-slate-700 rounded-lg p-4">
                    <p class="text-xs font-semibold text-slate-300 mb-2 flex items-center gap-1.5">
                      <svg class="w-3.5 h-3.5 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                      </svg>
                      Zero-config MLflow tracking
                    </p>
                    <ul class="space-y-1 text-xs text-slate-400">
                      <li class="flex items-start gap-1.5"><span class="text-violet-400 mt-0.5">✓</span><span>Supports <code class="text-violet-300">.zip</code>, <code class="text-violet-300">.py</code>, and <code class="text-violet-300">.ipynb</code> notebooks — all converted automatically</span></li>
                      <li class="flex items-start gap-1.5"><span class="text-violet-400 mt-0.5">✓</span><span>Entry script auto-detected — no naming requirements</span></li>
                      <li class="flex items-start gap-1.5"><span class="text-violet-400 mt-0.5">✓</span><span><code class="text-violet-300">requirements.txt</code> installed automatically if present in zip</span></li>
                      <li class="flex items-start gap-1.5"><span class="text-violet-400 mt-0.5">✓</span><span>MLflow <code class="text-violet-300">autolog()</code> injected — every <code class="text-violet-300">model.fit()</code> is tracked with no code changes</span></li>
                    </ul>
                  </div>

                  @if (customError) {
                    <div class="flex items-center gap-2 px-3 py-2.5 bg-red-500/10 border border-red-500/30 rounded-lg">
                      <svg class="w-4 h-4 text-red-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                      </svg>
                      <span class="text-sm text-red-300">{{ customError }}</span>
                    </div>
                  }

                  <div class="flex justify-end">
                    <button (click)="onTriggerCustomPipeline()"
                      [disabled]="!selectedCodePath || triggeringCustom"
                      class="px-6 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:bg-violet-600/40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition flex items-center gap-2">
                      @if (triggeringCustom) {
                        <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        Triggering...
                      } @else {
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/>
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                        </svg>
                        Run My Code
                      }
                    </button>
                  </div>
                </div>
              </div>

            @if (pipelineTriggerSuccess) {
              <div class="bg-green-500/10 border border-green-500/50 text-green-400 px-4 py-3 rounded-lg mb-6 text-sm">
                Pipeline triggered successfully! Run ID: {{ pipelineTriggerSuccess }}
              </div>
            }

            <!-- Pipeline Runs List -->
            <h3 class="text-lg font-semibold text-white mb-4">Pipeline Runs</h3>
            @if (pipelineRuns.length === 0) {
              <p class="text-sm text-slate-500 text-center py-8">No pipeline runs yet. Trigger one above.</p>
            } @else {
              <div class="bg-slate-800 rounded-xl border border-slate-700 overflow-x-auto">
                <table class="w-full min-w-[760px]">
                  <thead>
                    <tr class="border-b border-slate-700">
                      <th class="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Run ID</th>
                      <th class="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Status</th>
                      <th class="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Type</th>
                      <th class="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Parameters</th>
                      <th class="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">Started</th>
                      <th class="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (run of pipelineRuns; track run.id) {
                      <tr class="border-b border-slate-700/50 hover:bg-slate-700/30">
                        <td class="px-4 py-3 text-sm text-white font-mono">{{ run.id.substring(0, 8) }}</td>
                        <td class="px-4 py-3">
                          <div class="inline-flex items-center gap-1.5">
                            <span [class]="getPipelineStatusClass(run.status)">
                              {{ run.status }}
                            </span>
                            @if (run.status === 'FAILED') {
                              <button
                                (click)="toggleErrorPanel(run.id)"
                                [class]="'h-5 px-1.5 rounded text-[10.5px] mono transition-colors ' + (selectedErrorRunId === run.id ? 'bg-bad/20 text-bad ring-1 ring-bad/40' : 'bg-bad/10 text-bad hover:bg-bad/20 ring-1 ring-bad/25')"
                                title="Show captured stdout/stderr from the failed user script">
                                {{ selectedErrorRunId === run.id ? '× Hide' : 'Why?' }}
                              </button>
                            }
                          </div>
                        </td>
                        <td class="px-4 py-3">
                          @if (run.pipeline_type === 'custom') {
                            <span class="px-2 py-0.5 bg-violet-500/15 border border-violet-500/30 text-violet-300 rounded text-xs font-medium">Custom Code</span>
                          } @else {
                            <span class="px-2 py-0.5 bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 rounded text-xs font-medium">Built-in</span>
                          }
                        </td>
                        <td class="px-4 py-3 text-xs text-slate-400">
                          @if (run.pipeline_type === 'custom') {
                            {{ run.parameters['code_file'] }}
                          } @else {
                            {{ run.parameters['model_type'] }} | {{ run.parameters['dataset_name'] }}
                          }
                        </td>
                        <td class="px-4 py-3 text-sm text-slate-400 text-right">{{ run.started_at | date:'short' }}</td>
                        <td class="px-4 py-3 text-right">
                          <div class="flex items-center justify-end gap-2">
                            @if (run.status === 'RUNNING' || run.status === 'PENDING') {
                              <button (click)="refreshRunStatus(run.id)" class="text-xs text-slate-400 hover:text-slate-200 transition-colors">
                                Refresh
                              </button>
                            }
                            <button (click)="promptDeletePipelineRun(run.id)"
                              class="text-slate-500 hover:text-red-400 transition-colors p-1">
                              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                              </svg>
                            </button>
                            <button (click)="openLogs(run.id)"
                              [class]="logsButtonClass(run.id)">
                              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                              </svg>
                              {{ selectedLogRunId === run.id ? 'Hide' : 'Logs' }}
                            </button>
                          </div>
                        </td>
                      </tr>
                      <!-- Inline error panel (FAILED runs only) -->
                      @if (selectedErrorRunId === run.id) {
                        <tr>
                          <td colspan="6" class="p-0 max-w-0">
                            <div class="border-t border-line bg-bg min-w-0 overflow-hidden">
                              <div class="flex items-center justify-between gap-4 px-4 h-9 border-b border-line bg-card">
                                <div class="flex items-center gap-3 min-w-0">
                                  <span class="mono text-[11px] font-semibold tracking-[0.08em] uppercase text-bad">User-script error</span>
                                  <span class="mono text-[11px] text-ink3 truncate">run <span class="text-ink2">{{ run.id.substring(0, 8) }}</span></span>
                                  @if (runError.captured) {
                                    <span class="mono text-[10.5px] text-ink3">{{ runError.bytes }} chars</span>
                                  }
                                </div>
                                <div class="flex items-center gap-2">
                                  @if (runError.captured) {
                                    <button (click)="copyError()" class="h-6 px-2 rounded text-[10.5px] mono text-ink3 hover:text-ink transition-colors">
                                      {{ runErrorCopied ? 'COPIED' : 'COPY' }}
                                    </button>
                                  }
                                  <button (click)="closeErrorPanel()" class="text-ink3 hover:text-ink transition-colors inline-flex items-center gap-1 text-[11.5px]">
                                    <app-icon name="x" className="w-3.5 h-3.5"></app-icon>
                                    Close
                                  </button>
                                </div>
                              </div>
                              <div class="px-4 py-3 min-h-[120px]">
                                @if (runError.loading) {
                                  <div class="flex items-center gap-2 text-ink3">
                                    <div class="w-3 h-3 border border-ink3 border-t-transparent rounded-full animate-spin"></div>
                                    Fetching error blob...
                                  </div>
                                } @else if (runError.captured) {
                                  <pre class="font-mono text-[11.5px] leading-[1.55] whitespace-pre-wrap break-all text-ink2">{{ runError.text }}</pre>
                                } @else {
                                  <div class="text-[12.5px] text-ink3">
                                    No error blob was captured for this run.
                                    @if (runError.reason === 'no_error_blob_persisted') {
                                      <span class="block mt-1 text-[11.5px]">
                                        The script likely failed before the runner reached the persistence step (image-pull failure, runner crash, or this is an older run from before this feature shipped). Check the full <button (click)="closeErrorPanel(); openLogs(run.id)" class="underline text-cyan3">pod logs</button> for the root cause.
                                      </span>
                                    }
                                  </div>
                                }
                              </div>
                            </div>
                          </td>
                        </tr>
                      }
                      <!-- Inline log terminal -->
                      @if (selectedLogRunId === run.id) {
                        <tr>
                          <td colspan="6" class="p-0 max-w-0">
                            <div class="border-t border-line bg-bg min-w-0 overflow-hidden">
                              <!-- Terminal header -->
                              <div class="flex items-center justify-between gap-4 px-4 h-10 border-b border-line bg-card">
                                <div class="flex items-center gap-4 min-w-0">
                                  <span class="flex items-center gap-2">
                                    <span [class]="'w-1.5 h-1.5 rounded-full ' + logStatusDot()"></span>
                                    <span class="mono text-[11px] font-semibold tracking-[0.08em] uppercase text-ink">{{ run.status }}</span>
                                  </span>
                                  <span class="mono text-[11px] text-ink3 truncate">run <span class="text-ink2">{{ run.id.substring(0, 8) }}</span></span>
                                  <span class="mono text-[11px] text-ink3">elapsed <span class="text-ink2">{{ logElapsed }}</span></span>
                                  @if (stepStatus) {
                                    <span class="mono text-[11px] text-ink3">step <span class="text-ink2">{{ stepStatus.current }} / {{ stepStatus.total }}</span></span>
                                  }
                                </div>
                                <button (click)="closeLogs()" class="text-ink3 hover:text-ink transition-colors inline-flex items-center gap-1 text-[11.5px]">
                                  <app-icon name="x" className="w-3.5 h-3.5"></app-icon>
                                  Close
                                </button>
                              </div>

                              <!-- Toolbar -->
                              <div class="flex items-center gap-2 px-3 h-9 border-b border-line bg-card/60">
                                <!-- Filter pills -->
                                <div class="inline-flex items-center rounded-md bg-raised/40 border border-white/5 p-0.5">
                                  <button (click)="logFilter = 'all'"
                                    [class]="'h-6 px-2.5 rounded text-[11px] transition-colors ' + (logFilter === 'all' ? 'bg-cyan3/15 text-cyan3 ring-1 ring-cyan3/25' : 'text-ink2 hover:text-ink')">
                                    All <span class="mono text-[10px] text-ink3 ml-0.5">{{ logCounts.all }}</span>
                                  </button>
                                  <button (click)="logFilter = 'platform'"
                                    [class]="'h-6 px-2.5 rounded text-[11px] transition-colors ' + (logFilter === 'platform' ? 'bg-cyan3/15 text-cyan3 ring-1 ring-cyan3/25' : 'text-ink2 hover:text-ink')">
                                    Platform <span class="mono text-[10px] text-ink3 ml-0.5">{{ logCounts.platform }}</span>
                                  </button>
                                  <button (click)="logFilter = 'error'"
                                    [class]="'h-6 px-2.5 rounded text-[11px] transition-colors ' + (logFilter === 'error' ? 'bg-bad/15 text-bad ring-1 ring-bad/25' : 'text-ink2 hover:text-ink')">
                                    Errors <span class="mono text-[10px] text-ink3 ml-0.5">{{ logCounts.error }}</span>
                                  </button>
                                </div>

                                <!-- Search -->
                                <div class="flex items-center gap-1.5 h-6 px-2 rounded-md bg-raised/40 border border-white/5 flex-1 max-w-[280px] focus-within:border-cyan3/40">
                                  <app-icon name="search" className="w-3 h-3 text-ink3"></app-icon>
                                  <input
                                    [(ngModel)]="logSearch"
                                    [ngModelOptions]="{ standalone: true }"
                                    placeholder="Search logs"
                                    class="bg-transparent outline-none text-[11.5px] flex-1 placeholder:text-ink3 text-ink min-w-0"
                                  />
                                  @if (logSearch) {
                                    <button (click)="logSearch = ''" class="text-ink3 hover:text-ink"><app-icon name="x" className="w-3 h-3"></app-icon></button>
                                  }
                                </div>

                                <div class="flex-1"></div>

                                <!-- Toggles -->
                                <button (click)="logScriptOnly = !logScriptOnly"
                                  [disabled]="runLogsUserScript.length === 0"
                                  [class]="'h-6 px-2 rounded text-[10.5px] mono transition-colors ' + (logScriptOnly ? 'bg-cyan3/15 text-cyan2 ring-1 ring-cyan3/25' : 'text-ink3 hover:text-ink') + (runLogsUserScript.length === 0 ? ' opacity-40 cursor-not-allowed' : '')"
                                  [title]="logScriptOnly ? 'Showing user-script output only. Click for full Argo/KFP logs.' : 'Showing full logs. Click to hide Argo/KFP boilerplate.'">SCRIPT</button>
                                <button (click)="logShowTs = !logShowTs"
                                  [class]="'h-6 px-2 rounded text-[10.5px] mono transition-colors ' + (logShowTs ? 'bg-raised/60 text-ink ring-1 ring-white/10' : 'text-ink3 hover:text-ink')"
                                  title="Toggle timestamps">TS</button>
                                <button (click)="logWrap = !logWrap"
                                  [class]="'h-6 px-2 rounded text-[10.5px] mono transition-colors ' + (logWrap ? 'bg-raised/60 text-ink ring-1 ring-white/10' : 'text-ink3 hover:text-ink')"
                                  title="Toggle line wrap">WRAP</button>
                                <button (click)="logAutoScroll = !logAutoScroll; logAutoScroll && jumpToLatest()"
                                  [class]="'h-6 px-2 rounded text-[10.5px] mono transition-colors ' + (logAutoScroll ? 'bg-raised/60 text-ink ring-1 ring-white/10' : 'text-ink3 hover:text-ink')"
                                  title="Toggle auto-scroll">TAIL</button>

                                <div class="w-px h-4 bg-white/10 mx-1"></div>

                                <!-- Actions -->
                                <button (click)="copyLogs()" class="h-6 px-2 rounded text-[10.5px] mono text-ink3 hover:text-ink transition-colors" title="Copy logs">
                                  {{ logsCopied ? 'COPIED' : 'COPY' }}
                                </button>
                                <button (click)="downloadLogs()" class="h-6 px-2 rounded text-[10.5px] mono text-ink3 hover:text-ink transition-colors" title="Download logs">
                                  <app-icon name="upload" className="w-3 h-3 rotate-180"></app-icon>
                                </button>
                              </div>

                              <!-- Log output -->
                              <div class="relative">
                                <div
                                  class="h-80 overflow-y-auto overflow-x-hidden px-0 py-1 font-mono text-[11.5px] leading-[1.55]"
                                  #logContainer
                                  (scroll)="onLogScroll()"
                                >
                                  @if (logsLoading && parsedLogs.length === 0) {
                                    <div class="flex items-center gap-2 text-ink3 px-4 py-3">
                                      <div class="w-3 h-3 border border-ink3 border-t-transparent rounded-full animate-spin"></div>
                                      Fetching logs...
                                    </div>
                                  } @else if (parsedLogs.length === 0) {
                                    <div class="text-ink3 px-4 py-3">No logs yet.</div>
                                  } @else if (filteredLogs.length === 0) {
                                    <div class="text-ink3 px-4 py-3">No lines match the current filter.</div>
                                  } @else {
                                    @for (line of filteredLogs; track line.n) {
                                      @if (line.level === 'blank') {
                                        <div class="h-2"></div>
                                      } @else if (line.level === 'banner') {
                                        <div class="flex items-center gap-2 px-4 py-1 text-[10.5px] font-semibold tracking-[0.08em] uppercase text-ink3 border-t border-line bg-raised/30 mt-1">
                                          <span class="mono text-ink3 w-10 shrink-0 text-right">{{ line.n }}</span>
                                          <span>{{ line.message }}</span>
                                        </div>
                                      } @else {
                                        <div class="group flex items-start gap-2 px-4 py-[2px] hover:bg-white/[0.02]">
                                          <span class="mono text-[10.5px] text-ink3 w-10 shrink-0 text-right select-none tabular-nums">{{ line.n }}</span>
                                          @if (logShowTs) {
                                            <span class="mono text-[10.5px] text-ink3 w-16 shrink-0 tabular-nums">{{ line.ts || '' }}</span>
                                          }
                                          @if (logLevelPill(line.level); as pill) {
                                            <span [class]="'mono text-[9.5px] px-1 h-4 rounded shrink-0 inline-flex items-center ' + pill.cls">{{ pill.label }}</span>
                                          } @else {
                                            <span class="w-7 shrink-0"></span>
                                          }
                                          <span [class]="'min-w-0 flex-1 ' + logMessageCls(line.level) + (logWrap ? ' whitespace-pre-wrap break-all' : ' whitespace-pre overflow-x-auto')">{{ line.message }}</span>
                                        </div>
                                      }
                                    }
                                    @if (run.status === 'RUNNING' || run.status === 'PENDING') {
                                      <div class="flex items-center gap-2 px-4 py-1">
                                        <span class="mono text-[10.5px] text-ink3 w-10 shrink-0 text-right select-none">&nbsp;</span>
                                        <span class="text-cyan3 animate-pulse">▊</span>
                                      </div>
                                    }
                                  }
                                </div>

                                <!-- Jump to latest pill -->
                                @if (!logAutoScroll && logPendingCount > 0) {
                                  <button (click)="jumpToLatest()" class="absolute bottom-3 right-4 inline-flex items-center gap-2 h-7 px-3 rounded-full bg-cyan3 text-[#06121A] text-[11px] font-semibold shadow-lg hover:opacity-90">
                                    <app-icon name="chevronDown" className="w-3 h-3"></app-icon>
                                    {{ logPendingCount }} new · jump to latest
                                  </button>
                                }
                              </div>
                            </div>
                          </td>
                        </tr>
                      }
                    }
                  </tbody>
                </table>
              </div>
            }
          </div>
        }

        @case ('models') {
          <div>
            <!-- Header -->
            <div class="flex justify-between items-center mb-5">
              <div>
                <h3 class="text-lg font-semibold text-white">Model Registry</h3>
                @if (modelName) {
                  <span class="inline-block mt-1 px-2 py-0.5 bg-slate-700 text-slate-300 rounded text-xs font-mono">{{ modelName }}</span>
                }
              </div>
              <button (click)="loadModels()"
                class="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-xs font-medium rounded-lg transition">
                Refresh
              </button>
            </div>

            @if (modelVersions.length === 0) {
              <div class="text-center py-16">
                <svg class="w-16 h-16 text-slate-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/>
                </svg>
                <h3 class="text-lg text-slate-300 font-medium mb-2">No registered models yet</h3>
                <p class="text-slate-500">Call <code class="text-violet-300">mlflow.register_model()</code> in your training script.</p>
              </div>
            } @else {

              <!-- Lifecycle pipeline diagram -->
              <div class="bg-slate-800 rounded-xl border border-slate-700 p-5 mb-5">
                <p class="text-xs font-medium text-slate-500 uppercase tracking-wider mb-4">Model Lifecycle</p>
                <div class="flex items-start">
                  @for (step of lifecycleSteps; track step.stage; let last = $last) {
                    <div class="flex items-center">
                      <div class="flex flex-col items-center min-w-[90px]">
                        <div [class]="getLifecycleNodeClass(step.stage)"
                          class="px-3 py-1.5 rounded-full text-xs font-semibold transition-all">
                          {{ step.label }}
                        </div>
                        <p class="text-xs text-slate-500 mt-1.5 text-center">{{ step.desc }}</p>
                      </div>
                      @if (!last) {
                        <div class="flex-1 flex items-center px-1 mb-5">
                          <div class="h-px flex-1 bg-slate-600"></div>
                          <svg class="w-3 h-3 text-slate-600 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd"/>
                          </svg>
                        </div>
                      }
                    </div>
                  }
                </div>
              </div>

              <!-- Toasts -->
              @if (promoteMessage) {
                <div class="flex items-center gap-2 mb-4 px-4 py-3 bg-green-500/10 border border-green-500/40 text-green-400 text-sm rounded-lg">
                  <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                  </svg>
                  <span class="flex-1">{{ promoteMessage }}</span>
                  <button (click)="promoteMessage=''" class="ml-2 text-green-400/60 hover:text-green-300 transition">✕</button>
                </div>
              }
              @if (promoteError) {
                <div class="flex items-center gap-2 mb-4 px-4 py-3 bg-red-500/10 border border-red-500/40 text-red-400 text-sm rounded-lg">
                  <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                  </svg>
                  <span class="flex-1">{{ promoteError }}</span>
                  <button (click)="promoteError=''" class="ml-2 text-red-400/60 hover:text-red-300 transition">✕</button>
                </div>
              }
              @if (deploySuccess) {
                <div class="flex items-center gap-2 mb-4 px-4 py-3 bg-green-500/10 border border-green-500/40 text-green-400 text-sm rounded-lg">
                  <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                  </svg>
                  <span class="flex-1">{{ deploySuccess }}</span>
                  <button (click)="deploySuccess=''" class="ml-2 text-green-400/60 hover:text-green-300 transition">✕</button>
                </div>
              }
              @if (deployError) {
                <div class="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/40 text-red-400 text-sm rounded-lg">
                  <div class="flex items-start gap-2">
                    <svg class="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                    </svg>
                    <span class="flex-1 break-all text-[12px] leading-relaxed">{{ deployError }}</span>
                    <button (click)="deployError=''" class="ml-2 text-red-400/60 hover:text-red-300 transition shrink-0">✕</button>
                  </div>
                  @if (isWebhookError(deployError)) {
                    <div class="mt-3 flex items-center gap-3 pl-6">
                      <span class="text-[11.5px] text-red-300/80">KServe webhook is unreachable.</span>
                      <button
                        (click)="fixKserveWebhook()"
                        [disabled]="fixingWebhook"
                        class="inline-flex items-center gap-1.5 h-7 px-3 text-[11.5px] font-medium rounded-md bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 transition disabled:opacity-50"
                      >
                        {{ fixingWebhook ? 'Applying fix…' : '⚡ Auto-fix webhook' }}
                      </button>
                    </div>
                  }
                </div>
              }
              @if (webhookFixResult) {
                <div class="mb-4 px-4 py-3 bg-cyan3/10 border border-cyan3/30 text-cyan3 text-[12px] rounded-lg flex items-center gap-2">
                  <span class="flex-1">{{ webhookFixResult }}</span>
                  <button (click)="webhookFixResult=''" class="text-cyan3/50 hover:text-cyan3">✕</button>
                </div>
              }

              <!-- Versions table -->
              <div class="bg-slate-800 rounded-xl border border-slate-700 overflow-x-auto">
                <table class="w-full min-w-[820px]">
                  <thead>
                    <tr class="border-b border-slate-700">
                      <th class="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Model / Version</th>
                      <th class="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Stage</th>
                      <th class="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Metrics</th>
                      <th class="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Run</th>
                      <th class="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">Created</th>
                      <th class="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (v of modelVersions; track v.version) {
                      <tr [class]="'border-b border-slate-700/50 hover:bg-slate-700/20 transition-colors' + (v.stage === 'Production' ? ' bg-green-500/5' : '')">
                        <td class="px-4 py-3">
                          <div class="text-sm text-white font-medium">{{ v.name }}</div>
                          <div class="text-xs text-slate-500 font-mono mt-0.5">v{{ v.version }}</div>
                        </td>
                        <td class="px-4 py-3">
                          <span [class]="getStageClass(v.stage)">{{ v.stage }}</span>
                          @if (v.stage === 'Production') {
                            <span class="ml-1.5 inline-block w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></span>
                          }
                        </td>
                        <td class="px-4 py-3">
                          <div class="flex flex-wrap gap-1">
                            @for (entry of getModelMetrics(v.metrics); track entry.key) {
                              <span class="px-1.5 py-0.5 bg-slate-700 text-slate-300 rounded text-xs font-mono">
                                {{ entry.key }} {{ entry.value | number:'1.3-3' }}
                              </span>
                            }
                            @if (!v.metrics || objectKeys(v.metrics).length === 0) {
                              <span class="text-xs text-slate-600">—</span>
                            }
                          </div>
                        </td>
                        <td class="px-4 py-3 text-xs text-slate-400 font-mono">
                          {{ v.run_id ? v.run_id.substring(0, 8) : '-' }}
                        </td>
                        <td class="px-4 py-3 text-sm text-slate-400 text-right">
                          {{ v.creation_timestamp ? (v.creation_timestamp | date:'MMM d, HH:mm') : '-' }}
                        </td>
                        <td class="px-4 py-3 text-right">
                          <div class="inline-flex gap-1 items-center">
                            <!-- Staging -->
                            <button (click)="promote(v, 'Staging')"
                              [disabled]="v.stage === 'Staging' || promotingVersion === v.version"
                              class="inline-flex items-center justify-center w-16 px-2 py-1 text-xs bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 disabled:opacity-30 disabled:cursor-not-allowed rounded transition">
                              @if (promotingVersion === v.version && promotingStage === 'Staging') {
                                <div class="w-3 h-3 border border-amber-400 border-t-transparent rounded-full animate-spin"></div>
                              } @else { Staging }
                            </button>
                            <!-- Production -->
                            <button (click)="promote(v, 'Production')"
                              [disabled]="v.stage === 'Production' || promotingVersion === v.version"
                              class="inline-flex items-center justify-center w-20 px-2 py-1 text-xs bg-green-500/20 text-green-400 hover:bg-green-500/30 disabled:opacity-30 disabled:cursor-not-allowed rounded transition">
                              @if (promotingVersion === v.version && promotingStage === 'Production') {
                                <div class="w-3 h-3 border border-green-400 border-t-transparent rounded-full animate-spin"></div>
                              } @else { Production }
                            </button>
                            <!-- Archive -->
                            <button (click)="promote(v, 'Archived')"
                              [disabled]="v.stage === 'Archived' || promotingVersion === v.version"
                              class="inline-flex items-center justify-center w-16 px-2 py-1 text-xs bg-slate-500/20 text-slate-400 hover:bg-slate-500/30 disabled:opacity-30 disabled:cursor-not-allowed rounded transition">
                              @if (promotingVersion === v.version && promotingStage === 'Archived') {
                                <div class="w-3 h-3 border border-slate-400 border-t-transparent rounded-full animate-spin"></div>
                              } @else { Archive }
                            </button>
                            <!-- Deploy -->
                            <button (click)="openDeployModal(v)"
                              [disabled]="isDeployed(v) || deployingVersion === v.version"
                              [title]="isDeployed(v) ? 'Already deployed' : 'Configure and deploy to KServe'"
                              class="inline-flex items-center justify-center ml-1 px-3 py-1 text-xs bg-cyan3/10 border border-cyan3/30 text-cyan3 hover:bg-cyan3/20 disabled:opacity-30 disabled:cursor-not-allowed rounded transition">
                              @if (deployingVersion === v.version) {
                                <div class="w-3 h-3 border border-cyan3 border-t-transparent rounded-full animate-spin mr-1"></div>
                                Deploying...
                              } @else {
                                <svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M12 5l7 7-7 7"/>
                                </svg>
                                Deploy
                              }
                            </button>
                            <!-- Delete version (disabled when an active deployment references this version) -->
                            <button (click)="promptDeleteModelVersion(v.name, v.version, v.stage)"
                              [disabled]="isDeployed(v)"
                              [title]="isDeployed(v) ? 'Delete the active deployment first' : 'Delete this model version'"
                              class="inline-flex items-center justify-center ml-1 w-7 h-7 text-ink3 hover:text-bad
                                     disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-ink3
                                     rounded transition">
                              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>

              <!-- Activity log -->
              @if (stageLog.length > 0) {
                <div class="mt-4 bg-slate-900/60 rounded-xl border border-slate-700/60 p-4">
                  <p class="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">Stage History (this session)</p>
                  <div class="space-y-1.5">
                    @for (entry of stageLog; track $index) {
                      <div class="flex items-center gap-3 text-xs">
                        <span class="text-slate-600 font-mono tabular-nums shrink-0">{{ entry.time | date:'HH:mm:ss' }}</span>
                        <span [class]="getStageClass(entry.stage)" class="shrink-0">{{ entry.stage }}</span>
                        <span class="text-slate-400">{{ entry.message }}</span>
                      </div>
                    }
                  </div>
                </div>
              }
            }
          </div>
        }

        @case ('deployments') {
          <div>
            <div class="flex justify-between items-center mb-4">
              <div>
                <h3 class="text-lg font-semibold text-white">Deployments</h3>
                <p class="text-sm text-slate-400">Models served via KServe InferenceServices.</p>
              </div>
              <button
                (click)="loadDeployments()"
                class="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-xs font-medium rounded-lg transition"
              >
                Refresh
              </button>
            </div>

            <!-- Deployment progress panels (one per CREATING deployment) -->
            @for (d of deployments; track d.id) {
              @if (d.status === 'CREATING' || d.status === 'READY' || d.status === 'FAILED') {
                @if (d.status === 'CREATING' || deploymentLogLines(d).length > 0) {
                  <div class="mb-5 bg-slate-900 rounded-xl border overflow-hidden"
                       [class]="d.status === 'READY' ? 'border-green-500/40' : d.status === 'FAILED' ? 'border-red-500/40' : 'border-slate-700'">
                    <!-- Panel header -->
                    <div class="flex items-center justify-between px-4 py-3 border-b"
                         [class]="d.status === 'READY' ? 'bg-green-500/10 border-green-500/20' : d.status === 'FAILED' ? 'bg-red-500/10 border-red-500/20' : 'bg-slate-800 border-slate-700'">
                      <div class="flex items-center gap-2">
                        @if (d.status === 'CREATING') {
                          <div class="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
                        } @else if (d.status === 'READY') {
                          <div class="w-2 h-2 bg-green-400 rounded-full"></div>
                        } @else {
                          <div class="w-2 h-2 bg-red-400 rounded-full"></div>
                        }
                        <span class="text-sm font-medium font-mono"
                              [class]="d.status === 'READY' ? 'text-green-300' : d.status === 'FAILED' ? 'text-red-300' : 'text-white'">
                          {{ d.inference_service_name }}
                        </span>
                      </div>
                      <div class="flex items-center gap-4 text-xs text-slate-400">
                        @if (d.status === 'CREATING') {
                          <span>Elapsed: <span class="font-mono text-blue-400 tabular-nums">{{ deploymentElapsed(d) }}</span></span>
                          <span class="text-slate-600">~2–5 min typical</span>
                        } @else if (d.status === 'READY') {
                          <span class="text-green-400 font-medium">Ready in {{ deploymentElapsed(d) }}</span>
                        } @else {
                          <span class="text-red-400 font-medium">Failed after {{ deploymentElapsed(d) }}</span>
                        }
                      </div>
                    </div>
                    <!-- Terminal body -->
                    <div class="px-4 py-3 font-mono text-xs space-y-1 min-h-[100px] max-h-64 overflow-y-auto">
                      @for (line of deploymentLogLines(d); track $index) {
                        <div class="flex gap-3 items-start">
                          <span class="text-slate-600 shrink-0 tabular-nums">[{{ line.offset }}]</span>
                          <span [class]="line.type === 'success' ? 'text-green-400' : line.type === 'error' ? 'text-red-400' : 'text-slate-300'">
                            {{ line.text }}
                          </span>
                        </div>
                      }
                      @if (d.status === 'CREATING') {
                        <div class="flex gap-3 items-center">
                          <span class="text-slate-600 tabular-nums">[{{ deploymentElapsed(d) }}]</span>
                          <span class="text-slate-500">waiting<span class="animate-pulse"> ▌</span></span>
                        </div>
                      }
                    </div>
                  </div>
                }
              }
            }

            @if (deployments.length === 0) {
              <div class="text-center py-16">
                <svg class="w-16 h-16 text-slate-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
                <h3 class="text-lg text-slate-300 font-medium mb-2">No deployments yet</h3>
                <p class="text-slate-500">Deploy a model version from the Models tab to get a live inference endpoint.</p>
              </div>
            } @else {
              <!-- Deployment cards -->
              <div class="space-y-4">
                @for (d of deployments; track d.id) {
                  @if (d.status !== 'DELETED') {
                    <div class="bg-card border rounded-xl overflow-hidden"
                         [class]="d.status === 'READY' ? 'border-good/30' : d.status === 'FAILED' ? 'border-bad/30' : 'border-line'">

                      <!-- Card header -->
                      <div class="flex items-center gap-3 px-5 py-3.5 border-b"
                           [class]="d.status === 'READY' ? 'border-good/20 bg-good/[0.04]' : d.status === 'FAILED' ? 'border-bad/20 bg-bad/[0.04]' : 'border-line'">
                        <!-- status dot -->
                        <div class="w-2 h-2 rounded-full shrink-0"
                             [class]="d.status === 'READY' ? 'bg-good' : d.status === 'FAILED' ? 'bg-bad' : 'bg-cyan3 animate-pulse'"></div>

                        <!-- name + status -->
                        <div class="flex-1 min-w-0">
                          <span class="mono text-[13px] font-medium text-ink">{{ d.inference_service_name }}</span>
                        </div>

                        <!-- meta pills -->
                        <div class="flex items-center gap-2 shrink-0">
                          <span class="mono text-[11px] px-2 py-0.5 rounded bg-white/[0.05] border border-line text-ink3">
                            {{ d.replicas }} replica{{ d.replicas !== 1 ? 's' : '' }}
                          </span>
                          <span [class]="getDeploymentStatusClass(d.status)" class="text-[11px]">{{ d.status }}</span>
                          <span class="text-[11.5px] text-ink3">{{ d.created_at ? (d.created_at | date:'MMM d, HH:mm') : '' }}</span>
                        </div>

                        <!-- actions -->
                        <div class="flex items-center gap-1.5 shrink-0">
                          @if (d.status === 'READY') {
                            <button (click)="toggleSelectedDeployment(d)"
                              class="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11.5px] font-medium rounded-lg transition"
                              [class]="selectedDeployment?.id === d.id ? 'bg-cyan3/20 border border-cyan3/40 text-cyan3' : 'bg-cyan3/10 border border-cyan3/30 text-cyan3 hover:bg-cyan3/20'">
                              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/>
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                              </svg>
                              Test
                            </button>
                          }
                          <button (click)="deleteDeployment(d)"
                            [disabled]="deletingDeployment === d.id"
                            class="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11.5px] font-medium rounded-lg bg-bad/10 border border-bad/30 text-bad hover:bg-bad/20 disabled:opacity-40 transition">
                            @if (deletingDeployment === d.id) {
                              <div class="w-3 h-3 border border-bad border-t-transparent rounded-full animate-spin"></div>
                            }
                            {{ deletingDeployment === d.id ? 'Deleting…' : 'Delete' }}
                          </button>
                        </div>
                      </div>

                      <!-- Endpoint URL bar -->
                      @if (d.endpoint_url) {
                        <div class="px-5 py-3 border-b border-line flex items-center gap-3">
                          <div class="text-[10.5px] font-semibold tracking-[0.07em] uppercase text-ink3 shrink-0">API Endpoint</div>
                          <div class="flex-1 min-w-0 mono text-[12px] text-cyan3 truncate">POST {{ predictEndpoint(d) }}</div>
                          <button (click)="copyEndpoint(d)"
                            class="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium rounded-lg border transition shrink-0"
                            [class]="copiedEndpointId === d.id ? 'bg-good/10 border-good/30 text-good' : 'bg-white/[0.03] border-line text-ink2 hover:border-white/20'">
                            @if (copiedEndpointId === d.id) {
                              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
                              </svg>
                              Copied
                            } @else {
                              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                              </svg>
                              Copy URL
                            }
                          </button>
                          <button (click)="expandedEndpointId = expandedEndpointId === d.id ? '' : d.id"
                            class="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium rounded-lg border border-line bg-white/[0.03] text-ink2 hover:border-white/20 transition shrink-0">
                            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"/>
                            </svg>
                            curl
                          </button>
                        </div>

                        <!-- curl snippet -->
                        @if (expandedEndpointId === d.id) {
                          <div class="px-5 py-3 border-b border-line bg-black/20">
                            <div class="text-[10.5px] font-semibold tracking-[0.07em] uppercase text-ink3 mb-2">cURL Example</div>
                            <pre class="mono text-[11.5px] text-ink2 whitespace-pre-wrap break-all leading-relaxed">{{ curlSnippet(d) }}</pre>
                          </div>
                        }
                      } @else if (d.status === 'CREATING') {
                        <div class="px-5 py-3 border-b border-line flex items-center gap-2">
                          <div class="w-3 h-3 border border-cyan3 border-t-transparent rounded-full animate-spin"></div>
                          <span class="text-[12px] text-ink3">Endpoint will appear once deployment is ready…</span>
                        </div>
                      }

                      <!-- Inline test inference -->
                      @if (selectedDeployment?.id === d.id) {
                        <div class="px-5 py-4">
                          <div class="text-[11px] font-semibold tracking-[0.07em] uppercase text-ink3 mb-3">Test Inference</div>
                          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <label class="block text-[11px] text-ink3 mb-1.5">
                                Instances — JSON 2D array
                                <span class="text-ink3/60 ml-1 font-normal">e.g. [[5.1, 3.5, 1.4, 0.2]]</span>
                              </label>
                              <textarea
                                [(ngModel)]="predictInput"
                                [ngModelOptions]="{ standalone: true }"
                                rows="4"
                                class="w-full px-3 py-2 bg-raised border border-line rounded-lg text-ink text-[12.5px] mono focus:outline-none focus:border-cyan3/50 focus:ring-1 focus:ring-cyan3/30 resize-none"
                              ></textarea>
                              <button
                                (click)="runPredict()"
                                [disabled]="predicting"
                                class="mt-2.5 inline-flex items-center gap-2 px-4 py-2 text-[12.5px] font-medium rounded-lg bg-cyan3/10 border border-cyan3/30 text-cyan3 hover:bg-cyan3/20 disabled:opacity-40 transition"
                              >
                                @if (predicting) {
                                  <div class="w-3.5 h-3.5 border border-cyan3 border-t-transparent rounded-full animate-spin"></div>
                                  Predicting…
                                } @else {
                                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/>
                                  </svg>
                                  Run Prediction
                                }
                              </button>
                            </div>
                            <div>
                              @if (predictError) {
                                <div class="flex items-start gap-2 px-3.5 py-3 bg-bad/10 border border-bad/30 rounded-lg text-[12px] text-bad">
                                  <svg class="w-4 h-4 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                                  </svg>
                                  {{ predictError }}
                                </div>
                              }
                              @if (predictResult !== null) {
                                <div>
                                  <div class="text-[11px] font-semibold tracking-[0.07em] uppercase text-ink3 mb-1.5">Response</div>
                                  <pre class="bg-black/30 border border-line rounded-lg px-4 py-3 text-[12px] text-good mono overflow-auto max-h-40">{{ predictResult | json }}</pre>
                                </div>
                              }
                              @if (!predictError && predictResult === null) {
                                <div class="h-full flex items-center justify-center text-[12px] text-ink3 py-8">
                                  Response will appear here
                                </div>
                              }
                            </div>
                          </div>
                        </div>

                        <!-- ── Public API Keys ──────────────────────────── -->
                        <div class="px-5 py-4 border-t border-line">
                          <div class="flex items-center justify-between mb-3">
                            <div>
                              <div class="text-[11px] font-semibold tracking-[0.07em] uppercase text-ink3">Public API Keys</div>
                              <div class="text-[11px] text-ink3 mt-0.5">Issue keys for third parties to call this model without a platform account.</div>
                            </div>
                            <button (click)="openCreateApiKeyModal(d)"
                              class="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11.5px] font-medium rounded-lg bg-cyan3/10 border border-cyan3/30 text-cyan3 hover:bg-cyan3/20 transition shrink-0">
                              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"/>
                              </svg>
                              New key
                            </button>
                          </div>

                          @if (apiKeysLoading) {
                            <div class="text-[12px] text-ink3 py-3">Loading keys…</div>
                          } @else if (apiKeys.length === 0) {
                            <div class="text-[12px] text-ink3 py-3 italic">No API keys yet. Create one to expose this model publicly.</div>
                          } @else {
                            <div class="space-y-1.5">
                              @for (k of apiKeys; track k.id) {
                                <div class="flex items-center gap-3 px-3 py-2 bg-raised/40 border border-white/5 rounded-lg">
                                  <div class="min-w-0 flex-1">
                                    <div class="flex items-center gap-2">
                                      <span class="text-[12.5px] font-medium text-ink truncate">{{ k.name }}</span>
                                      @if (k.revoked_at) {
                                        <span class="mono text-[10px] px-1.5 py-px rounded bg-bad/15 text-bad">revoked</span>
                                      }
                                    </div>
                                    <div class="flex items-center gap-2 mt-0.5">
                                      <span class="mono text-[11px] text-ink3">{{ k.prefix }}••••</span>
                                      <span class="text-[10.5px] text-ink3">·</span>
                                      <span class="text-[11px] text-ink3">
                                        @if (k.revoked_at) { revoked {{ timeAgo(k.revoked_at) }} }
                                        @else if (k.last_used_at) { last used {{ timeAgo(k.last_used_at) }} }
                                        @else { never used }
                                      </span>
                                    </div>
                                  </div>
                                  @if (!k.revoked_at) {
                                    <button (click)="revokeApiKey(d, k)"
                                      class="text-[11px] text-ink3 hover:text-bad transition px-2 py-1 rounded shrink-0"
                                      title="Revoke this key">
                                      Revoke
                                    </button>
                                  }
                                </div>
                              }
                            </div>
                          }

                          @if (activeApiKeys.length > 0) {
                            <div class="mt-4">
                              <div class="text-[11px] font-semibold tracking-[0.07em] uppercase text-ink3 mb-2">Use this API from your code</div>
                              <div class="flex items-center gap-1 mb-2">
                                @for (lang of snippetLangs; track lang) {
                                  <button (click)="snippetLang = lang"
                                    class="px-3 py-1 text-[11px] rounded transition"
                                    [class]="snippetLang === lang ? 'bg-cyan3/15 text-cyan2 border border-cyan3/30' : 'text-ink3 hover:text-ink hover:bg-white/5 border border-transparent'">
                                    {{ lang }}
                                  </button>
                                }
                              </div>
                              <pre class="bg-black/30 border border-line rounded-lg px-3 py-2.5 text-[11.5px] text-good mono overflow-x-auto whitespace-pre">{{ snippetFor(d, snippetLang) }}</pre>
                              <p class="text-[10.5px] text-ink3 mt-1.5">Replace <span class="mono text-cyan3">mlops_&lt;your_key&gt;</span> with the value you saved when you created the key.</p>
                            </div>
                          }
                        </div>
                      }
                    </div>
                  }
                }
              </div>
            }
          </div>
        }
      }
    </div>

    <!-- ── Create API key modal ──────────────────────────────────────── -->
    @if (creatingApiKeyForDeployment) {
      <div class="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
           (click)="cancelCreateApiKey()">
        <div class="w-full max-w-md bg-base border border-line rounded-2xl shadow-2xl overflow-hidden"
             (click)="$event.stopPropagation()">
          @if (!newApiKeyPlaintext) {
            <div class="px-6 py-5 border-b border-line">
              <div class="text-[14px] font-semibold text-ink">Create API key</div>
              <div class="text-[12px] text-ink3 mt-0.5">For: <span class="mono text-cyan3">{{ creatingApiKeyForDeployment.inference_service_name }}</span></div>
            </div>
            <div class="px-6 py-5">
              <label class="block text-[11.5px] text-ink2 mb-1.5">Key name</label>
              <input
                [(ngModel)]="newApiKeyName"
                [ngModelOptions]="{ standalone: true }"
                placeholder="e.g. Production website, Mobile app, Test"
                class="w-full h-10 px-3 rounded-md bg-bg/60 border border-white/10 focus:border-cyan3/40 focus-cyan text-[12.5px] text-ink outline-none placeholder:text-ink3"
                (keydown.enter)="submitCreateApiKey()"
              />
              <p class="text-[11px] text-ink3 mt-2">A friendly label so you remember which app this key is for. Not part of the key itself.</p>
            </div>
            <div class="px-6 py-4 border-t border-line flex justify-end gap-2">
              <button (click)="cancelCreateApiKey()"
                class="px-3 py-2 text-[12px] text-ink2 hover:text-ink transition">Cancel</button>
              <button (click)="submitCreateApiKey()"
                [disabled]="!newApiKeyName.trim() || creatingApiKey"
                class="px-3.5 py-2 text-[12px] font-medium rounded-lg bg-cyan3/10 border border-cyan3/30 text-cyan3 hover:bg-cyan3/20 disabled:opacity-40 transition">
                {{ creatingApiKey ? 'Creating…' : 'Create key' }}
              </button>
            </div>
          } @else {
            <div class="px-6 py-5 border-b border-line">
              <div class="text-[14px] font-semibold text-ink">Your new API key</div>
              <div class="text-[12px] text-ink3 mt-0.5">Save this now — you won't see it again.</div>
            </div>
            <div class="px-6 py-5">
              <div class="flex items-stretch gap-2">
                <pre class="flex-1 min-w-0 bg-black/40 border border-line rounded-lg px-3 py-2.5 mono text-[12px] text-cyan2 overflow-x-auto whitespace-pre">{{ newApiKeyPlaintext }}</pre>
                <button (click)="copyNewApiKey()"
                  class="px-3 py-2 text-[11.5px] font-medium rounded-lg border bg-white/[0.03] border-line text-ink2 hover:border-white/20 transition shrink-0"
                  [class]="newApiKeyCopied ? 'bg-good/10 border-good/30 text-good' : ''">
                  {{ newApiKeyCopied ? 'Copied' : 'Copy' }}
                </button>
              </div>
              <div class="mt-3 px-3 py-2.5 rounded-lg bg-warn/10 border border-warn/30 text-[11.5px] text-warn flex items-start gap-2">
                <svg class="w-4 h-4 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
                <span>Store this key in a password manager or your app's secret store now. Once you close this dialog, only the prefix <span class="mono">{{ newApiKeyPlaintext.slice(0, 12) }}••••</span> will be visible.</span>
              </div>
            </div>
            <div class="px-6 py-4 border-t border-line flex justify-end">
              <button (click)="cancelCreateApiKey()"
                class="px-4 py-2 text-[12px] font-medium rounded-lg bg-cyan3/10 border border-cyan3/30 text-cyan3 hover:bg-cyan3/20 transition">
                I've saved it
              </button>
            </div>
          }
        </div>
      </div>
    }

    <!-- Deploy configuration modal -->
    @if (pendingDeployVersion) {
      <div class="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
           (click)="pendingDeployVersion = null">
        <div class="w-full max-w-md bg-base border border-line rounded-2xl shadow-2xl overflow-hidden"
             (click)="$event.stopPropagation()">
          <!-- Modal header -->
          <div class="px-6 py-5 border-b border-line">
            <div class="flex items-center gap-3">
              <div class="w-9 h-9 rounded-xl bg-cyan3/10 border border-cyan3/30 flex items-center justify-center shrink-0">
                <svg class="w-4.5 h-4.5 text-cyan3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
              </div>
              <div>
                <div class="text-[14px] font-semibold text-ink">Deploy Model</div>
                <div class="mono text-[11.5px] text-ink3">{{ pendingDeployVersion.name }} · v{{ pendingDeployVersion.version }}</div>
              </div>
            </div>
          </div>

          <!-- Modal body -->
          <div class="px-6 py-5 space-y-5">
            <!-- Replica selector -->
            <div>
              <div class="flex items-center justify-between mb-3">
                <div>
                  <div class="text-[13px] font-medium text-ink">Replicas</div>
                  <div class="text-[11.5px] text-ink3 mt-0.5">Number of model server instances to run in parallel</div>
                </div>
                <div class="mono text-[22px] font-bold text-cyan3 w-10 text-center">{{ pendingReplicas }}</div>
              </div>
              <!-- Replica buttons 1–5 -->
              <div class="flex gap-2">
                @for (n of replicaOptions; track n) {
                  <button (click)="pendingReplicas = n"
                    class="flex-1 h-10 rounded-lg border text-[13px] font-medium transition"
                    [class]="pendingReplicas === n
                      ? 'bg-cyan3/15 border-cyan3/60 text-cyan3'
                      : 'bg-white/[0.03] border-line text-ink2 hover:border-white/20 hover:text-ink'">
                    {{ n }}
                  </button>
                }
              </div>
              <!-- Info callout -->
              <div class="mt-3 flex items-start gap-2 px-3.5 py-3 bg-white/[0.03] border border-line rounded-lg">
                <svg class="w-3.5 h-3.5 text-ink3 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                <span class="text-[11.5px] text-ink3 leading-relaxed">
                  @if (pendingReplicas === 1) {
                    Single replica — suitable for development and testing.
                  } @else if (pendingReplicas <= 2) {
                    2 replicas — basic high-availability, requests load-balanced.
                  } @else {
                    {{ pendingReplicas }} replicas — production-grade throughput with horizontal scaling.
                  }
                </span>
              </div>
            </div>

            <!-- Stage badge -->
            <div class="flex items-center justify-between px-4 py-3 bg-card border border-line rounded-lg">
              <span class="text-[12.5px] text-ink2">Current stage</span>
              <span class="mono text-[11.5px] px-2 py-0.5 rounded"
                [class]="pendingDeployVersion.stage === 'Production' ? 'bg-good/10 border border-good/30 text-good' : 'bg-warn/10 border border-warn/30 text-warn'">
                {{ pendingDeployVersion.stage }}
              </span>
            </div>
          </div>

          <!-- Modal footer -->
          <div class="px-6 py-4 border-t border-line flex items-center justify-end gap-3">
            <button (click)="pendingDeployVersion = null"
              class="px-4 py-2 text-[13px] font-medium rounded-lg bg-white/[0.04] border border-line text-ink2 hover:border-white/20 hover:text-ink transition">
              Cancel
            </button>
            <button (click)="confirmDeploy()"
              class="inline-flex items-center gap-2 px-5 py-2 text-[13px] font-medium rounded-lg bg-cyan3/10 border border-cyan3/40 text-cyan3 hover:bg-cyan3/20 transition">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
              Deploy {{ pendingReplicas }} replica{{ pendingReplicas !== 1 ? 's' : '' }}
            </button>
          </div>
        </div>
      </div>
    }

    @if (confirmState) {
      <app-confirm-dialog
        [title]="confirmState.title"
        [message]="confirmState.message"
        [confirmLabel]="confirmState.confirmLabel"
        (confirmed)="confirmState.fn(); confirmState = null"
        (dismissed)="confirmState = null"
      ></app-confirm-dialog>
    }
  `,
})
export class ProjectDetailComponent implements OnInit, OnDestroy, AfterViewChecked {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private projectService = inject(ProjectService);
  private uploadService = inject(UploadService);
  private experimentService = inject(ExperimentService);
  private pipelineService = inject(PipelineService);
  private modelService = inject(ModelService);
  private deploymentService = inject(DeploymentService);
  project: Project | null = null;
  files: UploadedFile[] = [];
  runs: MlflowRun[] = [];
  selectedRun: MlflowRun | null = null;
  selectedRunIds = new Set<string>();
  experimentGroups: ExperimentGroup[] = [];
  expandedGroups = new Set<string>();
  showAllMetrics = false;
  registerTarget: MlflowRun | null = null;
  registering = false;
  registerMessage = '';
  registerError = '';
  pipelineRuns: PipelineRun[] = [];
  modelVersions: ModelVersion[] = [];
  modelName = '';
  promotingVersion = '';
  promotingStage = '';
  promoteMessage = '';
  promoteError = '';
  stageLog: { time: Date; message: string; stage: string }[] = [];
  deployingVersion = '';
  deployError = '';
  deploySuccess = '';
  fixingWebhook = false;
  webhookFixResult = '';
  pendingDeployVersion: ModelVersion | null = null;
  pendingReplicas = 1;
  copiedEndpointId = '';
  expandedEndpointId = '';

  deployments: Deployment[] = [];
  selectedDeployment: Deployment | null = null;
  deletingDeployment = '';
  predictInput = '[[5.1, 3.5, 1.4, 0.2]]';
  predicting = false;
  predictResult: unknown = null;
  predictError = '';
  private deploymentPollInterval: any = null;
  deploymentElapsedTick = 0;
  private deploymentTimerInterval: any = null;

  // ── Public API keys (per-deployment) ─────────────────────────────────
  apiKeys: ApiKey[] = [];
  apiKeysLoading = false;
  /** When non-null, the create-key modal is open for this deployment. */
  creatingApiKeyForDeployment: Deployment | null = null;
  newApiKeyName = '';
  creatingApiKey = false;
  /** Plaintext of the most-recently-created key — shown ONCE in the modal. */
  newApiKeyPlaintext: string | null = null;
  newApiKeyCopied = false;
  /** Snippet tabs in the "Use this API" panel. */
  readonly snippetLangs: ReadonlyArray<'cURL' | 'JavaScript' | 'Python'> = ['cURL', 'JavaScript', 'Python'];
  snippetLang: 'cURL' | 'JavaScript' | 'Python' = 'cURL';

  get activeApiKeys(): ApiKey[] {
    return this.apiKeys.filter(k => !k.revoked_at);
  }

  activeTab = 'overview';
  isDragging = false;
  uploading = false;
  uploadingFileName = '';
  uploadSuccess = false;
  pipelineTriggerSuccess = '';

  // Pre-flight code analyzer (static AST scan of the last uploaded script)
  analyzingCode = false;
  analyzedFileName = '';
  codeWarnings: CodeWarning[] = [];

  // Error panel (FAILED runs only -- shows the user-script stdout/stderr
  // blob the runner persisted to MinIO. Cheap to fetch; survives pod GC.)
  selectedErrorRunId: string | null = null;
  runError: {
    loading: boolean;
    captured: boolean;
    text: string;
    bytes: number;
    reason: string;
  } = { loading: false, captured: false, text: '', bytes: 0, reason: '' };
  runErrorCopied = false;

  // Log terminal
  selectedLogRunId: string | null = null;
  runLogs: string[] = [];
  /** Server-side filtered projection: only `[platform]` lines + the
   *  `=== STDOUT/STDERR ===` blocks. Hides ~500 lines of Argo / KFP
   *  boilerplate per step that bury the real script error. */
  runLogsUserScript: string[] = [];
  logsLoading = false;
  private logPollInterval: any = null;

  // Log terminal state (enhanced)
  logFilter: 'all' | 'platform' | 'error' = 'all';
  /** When true (default), render `runLogsUserScript` instead of `runLogs`.
   *  Toggled via the RAW button -- RAW off = filtered, RAW on = full. */
  logScriptOnly = true;
  logSearch = '';
  logWrap = true;
  logShowTs = true;
  logAutoScroll = true;
  logsCopied = false;
  logPendingCount = 0;
  logElapsedTick = 0;
  private logElapsedInterval: any = null;
  private lastRenderedLogLength = 0;
  @ViewChild('logContainer') private logContainerRef?: ElementRef<HTMLDivElement>;

  // Custom code pipeline
  selectedCodePath = '';
  selectedDatasetPath = '';
  customEntryScript = '';
  triggeringCustom = false;
  customError = '';
  showAdvanced = false;
  uploadingDataset = false;

  private pollInterval: any = null;

  experimentsChartType: 'bar' = 'bar';
  experimentsChartData: ChartData<'bar'> = { labels: [], datasets: [] };
  experimentsChartOptions: ChartConfiguration<'bar'>['options'] = {
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
        max: 1,
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

  get codeFiles() {
    return this.files.filter(f => {
      const n = f.name.toLowerCase();
      return n.endsWith('.zip') || n.endsWith('.py') || n.endsWith('.ipynb');
    });
  }

  get datasetFiles() {
    return this.files.filter(f => f.name.toLowerCase().endsWith('.csv'));
  }

  tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'code', label: 'Code' },
    { id: 'experiments', label: 'Experiments' },
    { id: 'pipelines', label: 'Pipelines' },
    { id: 'models', label: 'Models' },
    { id: 'deployments', label: 'Deployments' },
  ];

  tabCount(id: string): number | null {
    switch (id) {
      case 'code': return this.files.length || null;
      case 'experiments': return this.runs.length || null;
      case 'pipelines': return this.pipelineRuns.length || null;
      case 'models': return this.modelVersions.length || null;
      case 'deployments': return this.deployments.filter(d => d.status !== 'DELETED').length || null;
      default: return null;
    }
  }

  championVersion(): ModelVersion | null {
    const prod = this.modelVersions.find(v => v.stage === 'Production');
    if (prod) return prod;
    const staging = this.modelVersions.find(v => v.stage === 'Staging');
    return staging || null;
  }

  championFramework(): string {
    const name = (this.championVersion()?.name || '').toLowerCase();
    if (name.includes('xgboost')) return 'XGBoost';
    if (name.includes('lightgbm')) return 'LightGBM';
    if (name.includes('torch') || name.includes('pytorch')) return 'PyTorch';
    if (name.includes('tensorflow') || name.includes('tf-')) return 'TensorFlow';
    return 'sklearn';
  }

  championRun(): MlflowRun | null {
    const v = this.championVersion();
    if (!v?.run_id) return null;
    return this.runs.find(r => r.info.run_id === v.run_id) || null;
  }

  championMetric(): { label: string; value: string; sub: string } {
    const v = this.championVersion();
    const metrics = v?.metrics || {};
    const fromRun = this.championRun();
    const runMetrics: Record<string, number> = {};
    if (fromRun) {
      for (const m of fromRun.data.metrics || []) runMetrics[m.key] = m.value;
    }
    const all = { ...runMetrics, ...metrics };
    const priority = ['f1_score', 'accuracy', 'roc_auc', 'r2_score'];
    for (const k of priority) {
      if (k in all) {
        const label = k === 'f1_score' ? 'F1 Score' : k === 'accuracy' ? 'Accuracy' : k === 'roc_auc' ? 'ROC-AUC' : 'R² Score';
        return { label, value: all[k].toFixed(3), sub: 'from best run' };
      }
    }
    const keys = Object.keys(all);
    if (keys.length === 0) return { label: 'Metric', value: '—', sub: 'no metrics logged' };
    const k = keys[0];
    return { label: k, value: all[k].toFixed(3), sub: 'from best run' };
  }

  finishedRunsCount(): number {
    return this.runs.filter(r => r.info.status === 'FINISHED').length;
  }

  recentRuns(): MlflowRun[] {
    return [...this.runs]
      .sort((a, b) => (b.info.start_time || 0) - (a.info.start_time || 0))
      .slice(0, 5);
  }

  shortRunId(id: string): string {
    return id ? id.substring(0, 8) : '';
  }

  mapRunStatus(s: string): string {
    switch ((s || '').toUpperCase()) {
      case 'FINISHED': return 'succeeded';
      case 'RUNNING': return 'running';
      case 'FAILED': return 'failed';
      case 'KILLED': return 'canceled';
      case 'SCHEDULED': return 'queued';
      default: return s?.toLowerCase() || '—';
    }
  }

  topRunMetric(r: MlflowRun): string {
    const metrics = r.data?.metrics || [];
    if (metrics.length === 0) return '—';
    const priority = ['accuracy', 'f1_score', 'roc_auc', 'r2_score'];
    for (const k of priority) {
      const m = metrics.find(x => x.key === k);
      if (m) return `${k}: ${m.value.toFixed(3)}`;
    }
    const m = metrics[0];
    return `${m.key}: ${m.value.toFixed(3)}`;
  }

  timeAgo(iso: string | Date | null | undefined): string {
    if (!iso) return '—';
    const date = typeof iso === 'string' ? new Date(iso) : iso;
    return this.timeAgoMs(date.getTime());
  }

  timeAgoMs(ms: number | null | undefined): string {
    if (!ms) return '—';
    const s = Math.floor((Date.now() - ms) / 1000);
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 30) return `${d}d ago`;
    const mo = Math.floor(d / 30);
    return `${mo}mo ago`;
  }

  runVolumeBars(): { label: string; count: number; pct: number }[] {
    const days = 14;
    const now = new Date();
    const buckets: { label: string; count: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      buckets.push({
        label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        count: 0,
      });
    }
    const startMs = new Date(now);
    startMs.setDate(startMs.getDate() - (days - 1));
    startMs.setHours(0, 0, 0, 0);
    for (const r of this.runs) {
      const t = r.info.start_time;
      if (!t) continue;
      const idx = Math.floor((t - startMs.getTime()) / (24 * 60 * 60 * 1000));
      if (idx >= 0 && idx < days) buckets[idx].count += 1;
    }
    const max = Math.max(1, ...buckets.map(b => b.count));
    return buckets.map(b => ({ ...b, pct: Math.round((b.count / max) * 100) }));
  }

  contributors(): { name: string; initial: string; runs: number }[] {
    if (this.runs.length === 0) return [];
    const counts: Record<string, number> = {};
    for (const r of this.runs) {
      const user = (r.data.tags || []).find(t => t.key === 'mlflow.user')?.value || 'system';
      counts[user] = (counts[user] || 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, runs]) => ({
        name,
        initial: name.charAt(0).toUpperCase(),
        runs,
      }));
  }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.projectService.get(id).subscribe((p) => (this.project = p));
    this.loadFiles(id);
    this.loadRuns(id);
    this.loadPipelineRuns(id);
    this.loadModels();
    this.loadDeployments(id);
  }

  ngOnDestroy(): void {
    if (this.pollInterval) clearInterval(this.pollInterval);
    if (this.deploymentPollInterval) clearInterval(this.deploymentPollInterval);
    if (this.deploymentTimerInterval) clearInterval(this.deploymentTimerInterval);
    if (this.logPollInterval) clearInterval(this.logPollInterval);
    if (this.logElapsedInterval) clearInterval(this.logElapsedInterval);
  }

  loadFiles(projectId: string): void {
    this.uploadService.listFiles(projectId).subscribe({
      next: (res) => (this.files = res.files),
    });
  }

  loadRuns(projectId: string): void {
    this.experimentService.listRuns(projectId).subscribe({
      next: (res) => {
        this.runs = res.runs;
        this.buildExperimentGroups();
        this.buildExperimentsChart();
      },
    });
  }

  // ── Experiment grouping & ranking ─────────────────────────────────────────
  // Metrics we rank models by, best-first. Mirrors championMetric/topRunMetric.
  private readonly primaryMetricPriority = ['f1_score', 'accuracy', 'roc_auc', 'r2_score'];
  // The only metrics surfaced on the Experiments tab. Each spec lists the keys
  // we accept (eval/test first), so autolog's noisy training_* keys are hidden.
  private readonly HEADLINE: { label: string; keys: string[] }[] = [
    { label: 'Accuracy', keys: ['accuracy', 'accuracy_score', 'accuracy_score_X_test', 'test_accuracy', 'val_accuracy'] },
    { label: 'F1', keys: ['f1_score', 'f1', 'f1_score_X_test', 'test_f1_score', 'val_f1'] },
    { label: 'ROC-AUC', keys: ['roc_auc', 'roc_auc_score', 'roc_auc_X_test', 'auc'] },
  ];

  // The curated headline metrics for a run (Accuracy / F1 / ROC-AUC). Falls back
  // to the run's single top metric so a row is never blank (e.g. regression).
  headlineMetrics(run: MlflowRun): { label: string; value: number }[] {
    const metrics = run.data?.metrics || [];
    if (metrics.length === 0) return [];
    const out: { label: string; value: number }[] = [];
    for (const spec of this.HEADLINE) {
      for (const k of spec.keys) {
        const m = metrics.find((x) => x.key === k);
        if (m) { out.push({ label: spec.label, value: m.value }); break; }
      }
    }
    if (out.length > 0) return out;
    // Fallback: a non-training metric if possible, else the very first.
    const fallback = metrics.find((m) => !/^train(ing)?_/i.test(m.key)) || metrics[0];
    return [{ label: fallback.key, value: fallback.value }];
  }

  // Best value of a headline metric within a run (used by ranking + chart).
  private headlineValue(run: MlflowRun, spec: { keys: string[] }): number | null {
    const metrics = run.data?.metrics || [];
    for (const k of spec.keys) {
      const m = metrics.find((x) => x.key === k);
      if (m) return m.value;
    }
    return null;
  }
  // Known algorithm names we recognise inside a run name / params.
  private readonly modelKeywords: { match: RegExp; label: string }[] = [
    { match: /xgboost|xgb/i, label: 'XGBoost' },
    { match: /lightgbm|lgbm/i, label: 'LightGBM' },
    { match: /gradient\s*boost|gradientboosting|gbm|gbc/i, label: 'GradientBoosting' },
    { match: /random\s*forest|randomforest|rf\b/i, label: 'RandomForest' },
    { match: /logistic/i, label: 'LogisticRegression' },
    { match: /decision\s*tree|decisiontree/i, label: 'DecisionTree' },
    { match: /\bsvm\b|svc|support\s*vector/i, label: 'SVM' },
    { match: /\bknn\b|kneighbors|k-nearest/i, label: 'KNN' },
    { match: /ridge/i, label: 'Ridge' },
    { match: /lasso/i, label: 'Lasso' },
    { match: /pytorch|torch/i, label: 'PyTorch' },
    { match: /tensorflow|keras|\btf-/i, label: 'TensorFlow' },
    { match: /linear\s*regression|linearregression/i, label: 'LinearRegression' },
  ];

  private isLowerBetter(metricKey: string): boolean {
    return /loss|error|rmse|mae/i.test(metricKey);
  }

  // Derive the model family for a run from its name, then its params, then a
  // sensible fallback (text after the last dash, else the raw name).
  deriveModelKey(run: MlflowRun): string {
    const name = run.info.run_name || '';
    const paramText = (run.data.params || []).map((p) => `${p.key} ${p.value}`).join(' ');
    const haystack = `${name} ${paramText}`;
    for (const { match, label } of this.modelKeywords) {
      if (match.test(haystack)) return label;
    }
    if (name.includes('-')) {
      const tail = name.split('-').pop()!.trim();
      if (tail) return tail;
    }
    return name || 'default';
  }

  // Pick the metric a run is ranked by: first present headline metric (F1 →
  // Accuracy → ROC-AUC, eval keys preferred), else the first regression-priority
  // metric, else the first logged metric. Returns null when nothing was logged.
  primaryMetric(run: MlflowRun): { key: string; value: number } | null {
    const metrics = run.data?.metrics || [];
    if (metrics.length === 0) return null;
    // Headline order for ranking: F1, then Accuracy, then ROC-AUC.
    const rankOrder = ['F1', 'Accuracy', 'ROC-AUC'];
    for (const label of rankOrder) {
      const spec = this.HEADLINE.find((h) => h.label === label)!;
      const v = this.headlineValue(run, spec);
      if (v !== null) return { key: label, value: v };
    }
    // Regression / fallback: return the RAW metric key so the group's exact-match
    // valueOf resolves it (headline labels are resolved separately via HEADLINE).
    for (const k of this.primaryMetricPriority) {
      const m = metrics.find((x) => x.key === k);
      if (m) return { key: m.key, value: m.value };
    }
    const first = metrics[0];
    return { key: first.key, value: first.value };
  }

  // Bucket runs by model family, rank runs within each group, then rank the
  // groups against one another by their best primary-metric value.
  private buildExperimentGroups(): void {
    const buckets = new Map<string, MlflowRun[]>();
    for (const run of this.runs) {
      const key = this.deriveModelKey(run);
      (buckets.get(key) ?? buckets.set(key, []).get(key)!).push(run);
    }

    const groups: ExperimentGroup[] = [];
    for (const [key, runs] of buckets) {
      // Decide the ranking metric for this group from its best-logged run.
      const sampleMetric =
        runs.map((r) => this.primaryMetric(r)).find((m) => m !== null) ?? null;
      const primaryKey = sampleMetric?.key ?? '';
      const lowerIsBetter = primaryKey ? this.isLowerBetter(primaryKey) : false;

      // primaryKey may be a headline label ("F1") or a raw metric key; resolve
      // both so every run in the group is scored on the same metric.
      const headlineSpec = this.HEADLINE.find((h) => h.label === primaryKey);
      const valueOf = (r: MlflowRun): number | null => {
        if (headlineSpec) return this.headlineValue(r, headlineSpec);
        const m = (r.data?.metrics || []).find((x) => x.key === primaryKey);
        return m ? m.value : null;
      };

      const sorted = [...runs].sort((a, b) => {
        // FINISHED runs first, then by primary metric (best-first), then newest.
        const af = a.info.status === 'FINISHED' ? 0 : 1;
        const bf = b.info.status === 'FINISHED' ? 0 : 1;
        if (af !== bf) return af - bf;
        const av = valueOf(a);
        const bv = valueOf(b);
        if (av !== null && bv !== null && av !== bv) {
          return lowerIsBetter ? av - bv : bv - av;
        }
        if (av !== null && bv === null) return -1;
        if (av === null && bv !== null) return 1;
        return (b.info.start_time || 0) - (a.info.start_time || 0);
      });

      const bestRun = sorted[0];
      const bestVal = valueOf(bestRun);
      groups.push({
        key,
        runs: sorted,
        bestRun,
        primaryKey,
        primaryValue: bestVal ?? 0,
        lowerIsBetter,
        rank: 0,
      });
    }

    // Rank groups: those with a comparable metric first (best value wins),
    // groups without any metric fall to the bottom, alphabetically.
    groups.sort((a, b) => {
      const aHas = !!a.primaryKey;
      const bHas = !!b.primaryKey;
      if (aHas !== bHas) return aHas ? -1 : 1;
      if (aHas && a.primaryValue !== b.primaryValue) {
        // Higher is better unless both groups rank a lower-is-better metric.
        const lower = a.lowerIsBetter && b.lowerIsBetter;
        return lower ? a.primaryValue - b.primaryValue : b.primaryValue - a.primaryValue;
      }
      return a.key.localeCompare(b.key);
    });
    groups.forEach((g, i) => (g.rank = i + 1));

    this.experimentGroups = groups;
    // Expand the leading group by default so the page never looks empty.
    if (groups.length && this.expandedGroups.size === 0) {
      this.expandedGroups.add(groups[0].key);
    }
  }

  bestGroup(): ExperimentGroup | null {
    const top = this.experimentGroups[0];
    return top && top.primaryKey ? top : null;
  }

  toggleGroup(key: string): void {
    if (this.expandedGroups.has(key)) this.expandedGroups.delete(key);
    else this.expandedGroups.add(key);
  }

  // 1–5 stars from a group's primary value relative to the best group.
  groupStars(group: ExperimentGroup): number {
    if (!group.primaryKey) return 0;
    const best = this.bestGroup();
    if (!best || best.primaryValue === 0) return group === best ? 5 : 1;
    const ratio = group.lowerIsBetter
      ? best.primaryValue / Math.max(group.primaryValue, 1e-9)
      : group.primaryValue / best.primaryValue;
    return Math.max(1, Math.min(5, Math.round(ratio * 5)));
  }

  // Human label for the primary metric key (e.g. f1_score → F1 Score).
  metricLabel(key: string): string {
    if (!key) return '—';
    const map: Record<string, string> = {
      f1_score: 'F1 Score',
      accuracy: 'Accuracy',
      roc_auc: 'ROC-AUC',
      r2_score: 'R² Score',
    };
    return map[key] || key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  rankBadgeClass(rank: number): string {
    switch (rank) {
      case 1: return 'bg-amber-400/15 border-amber-400/40 text-amber-300';
      case 2: return 'bg-slate-300/15 border-slate-300/40 text-slate-200';
      case 3: return 'bg-orange-500/15 border-orange-500/40 text-orange-300';
      default: return 'bg-white/[0.04] border-line text-ink3';
    }
  }

  // Chart: one bar group per model family showing each model's BEST value for
  // the present metrics — far fewer bars than per-run, no repeated labels.
  private buildExperimentsChart(): void {
    const ranked = this.experimentGroups.filter((g) =>
      g.runs.some((r) => r.info.status === 'FINISHED')
    );
    if (ranked.length === 0) {
      this.experimentsChartData = { labels: [], datasets: [] };
      return;
    }
    // Only the headline metrics that at least one model actually logged.
    const presentSpecs = this.HEADLINE.filter((spec) =>
      ranked.some((g) => g.runs.some((r) => this.headlineValue(r, spec) !== null))
    );
    // Best (max) value of a headline metric within a model group.
    const bestOf = (g: ExperimentGroup, spec: { keys: string[] }): number => {
      let best = 0;
      let found = false;
      for (const r of g.runs) {
        const v = this.headlineValue(r, spec);
        if (v !== null) { best = found ? Math.max(best, v) : v; found = true; }
      }
      return found ? best : 0;
    };
    // cyan → violet → amber palette aligned to design tokens
    const palette = [
      { bg: 'rgba(66,194,255,0.75)', border: 'rgba(66,194,255,0.9)' },
      { bg: 'rgba(139,92,246,0.75)', border: 'rgba(139,92,246,0.9)' },
      { bg: 'rgba(245,158,11,0.75)', border: 'rgba(245,158,11,0.9)' },
    ];
    this.experimentsChartData = {
      labels: ranked.map((g) => g.key),
      datasets: presentSpecs.map((spec, idx) => ({
        label: spec.label,
        data: ranked.map((g) => bestOf(g, spec)),
        backgroundColor: palette[idx % palette.length].bg,
        borderColor: palette[idx % palette.length].border,
        borderWidth: 1,
        borderRadius: 3,
      })),
    };
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = true;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = false;

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.uploadFiles(Array.from(files));
    }
  }

  onFileSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.uploadFiles(Array.from(input.files));
    }
  }

  uploadFiles(files: File[]): void {
    if (!this.project) return;
    const projectId = this.project.id;

    for (const file of files) {
      this.uploading = true;
      this.uploadingFileName = file.name;
      this.uploadSuccess = false;

      this.uploadService.upload(projectId, file).subscribe({
        next: (res) => {
          this.uploading = false;
          this.uploadSuccess = true;
          this.loadFiles(projectId);
          this.runCodeAnalysis(projectId, res.path, file.name);
          setTimeout(() => (this.uploadSuccess = false), 3000);
        },
        error: () => {
          this.uploading = false;
        },
      });
    }
  }

  // Only .py / .ipynb / .zip carry executable code worth analyzing.
  // Datasets (.csv) and configs (.yaml/.json) are skipped to avoid noise.
  private isAnalyzable(filename: string): boolean {
    const lower = filename.toLowerCase();
    return lower.endsWith('.py') || lower.endsWith('.ipynb') || lower.endsWith('.zip');
  }

  private runCodeAnalysis(projectId: string, path: string, filename: string): void {
    if (!this.isAnalyzable(filename)) {
      this.analyzedFileName = '';
      this.codeWarnings = [];
      return;
    }
    this.analyzingCode = true;
    this.analyzedFileName = filename;
    this.codeWarnings = [];
    this.uploadService.analyzeFile(projectId, path).subscribe({
      next: (res) => {
        this.analyzingCode = false;
        this.codeWarnings = res.warnings || [];
      },
      error: () => {
        this.analyzingCode = false;
        // Quietly drop the panel rather than surface a "couldn't analyze"
        // error -- analysis is advisory, the user can still run.
        this.analyzedFileName = '';
      },
    });
  }

  formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  getStatusClass(status: string): string {
    const base = 'inline-flex items-center px-2 py-0.5 rounded font-medium border';
    switch (status) {
      case 'FINISHED': return `${base} bg-good/10 border-good/30 text-good`;
      case 'RUNNING':  return `${base} bg-cyan3/10 border-cyan3/30 text-cyan3`;
      case 'FAILED':   return `${base} bg-bad/10 border-bad/30 text-bad`;
      default:         return `${base} bg-white/[0.05] border-line text-ink2`;
    }
  }

  getDuration(run: MlflowRun): string {
    if (!run.info.end_time || !run.info.start_time) return '-';
    const ms = run.info.end_time - run.info.start_time;
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  }

  // Pipeline methods
  loadPipelineRuns(projectId: string): void {
    this.pipelineService.listRuns(projectId).subscribe({
      next: (res) => (this.pipelineRuns = res.runs),
    });
  }

  onTriggerCustomPipeline(): void {
    if (!this.project || !this.selectedCodePath) return;
    this.triggeringCustom = true;
    this.customError = '';
    this.pipelineService.triggerCustom({
      project_id: this.project.id,
      code_minio_path: this.selectedCodePath,
      dataset_minio_path: this.selectedDatasetPath || undefined,
      entry_script: this.customEntryScript || undefined,
    }).subscribe({
      next: (res) => {
        this.triggeringCustom = false;
        this.pipelineTriggerSuccess = res.id.substring(0, 8);
        this.loadPipelineRuns(this.project!.id);
        this.startPolling();
        setTimeout(() => (this.pipelineTriggerSuccess = ''), 5000);
      },
      error: (err) => {
        this.triggeringCustom = false;
        this.customError = err.error?.detail || 'Failed to trigger pipeline';
      },
    });
  }

  onDatasetFileSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length || !this.project) return;
    const file = input.files[0];
    this.uploadingDataset = true;
    this.uploadService.upload(this.project.id, file).subscribe({
      next: () => {
        this.uploadingDataset = false;
        this.loadFiles(this.project!.id);
        setTimeout(() => {
          const uploaded = this.files.find(f => f.name === file.name);
          if (uploaded) this.selectedDatasetPath = uploaded.path;
        }, 500);
      },
      error: () => { this.uploadingDataset = false; },
    });
    input.value = '';
  }

  openLogs(runId: string): void {
    if (this.selectedLogRunId === runId) {
      this.closeLogs();
      return;
    }
    this.selectedLogRunId = runId;
    this.runLogs = [];
    this.runLogsUserScript = [];
    this.lastRenderedLogLength = 0;
    this.logAutoScroll = true;
    this.logPendingCount = 0;
    this.fetchLogs(runId);

    // Poll while run is active
    if (this.logPollInterval) clearInterval(this.logPollInterval);
    const run = this.pipelineRuns.find(r => r.id === runId);
    if (run?.status === 'RUNNING' || run?.status === 'PENDING') {
      this.logPollInterval = setInterval(() => {
        this.fetchLogs(runId);
        const current = this.pipelineRuns.find(r => r.id === runId);
        if (current?.status !== 'RUNNING' && current?.status !== 'PENDING') {
          clearInterval(this.logPollInterval);
        }
      }, 4000);
    }

    // Elapsed ticker (1 s) — only while terminal is open
    if (this.logElapsedInterval) clearInterval(this.logElapsedInterval);
    this.logElapsedInterval = setInterval(() => { this.logElapsedTick++; }, 1000);
  }

  closeLogs(): void {
    this.selectedLogRunId = null;
    this.runLogs = [];
    this.runLogsUserScript = [];
    this.logSearch = '';
    this.logFilter = 'all';
    this.logPendingCount = 0;
    if (this.logPollInterval) {
      clearInterval(this.logPollInterval);
      this.logPollInterval = null;
    }
    if (this.logElapsedInterval) {
      clearInterval(this.logElapsedInterval);
      this.logElapsedInterval = null;
    }
  }

  fetchLogs(runId: string): void {
    this.logsLoading = true;
    this.pipelineService.getLogs(runId).subscribe({
      next: (res: RunLogs) => {
        this.logsLoading = false;
        const prevLen = this.activeLogSource.length;
        this.runLogs = res.logs;
        this.runLogsUserScript = res.user_script_logs ?? [];
        const newLen = this.activeLogSource.length;
        if (!this.logAutoScroll && newLen > prevLen) {
          this.logPendingCount += newLen - prevLen;
        }
      },
      error: () => { this.logsLoading = false; },
    });
  }

  toggleErrorPanel(runId: string): void {
    if (this.selectedErrorRunId === runId) {
      this.closeErrorPanel();
      return;
    }
    this.selectedErrorRunId = runId;
    this.runError = { loading: true, captured: false, text: '', bytes: 0, reason: '' };
    this.runErrorCopied = false;
    this.pipelineService.getError(runId).subscribe({
      next: (res: RunError) => {
        if (this.selectedErrorRunId !== runId) return; // user closed/switched
        if (res.error) {
          this.runError = {
            loading: false,
            captured: true,
            text: res.error,
            bytes: res.error.length,
            reason: res.reason,
          };
        } else {
          this.runError = {
            loading: false,
            captured: false,
            text: '',
            bytes: 0,
            reason: res.reason,
          };
        }
      },
      error: () => {
        if (this.selectedErrorRunId !== runId) return;
        this.runError = {
          loading: false,
          captured: false,
          text: '',
          bytes: 0,
          reason: 'fetch_failed',
        };
      },
    });
  }

  closeErrorPanel(): void {
    this.selectedErrorRunId = null;
    this.runError = { loading: false, captured: false, text: '', bytes: 0, reason: '' };
    this.runErrorCopied = false;
  }

  copyError(): void {
    if (!this.runError.text) return;
    navigator.clipboard.writeText(this.runError.text).then(() => {
      this.runErrorCopied = true;
      setTimeout(() => (this.runErrorCopied = false), 1500);
    });
  }

  logsButtonClass(runId: string): string {
    const active = this.selectedLogRunId === runId;
    return 'flex items-center gap-1 text-xs px-2.5 py-1 rounded transition-colors ' +
      (active ? 'bg-slate-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600');
  }

  // ---------- Log parser ----------

  private parseLogLine(raw: string, n: number): LogLine {
    if (raw === '') {
      return { n, raw, level: 'blank', message: '' };
    }
    // Step banners / container markers
    if (raw.startsWith('┌──') || raw.startsWith('└──')) {
      return { n, raw, level: 'banner', source: 'step', message: raw };
    }
    // Platform injected prefix
    if (raw.startsWith('[platform]') || raw.startsWith('│  [platform]')) {
      const msg = raw.replace(/^│\s+/, '').replace(/^\[platform\]\s*/, '');
      return { n, raw, level: 'platform', source: 'platform', message: msg };
    }
    // Strip backend's "│  " indent from container output
    let body = raw.replace(/^│\s+/, '');
    // Container name marker e.g. "── container: main ──"
    const container = body.match(/^──\s*container:\s*(\S+)\s*──\s*$/);
    if (container) {
      return { n, raw, level: 'banner', source: container[1], message: `container · ${container[1]}` };
    }
    // Argo executor: time="..." level=info msg="..."
    const argo = body.match(/time="([^"]+)"\s+level=(\w+)\s+msg="([^"]*)"/);
    if (argo) {
      const ts = this.extractTime(argo[1]);
      const lvl = argo[2].toLowerCase();
      const level: LogLevel = lvl === 'error' ? 'error' : lvl === 'warning' || lvl === 'warn' ? 'warn' : 'info';
      return { n, raw, level, ts, source: 'argo', message: argo[3] };
    }
    // Go klog: I0423 11:37:27.576254 20 cache.go:116] message
    const klog = body.match(/^([IWE])(\d{4})\s+(\d{2}:\d{2}:\d{2})\.\d+\s+\d+\s+([^:]+:\d+)\]\s*(.*)/);
    if (klog) {
      const level: LogLevel = klog[1] === 'E' ? 'error' : klog[1] === 'W' ? 'warn' : 'info';
      return { n, raw, level, ts: klog[3], source: klog[4], message: klog[5] };
    }
    // Heuristics on remaining plain text
    const lc = body.toLowerCase();
    if (body.startsWith('✓') || lc.includes('success') || lc.includes('completed') || lc.includes('registered:')) {
      return { n, raw, level: 'success', message: body };
    }
    if (lc.includes('traceback') || lc.startsWith('error:') || /\berror\b/.test(lc) || lc.startsWith('[error]')) {
      return { n, raw, level: 'error', message: body };
    }
    if (lc.includes('warning') || lc.includes('deprecat')) {
      return { n, raw, level: 'warn', message: body };
    }
    return { n, raw, level: 'info', message: body };
  }

  private extractTime(iso: string): string {
    // "2026-04-23T11:37:22.782Z" -> "11:37:22"
    const m = iso.match(/T(\d{2}:\d{2}:\d{2})/);
    return m ? m[1] : iso.slice(0, 8);
  }

  /** Source array currently rendered in the terminal. Server-side filter
   *  (`runLogsUserScript`) is preferred when enabled and non-empty; falls
   *  back to the full `runLogs` so the panel never goes empty if the
   *  backend hasn't shipped `user_script_logs` yet. */
  private get activeLogSource(): string[] {
    if (this.logScriptOnly && this.runLogsUserScript.length > 0) {
      return this.runLogsUserScript;
    }
    return this.runLogs;
  }

  get parsedLogs(): LogLine[] {
    return this.activeLogSource.map((raw, i) => this.parseLogLine(raw, i + 1));
  }

  get filteredLogs(): LogLine[] {
    const q = this.logSearch.trim().toLowerCase();
    return this.parsedLogs.filter(l => {
      if (this.logFilter === 'platform' && l.level !== 'platform' && l.level !== 'banner') return false;
      if (this.logFilter === 'error' && l.level !== 'error' && l.level !== 'warn') return false;
      if (q && !l.raw.toLowerCase().includes(q)) return false;
      return true;
    });
  }

  get logCounts(): { all: number; platform: number; error: number } {
    let platform = 0, errors = 0;
    for (const l of this.parsedLogs) {
      if (l.level === 'platform') platform++;
      else if (l.level === 'error' || l.level === 'warn') errors++;
    }
    return { all: this.parsedLogs.length, platform, error: errors };
  }

  get stepStatus(): { current: number; total: number } | null {
    const banners: string[] = [];
    for (const l of this.runLogs) {
      if (l.startsWith('┌──')) banners.push(l);
    }
    if (banners.length === 0) return null;
    let current = banners.findIndex(b => b.includes('[Running]') || b.includes('[Pending]'));
    if (current < 0) current = banners.length - 1;
    return { current: current + 1, total: banners.length };
  }

  logLevelPill(level: LogLevel): { label: string; cls: string } | null {
    switch (level) {
      case 'platform': return { label: 'PLT', cls: 'bg-cyan3/15 text-cyan3 ring-1 ring-cyan3/25' };
      case 'info':     return { label: 'INF', cls: 'bg-white/5 text-ink2 ring-1 ring-white/10' };
      case 'warn':     return { label: 'WRN', cls: 'bg-warn/15 text-warn ring-1 ring-warn/25' };
      case 'error':    return { label: 'ERR', cls: 'bg-bad/15 text-bad ring-1 ring-bad/25' };
      case 'success':  return { label: 'OK ', cls: 'bg-good/15 text-good ring-1 ring-good/25' };
      default:         return null;
    }
  }

  logMessageCls(level: LogLevel): string {
    switch (level) {
      case 'platform': return 'text-ink';
      case 'warn':     return 'text-warn';
      case 'error':    return 'text-bad';
      case 'success':  return 'text-good';
      default:         return 'text-ink2';
    }
  }

  logStatusDot(): string {
    const run = this.selectedLogRunId ? this.pipelineRuns.find(r => r.id === this.selectedLogRunId) : null;
    if (!run) return 'bg-ink3';
    if (run.status === 'RUNNING') return 'bg-cyan3 animate-pulse';
    if (run.status === 'PENDING') return 'bg-warn animate-pulse';
    if (run.status === 'SUCCEEDED') return 'bg-good';
    if (run.status === 'FAILED') return 'bg-bad';
    return 'bg-ink3';
  }

  get logElapsed(): string {
    // Touch the tick so the getter re-evaluates every second
    void this.logElapsedTick;
    const run = this.selectedLogRunId ? this.pipelineRuns.find(r => r.id === this.selectedLogRunId) : null;
    if (!run || !run.started_at) return '—';
    const end = run.finished_at ? new Date(run.finished_at).getTime() : Date.now();
    const s = Math.max(0, Math.floor((end - new Date(run.started_at).getTime()) / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${String(sec).padStart(2, '0')}s`;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }

  onLogScroll(): void {
    const el = this.logContainerRef?.nativeElement;
    if (!el) return;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 24;
    this.logAutoScroll = atBottom;
    if (atBottom) this.logPendingCount = 0;
  }

  jumpToLatest(): void {
    this.logAutoScroll = true;
    this.logPendingCount = 0;
    const el = this.logContainerRef?.nativeElement;
    if (el) el.scrollTop = el.scrollHeight;
  }

  copyLogs(): void {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(this.runLogs.join('\n')).then(() => {
      this.logsCopied = true;
      setTimeout(() => (this.logsCopied = false), 1500);
    }).catch(() => {});
  }

  downloadLogs(): void {
    const runShort = (this.selectedLogRunId || 'run').slice(0, 8);
    const now = new Date();
    const stamp = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    const blob = new Blob([this.runLogs.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pipeline-${runShort}-${stamp}.log`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  ngAfterViewChecked(): void {
    if (!this.selectedLogRunId) return;
    if (this.runLogs.length === this.lastRenderedLogLength) return;
    this.lastRenderedLogLength = this.runLogs.length;
    if (!this.logAutoScroll) return;
    const el = this.logContainerRef?.nativeElement;
    if (el) el.scrollTop = el.scrollHeight;
  }

  refreshRunStatus(runId: string): void {
    this.pipelineService.getRunStatus(runId).subscribe({
      next: (updated) => {
        const idx = this.pipelineRuns.findIndex((r) => r.id === runId);
        if (idx >= 0) this.pipelineRuns[idx] = updated;
      },
    });
  }

  startPolling(): void {
    if (this.pollInterval) return;
    this.pollInterval = setInterval(() => {
      if (!this.project) return;
      const hasActive = this.pipelineRuns.some(
        (r) => r.status === 'RUNNING' || r.status === 'PENDING'
      );
      if (hasActive) {
        this.loadPipelineRuns(this.project.id);
        this.loadRuns(this.project.id);
      } else {
        clearInterval(this.pollInterval);
        this.pollInterval = null;
      }
    }, 5000);
  }

  getPipelineStatusClass(status: string): string {
    const base = 'px-2 py-0.5 rounded-full text-xs font-medium';
    switch (status) {
      case 'SUCCEEDED':
        return `${base} bg-green-500/20 text-green-400`;
      case 'RUNNING':
        return `${base} bg-blue-500/20 text-blue-400`;
      case 'FAILED':
        return `${base} bg-red-500/20 text-red-400`;
      case 'PENDING':
        return `${base} bg-amber-500/20 text-amber-400`;
      default:
        return `${base} bg-slate-500/20 text-slate-400`;
    }
  }

  // Run comparison
  toggleRunSelection(runId: string): void {
    if (this.selectedRunIds.has(runId)) {
      this.selectedRunIds.delete(runId);
    } else {
      this.selectedRunIds.add(runId);
    }
  }

  openCompare(): void {
    if (this.selectedRunIds.size < 2) return;
    const ids = Array.from(this.selectedRunIds).join(',');
    this.router.navigate(['/runs/compare'], { queryParams: { run_ids: ids } });
  }

  // ── Register a run as a model ─────────────────────────────────────────────
  // The single project model these runs register into, e.g. "breast-cancer-model".
  projectModelName(): string {
    const base = (this.project?.name || 'project').toLowerCase().replace(/\s+/g, '-');
    return `${base}-model`;
  }

  // run_ids that already back a registered model version (for the badge).
  private registeredRunIds(): Set<string> {
    return new Set(this.modelVersions.map((v) => v.run_id).filter((id): id is string => !!id));
  }

  isRegistered(run: MlflowRun): boolean {
    return this.registeredRunIds().has(run.info.run_id);
  }

  registeredVersion(run: MlflowRun): string | null {
    const v = this.modelVersions.find((mv) => mv.run_id === run.info.run_id);
    return v ? v.version : null;
  }

  promptRegister(run: MlflowRun): void {
    this.registerError = '';
    this.registerMessage = '';
    this.registerTarget = run;
  }

  doRegister(): void {
    if (!this.project || !this.registerTarget) return;
    const run = this.registerTarget;
    this.registering = true;
    this.registerError = '';
    this.modelService.register(this.project.id, run.info.run_id).subscribe({
      next: (res) => {
        this.registering = false;
        this.registerTarget = null;
        const label = run.info.run_name || run.info.run_id.substring(0, 8);
        this.registerMessage = `Registered ${label} as ${res.name} v${res.version}.`;
        this.loadModels();
        if (this.project) this.loadRuns(this.project.id);
        setTimeout(() => (this.registerMessage = ''), 8000);
      },
      error: (err) => {
        this.registering = false;
        this.registerTarget = null;
        this.registerError =
          err.error?.detail ||
          (err.status === 0
            ? 'Cannot reach the server. Check your connection and try again.'
            : 'Could not register this run as a model. Please try again.');
      },
    });
  }

  // Models
  loadModels(): void {
    if (!this.project) {
      const id = this.route.snapshot.paramMap.get('id');
      if (!id) return;
      this.modelService.listProjectModels(id).subscribe({
        next: (res) => {
          this.modelName = res.model_name;
          this.modelVersions = res.versions;
        },
        error: () => {
          this.modelVersions = [];
        },
      });
      return;
    }
    this.modelService.listProjectModels(this.project.id).subscribe({
      next: (res) => {
        this.modelName = res.model_name;
        this.modelVersions = res.versions;
      },
      error: () => {
        this.modelVersions = [];
      },
    });
  }

  promote(version: ModelVersion, stage: ModelStage): void {
    this.promotingVersion = version.version;
    this.promotingStage = stage;
    this.promoteMessage = '';
    this.promoteError = '';
    this.modelService.promote(version.name, version.version, stage).subscribe({
      next: () => {
        this.promotingVersion = '';
        this.promotingStage = '';
        this.promoteMessage = `v${version.version} successfully moved to ${stage}`;
        this.stageLog.unshift({ time: new Date(), message: `v${version.version} moved to ${stage}`, stage });
        this.loadModels();
      },
      error: (err: any) => {
        this.promotingVersion = '';
        this.promotingStage = '';
        this.promoteError = err.error?.detail || `Failed to move v${version.version} to ${stage}`;
      },
    });
  }

  // Model lifecycle helpers
  readonly objectKeys = Object.keys;

  get lifecycleSteps() {
    const descs: Record<string, string> = {
      None: 'Registered', Staging: 'Under test', Production: 'Live', Archived: 'Retired',
    };
    const active = new Set(this.modelVersions.map(v => v.stage));
    return ['None', 'Staging', 'Production', 'Archived'].map(s => ({
      stage: s,
      label: s === 'None' ? 'Registered' : s,
      desc: descs[s],
      active: active.has(s as any),
    }));
  }

  getLifecycleNodeClass(stage: string): string {
    const activeStages = new Set(this.modelVersions.map(v => v.stage));
    if (!activeStages.has(stage as any)) {
      return 'px-3 py-1.5 rounded-full text-xs font-semibold border border-slate-600 text-slate-600';
    }
    switch (stage) {
      case 'Production': return 'px-3 py-1.5 rounded-full text-xs font-semibold bg-green-500/20 text-green-400 border border-green-500/40 ring-2 ring-green-500/20';
      case 'Staging':    return 'px-3 py-1.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/40';
      case 'Archived':   return 'px-3 py-1.5 rounded-full text-xs font-semibold bg-slate-500/20 text-slate-400 border border-slate-500/40';
      default:           return 'px-3 py-1.5 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-400 border border-indigo-500/40';
    }
  }

  getModelMetrics(metrics?: Record<string, number>): { key: string; value: number }[] {
    if (!metrics) return [];
    const priority = ['accuracy', 'f1_score', 'f1', 'roc_auc', 'r2_score', 'rmse'];
    const keys = [
      ...priority.filter(k => k in metrics),
      ...Object.keys(metrics).filter(k => !priority.includes(k)),
    ].slice(0, 3);
    return keys.map(k => ({ key: k.replace('_score', '').replace('_', ' '), value: metrics[k] }));
  }

  getStageClass(stage: string): string {
    const base = 'px-2 py-0.5 rounded-full text-xs font-medium';
    switch (stage) {
      case 'Production':
        return `${base} bg-green-500/20 text-green-400`;
      case 'Staging':
        return `${base} bg-amber-500/20 text-amber-400`;
      case 'Archived':
        return `${base} bg-slate-500/20 text-slate-400`;
      default:
        return `${base} bg-slate-700/50 text-slate-300`;
    }
  }

  // Deployments
  loadDeployments(projectId?: string): void {
    const id = projectId ?? this.project?.id ?? this.route.snapshot.paramMap.get('id');
    if (!id) return;
    this.deploymentService.listProjectDeployments(id).subscribe({
      next: (res) => {
        this.deployments = res.deployments;
        // Keep the selected deployment's reference in sync with the refreshed list.
        if (this.selectedDeployment) {
          const match = res.deployments.find((d) => d.id === this.selectedDeployment!.id);
          this.selectedDeployment = match ?? null;
        }
        this.maybeStartDeploymentPolling();
      },
      error: () => {
        this.deployments = [];
      },
    });
  }

  private maybeStartDeploymentPolling(): void {
    const hasPending = this.deployments.some((d) => d.status === 'CREATING');
    if (hasPending && !this.deploymentPollInterval) {
      this.deploymentPollInterval = setInterval(() => this.loadDeployments(), 5000);
    } else if (!hasPending && this.deploymentPollInterval) {
      clearInterval(this.deploymentPollInterval);
      this.deploymentPollInterval = null;
    }
    // 1-second tick so elapsed timer re-renders every second
    if (hasPending && !this.deploymentTimerInterval) {
      this.deploymentTimerInterval = setInterval(() => { this.deploymentElapsedTick++; }, 1000);
    } else if (!hasPending && this.deploymentTimerInterval) {
      clearInterval(this.deploymentTimerInterval);
      this.deploymentTimerInterval = null;
    }
  }

  isDeployed(version: ModelVersion): boolean {
    return this.deployments.some(
      (d) =>
        d.status !== 'DELETED' &&
        d.inference_service_name.endsWith(`-v${version.version}`)
    );
  }

  readonly replicaOptions = [1, 2, 3, 4, 5];

  openDeployModal(version: ModelVersion): void {
    this.pendingDeployVersion = version;
    this.pendingReplicas = 1;
  }

  confirmDeploy(): void {
    if (!this.pendingDeployVersion) return;
    const version = this.pendingDeployVersion;
    const replicas = this.pendingReplicas;
    this.pendingDeployVersion = null;
    this.deployVersion(version, replicas);
  }

  deployVersion(version: ModelVersion, replicas = 1): void {
    if (!version.db_id) {
      this.deployError = 'No DB id for this model version — click Refresh and try again.';
      return;
    }
    this.deployingVersion = version.version;
    this.deployError = '';
    this.deploySuccess = '';
    this.deploymentService.create(version.db_id, replicas).subscribe({
      next: () => {
        this.deployingVersion = '';
        this.deploySuccess = `Model v${version.version} deploying with ${replicas} replica${replicas !== 1 ? 's' : ''} — switching to Deployments tab.`;
        this.activeTab = 'deployments';
        this.loadDeployments();
      },
      error: (err) => {
        this.deployingVersion = '';
        this.deployError = err.error?.detail
          ?? 'Deploy failed. Check that KServe is installed and kubeconfig is configured.';
      },
    });
  }

  predictEndpoint(d: Deployment): string {
    // Public-callable URL: backend proxy. (KServe's status.url uses *.example.com,
    // a cluster-internal placeholder that doesn't resolve from outside.)
    return `${environment.apiBaseUrl}/deployments/${d.id}/predict`;
  }

  copyEndpoint(d: Deployment): void {
    navigator.clipboard.writeText(this.predictEndpoint(d)).then(() => {
      this.copiedEndpointId = d.id;
      setTimeout(() => { this.copiedEndpointId = ''; }, 2000);
    });
  }

  curlSnippet(d: Deployment): string {
    const url = this.predictEndpoint(d);
    return `# Get a JWT token first:\n#   curl -X POST ${environment.apiBaseUrl}/auth/login \\\n#     -H "Content-Type: application/json" \\\n#     -d '{"email":"<your-email>","password":"<your-password>"}'\n# Then call predict with the access_token:\ncurl -X POST "${url}" \\\n  -H "Authorization: Bearer <ACCESS_TOKEN>" \\\n  -H "Content-Type: application/json" \\\n  -d '{"instances": [[13.54, 14.36, 87.46, 566.3, 0.09779, 0.08129, 0.06664, 0.04781, 0.1885, 0.05766, 0.2699, 0.7886, 2.058, 23.56, 0.008462, 0.0146, 0.02387, 0.01315, 0.0198, 0.0023, 15.11, 19.26, 99.7, 711.2, 0.144, 0.1773, 0.239, 0.1288, 0.2977, 0.07259]]}'`;
  }

  // ─── Public API keys (per-deployment) ──────────────────────────────────
  toggleSelectedDeployment(d: Deployment): void {
    if (this.selectedDeployment?.id === d.id) {
      this.selectedDeployment = null;
      this.apiKeys = [];
    } else {
      this.selectedDeployment = d;
      this.loadApiKeys(d);
    }
  }

  loadApiKeys(d: Deployment): void {
    this.apiKeysLoading = true;
    this.deploymentService.listApiKeys(d.id).subscribe({
      next: (keys) => {
        this.apiKeys = keys;
        this.apiKeysLoading = false;
      },
      error: () => {
        this.apiKeys = [];
        this.apiKeysLoading = false;
      },
    });
  }

  openCreateApiKeyModal(d: Deployment): void {
    this.creatingApiKeyForDeployment = d;
    this.newApiKeyName = '';
    this.newApiKeyPlaintext = null;
    this.newApiKeyCopied = false;
    this.creatingApiKey = false;
  }

  cancelCreateApiKey(): void {
    this.creatingApiKeyForDeployment = null;
    this.newApiKeyName = '';
    this.newApiKeyPlaintext = null;
    this.newApiKeyCopied = false;
  }

  submitCreateApiKey(): void {
    const d = this.creatingApiKeyForDeployment;
    const name = this.newApiKeyName.trim();
    if (!d || !name || this.creatingApiKey) return;
    this.creatingApiKey = true;
    this.deploymentService.createApiKey(d.id, name).subscribe({
      next: (created) => {
        this.newApiKeyPlaintext = created.key;
        this.creatingApiKey = false;
        // Refresh the list under the modal so the new prefix shows up
        // immediately when the user closes the dialog.
        this.loadApiKeys(d);
      },
      error: () => {
        this.creatingApiKey = false;
      },
    });
  }

  copyNewApiKey(): void {
    if (!this.newApiKeyPlaintext) return;
    navigator.clipboard.writeText(this.newApiKeyPlaintext).then(() => {
      this.newApiKeyCopied = true;
      setTimeout(() => { this.newApiKeyCopied = false; }, 2000);
    });
  }

  revokeApiKey(d: Deployment, k: ApiKey): void {
    if (!confirm(`Revoke "${k.name}"? Callers using this key will get 401 from now on.`)) return;
    this.deploymentService.revokeApiKey(d.id, k.id).subscribe({
      next: () => this.loadApiKeys(d),
    });
  }

  /** Public-API URL the user can paste into their app. */
  publicPredictUrl(d: Deployment): string {
    // environment.apiBaseUrl is "/api/v1" in prod (proxied), "http://localhost:8000/api/v1" in dev.
    // The public endpoint sits at /api/public so we replace the suffix.
    const base = environment.apiBaseUrl.replace(/\/api\/v1$/, '');
    const origin = base.startsWith('http') ? base : window.location.origin;
    return `${origin}/api/public/predict/${d.id}`;
  }

  snippetFor(d: Deployment, lang: 'cURL' | 'JavaScript' | 'Python'): string {
    const url = this.publicPredictUrl(d);
    const sample = '[[13.54, 14.36, 87.46, 566.3, 0.09779, 0.08129, 0.06664, 0.04781, 0.1885, 0.05766, 0.2699, 0.7886, 2.058, 23.56, 0.008462, 0.0146, 0.02387, 0.01315, 0.0198, 0.0023, 15.11, 19.26, 99.7, 711.2, 0.144, 0.1773, 0.239, 0.1288, 0.2977, 0.07259]]';
    if (lang === 'cURL') {
      return `curl -X POST "${url}" \\\n  -H "Authorization: Bearer mlops_<your_key>" \\\n  -H "Content-Type: application/json" \\\n  -d '{"instances": ${sample}}'`;
    }
    if (lang === 'JavaScript') {
      return `fetch("${url}", {\n  method: "POST",\n  headers: {\n    "Authorization": "Bearer mlops_<your_key>",\n    "Content-Type": "application/json",\n  },\n  body: JSON.stringify({ instances: ${sample} }),\n})\n  .then(r => r.json())\n  .then(console.log);`;
    }
    return `import requests\n\nr = requests.post(\n    "${url}",\n    headers={"Authorization": "Bearer mlops_<your_key>"},\n    json={"instances": ${sample}},\n)\nprint(r.json())`;
  }

  isWebhookError(msg: string): boolean {
    return msg.includes('context deadline exceeded') && msg.toLowerCase().includes('kserve');
  }

  fixKserveWebhook(): void {
    this.fixingWebhook = true;
    this.webhookFixResult = '';
    this.deploymentService.fixKserveWebhook().subscribe({
      next: (res) => {
        this.fixingWebhook = false;
        this.webhookFixResult = res.message;
        if (res.ok) this.deployError = '';
      },
      error: (err) => {
        this.fixingWebhook = false;
        this.webhookFixResult = err.error?.detail ?? 'Fix failed — check backend logs.';
      },
    });
  }

  deleteDeployment(dep: Deployment): void {
    this.openConfirm(
      'Delete deployment',
      `Delete ${dep.inference_service_name}?`,
      'Delete',
      () => {
        this.deletingDeployment = dep.id;
        this.deploymentService.delete(dep.id).subscribe({
          next: () => {
            this.deletingDeployment = '';
            if (this.selectedDeployment?.id === dep.id) this.selectedDeployment = null;
            this.loadDeployments();
          },
          error: () => { this.deletingDeployment = ''; },
        });
      }
    );
  }

  confirmState: { title: string; message: string; confirmLabel: string; fn: () => void } | null = null;

  openConfirm(title: string, message: string, confirmLabel: string, fn: () => void): void {
    this.confirmState = { title, message, confirmLabel, fn };
  }

  promptDeleteFile(path: string, name: string): void {
    this.openConfirm('Delete file', `Delete ${name}?`, 'Delete', () => this.doDeleteFile(path));
  }

  promptDeleteExpRun(runId: string, runName: string): void {
    this.openConfirm('Delete run', `Delete run ${runName || runId.substring(0, 8)}?`, 'Delete', () => this.doDeleteExperimentRun(runId));
  }

  promptDeletePipelineRun(runId: string): void {
    this.openConfirm('Delete run', `Delete pipeline run ${runId.substring(0, 8)}?`, 'Delete', () => this.doDeletePipelineRun(runId));
  }

  promptDeleteModelVersion(name: string, version: string, stage?: string): void {
    const isProd = stage === 'Production';
    const msg = isProd
      ? `${name} v${version} is in PRODUCTION. Delete anyway? This is irreversible.`
      : `Delete ${name} v${version}? This cannot be undone.`;
    this.openConfirm('Delete version', msg, 'Delete', () => this.doDeleteModelVersion(name, version));
  }

  doDeleteFile(filePath: string): void {
    if (!this.project) return;
    this.uploadService.deleteFile(this.project.id, filePath).subscribe({
      next: () => this.loadFiles(this.project!.id),
    });
  }

  doDeleteExperimentRun(runId: string): void {
    if (!this.project) return;
    this.experimentService.deleteRun(runId).subscribe({
      next: () => this.loadRuns(this.project!.id),
    });
  }

  doDeletePipelineRun(runId: string): void {
    if (!this.project) return;
    this.pipelineService.deleteRun(runId).subscribe({
      next: () => this.loadPipelineRuns(this.project!.id),
    });
  }

  doDeleteModelVersion(modelName: string, version: string): void {
    this.promoteError = '';
    this.modelService.deleteVersion(modelName, version).subscribe({
      next: () => {
        this.loadModels();
        this.promoteMessage = `Deleted ${modelName} v${version}`;
        setTimeout(() => { this.promoteMessage = ''; }, 4000);
      },
      error: (err) => {
        const detail = err?.error?.detail || err?.message || 'Delete failed';
        this.promoteError = `Could not delete v${version}: ${detail}`;
      },
    });
  }

  runPredict(): void {
    if (!this.selectedDeployment) return;
    let instances: unknown[];
    try {
      const parsed = JSON.parse(this.predictInput);
      if (!Array.isArray(parsed)) throw new Error('instances must be an array');
      instances = parsed;
    } catch (e: any) {
      this.predictError = `Invalid JSON: ${e.message}`;
      this.predictResult = null;
      return;
    }
    this.predicting = true;
    this.predictError = '';
    this.predictResult = null;
    this.deploymentService.predict(this.selectedDeployment.id, instances).subscribe({
      next: (res) => {
        this.predicting = false;
        this.predictResult = res;
      },
      error: (err) => {
        this.predicting = false;
        this.predictError = err?.error?.detail || err?.message || 'Prediction failed';
      },
    });
  }

  private fmtSecs(total: number): string {
    const abs = Math.max(0, Math.floor(total));
    const m = Math.floor(abs / 60).toString().padStart(2, '0');
    const s = (abs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  deploymentElapsed(dep: Deployment): string {
    void this.deploymentElapsedTick; // triggers re-render every tick
    if (!dep.created_at) return '00:00';
    return this.fmtSecs((Date.now() - new Date(dep.created_at).getTime()) / 1000);
  }

  deploymentLogLines(dep: Deployment): { offset: string; text: string; type: 'info' | 'success' | 'error' | 'pending' }[] {
    void this.deploymentElapsedTick;
    if (!dep.created_at) return [];
    const elapsed = (Date.now() - new Date(dep.created_at).getTime()) / 1000;
    const steps: { at: number; text: string }[] = [
      { at:   0, text: 'Deployment request accepted — creating InferenceService manifest' },
      { at:   2, text: 'Applying manifest to Kubernetes cluster...' },
      { at:   6, text: 'InferenceService resource created in namespace "mlops"' },
      { at:  12, text: 'Scheduling pod on cluster node...' },
      { at:  22, text: 'Pulling model server image (kserve/sklearnserver)...' },
      { at:  60, text: 'Downloading model artifacts from object storage...' },
      { at:  95, text: 'Starting inference server process...' },
      { at: 125, text: 'Running readiness health probes...' },
    ];
    const lines = steps
      .filter(s => elapsed >= s.at)
      .map(s => ({ offset: this.fmtSecs(s.at), text: s.text, type: 'info' as 'info' | 'success' | 'error' | 'pending' }));
    if (dep.status === 'READY') {
      lines.push({ offset: this.fmtSecs(elapsed), text: '✓ InferenceService is READY — serving predictions', type: 'success' as const });
    } else if (dep.status === 'FAILED') {
      lines.push({ offset: this.fmtSecs(elapsed), text: '✗ Deployment FAILED — check cluster event logs', type: 'error' as const });
    }
    return lines;
  }

  getDeploymentStatusClass(status: DeploymentStatus): string {
    const base = 'px-2 py-0.5 rounded-full text-xs font-medium';
    switch (status) {
      case 'READY':
        return `${base} bg-green-500/20 text-green-400`;
      case 'CREATING':
        return `${base} bg-blue-500/20 text-blue-400`;
      case 'FAILED':
        return `${base} bg-red-500/20 text-red-400`;
      case 'DELETED':
        return `${base} bg-slate-500/20 text-slate-400`;
      default:
        return `${base} bg-slate-700/50 text-slate-300`;
    }
  }
}
