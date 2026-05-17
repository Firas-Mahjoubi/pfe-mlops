import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router } from '@angular/router';
import { Subscription, filter } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { MobileNavService } from '../../../core/services/mobile-nav.service';
import { ThemeService } from '../../../core/services/theme.service';
import { IconComponent } from '../../ui/icon/icon.component';
import { KbdComponent } from '../../ui/kbd/kbd.component';

interface Crumb { label: string; url?: string; active?: boolean; }

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [CommonModule, IconComponent, KbdComponent],
  template: `
    <div class="h-12 shrink-0 bg-bg hairline flex items-center px-4 gap-4 sticky top-0 z-30">
      <!-- mobile menu hamburger (hidden on md+ where the sidebar is always visible) -->
      <button
        type="button"
        class="md:hidden h-9 w-9 -ml-1 flex items-center justify-center rounded hover:bg-white/5 text-ink2"
        (click)="mobileNav.toggle()"
        aria-label="Open menu"
      >
        <app-icon name="menu" className="w-5 h-5"></app-icon>
      </button>

      <!-- breadcrumbs -->
      <div class="flex items-center gap-2 text-[13px] min-w-0">
        @for (c of crumbs; track $index; let i = $index) {
          @if (i > 0) {
            <app-icon name="chevron" className="w-3 h-3 text-ink3 shrink-0"></app-icon>
          }
          <button
            (click)="navigate(c)"
            [class]="'truncate ' + (c.active ? 'text-ink' : 'text-ink2 hover:text-ink')"
          >{{ c.label }}</button>
        }
      </div>

      <!-- search -->
      <div class="flex-1 max-w-[520px] mx-auto">
        <button class="w-full h-8 px-2.5 rounded-md bg-raised/60 border border-white/5 hover:border-white/10 flex items-center gap-2 text-ink3 hover:text-ink2 transition-colors">
          <app-icon name="search" className="w-3.5 h-3.5"></app-icon>
          <span class="text-[12.5px]">Search projects, runs, models…</span>
          <div class="ml-auto flex items-center gap-1">
            <app-kbd>⌘</app-kbd><app-kbd>K</app-kbd>
          </div>
        </button>
      </div>

      <div class="flex items-center gap-1.5">
        <button class="inline-flex items-center gap-1.5 h-7 px-2.5 text-[12px] rounded-md bg-transparent text-ink2 hover:text-ink hover:bg-white/5 transition-colors">
          <app-icon name="plus" className="w-3.5 h-3.5"></app-icon>New
        </button>
        <button class="inline-flex items-center gap-1.5 h-7 px-2.5 text-[12px] rounded-md bg-transparent text-ink2 hover:text-ink hover:bg-white/5 transition-colors">
          <app-icon name="bell" className="w-3.5 h-3.5"></app-icon>
          <span class="w-1.5 h-1.5 rounded-full bg-cyan3 -ml-1 mr-0.5"></span>
        </button>
        <button class="inline-flex items-center gap-1.5 h-7 px-2.5 text-[12px] rounded-md bg-transparent text-ink2 hover:text-ink hover:bg-white/5 transition-colors">
          <app-icon name="help" className="w-3.5 h-3.5"></app-icon>
        </button>
        <button
          (click)="themeService.toggle()"
          class="inline-flex items-center gap-1.5 h-7 px-2.5 text-[12px] rounded-md bg-transparent text-ink2 hover:text-ink hover:bg-white/5 transition-colors"
          [title]="themeService.isDark() ? 'Switch to light mode' : 'Switch to dark mode'"
        >
          <app-icon [name]="themeService.isDark() ? 'sun' : 'moon'" className="w-3.5 h-3.5"></app-icon>
        </button>
        <div class="w-px h-5 bg-white/10 mx-1.5"></div>
        @if (authService.currentUser$ | async; as user) {
          <div class="flex items-center gap-2">
            <div class="w-7 h-7 rounded-full bg-gradient-to-br from-cyan3 to-violet text-[#06121A] text-[11px] font-bold flex items-center justify-center">{{ initial(user.full_name || user.email) }}</div>
            <div class="text-[12px] leading-tight hidden md:block">
              <div class="text-ink">{{ user.full_name || user.email }}</div>
              <div class="text-ink3 text-[10.5px]">Member</div>
            </div>
            <button
              (click)="authService.logout()"
              class="ml-1 text-[11px] text-ink3 hover:text-ink transition-colors"
              title="Logout"
            >⎋</button>
          </div>
        }
      </div>
    </div>
  `,
})
export class TopbarComponent implements OnInit, OnDestroy {
  authService = inject(AuthService);
  themeService = inject(ThemeService);
  protected mobileNav = inject(MobileNavService);
  private router = inject(Router);
  private sub?: Subscription;

  crumbs: Crumb[] = [{ label: 'Acme ML', active: true }];

  ngOnInit(): void {
    this.updateCrumbs(this.router.url);
    this.sub = this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(e => this.updateCrumbs(e.urlAfterRedirects));
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  private updateCrumbs(url: string): void {
    const titles: Record<string, string> = {
      dashboard: 'Dashboard',
      projects: 'Projects',
      experiments: 'Experiments',
      pipelines: 'Pipelines',
      models: 'Model Registry',
      deployments: 'Deployments',
      runs: 'Runs',
    };
    const parts = url.split('?')[0].split('/').filter(Boolean);
    const out: Crumb[] = [{ label: 'Acme ML', url: '/dashboard' }];

    if (parts.length === 0) {
      out[0].active = true;
    } else {
      const section = parts[0];
      const sectionLabel = titles[section] || section;
      if (parts.length === 1) {
        out.push({ label: sectionLabel, active: true });
      } else {
        out.push({ label: sectionLabel, url: '/' + section });
        out.push({ label: decodeURIComponent(parts.slice(1).join(' / ')), active: true });
      }
    }
    this.crumbs = out;
  }

  navigate(c: Crumb): void {
    if (c.url && !c.active) this.router.navigateByUrl(c.url);
  }

  initial(name: string): string {
    return (name || 'U').charAt(0).toUpperCase();
  }
}
