import { Component, Input } from '@angular/core';

export type BtnVariant = 'primary' | 'ghost' | 'outline' | 'dark' | 'danger';
export type BtnSize = 'sm' | 'md' | 'lg';

@Component({
  selector: 'app-btn',
  standalone: true,
  template: `
    <button
      [type]="type"
      [disabled]="disabled"
      [class]="classes"
    >
      <ng-content></ng-content>
    </button>
  `,
})
export class BtnComponent {
  @Input() variant: BtnVariant = 'primary';
  @Input() size: BtnSize = 'md';
  @Input() type: 'button' | 'submit' | 'reset' = 'button';
  @Input() disabled: boolean = false;
  @Input() className: string = '';

  private sizes: Record<BtnSize, string> = {
    sm: 'h-7 px-2.5 text-[12px]',
    md: 'h-8 px-3 text-[13px]',
    lg: 'h-9 px-3.5 text-[13px]',
  };

  private variants: Record<BtnVariant, string> = {
    primary: 'bg-cyan3 text-[#06121A] hover:bg-cyan2 font-semibold',
    ghost:   'bg-transparent text-ink2 hover:text-ink hover:bg-white/5',
    outline: 'bg-transparent text-ink border border-white/10 hover:border-white/20 hover:bg-white/5',
    dark:    'bg-white/5 text-ink hover:bg-white/10 border border-white/5',
    danger:  'bg-bad/10 text-bad border border-bad/20 hover:bg-bad/15',
  };

  get classes(): string {
    const base = 'inline-flex items-center gap-1.5 rounded-md transition-colors duration-150 focus-cyan disabled:opacity-50 disabled:cursor-not-allowed';
    return `${base} ${this.sizes[this.size]} ${this.variants[this.variant]} ${this.className}`;
  }
}
