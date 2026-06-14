import { Component, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IconComponent } from '../../ui/icon/icon.component';
import { LogoComponent } from '../../ui/logo/logo.component';
import { AuthBgComponent } from './auth-bg.component';

@Component({
  selector: 'app-auth-layout',
  standalone: true,
  imports: [CommonModule, IconComponent, LogoComponent, AuthBgComponent],
  template: `
    <div class="min-h-screen grid grid-cols-1 md:grid-cols-2 bg-bg auth-root"
         [style.--mx]="mx" [style.--my]="my">
      <!-- ─── Brand pane (desktop only) ─────────────────────────────── -->
      <div class="hidden md:flex relative overflow-hidden flex-col justify-between p-10 border-r border-line">
        <!-- decorative, depth-layered background (purely visual) -->
        <div class="auth-orbs" aria-hidden="true"></div>
        <div class="auth-floor" aria-hidden="true"><div class="auth-floor-grid"></div></div>
        <app-auth-bg aria-hidden="true"></app-auth-bg>
        <div class="auth-grid" aria-hidden="true"></div>
        <div class="auth-vignette" aria-hidden="true"></div>

        <!-- top: brand mark -->
        <div class="relative z-10 flex items-center gap-2.5 brand-pop">
          <app-logo className="w-7 h-7"></app-logo>
          <span class="text-[17px] font-semibold tracking-tight">MLOps</span>
        </div>

        <!-- middle: tagline (slotted) + floating 3D feature tiles -->
        <div class="relative z-10 max-w-md scene">
          <ng-content select="[brand-headline]"></ng-content>

          <div class="mt-8 grid grid-cols-2 gap-2.5 tiles">
            <div class="auth-tile float-a" style="--depth: 14px">
              <div class="flex items-center gap-1.5">
                <app-icon name="beaker" className="w-3.5 h-3.5 text-cyan3"></app-icon>
                <span class="text-[12px] font-semibold text-ink">Tracking</span>
              </div>
              <p class="mt-1 text-[11px] text-ink3">MLflow autolog · zero-config runs</p>
            </div>
            <div class="auth-tile float-b" style="--depth: 22px">
              <div class="flex items-center gap-1.5">
                <app-icon name="rocket" className="w-3.5 h-3.5 text-cyan2"></app-icon>
                <span class="text-[12px] font-semibold text-ink">Deploy</span>
              </div>
              <p class="mt-1 text-[11px] text-ink3">KServe · one-click serving</p>
            </div>
            <div class="auth-tile col-span-2 float-c" style="--depth: 10px">
              <div class="flex items-center gap-1.5">
                <app-icon name="pipeline" className="w-3.5 h-3.5 text-cyan1"></app-icon>
                <span class="text-[12px] font-semibold text-ink">Pipelines</span>
              </div>
              <p class="mt-1 text-[11px] text-ink3">Kubeflow + Argo · trigger from your laptop, run on the cluster</p>
            </div>
          </div>
        </div>

        <!-- bottom: tech ribbon -->
        <div class="relative z-10 mono text-[10.5px] text-ink3 tracking-[0.18em] uppercase">
          Kubeflow <span class="mx-2 text-line2">·</span> KServe <span class="mx-2 text-line2">·</span>
          MLflow <span class="mx-2 text-line2">·</span> Kubernetes
        </div>
      </div>

      <!-- ─── Form pane ─────────────────────────────────────────────── -->
      <div class="flex items-center justify-center px-5 py-10 md:py-12 relative overflow-hidden">
        <!-- mobile-only ambience so the form pane isn't fully flat on phones -->
        <div class="auth-mesh-mobile md:hidden" aria-hidden="true"></div>
        <app-auth-bg class="md:hidden auth-bg-mobile" aria-hidden="true"></app-auth-bg>

        <div class="relative z-10 w-full max-w-sm auth-card rounded-2xl p-6 sm:p-7 animate-fade-in">
          <!-- mobile brand (sm-down only) -->
          <div class="md:hidden flex items-center gap-2 mb-5">
            <app-logo className="w-6 h-6"></app-logo>
            <span class="font-semibold tracking-tight">MLOps</span>
          </div>

          <ng-content></ng-content>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .auth-root { --mx: 0; --my: 0; }

    /* ── Glowing, drifting orbs (depth layer furthest back) ─────────── */
    .auth-orbs {
      position: absolute; inset: -10%; pointer-events: none; z-index: 0;
      background:
        radial-gradient(38% 38% at 18% 26%, rgba(66, 194, 255, 0.28), transparent 70%),
        radial-gradient(34% 34% at 84% 68%, rgba(133, 244, 255, 0.18), transparent 70%),
        radial-gradient(42% 42% at 52% 108%, rgba(184, 255, 249, 0.12), transparent 70%);
      filter: blur(14px);
      transform: translate3d(calc(var(--mx) * -18px), calc(var(--my) * -18px), 0);
      animation: orbDrift 26s ease-in-out infinite alternate;
      will-change: transform;
    }
    @keyframes orbDrift {
      0%   { transform: translate3d(calc(var(--mx) * -18px), calc(var(--my) * -18px), 0) scale(1); }
      100% { transform: translate3d(calc(var(--mx) * -18px - 24px), calc(var(--my) * -18px - 30px), 0) scale(1.08); }
    }

    /* ── Perspective "Tron" floor receding into the distance ────────── */
    .auth-floor {
      position: absolute; left: -25%; right: -25%; bottom: -8%; height: 70%;
      pointer-events: none; z-index: 0;
      perspective: 520px; perspective-origin: 50% 0%;
      -webkit-mask-image: linear-gradient(to top, black 0%, transparent 78%);
              mask-image: linear-gradient(to top, black 0%, transparent 78%);
      opacity: 0.55;
    }
    .auth-floor-grid {
      position: absolute; inset: 0;
      transform: rotateX(74deg) translateZ(0);
      transform-origin: 50% 100%;
      background-image:
        linear-gradient(rgba(66, 194, 255, 0.30) 1px, transparent 1px),
        linear-gradient(90deg, rgba(66, 194, 255, 0.30) 1px, transparent 1px);
      background-size: 46px 46px;
      animation: floorScroll 9s linear infinite;
      will-change: background-position;
    }
    @keyframes floorScroll {
      from { background-position: 0 0, 0 0; }
      to   { background-position: 0 46px, 0 0; }
    }

    /* ── Particle canvas sizing within the pane ─────────────────────── */
    app-auth-bg { position: absolute; inset: 0; z-index: 0; }
    .auth-bg-mobile { opacity: 0.6; }

    /* Faint dotted grid overlay, masked to the centre so edges fade out */
    .auth-grid {
      position: absolute; inset: 0; pointer-events: none; z-index: 0;
      background-image: radial-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px);
      background-size: 22px 22px;
      -webkit-mask-image: radial-gradient(circle at center, black 30%, transparent 78%);
              mask-image: radial-gradient(circle at center, black 30%, transparent 78%);
    }

    /* Soft vignette to keep text readable over the scene */
    .auth-vignette {
      position: absolute; inset: 0; pointer-events: none; z-index: 1;
      background: linear-gradient(180deg, rgba(15, 20, 32, 0.45) 0%, transparent 38%, rgba(15, 20, 32, 0.62) 100%);
    }

    .auth-mesh-mobile {
      position: absolute; inset: 0; pointer-events: none; z-index: 0;
      background:
        radial-gradient(circle at 50% 0%, rgba(66, 194, 255, 0.14), transparent 60%),
        radial-gradient(circle at 50% 100%, rgba(133, 244, 255, 0.08), transparent 60%);
    }

    /* ── Brand mark subtle entrance ─────────────────────────────────── */
    .brand-pop { animation: fadeIn 0.5s ease-out both; }

    /* ── Floating 3D feature tiles ──────────────────────────────────── */
    .scene { perspective: 900px; }
    .tiles { transform-style: preserve-3d; }
    :host ::ng-deep .auth-tile {
      position: relative;
      padding: 0.7rem 0.8rem;
      border-radius: 0.7rem;
      background: linear-gradient(180deg, rgba(27, 36, 56, 0.72), rgba(20, 27, 42, 0.6));
      border: 1px solid rgba(255, 255, 255, 0.08);
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35), 0 1px 0 rgba(255, 255, 255, 0.04) inset;
      backdrop-filter: blur(6px);
      transform: translate3d(calc(var(--mx) * var(--depth, 12px)), calc(var(--my) * var(--depth, 12px)), 0);
      transition: border-color 220ms ease, box-shadow 220ms ease, transform 120ms ease;
    }
    :host ::ng-deep .auth-tile:hover {
      border-color: rgba(66, 194, 255, 0.40);
      box-shadow: 0 14px 36px rgba(0, 0, 0, 0.42), 0 0 0 1px rgba(66, 194, 255, 0.18);
    }
    .float-a { animation: floatY 7s ease-in-out infinite; }
    .float-b { animation: floatY 8.5s ease-in-out infinite 0.6s; }
    .float-c { animation: floatY 9.5s ease-in-out infinite 1.1s; }
    @keyframes floatY {
      0%, 100% { translate: 0 0; }
      50%      { translate: 0 -6px; }
    }

    /* ── Form card: glass with a soft cyan gradient border ──────────── */
    :host ::ng-deep .auth-card {
      position: relative;
      background: rgba(20, 27, 42, 0.55);
      backdrop-filter: blur(14px);
      border: 1px solid rgba(255, 255, 255, 0.10);
      box-shadow:
        0 1px 0 rgba(255, 255, 255, 0.04) inset,
        0 24px 60px rgba(0, 0, 0, 0.45);
    }
    :host ::ng-deep .auth-card::before {
      content: ""; position: absolute; inset: 0; border-radius: inherit;
      padding: 1px; pointer-events: none;
      background: linear-gradient(140deg, rgba(66, 194, 255, 0.55), rgba(133, 244, 255, 0.12) 38%, transparent 70%);
      -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
              mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
      -webkit-mask-composite: xor; mask-composite: exclude;
    }
    :host ::ng-deep .auth-card::after {
      content: ""; position: absolute; left: 0; right: 0; top: 0; height: 1px;
      background: linear-gradient(90deg, transparent, rgba(133, 244, 255, 0.6), transparent);
      border-top-left-radius: inherit; border-top-right-radius: inherit;
    }

    /* Form-card entrance */
    .animate-fade-in { animation: fadeIn 0.5s ease-out both; }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(8px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    /* ── Respect users who don't want motion ────────────────────────── */
    @media (prefers-reduced-motion: reduce) {
      .auth-orbs, .auth-floor-grid, .float-a, .float-b, .float-c,
      .animate-fade-in, .brand-pop { animation: none; }
      :host ::ng-deep .auth-tile { transform: none; }
    }
  `],
})
export class AuthLayoutComponent {
  /** Normalized cursor offset (-0.5..0.5) feeding the parallax CSS vars. */
  mx = 0;
  my = 0;
  private parallaxOn =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches &&
    window.matchMedia('(pointer: fine)').matches;

  @HostListener('mousemove', ['$event'])
  onMove(e: MouseEvent): void {
    if (!this.parallaxOn) return;
    this.mx = e.clientX / window.innerWidth - 0.5;
    this.my = e.clientY / window.innerHeight - 0.5;
  }

  @HostListener('mouseleave')
  onLeave(): void {
    this.mx = 0;
    this.my = 0;
  }
}
