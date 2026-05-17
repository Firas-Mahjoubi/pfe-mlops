import { Component, HostListener, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { User } from '../../../core/models/user.model';
import { MobileNavService } from '../../../core/services/mobile-nav.service';
import { IconComponent, IconName } from '../../ui/icon/icon.component';
import { LogoComponent } from '../../ui/logo/logo.component';

interface NavItem {
  route: string;
  label: string;
  icon: IconName;
  badge?: number;
  badgeTone?: 'cyan';
}

interface SubNavItem {
  label: string;
  route: string;
}

interface ResourceMini {
  label: string;
  value: string;
  color: string;
  pct: number;
}

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, IconComponent, LogoComponent],
  template: `
    <aside
      class="w-[232px] shrink-0 bg-bg border-r border-line flex flex-col h-screen
             fixed left-0 top-0 z-40 transition-transform duration-200
             md:translate-x-0"
      [class.translate-x-0]="mobileNav.isOpen()"
      [class.-translate-x-full]="!mobileNav.isOpen()"
    >
      <!-- brand -->
      <div class="h-12 px-4 flex items-center gap-2 hairline">
        <app-logo></app-logo>
        <div class="font-semibold tracking-tight text-[15px]">MLOps</div>
        <div class="mono text-[10px] text-ink3 ml-auto">v2.4.1</div>
      </div>

      <!-- workspace / user switcher -->
      @if (user) {
        <div class="relative mx-3 mt-3">
          <button
            #menuTrigger
            (click)="$event.stopPropagation(); userMenuOpen = !userMenuOpen"
            class="w-full h-10 px-2.5 rounded-md bg-raised/60 border border-white/5 hover:border-white/10 flex items-center gap-2 text-left transition-colors"
          >
            <div class="w-6 h-6 rounded bg-gradient-to-br from-cyan3 to-cyan2 text-[#06121A] text-[11px] font-bold flex items-center justify-center shrink-0">
              {{ initial(user.full_name || user.email) }}
            </div>
            <div class="min-w-0 flex-1">
              <div class="text-[12px] font-medium truncate">{{ user.full_name || user.email }}</div>
              <div class="text-[10px] text-ink3 truncate">{{ user.email }}</div>
            </div>
            <app-icon name="chevronDown" className="w-3.5 h-3.5 text-ink3 shrink-0"></app-icon>
          </button>

          @if (userMenuOpen) {
            <div class="absolute top-[calc(100%+4px)] left-0 right-0 z-50 bg-card border border-line rounded-md shadow-card overflow-hidden" (click)="$event.stopPropagation()">
              <div class="px-3 py-2.5 border-b border-line">
                <div class="text-[12px] font-medium text-ink truncate">{{ user.full_name || user.email }}</div>
                <div class="text-[10.5px] text-ink3 truncate">{{ user.email }}</div>
              </div>
              <button
                (click)="logout()"
                class="w-full flex items-center gap-2 px-3 py-2 text-[12.5px] text-bad hover:bg-bad/10 transition-colors"
              >
                <app-icon name="x" className="w-3.5 h-3.5"></app-icon>
                Sign out
              </button>
            </div>
          }
        </div>
      }

      <!-- nav -->
      <nav class="mt-3 px-2 flex-1 overflow-y-auto">
        <div class="px-2 pb-1.5 text-[10px] font-semibold tracking-[0.12em] text-ink3 uppercase">ML Lifecycle</div>
        @for (n of nav; track n.route) {
          <a
            [routerLink]="n.route"
            routerLinkActive
            #rla="routerLinkActive"
            (click)="mobileNav.close()"
            class="relative w-full h-8 px-2 rounded-md flex items-center gap-2.5 text-[13px] transition-colors duration-150"
            [class]="rla.isActive ? 'bg-cyan3/10 text-ink' : 'text-ink2 hover:text-ink hover:bg-white/[0.03]'"
          >
            <app-icon [name]="n.icon" [className]="'w-[15px] h-[15px] ' + (rla.isActive ? 'text-cyan3' : 'text-ink3')"></app-icon>
            <span class="flex-1 text-left">{{ n.label }}</span>
            @if (n.badge != null) {
              <span [class]="'mono text-[10px] px-1.5 py-[1px] rounded ' + (n.badgeTone === 'cyan' ? 'bg-cyan3/15 text-cyan2' : 'bg-white/5 text-ink3')">{{ n.badge }}</span>
            }
            @if (rla.isActive) {
              <span class="absolute -left-2 w-[2px] h-5 bg-cyan3 rounded-r"></span>
            }
          </a>
        }

        <div class="px-2 pt-5 pb-1.5 text-[10px] font-semibold tracking-[0.12em] text-ink3 uppercase">Data &amp; Platform</div>
        @for (s of subNav; track s.route) {
          <a
            [routerLink]="s.route"
            routerLinkActive
            #srla="routerLinkActive"
            (click)="mobileNav.close()"
            class="w-full h-8 px-2 rounded-md flex items-center gap-2.5 text-[13px] transition-colors duration-150"
            [class]="srla.isActive ? 'bg-cyan3/10 text-ink' : 'text-ink2 hover:text-ink hover:bg-white/[0.03]'"
          >
            <span class="w-[15px] h-[15px] flex items-center justify-center">
              <span [class]="'w-1 h-1 rounded-full ' + (srla.isActive ? 'bg-cyan3' : 'bg-ink3')"></span>
            </span>
            <span class="flex-1 text-left">{{ s.label }}</span>
            @if (srla.isActive) {
              <span class="absolute -left-2 w-[2px] h-5 bg-cyan3 rounded-r"></span>
            }
          </a>
        }
      </nav>

      <!-- cluster footer -->
      <div class="m-3 p-2.5 rounded-md bg-raised/50 border border-white/5">
        <div class="flex items-center justify-between mb-2">
          <div class="text-[11px] text-ink2 flex items-center gap-1.5">
            <span class="w-1.5 h-1.5 rounded-full bg-good"></span> Cluster — nominal
          </div>
          <span class="mono text-[10px] text-ink3">4/6 nodes</span>
        </div>
        <div class="grid grid-cols-3 gap-1.5">
          @for (r of resources; track r.label) {
            <div>
              <div class="flex items-center justify-between mb-1">
                <span class="mono text-[9px] text-ink3">{{ r.label }}</span>
                <span class="mono text-[10px] text-ink">{{ r.value }}</span>
              </div>
              <div class="h-1 rounded-full bg-white/5 overflow-hidden">
                <div class="h-full rounded-full" [style.width.%]="r.pct" [style.background]="r.color" [style.opacity]="0.8"></div>
              </div>
            </div>
          }
        </div>
      </div>
    </aside>
  `,
})
export class SidebarComponent implements OnInit, OnDestroy {
  private authService = inject(AuthService);
  protected mobileNav = inject(MobileNavService);
  private sub?: Subscription;

  userMenuOpen = false;
  user: User | null = null;

  ngOnInit(): void {
    this.sub = this.authService.currentUser$.subscribe(u => (this.user = u));
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  @HostListener('document:click')
  onDocClick(): void {
    this.userMenuOpen = false;
  }

  logout(): void {
    this.userMenuOpen = false;
    this.authService.logout();
  }

  initial(name: string): string {
    return (name || 'U').charAt(0).toUpperCase();
  }

  nav: NavItem[] = [
    { route: '/dashboard',   label: 'Dashboard',   icon: 'dashboard' },
    { route: '/projects',    label: 'Projects',    icon: 'projects' },
    { route: '/experiments', label: 'Experiments', icon: 'beaker'   },
    { route: '/pipelines',   label: 'Pipelines',   icon: 'pipeline' },
    { route: '/models',      label: 'Models',      icon: 'model'    },
    { route: '/deployments', label: 'Deployments', icon: 'rocket'   },
  ];

  subNav: SubNavItem[] = [
    { label: 'Feature Store', route: '/features' },
    { label: 'Datasets',      route: '/datasets' },
    { label: 'Artifacts',     route: '/artifacts' },
    { label: 'Monitoring',    route: '/monitoring' },
  ];

  resources: ResourceMini[] = [
    { label: 'CPU', value: '38%', color: '#42C2FF', pct: 38 },
    { label: 'GPU', value: '71%', color: '#85F4FF', pct: 71 },
    { label: 'MEM', value: '54%', color: '#B8FFF9', pct: 54 },
  ];
}
