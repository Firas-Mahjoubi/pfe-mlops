import { Component, Input, OnChanges } from '@angular/core';

interface Bar { x: number; y: number; w: number; h: number; opacity: number; }

@Component({
  selector: 'app-bars',
  standalone: true,
  template: `
    <svg [attr.width]="w" [attr.height]="h">
      @for (b of bars; track $index) {
        <rect [attr.x]="b.x" [attr.y]="b.y" [attr.width]="b.w" [attr.height]="b.h"
              [attr.fill]="color" [attr.opacity]="b.opacity" rx="1"/>
      }
    </svg>
  `,
})
export class BarsComponent implements OnChanges {
  @Input() data: number[] = [];
  @Input() w: number = 120;
  @Input() h: number = 28;
  @Input() color: string = '#42C2FF';

  bars: Bar[] = [];

  ngOnChanges(): void {
    if (!this.data?.length) { this.bars = []; return; }
    const max = Math.max(...this.data, 1);
    const bw = (this.w - (this.data.length - 1) * 2) / this.data.length;
    this.bars = this.data.map((v, i) => {
      const bh = Math.max(2, (v / max) * (this.h - 2));
      return { x: i * (bw + 2), y: this.h - bh, w: bw, h: bh, opacity: 0.7 + 0.3 * (v / max) };
    });
  }
}
