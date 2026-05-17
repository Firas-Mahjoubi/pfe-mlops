import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SidebarComponent } from '../../components/sidebar/sidebar.component';
import { TopbarComponent } from '../../components/topbar/topbar.component';
import { MobileNavService } from '../../../core/services/mobile-nav.service';

@Component({
  selector: 'app-dashboard-layout',
  standalone: true,
  imports: [RouterOutlet, SidebarComponent, TopbarComponent],
  template: `
    <div class="flex min-h-screen bg-bg">
      <app-sidebar />
      @if (nav.isOpen()) {
        <button
          type="button"
          class="fixed inset-0 z-30 bg-black/50 md:hidden"
          (click)="nav.close()"
          aria-label="Close menu"
        ></button>
      }
      <div class="flex-1 flex flex-col min-w-0 md:ml-[232px]">
        <app-topbar />
        <main class="flex-1 min-w-0">
          <router-outlet />
          <div class="h-8"></div>
        </main>
      </div>
    </div>
  `,
})
export class DashboardLayoutComponent {
  protected nav = inject(MobileNavService);
}
