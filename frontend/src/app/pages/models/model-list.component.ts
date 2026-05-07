import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ModelService, GlobalModelEntry, ModelStage, ModelVersion } from '../../core/services/model.service';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { ConfirmDialogComponent } from '../../shared/ui/confirm-dialog/confirm-dialog.component';

interface ConfirmState {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
}

@Component({
  selector: 'app-model-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, IconComponent, ConfirmDialogComponent],
  template: `
    <div class="p-4 space-y-3">
      <div class="flex items-start justify-between gap-4">
        <div>
          <h1 class="text-[22px] font-semibold tracking-tight">Models</h1>
          <p class="text-[12.5px] text-ink3">
            {{ filtered.length }} of {{ models.length }} registered models · all projects
          </p>
        </div>
        <button (click)="refresh()" class="h-8 px-3 rounded-md bg-raised/50 border border-white/5 hover:border-white/10 text-[12.5px] text-ink2 hover:text-ink flex items-center gap-1.5">
          <app-icon name="refresh" className="w-3.5 h-3.5"></app-icon>Refresh
        </button>
      </div>

      <div class="flex items-center gap-2 bg-card border border-line rounded-lg p-2">
        <div class="flex items-center gap-2 px-2 h-8 rounded-md bg-raised/50 border border-white/5 flex-1 max-w-[360px] focus-within:border-cyan3/40">
          <app-icon name="search" className="w-3.5 h-3.5 text-ink3"></app-icon>
          <input [(ngModel)]="q" (ngModelChange)="apply()" placeholder="Filter by model or project" class="bg-transparent outline-none text-[12.5px] flex-1 placeholder:text-ink3 text-ink" />
        </div>
      </div>

      @if (loading) {
        <div class="text-center text-ink3 py-12 text-[13px]">Loading models...</div>
      } @else if (error) {
        <div class="bg-bad/10 border border-bad/30 rounded-lg p-4 text-bad text-[12.5px]">{{ error }}</div>
      } @else if (filtered.length === 0) {
        <div class="bg-card border border-line rounded-lg p-12 text-center">
          <div class="w-10 h-10 mx-auto mb-3 rounded-full bg-raised/50 flex items-center justify-center">
            <app-icon name="model" className="w-5 h-5 text-ink3"></app-icon>
          </div>
          <div class="text-[13px] text-ink2">No registered models yet</div>
          <div class="text-[11.5px] text-ink3 mt-1">Promote a successful run to register a model</div>
        </div>
      } @else {
        <div class="space-y-2">
          @for (m of filtered; track m.name) {
            <div class="bg-card border border-line rounded-lg overflow-hidden">
              <button (click)="toggle(m.name)" class="w-full flex items-center justify-between px-3 py-2.5 hover:bg-white/[0.02]">
                <div class="flex items-center gap-3">
                  <app-icon [name]="expanded.has(m.name) ? 'chevronDown' : 'chevron'" className="w-3.5 h-3.5 text-ink3"></app-icon>
                  <div class="text-left">
                    <div class="text-[13px] font-medium text-ink">{{ m.name }}</div>
                    <div class="text-[11px] text-ink3">
                      <a [routerLink]="['/projects', m.project_id]" (click)="$event.stopPropagation()" class="text-cyan3 hover:underline">{{ m.project_name }}</a>
                      · {{ m.versions.length }} version{{ m.versions.length === 1 ? '' : 's' }}
                    </div>
                  </div>
                </div>
                <div class="flex items-center gap-1.5">
                  @for (s of stageSummary(m.versions); track s.key) {
                    <span [class]="stagePill(s.key)">{{ s.count }} {{ s.key }}</span>
                  }
                </div>
              </button>

              @if (expanded.has(m.name)) {
                <div class="border-t border-line bg-raised/30">
                  <table class="w-full text-[12.5px]">
                    <thead class="text-[10.5px] font-semibold tracking-[0.08em] uppercase text-ink3">
                      <tr class="border-b border-line">
                        <th class="text-left px-3 py-2">Version</th>
                        <th class="text-left px-3 py-2">Stage</th>
                        <th class="text-left px-3 py-2">Source</th>
                        <th class="text-right px-3 py-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (v of m.versions; track v.version) {
                        <tr class="border-b border-line last:border-b-0 hover:bg-white/[0.02]">
                          <td class="px-3 py-2 mono text-ink">v{{ v.version }}</td>
                          <td class="px-3 py-2"><span [class]="stagePill(v.stage)">{{ v.stage }}</span></td>
                          <td class="px-3 py-2 mono text-[10.5px] text-ink3 truncate max-w-[320px]">{{ v.source || '—' }}</td>
                          <td class="px-3 py-2 text-right">
                            <select (change)="onStageChange($event, m.name, v.version)" [value]="v.stage" class="appearance-none h-7 px-2 rounded bg-raised/60 border border-white/5 text-[11.5px] text-ink2 outline-none hover:border-white/10">
                              <option value="None" class="bg-card">None</option>
                              <option value="Staging" class="bg-card">Staging</option>
                              <option value="Production" class="bg-card">Production</option>
                              <option value="Archived" class="bg-card">Archived</option>
                            </select>
                            <button (click)="promptDelete(m.name, v.version)" class="ml-2 h-7 px-2 rounded bg-bad/10 border border-bad/20 text-bad text-[11.5px] hover:bg-bad/20">Delete</button>
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
    </div>

    @if (confirmState.open) {
      <app-confirm-dialog
        [title]="confirmState.title"
        [message]="confirmState.message"
        [confirmLabel]="confirmState.confirmLabel"
        (confirmed)="onConfirm()"
        (dismissed)="onCancel()"
      ></app-confirm-dialog>
    }
  `,
})
export class ModelListComponent implements OnInit {
  private modelService = inject(ModelService);

  models: GlobalModelEntry[] = [];
  filtered: GlobalModelEntry[] = [];
  expanded = new Set<string>();
  loading = false;
  error = '';
  q = '';

  confirmState: ConfirmState = {
    open: false,
    title: '',
    message: '',
    confirmLabel: 'Confirm',
    onConfirm: () => {},
  };

  ngOnInit(): void {
    this.refresh();
  }

  refresh(): void {
    this.loading = true;
    this.error = '';
    this.modelService.listAll().subscribe({
      next: (resp) => {
        this.models = resp.models || [];
        this.apply();
        this.loading = false;
      },
      error: (e) => {
        this.error = e?.error?.detail || 'Failed to load models';
        this.loading = false;
      },
    });
  }

  apply(): void {
    const q = this.q.trim().toLowerCase();
    this.filtered = !q
      ? this.models
      : this.models.filter(
          (m) =>
            m.name.toLowerCase().includes(q) ||
            (m.project_name || '').toLowerCase().includes(q),
        );
  }

  toggle(name: string): void {
    if (this.expanded.has(name)) this.expanded.delete(name);
    else this.expanded.add(name);
  }

  stagePill(stage: string): string {
    const base = 'inline-flex items-center px-1.5 py-[2px] rounded text-[10px] font-semibold tracking-[0.08em] ring-1';
    switch (stage) {
      case 'Production': return `${base} bg-good/10 text-good ring-good/20`;
      case 'Staging':    return `${base} bg-cyan3/10 text-cyan3 ring-cyan3/20`;
      case 'Archived':   return `${base} bg-white/5 text-ink3 ring-white/10`;
      default:           return `${base} bg-white/5 text-ink2 ring-white/10`;
    }
  }

  stageSummary(versions: ModelVersion[]): { key: string; count: number }[] {
    const counts: Record<string, number> = {};
    for (const v of versions) counts[v.stage] = (counts[v.stage] || 0) + 1;
    const order = ['Production', 'Staging', 'None', 'Archived'];
    return order
      .filter((k) => counts[k])
      .map((k) => ({ key: k, count: counts[k] }));
  }

  onStageChange(ev: Event, name: string, version: string): void {
    const stage = (ev.target as HTMLSelectElement).value as ModelStage;
    this.modelService.promote(name, version, stage).subscribe({
      next: () => this.refresh(),
      error: (e) => (this.error = e?.error?.detail || 'Failed to change stage'),
    });
  }

  promptDelete(name: string, version: string): void {
    this.confirmState = {
      open: true,
      title: 'Delete version',
      message: `Delete ${name} v${version}? This cannot be undone.`,
      confirmLabel: 'Delete',
      onConfirm: () => this.doDelete(name, version),
    };
  }

  doDelete(name: string, version: string): void {
    this.modelService.deleteVersion(name, version).subscribe({
      next: () => this.refresh(),
      error: (e) => (this.error = e?.error?.detail || 'Failed to delete version'),
    });
  }

  onConfirm(): void {
    const fn = this.confirmState.onConfirm;
    this.confirmState.open = false;
    fn();
  }

  onCancel(): void {
    this.confirmState.open = false;
  }
}
