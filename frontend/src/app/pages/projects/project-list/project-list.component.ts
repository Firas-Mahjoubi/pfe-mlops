import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ProjectService, ProjectStats } from '../../../core/services/project.service';
import { AdminService } from '../../../core/services/admin.service';
import { Project } from '../../../core/models/project.model';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { BtnComponent } from '../../../shared/ui/btn/btn.component';
import { StatusComponent } from '../../../shared/ui/status/status.component';
import { ConfirmDialogComponent } from '../../../shared/ui/confirm-dialog/confirm-dialog.component';

type SortKey = 'updated' | 'name' | 'created';
type StatusFilter = 'all' | 'active' | 'idle' | 'archived';
type ViewMode = 'table' | 'grid';

@Component({
  selector: 'app-project-list',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, IconComponent, BtnComponent, StatusComponent, ConfirmDialogComponent],
  template: `
    <div class="p-4 space-y-3">
      <!-- page head -->
      <div class="flex items-start justify-between gap-4">
        <div>
          <h1 class="text-[22px] font-semibold tracking-tight">Projects</h1>
          <p class="text-[12.5px] text-ink3">
            {{ filtered.length }} of {{ projects.length }} projects · workspace
            <span class="mono text-ink2">acme-ml</span>
          </p>
        </div>
        <div class="flex items-center gap-2">
          <app-btn variant="outline" size="md">
            <app-icon name="upload" className="w-3.5 h-3.5"></app-icon>Import
          </app-btn>
          <app-btn variant="primary" size="md" (click)="openCreate()">
            <app-icon name="plus" className="w-3.5 h-3.5"></app-icon>New project
          </app-btn>
        </div>
      </div>

      <!-- toolbar -->
      <div class="flex items-center gap-2 bg-card border border-line rounded-lg p-2">
        <div class="flex items-center gap-2 px-2 h-8 rounded-md bg-raised/50 border border-white/5 flex-1 max-w-[360px] focus-within:border-cyan3/40">
          <app-icon name="search" className="w-3.5 h-3.5 text-ink3"></app-icon>
          <input
            [(ngModel)]="q"
            (ngModelChange)="apply()"
            name="q"
            placeholder="Filter by name or description"
            class="bg-transparent outline-none text-[12.5px] flex-1 placeholder:text-ink3 text-ink"
          />
          @if (q) {
            <button (click)="q = ''; apply()"><app-icon name="x" className="w-3 h-3 text-ink3"></app-icon></button>
          }
        </div>

        <div class="relative">
          <select
            [(ngModel)]="statusFilter"
            (ngModelChange)="apply()"
            name="sf"
            class="appearance-none h-8 pl-2.5 pr-7 rounded-md bg-raised/50 border border-white/5 text-[12.5px] text-ink2 hover:text-ink hover:border-white/10 focus-cyan outline-none"
          >
            <option value="all" class="bg-card">All statuses</option>
            <option value="active" class="bg-card">Active</option>
            <option value="idle" class="bg-card">Idle</option>
            <option value="archived" class="bg-card">Archived</option>
          </select>
          <app-icon name="chevronDown" className="w-3 h-3 text-ink3 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none"></app-icon>
        </div>

        <div class="relative">
          <select
            [(ngModel)]="sortBy"
            (ngModelChange)="apply()"
            name="sort"
            class="appearance-none h-8 pl-2.5 pr-7 rounded-md bg-raised/50 border border-white/5 text-[12.5px] text-ink2 hover:text-ink hover:border-white/10 focus-cyan outline-none"
          >
            <option value="updated" class="bg-card">Recently updated</option>
            <option value="name" class="bg-card">Name</option>
            <option value="created" class="bg-card">Created</option>
          </select>
          <app-icon name="chevronDown" className="w-3 h-3 text-ink3 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none"></app-icon>
        </div>

        <div class="ml-auto flex items-center border border-white/10 rounded-md overflow-hidden">
          <button
            (click)="mode = 'table'"
            [class]="'h-8 px-2.5 text-[12px] ' + (mode === 'table' ? 'bg-white/5 text-ink' : 'text-ink3 hover:text-ink')"
          >Table</button>
          <button
            (click)="mode = 'grid'"
            [class]="'h-8 px-2.5 text-[12px] border-l border-white/10 ' + (mode === 'grid' ? 'bg-white/5 text-ink' : 'text-ink3 hover:text-ink')"
          >Grid</button>
        </div>
      </div>

      @if (mode === 'table') {
        <div class="bg-card border border-line rounded-lg shadow-card overflow-x-auto">
          <div class="grid grid-cols-[minmax(240px,2fr)_90px_120px_90px_90px_90px_140px_40px] min-w-[820px] px-3 h-9 items-center hairline text-[10.5px] font-semibold tracking-[0.08em] text-ink3 uppercase">
            <div>Name</div>
            <div>Status</div>
            <div>Owner</div>
            <div class="text-right">Runs</div>
            <div class="text-right">Exp</div>
            <div class="text-right">Models</div>
            <div class="text-right pr-2">Last activity</div>
            <div></div>
          </div>
          @for (p of filtered; track p.id) {
            <div
              (click)="openProject(p)"
              class="grid grid-cols-[minmax(240px,2fr)_90px_120px_90px_90px_90px_140px_40px] min-w-[820px] px-3 h-12 items-center row cursor-pointer border-t border-white/[0.04] group"
            >
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <div class="w-6 h-6 rounded bg-raised flex items-center justify-center">
                    <app-icon name="folder" className="w-3.5 h-3.5 text-cyan2"></app-icon>
                  </div>
                  <div class="min-w-0">
                    <div class="text-[13px] font-medium text-ink truncate group-hover:text-cyan1">{{ p.name }}</div>
                    <div class="text-[11px] text-ink3 truncate">{{ p.description || 'No description' }}</div>
                  </div>
                </div>
              </div>
              <div><app-status [s]="statusFor(p)"></app-status></div>
              <div class="text-[12px] text-ink2 mono">&#64;{{ ownerFor(p) }}</div>
              <div class="text-right mono text-[12px]" [class.text-ink]="statFor(p, 'runs') > 0" [class.text-ink3]="statFor(p, 'runs') === 0">{{ statFor(p, 'runs') || '—' }}</div>
              <div class="text-right mono text-[12px]" [class.text-ink]="statFor(p, 'experiments') > 0" [class.text-ink3]="statFor(p, 'experiments') === 0">{{ statFor(p, 'experiments') || '—' }}</div>
              <div class="text-right mono text-[12px]" [class.text-ink]="statFor(p, 'models') > 0" [class.text-ink3]="statFor(p, 'models') === 0">{{ statFor(p, 'models') || '—' }}</div>
              <div class="text-right pr-2 text-[11.5px] text-ink2">{{ p.updated_at | date: 'MMM d' }}</div>
              <div class="flex justify-end">
                <button class="opacity-0 group-hover:opacity-100 text-ink3 hover:text-bad transition-colors"
                  (click)="$event.stopPropagation(); deleteTarget = p">
                  <app-icon name="x" className="w-3.5 h-3.5"></app-icon>
                </button>
              </div>
            </div>
          }
          @if (filtered.length === 0) {
            <div class="p-10 text-center text-ink3 text-[13px]">No matches. Try a different filter.</div>
          }
        </div>
      } @else {
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          @for (p of filtered; track p.id) {
            <button
              (click)="openProject(p)"
              class="text-left bg-card border border-line rounded-lg p-3.5 hover:border-white/15 transition-colors group"
            >
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <div class="w-7 h-7 rounded bg-raised flex items-center justify-center">
                    <app-icon name="folder" className="w-4 h-4 text-cyan2"></app-icon>
                  </div>
                  <div class="font-semibold text-[14px] group-hover:text-cyan1">{{ p.name }}</div>
                </div>
                <app-status [s]="statusFor(p)"></app-status>
              </div>
              <div class="text-[12px] text-ink3 mt-2 line-clamp-2 min-h-[32px]">
                {{ p.description || 'No description' }}
              </div>
              <div class="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-white/5">
                <div>
                  <div class="mono text-[14px]" [class.text-ink]="statFor(p, 'runs') > 0" [class.text-ink3]="statFor(p, 'runs') === 0">{{ statFor(p, 'runs') || '—' }}</div>
                  <div class="text-[10px] text-ink3 uppercase tracking-wider">runs</div>
                </div>
                <div>
                  <div class="mono text-[14px]" [class.text-ink]="statFor(p, 'experiments') > 0" [class.text-ink3]="statFor(p, 'experiments') === 0">{{ statFor(p, 'experiments') || '—' }}</div>
                  <div class="text-[10px] text-ink3 uppercase tracking-wider">exp</div>
                </div>
                <div>
                  <div class="mono text-[14px]" [class.text-ink]="statFor(p, 'models') > 0" [class.text-ink3]="statFor(p, 'models') === 0">{{ statFor(p, 'models') || '—' }}</div>
                  <div class="text-[10px] text-ink3 uppercase tracking-wider">models</div>
                </div>
              </div>
              <div class="flex items-center justify-between mt-3 text-[11px] text-ink3">
                <span class="mono">&#64;{{ ownerFor(p) }}</span>
                <span>{{ p.updated_at | date: 'MMM d' }}</span>
              </div>
            </button>
          }
          @if (filtered.length === 0) {
            <div class="col-span-3 p-10 text-center text-ink3 text-[13px]">No matches. Try a different filter.</div>
          }
        </div>
      }

      <!-- delete confirm -->
      @if (deleteTarget) {
        <app-confirm-dialog
          title="Delete project"
          [message]="'Delete ' + deleteTarget.name + '? This removes all pipeline runs, models, deployments and the MLflow experiment. This cannot be undone.'"
          confirmLabel="Delete project"
          (confirmed)="doDelete()"
          (dismissed)="deleteTarget = null"
        ></app-confirm-dialog>
      }

      <!-- purge confirm -->
      @if (showPurge) {
        <app-confirm-dialog
          title="Delete all my data"
          message="This permanently deletes ALL your projects, runs, models, and deployments — including KServe services and MLflow experiments. This cannot be undone."
          confirmLabel="Delete everything"
          (confirmed)="doPurge()"
          (dismissed)="showPurge = false"
        ></app-confirm-dialog>
      }

      <!-- danger zone -->
      <div class="mt-6 rounded-lg border border-bad/20 bg-bad/[0.03] p-4">
        <div class="flex items-center justify-between">
          <div>
            <div class="text-[13px] font-semibold text-bad">Danger Zone</div>
            <div class="text-[12px] text-ink3 mt-0.5">Permanently delete all projects, runs, models and deployments.</div>
          </div>
          <app-btn variant="danger" size="sm" (click)="showPurge = true">Delete all my data</app-btn>
        </div>
        @if (purgeResult) {
          <div class="mt-3 text-[12px] text-good">
            Deleted {{ purgeResult.deleted.projects }} project(s), {{ purgeResult.deleted.runs }} run(s), {{ purgeResult.deleted.deployments }} deployment(s).
          </div>
        }
      </div>

      <!-- create modal -->
      @if (showCreateModal) {
        <div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50" (click)="showCreateModal = false">
          <div class="bg-card rounded-lg p-5 w-full max-w-md border border-line shadow-card" (click)="$event.stopPropagation()">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-[15px] font-semibold">Create new project</h3>
              <button (click)="showCreateModal = false" class="text-ink3 hover:text-ink">
                <app-icon name="x" className="w-3.5 h-3.5"></app-icon>
              </button>
            </div>
            <form [formGroup]="createForm" (ngSubmit)="onCreate()">
              <div class="mb-3">
                <label class="block text-[11.5px] text-ink2 mb-1.5">Project name</label>
                <input
                  type="text"
                  formControlName="name"
                  placeholder="my-ml-project"
                  class="w-full h-9 px-3 rounded-md bg-bg/60 border border-white/10 hover:border-white/20 focus:border-cyan3/40 focus-cyan mono text-[12.5px] text-ink outline-none placeholder:text-ink3"
                />
              </div>
              <div class="mb-5">
                <label class="block text-[11.5px] text-ink2 mb-1.5">Description</label>
                <textarea
                  formControlName="description"
                  rows="3"
                  placeholder="Describe your project…"
                  class="w-full p-2 rounded-md bg-bg/60 border border-white/10 hover:border-white/20 focus:border-cyan3/40 focus-cyan text-[12.5px] text-ink outline-none placeholder:text-ink3 resize-none"
                ></textarea>
              </div>
              <div class="flex gap-2 justify-end">
                <app-btn type="button" variant="ghost" (click)="showCreateModal = false">Cancel</app-btn>
                <app-btn type="submit" variant="primary" [disabled]="createForm.invalid">Create</app-btn>
              </div>
            </form>
          </div>
        </div>
      }
    </div>
  `,
})
export class ProjectListComponent implements OnInit {
  private projectService = inject(ProjectService);
  private adminService = inject(AdminService);
  private router = inject(Router);
  private fb = inject(FormBuilder);

  projects: Project[] = [];
  filtered: Project[] = [];
  statsByProject: Record<string, ProjectStats> = {};
  q = '';
  sortBy: SortKey = 'updated';
  statusFilter: StatusFilter = 'all';
  mode: ViewMode = 'table';
  showCreateModal = false;
  deleteTarget: Project | null = null;
  showPurge = false;
  purgeResult: { deleted: { projects: number; runs: number; models: number; deployments: number } } | null = null;

  createForm: FormGroup = this.fb.group({
    name: ['', [Validators.required]],
    description: [''],
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.projectService.list().subscribe({
      next: (rows) => {
        this.projects = rows || [];
        this.apply();
      },
    });
    this.projectService.stats().subscribe({
      next: (stats) => {
        this.statsByProject = {};
        for (const s of stats || []) {
          this.statsByProject[s.project_id] = s;
        }
      },
      error: () => { this.statsByProject = {}; },
    });
  }

  statFor(p: Project, field: 'runs' | 'experiments' | 'models' | 'deployments'): number {
    return this.statsByProject[p.id]?.[field] ?? 0;
  }

  apply(): void {
    const q = this.q.toLowerCase().trim();
    let rows = this.projects.filter((p) => {
      const matchesQ = !q || p.name.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q);
      const matchesStatus = this.statusFilter === 'all' || this.statusFor(p) === this.statusFilter;
      return matchesQ && matchesStatus;
    });
    if (this.sortBy === 'name') {
      rows = [...rows].sort((a, b) => a.name.localeCompare(b.name));
    } else if (this.sortBy === 'created') {
      rows = [...rows].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    } else {
      rows = [...rows].sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at));
    }
    this.filtered = rows;
  }

  statusFor(_: Project): 'active' | 'idle' | 'archived' {
    return 'active';
  }

  ownerFor(_: Project): string {
    return 'me';
  }

  openProject(p: Project): void {
    this.router.navigate(['/projects', p.id]);
  }

  openCreate(): void {
    this.showCreateModal = true;
  }

  onCreate(): void {
    if (this.createForm.invalid) return;
    this.projectService.create(this.createForm.value).subscribe({
      next: () => {
        this.showCreateModal = false;
        this.createForm.reset();
        this.load();
      },
    });
  }

  doDelete(): void {
    if (!this.deleteTarget) return;
    const id = this.deleteTarget.id;
    this.deleteTarget = null;
    this.projectService.delete(id).subscribe({ next: () => this.load() });
  }

  doPurge(): void {
    this.showPurge = false;
    this.adminService.purgeAll().subscribe({
      next: (res) => {
        this.purgeResult = res;
        this.load();
      },
    });
  }
}
