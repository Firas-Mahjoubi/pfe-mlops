import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SidebarComponent } from '../../components/sidebar/sidebar.component';
import { TopbarComponent } from '../../components/topbar/topbar.component';

@Component({
  selector: 'app-dashboard-layout',
  standalone: true,
  imports: [RouterOutlet, SidebarComponent, TopbarComponent],
  template: `
    <div class="flex min-h-screen bg-bg">
      <app-sidebar />
      <div class="flex-1 flex flex-col min-w-0 ml-[232px]">
        <app-topbar />
        <main class="flex-1 min-w-0">
          <router-outlet />
          <div class="h-8"></div>
        </main>
      </div>
    </div>
  `,
})
export class DashboardLayoutComponent {}
