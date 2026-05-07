import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-framework-chip',
  standalone: true,
  template: `
    <button
      (click)="clicked.emit()"
      [class]="classes"
    >{{ name }}</button>
  `,
})
export class FrameworkChipComponent {
  @Input() name!: string;
  @Input() active: boolean = false;
  @Output() clicked = new EventEmitter<void>();

  get classes(): string {
    const base = 'mono text-[11px] px-2 h-6 rounded border transition-colors duration-150';
    return this.active
      ? `${base} border-cyan3/50 text-cyan3 bg-cyan3/10`
      : `${base} border-white/10 text-ink2 hover:text-ink hover:border-white/20`;
  }
}
