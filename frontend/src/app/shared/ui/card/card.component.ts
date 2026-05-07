import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-card',
  standalone: true,
  template: `
    <div [class]="'bg-card border border-line rounded-lg shadow-card ' + className">
      @if (title) {
        <div [class]="'flex items-center justify-between hairline ' + (dense ? 'px-3 h-9' : 'px-4 h-11')">
          <div class="text-[12px] font-semibold tracking-[0.04em] text-ink2 uppercase">{{ title }}</div>
          <div class="flex items-center gap-2">
            <ng-content select="[right]"></ng-content>
          </div>
        </div>
      }
      <ng-content></ng-content>
    </div>
  `,
})
export class CardComponent {
  @Input() title: string = '';
  @Input() dense: boolean = false;
  @Input() className: string = '';
}
