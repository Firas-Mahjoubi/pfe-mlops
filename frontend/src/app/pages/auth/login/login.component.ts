import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { RouterLink, Router } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { AuthLayoutComponent } from '../../../shared/layouts/auth-layout/auth-layout.component';
import { BtnComponent } from '../../../shared/ui/btn/btn.component';
import { IconComponent } from '../../../shared/ui/icon/icon.component';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, AuthLayoutComponent, BtnComponent, IconComponent],
  template: `
    <app-auth-layout>
      <!-- Brand-pane headline (slotted) -->
      <ng-container brand-headline>
        <h2 class="text-[28px] font-semibold tracking-tight leading-tight">Ship ML to production with confidence.</h2>
        <p class="text-[13px] text-ink3 mt-3 max-w-md">
          Track experiments, version models, deploy with one click. Built on MLflow,
          Kubeflow, and Pipelines.
        </p>
      </ng-container>

      <!-- Form -->
      <h1 class="text-[22px] font-semibold tracking-tight">Sign in</h1>
      <p class="text-[12.5px] text-ink3 mt-1">Welcome back. Enter your credentials to continue.</p>

      @if (errorMessage) {
        <div class="mt-5 px-3 py-2 rounded-md bg-bad/10 border border-bad/20 text-bad text-[12px] flex items-start gap-2">
          <app-icon name="warn" className="w-3.5 h-3.5 mt-0.5 shrink-0"></app-icon>
          <span>{{ errorMessage }}</span>
        </div>
      }

      <form [formGroup]="form" (ngSubmit)="onSubmit()" class="mt-5 space-y-3.5">
        <!-- Email -->
        <div>
          <label class="block text-[11.5px] text-ink2 mb-1.5">Email</label>
          <div class="relative">
            <app-icon name="mail" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink3 pointer-events-none"></app-icon>
            <input
              type="email"
              formControlName="email"
              placeholder="you@example.com"
              autocomplete="email"
              class="w-full h-10 pl-9 pr-3 rounded-md bg-bg/60 border border-white/10 hover:border-white/20 focus:border-cyan3/40 focus-cyan text-[12.5px] text-ink outline-none placeholder:text-ink3 transition-colors"
            />
          </div>
        </div>

        <!-- Password + show/hide toggle + forgot link -->
        <div>
          <div class="flex items-center justify-between mb-1.5">
            <label class="block text-[11.5px] text-ink2">Password</label>
            <a href="#" (click)="$event.preventDefault()" class="text-[11px] text-cyan3 hover:text-cyan2 transition-colors">Forgot password?</a>
          </div>
          <div class="relative">
            <app-icon name="lock" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink3 pointer-events-none"></app-icon>
            <input
              [type]="showPassword ? 'text' : 'password'"
              formControlName="password"
              placeholder="••••••••"
              autocomplete="current-password"
              class="w-full h-10 pl-9 pr-10 rounded-md bg-bg/60 border border-white/10 hover:border-white/20 focus:border-cyan3/40 focus-cyan mono text-[12.5px] text-ink outline-none placeholder:text-ink3 transition-colors"
            />
            <button
              type="button"
              (click)="showPassword = !showPassword"
              tabindex="-1"
              class="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded text-ink3 hover:text-ink hover:bg-white/5 transition-colors"
              [attr.aria-label]="showPassword ? 'Hide password' : 'Show password'"
            >
              <app-icon [name]="showPassword ? 'eyeOff' : 'eye'" className="w-4 h-4"></app-icon>
            </button>
          </div>
        </div>

        <app-btn type="submit" variant="primary" size="lg" [disabled]="form.invalid || loading" className="w-full justify-center mt-2">
          @if (loading) {
            <svg class="animate-spin w-3.5 h-3.5 mr-2" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-opacity="0.25" stroke-width="3"/>
              <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
            </svg>
            Signing in…
          } @else {
            Sign in
          }
        </app-btn>
      </form>

      <p class="mt-6 text-center text-[12px] text-ink3">
        Don't have an account?
        <a routerLink="/signup" class="text-cyan3 hover:text-cyan2 font-medium">Sign up</a>
      </p>
    </app-auth-layout>
  `,
})
export class LoginComponent {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);

  form: FormGroup = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  loading = false;
  errorMessage = '';
  showPassword = false;

  onSubmit(): void {
    if (this.form.invalid) return;
    this.loading = true;
    this.errorMessage = '';

    this.authService.login(this.form.value).subscribe({
      next: () => {
        this.router.navigate(['/dashboard']);
      },
      error: (err) => {
        this.loading = false;
        this.errorMessage = err.error?.detail || 'Login failed. Please try again.';
      },
    });
  }
}
