import {
  Component,
  ElementRef,
  AfterViewInit,
  OnDestroy,
  ViewChild,
  NgZone,
} from '@angular/core';

/**
 * Lightweight constellation canvas: drifting cyan nodes with lines drawn between
 * near neighbours. Purely decorative, no dependencies. Runs outside Angular's
 * zone so it never triggers change detection, is DPR-aware, pauses when the tab
 * is hidden, and renders a single static frame when the user prefers reduced
 * motion.
 */
@Component({
  selector: 'app-auth-bg',
  standalone: true,
  template: `<canvas #cv class="auth-bg-canvas"></canvas>`,
  styles: [`
    :host {
      position: absolute; inset: 0;
      pointer-events: none;
      z-index: 0;
    }
    .auth-bg-canvas { width: 100%; height: 100%; display: block; }
  `],
})
export class AuthBgComponent implements AfterViewInit, OnDestroy {
  @ViewChild('cv', { static: true }) cv!: ElementRef<HTMLCanvasElement>;

  private ctx!: CanvasRenderingContext2D;
  private raf = 0;
  private nodes: { x: number; y: number; vx: number; vy: number }[] = [];
  private w = 0;
  private h = 0;
  private dpr = 1;
  private ro?: ResizeObserver;
  private readonly onVisibility = () => {
    if (document.hidden) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    } else if (!this.raf && !this.reduced) {
      this.loop();
    }
  };
  private reduced = false;

  constructor(private host: ElementRef<HTMLElement>, private zone: NgZone) {}

  ngAfterViewInit(): void {
    const canvas = this.cv.nativeElement;
    this.ctx = canvas.getContext('2d')!;
    this.reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    this.resize();
    this.seed();

    this.ro = new ResizeObserver(() => { this.resize(); this.seed(); this.drawOnce(); });
    this.ro.observe(this.host.nativeElement);

    if (this.reduced) {
      this.drawOnce();
      return;
    }
    document.addEventListener('visibilitychange', this.onVisibility);
    this.zone.runOutsideAngular(() => this.loop());
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
    document.removeEventListener('visibilitychange', this.onVisibility);
  }

  private resize(): void {
    const rect = this.host.nativeElement.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = Math.max(1, Math.floor(rect.width));
    this.h = Math.max(1, Math.floor(rect.height));
    const canvas = this.cv.nativeElement;
    canvas.width = this.w * this.dpr;
    canvas.height = this.h * this.dpr;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  private seed(): void {
    // density scales with area, capped for performance
    const count = Math.min(64, Math.round((this.w * this.h) / 16000));
    this.nodes = Array.from({ length: count }, () => ({
      x: Math.random() * this.w,
      y: Math.random() * this.h,
      vx: (Math.random() - 0.5) * 0.25,
      vy: (Math.random() - 0.5) * 0.25,
    }));
  }

  private loop = (): void => {
    this.step();
    this.draw();
    this.raf = requestAnimationFrame(this.loop);
  };

  private step(): void {
    for (const n of this.nodes) {
      n.x += n.vx; n.y += n.vy;
      if (n.x < 0 || n.x > this.w) n.vx *= -1;
      if (n.y < 0 || n.y > this.h) n.vy *= -1;
    }
  }

  private drawOnce(): void { this.draw(); }

  private draw(): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);
    const maxDist = 130;

    // lines between near nodes
    for (let i = 0; i < this.nodes.length; i++) {
      for (let j = i + 1; j < this.nodes.length; j++) {
        const a = this.nodes[i], b = this.nodes[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const dist = Math.hypot(dx, dy);
        if (dist < maxDist) {
          const alpha = (1 - dist / maxDist) * 0.18;
          ctx.strokeStyle = `rgba(66, 194, 255, ${alpha})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }

    // nodes
    for (const n of this.nodes) {
      ctx.fillStyle = 'rgba(133, 244, 255, 0.55)';
      ctx.beginPath();
      ctx.arc(n.x, n.y, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
