import { Component, Input, OnChanges } from '@angular/core';

@Component({
  selector: 'app-sparkline',
  standalone: true,
  template: `
    <svg [attr.width]="w" [attr.height]="h" class="block">
      <defs>
        <linearGradient [attr.id]="gradientId" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" [attr.stop-color]="color" stop-opacity="0.35"/>
          <stop offset="100%" [attr.stop-color]="color" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path [attr.d]="fillPath" [attr.fill]="'url(#' + gradientId + ')'"/>
      <path [attr.d]="linePath" [attr.stroke]="color" stroke-width="1.25" fill="none"/>
    </svg>
  `,
})
export class SparklineComponent implements OnChanges {
  @Input() data: number[] = [];
  @Input() w: number = 120;
  @Input() h: number = 28;
  @Input() color: string = '#42C2FF';

  gradientId = 'sf_' + Math.random().toString(36).slice(2, 7);
  linePath = '';
  fillPath = '';

  ngOnChanges(): void {
    if (!this.data || this.data.length < 2) {
      this.linePath = '';
      this.fillPath = '';
      return;
    }
    const max = Math.max(...this.data);
    const min = Math.min(...this.data);
    const range = Math.max(1e-6, max - min);
    const step = this.w / (this.data.length - 1);
    const pts = this.data.map((v, i) => [i * step, this.h - ((v - min) / range) * (this.h - 4) - 2] as [number, number]);
    this.linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
    this.fillPath = `${this.linePath} L${this.w},${this.h} L0,${this.h} Z`;
  }
}
