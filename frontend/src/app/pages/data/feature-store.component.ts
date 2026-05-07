import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IconComponent } from '../../shared/ui/icon/icon.component';

@Component({
  selector: 'app-feature-store',
  standalone: true,
  imports: [CommonModule, IconComponent],
  template: `
    <div class="p-4 space-y-3">
      <div>
        <h1 class="text-[22px] font-semibold tracking-tight">Feature Store</h1>
        <p class="text-[12.5px] text-ink3">Shared feature definitions for training and serving</p>
      </div>

      <div class="bg-card border border-line rounded-lg p-16 text-center">
        <div class="w-14 h-14 mx-auto mb-4 rounded-full bg-raised/50 flex items-center justify-center">
          <app-icon name="cpu" className="w-6 h-6 text-ink3"></app-icon>
        </div>
        <div class="text-[15px] font-medium text-ink mb-1">Planned for v3</div>
        <p class="text-[12.5px] text-ink3 max-w-md mx-auto">
          A Feast-based feature store will land here — offline/online feature retrieval,
          point-in-time joins, and materialization jobs.
        </p>
        <div class="mt-5 inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-raised/40 border border-white/5 mono text-[10.5px] text-ink3">
          <span class="w-1.5 h-1.5 rounded-full bg-ink3"></span>
          NOT YET INTEGRATED
        </div>
      </div>
    </div>
  `,
})
export class FeatureStoreComponent {}
