import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IconComponent } from '../../shared/ui/icon/icon.component';

@Component({
  selector: 'app-artifacts',
  standalone: true,
  imports: [CommonModule, IconComponent],
  template: `
    <div class="p-4 space-y-3">
      <div>
        <h1 class="text-[22px] font-semibold tracking-tight">Artifacts</h1>
        <p class="text-[12.5px] text-ink3">Model binaries, training outputs, and MLflow artifacts — stored in MinIO</p>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <a href="http://localhost:9001" target="_blank" rel="noopener" class="group bg-card border border-line rounded-lg p-5 hover:border-cyan3/40 transition-colors">
          <div class="flex items-start gap-3">
            <div class="w-10 h-10 rounded-lg bg-cyan3/10 flex items-center justify-center shrink-0">
              <app-icon name="folder" className="w-5 h-5 text-cyan3"></app-icon>
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="text-[13.5px] font-medium text-ink">MinIO Console</span>
                <app-icon name="chevron" className="w-3 h-3 text-ink3 group-hover:text-cyan3 transition-colors"></app-icon>
              </div>
              <p class="text-[12px] text-ink3 mt-1">Browse all buckets: mlflow, user-uploads, pipeline-artifacts</p>
              <div class="mt-2 mono text-[10.5px] text-ink3">localhost:9001</div>
            </div>
          </div>
        </a>

        <a href="http://localhost:5000" target="_blank" rel="noopener" class="group bg-card border border-line rounded-lg p-5 hover:border-cyan3/40 transition-colors">
          <div class="flex items-start gap-3">
            <div class="w-10 h-10 rounded-lg bg-cyan3/10 flex items-center justify-center shrink-0">
              <app-icon name="beaker" className="w-5 h-5 text-cyan3"></app-icon>
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="text-[13.5px] font-medium text-ink">MLflow UI</span>
                <app-icon name="chevron" className="w-3 h-3 text-ink3 group-hover:text-cyan3 transition-colors"></app-icon>
              </div>
              <p class="text-[12px] text-ink3 mt-1">Run detail, artifact tree, metric curves, registered models</p>
              <div class="mt-2 mono text-[10.5px] text-ink3">localhost:5000</div>
            </div>
          </div>
        </a>
      </div>

      <div class="bg-card border border-line rounded-lg p-5">
        <div class="text-[11px] font-semibold tracking-[0.08em] uppercase text-ink3 mb-3">Default buckets</div>
        <div class="space-y-2 text-[12.5px]">
          <div class="flex items-center justify-between py-1.5 border-b border-line last:border-b-0">
            <div class="flex items-center gap-2">
              <app-icon name="folder" className="w-3.5 h-3.5 text-ink3"></app-icon>
              <span class="mono text-ink">mlflow</span>
            </div>
            <span class="text-[11px] text-ink3">MLflow run artifacts + registered models</span>
          </div>
          <div class="flex items-center justify-between py-1.5 border-b border-line last:border-b-0">
            <div class="flex items-center gap-2">
              <app-icon name="folder" className="w-3.5 h-3.5 text-ink3"></app-icon>
              <span class="mono text-ink">user-uploads</span>
            </div>
            <span class="text-[11px] text-ink3">Code and dataset files per project</span>
          </div>
          <div class="flex items-center justify-between py-1.5">
            <div class="flex items-center gap-2">
              <app-icon name="folder" className="w-3.5 h-3.5 text-ink3"></app-icon>
              <span class="mono text-ink">pipeline-artifacts</span>
            </div>
            <span class="text-[11px] text-ink3">Intermediate outputs from KFP pipeline components</span>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class ArtifactsComponent {}
