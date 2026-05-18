import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IconComponent } from '../../ui/icon/icon.component';
import { LogoComponent } from '../../ui/logo/logo.component';

@Component({
  selector: 'app-auth-layout',
  standalone: true,
  imports: [CommonModule, IconComponent, LogoComponent],
  template: `
    <div class="min-h-screen grid grid-cols-1 md:grid-cols-2 bg-bg">
      <!-- ─── Brand pane (desktop only) ─────────────────────────────── -->
      <div class="hidden md:flex relative overflow-hidden flex-col justify-between p-10 border-r border-line">
        <!-- animated mesh-gradient + dotted grid overlay (purely decorative) -->
        <div class="auth-mesh"></div>
        <div class="auth-grid"></div>
        <div class="auth-vignette"></div>

        <!-- top: brand mark -->
        <div class="relative z-10 flex items-center gap-2.5">
          <app-logo className="w-7 h-7"></app-logo>
          <span class="text-[17px] font-semibold tracking-tight">MLOps</span>
        </div>

        <!-- middle: tagline (slotted) + feature tiles -->
        <div class="relative z-10 max-w-md">
          <ng-content select="[brand-headline]"></ng-content>

          <div class="mt-8 grid grid-cols-2 gap-2.5">
            <div class="auth-tile">
              <div class="flex items-center gap-1.5">
                <app-icon name="beaker" className="w-3.5 h-3.5 text-cyan3"></app-icon>
                <span class="text-[12px] font-semibold text-ink">Tracking</span>
              </div>
              <p class="mt-1 text-[11px] text-ink3">MLflow autolog · zero-config runs</p>
            </div>
            <div class="auth-tile">
              <div class="flex items-center gap-1.5">
                <app-icon name="rocket" className="w-3.5 h-3.5 text-cyan2"></app-icon>
                <span class="text-[12px] font-semibold text-ink">Deploy</span>
              </div>
              <p class="mt-1 text-[11px] text-ink3">KServe · one-click serving</p>
            </div>
            <div class="auth-tile col-span-2">
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
      <div class="flex items-center justify-center px-5 py-10 md:py-12 relative">
        <!-- mobile-only mesh tint so the form pane isn't fully flat on phones -->
        <div class="auth-mesh-mobile md:hidden"></div>

        <div class="relative z-10 w-full max-w-sm bg-card/40 backdrop-blur-md border border-white/10 rounded-xl p-6 sm:p-7 shadow-card animate-fade-in">
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

    /* Slow drifting cyan glow — the "modern SaaS" backdrop */
    .auth-mesh {
      position: absolute; inset: 0; pointer-events: none;
      background:
        radial-gradient(circle at 18% 28%, rgba(66, 194, 255, 0.22), transparent 42%),
        radial-gradient(circle at 82% 70%, rgba(133, 244, 255, 0.15), transparent 46%),
        radial-gradient(circle at 50% 102%, rgba(184, 255, 249, 0.10), transparent 38%);
      animation: meshDrift 28s ease-in-out infinite alternate;
      will-change: transform;
    }
    .auth-mesh-mobile {
      position: absolute; inset: 0; pointer-events: none;
      background:
        radial-gradient(circle at 50% 0%, rgba(66, 194, 255, 0.12), transparent 60%),
        radial-gradient(circle at 50% 100%, rgba(133, 244, 255, 0.08), transparent 60%);
    }
    @keyframes meshDrift {
      0%   { transform: translate3d(0, 0, 0) scale(1); }
      100% { transform: translate3d(-22px, -28px, 0) scale(1.08); }
    }

    /* Faint dotted grid overlay, masked to the centre so edges fade out */
    .auth-grid {
      position: absolute; inset: 0; pointer-events: none;
      background-image: radial-gradient(rgba(255, 255, 255, 0.045) 1px, transparent 1px);
      background-size: 22px 22px;
      -webkit-mask-image: radial-gradient(circle at center, black 35%, transparent 80%);
              mask-image: radial-gradient(circle at center, black 35%, transparent 80%);
    }

    /* Soft vignette to keep text readable over the mesh */
    .auth-vignette {
      position: absolute; inset: 0; pointer-events: none;
      background: linear-gradient(180deg, rgba(15, 20, 32, 0.4) 0%, transparent 40%, rgba(15, 20, 32, 0.55) 100%);
    }

    /* Feature tile card */
    :host ::ng-deep .auth-tile {
      padding: 0.625rem 0.75rem;
      border-radius: 0.5rem;
      background: rgba(20, 27, 42, 0.55);
      border: 1px solid rgba(255, 255, 255, 0.06);
      transition: border-color 200ms ease, background-color 200ms ease, transform 200ms ease;
    }
    :host ::ng-deep .auth-tile:hover {
      border-color: rgba(66, 194, 255, 0.25);
      background: rgba(20, 27, 42, 0.75);
      transform: translateY(-1px);
    }

    /* Form-card entrance */
    .animate-fade-in { animation: fadeIn 0.45s ease-out both; }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(6px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    /* Respect users who don't want motion */
    @media (prefers-reduced-motion: reduce) {
      .auth-mesh, .animate-fade-in { animation: none; }
    }
  `],
})
export class AuthLayoutComponent {}
