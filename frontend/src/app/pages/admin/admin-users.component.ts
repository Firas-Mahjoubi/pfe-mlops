import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AdminService, AdminUser } from '../../core/services/admin.service';
import { AuthService } from '../../core/auth/auth.service';
import { ConfirmDialogComponent } from '../../shared/ui/confirm-dialog/confirm-dialog.component';

type Pending = { kind: 'delete' | 'purge'; user: AdminUser } | null;

@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [CommonModule, ConfirmDialogComponent],
  template: `
    <div class="p-4 space-y-4">
      <div>
        <h1 class="text-[22px] font-semibold tracking-tight">Users</h1>
        <p class="text-[12.5px] text-ink3 mt-0.5">Manage accounts, roles, and access across the platform.</p>
      </div>

      @if (loading) {
        <div class="text-ink3 text-[13px] py-10 text-center">Loading users…</div>
      } @else {
        <div class="bg-card border border-line rounded-lg overflow-x-auto">
          <table class="w-full min-w-[760px] text-[13px]">
            <thead>
              <tr class="border-b border-line text-left text-ink3">
                <th class="px-4 py-2.5 font-medium">User</th>
                <th class="px-4 py-2.5 font-medium">Role</th>
                <th class="px-4 py-2.5 font-medium">Status</th>
                <th class="px-4 py-2.5 font-medium text-right">Projects</th>
                <th class="px-4 py-2.5 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-line">
              @for (u of users; track u.id) {
                <tr class="hover:bg-white/[0.02]">
                  <td class="px-4 py-2.5">
                    <div class="text-ink">{{ u.full_name || '—' }} @if (u.id === selfId) { <span class="text-ink3">(you)</span> }</div>
                    <div class="text-[11.5px] text-ink3">{{ u.email }}</div>
                  </td>
                  <td class="px-4 py-2.5">
                    <span [class]="'mono text-[10.5px] px-1.5 py-0.5 rounded ' + (u.role === 'admin' ? 'bg-cyan3/15 text-cyan2' : 'bg-white/5 text-ink3')">{{ u.role }}</span>
                  </td>
                  <td class="px-4 py-2.5">
                    <span [class]="'text-[12px] ' + (u.is_active ? 'text-good' : 'text-ink3')">{{ u.is_active ? 'active' : 'inactive' }}</span>
                  </td>
                  <td class="px-4 py-2.5 text-right mono text-ink2">{{ u.project_count }}</td>
                  <td class="px-4 py-2.5">
                    <div class="flex items-center justify-end gap-2">
                      @if (u.id !== selfId) {
                        <button (click)="toggleRole(u)" class="text-[11.5px] text-ink2 hover:text-cyan3">{{ u.role === 'admin' ? 'Demote' : 'Promote' }}</button>
                        <button (click)="toggleActive(u)" class="text-[11.5px] text-ink2 hover:text-ink">{{ u.is_active ? 'Deactivate' : 'Activate' }}</button>
                        <button (click)="pending = { kind: 'purge', user: u }" class="text-[11.5px] text-ink2 hover:text-amber-400">Purge</button>
                        <button (click)="pending = { kind: 'delete', user: u }" class="text-[11.5px] text-ink2 hover:text-bad">Delete</button>
                      } @else {
                        <span class="text-[11.5px] text-ink3">—</span>
                      }
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>

    @if (pending) {
      <app-confirm-dialog
        [title]="pending.kind === 'delete' ? 'Delete user' : 'Purge user data'"
        [message]="pending.kind === 'delete'
          ? ('Permanently delete ' + pending.user.email + ' and all their projects, runs, and deployments? This cannot be undone.')
          : ('Delete all projects, runs, and deployments owned by ' + pending.user.email + '? The account itself is kept.')"
        [confirmLabel]="pending.kind === 'delete' ? 'Delete user' : 'Purge data'"
        (confirmed)="confirm()"
        (dismissed)="pending = null">
      </app-confirm-dialog>
    }
  `,
})
export class AdminUsersComponent implements OnInit {
  private admin = inject(AdminService);
  private auth = inject(AuthService);

  loading = true;
  users: AdminUser[] = [];
  selfId = '';
  pending: Pending = null;

  ngOnInit(): void {
    this.selfId = this.auth.currentUser?.id ?? '';
    this.load();
  }

  load(): void {
    this.loading = true;
    this.admin.listUsers().subscribe({
      next: (us) => { this.users = us; this.loading = false; },
      error: () => { this.loading = false; },
    });
  }

  toggleRole(u: AdminUser): void {
    this.admin.updateUser(u.id, { role: u.role === 'admin' ? 'user' : 'admin' })
      .subscribe({ next: (updated) => this.replace(updated) });
  }

  toggleActive(u: AdminUser): void {
    this.admin.updateUser(u.id, { is_active: !u.is_active })
      .subscribe({ next: (updated) => this.replace(updated) });
  }

  confirm(): void {
    if (!this.pending) return;
    const { kind, user } = this.pending;
    this.pending = null;
    if (kind === 'delete') {
      this.admin.deleteUser(user.id).subscribe({ next: () => this.load() });
    } else {
      this.admin.purgeUser(user.id).subscribe({ next: () => this.load() });
    }
  }

  private replace(u: AdminUser): void {
    this.users = this.users.map((x) => (x.id === u.id ? u : x));
  }
}
