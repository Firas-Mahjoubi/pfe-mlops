import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BtnComponent } from '../btn/btn.component';
import { IconComponent } from '../icon/icon.component';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule, BtnComponent, IconComponent],
  template: `
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4" (click)="dismissed.emit()">
      <div class="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>
      <div class="relative bg-card border border-line rounded-lg shadow-card w-full max-w-md" (click)="$event.stopPropagation()">
        <div class="flex items-center justify-between px-4 h-12 hairline">
          <div class="flex items-center gap-2">
            @if (danger) {
              <app-icon name="warn" className="w-4 h-4 text-bad"></app-icon>
            }
            <span class="text-[14px] font-semibold text-ink">{{ title }}</span>
          </div>
          <button (click)="dismissed.emit()" class="text-ink3 hover:text-ink transition-colors">
            <app-icon name="x" className="w-4 h-4"></app-icon>
          </button>
        </div>
        <div class="px-4 py-4">
          <p class="text-[13px] text-ink2 leading-relaxed">{{ message }}</p>
        </div>
        <div class="flex items-center justify-end gap-2 px-4 pb-4">
          <app-btn variant="ghost" size="md" (click)="dismissed.emit()">Cancel</app-btn>
          <app-btn [variant]="danger ? 'danger' : 'primary'" size="md" (click)="confirmed.emit()">
            {{ confirmLabel }}
          </app-btn>
        </div>
      </div>
    </div>
  `,
})
export class ConfirmDialogComponent {
  @Input() title = 'Confirm';
  @Input() message = 'Are you sure?';
  @Input() confirmLabel = 'Delete';
  @Input() danger = true;
  @Output() confirmed = new EventEmitter<void>();
  @Output() dismissed = new EventEmitter<void>();
}
