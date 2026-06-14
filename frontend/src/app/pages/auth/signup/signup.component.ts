import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { RouterLink, Router } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { AuthLayoutComponent } from '../../../shared/layouts/auth-layout/auth-layout.component';
import { BtnComponent } from '../../../shared/ui/btn/btn.component';
import { IconComponent } from '../../../shared/ui/icon/icon.component';

@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, AuthLayoutComponent, BtnComponent, IconComponent],
  template: `
    <app-auth-layout>
      <ng-container brand-headline>
        <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cyan3/10 border border-cyan3/20 text-[10.5px] font-medium text-cyan2 tracking-wide uppercase">
          <span class="w-1.5 h-1.5 rounded-full bg-cyan3 animate-pulse"></span>
          Get started free
        </span>
        <h2 class="text-[28px] font-semibold tracking-tight leading-tight mt-4">From notebook to production, in minutes.</h2>
        <p class="text-[13px] text-ink3 mt-3 max-w-md leading-relaxed">
          Upload your code, run it on the cluster, and watch metrics, models, and
          deployments come together, with zero-config MLflow autolog and KServe
          inference.
        </p>
      </ng-container>

      <h1 class="text-[22px] font-semibold tracking-tight">Create your account</h1>
      <p class="text-[12.5px] text-ink3 mt-1">Spin up your workspace in seconds.</p>

      @if (errorMessage) {
        <div class="mt-5 px-3 py-2 rounded-md bg-bad/10 border border-bad/20 text-bad text-[12px] flex items-start gap-2">
          <app-icon name="warn" className="w-3.5 h-3.5 mt-0.5 shrink-0"></app-icon>
          <span>{{ errorMessage }}</span>
        </div>
      }

      <form [formGroup]="form" (ngSubmit)="onSubmit()" class="mt-5 space-y-3.5">
        <!-- Full name -->
        <div>
          <label class="block text-[11.5px] text-ink2 mb-1.5">Full name</label>
          <div class="relative">
            <app-icon name="projects" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink3 pointer-events-none"></app-icon>
            <input
              type="text"
              formControlName="full_name"
              placeholder="Jane Doe"
              autocomplete="name"
              class="w-full h-10 pl-9 pr-3 rounded-md bg-bg/60 border border-white/10 hover:border-white/20 focus:border-cyan3/40 focus-cyan text-[12.5px] text-ink outline-none placeholder:text-ink3 transition-colors"
            />
          </div>
        </div>

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

        <!-- Password -->
        <div>
          <label class="block text-[11.5px] text-ink2 mb-1.5">Password</label>
          <div class="relative">
            <app-icon name="lock" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink3 pointer-events-none"></app-icon>
            <input
              [type]="showPassword ? 'text' : 'password'"
              formControlName="password"
              placeholder="At least 6 characters"
              autocomplete="new-password"
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

        <!-- Confirm password -->
        <div>
          <label class="block text-[11.5px] text-ink2 mb-1.5">Confirm password</label>
          <div class="relative">
            <app-icon name="lock" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink3 pointer-events-none"></app-icon>
            <input
              [type]="showConfirm ? 'text' : 'password'"
              formControlName="confirmPassword"
              placeholder="••••••••"
              autocomplete="new-password"
              class="w-full h-10 pl-9 pr-10 rounded-md bg-bg/60 border border-white/10 hover:border-white/20 focus:border-cyan3/40 focus-cyan mono text-[12.5px] text-ink outline-none placeholder:text-ink3 transition-colors"
            />
            <button
              type="button"
              (click)="showConfirm = !showConfirm"
              tabindex="-1"
              class="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded text-ink3 hover:text-ink hover:bg-white/5 transition-colors"
              [attr.aria-label]="showConfirm ? 'Hide password' : 'Show password'"
            >
              <app-icon [name]="showConfirm ? 'eyeOff' : 'eye'" className="w-4 h-4"></app-icon>
            </button>
          </div>
          @if (form.hasError('passwordMismatch') && form.get('confirmPassword')?.touched) {
            <p class="text-bad text-[11px] mt-1">Passwords do not match</p>
          }
        </div>

        <app-btn type="submit" variant="primary" size="lg" [disabled]="form.invalid || loading" className="w-full justify-center mt-2">
          @if (loading) {
            <svg class="animate-spin w-3.5 h-3.5 mr-2" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-opacity="0.25" stroke-width="3"/>
              <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
            </svg>
            Creating account…
          } @else {
            Create account
          }
        </app-btn>

        <p class="text-center text-[11px] text-ink3 flex items-center justify-center gap-1.5">
          <app-icon name="lock" className="w-3 h-3 text-ink3"></app-icon>
          No credit card needed. Your workspace is ready instantly.
        </p>
      </form>

      <p class="mt-5 text-center text-[12px] text-ink3">
        Already have an account?
        <a routerLink="/login" class="text-cyan3 hover:text-cyan2 font-medium">Sign in</a>
      </p>
    </app-auth-layout>
  `,
})
export class SignupComponent {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);

  form: FormGroup = this.fb.group(
    {
      full_name: ['', [Validators.required]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: this.passwordMatchValidator }
  );

  loading = false;
  errorMessage = '';
  showPassword = false;
  showConfirm = false;

  passwordMatchValidator(group: FormGroup): { [key: string]: boolean } | null {
    const password = group.get('password')?.value;
    const confirm = group.get('confirmPassword')?.value;
    return password === confirm ? null : { passwordMismatch: true };
  }

  onSubmit(): void {
    if (this.form.invalid) return;
    this.loading = true;
    this.errorMessage = '';

    const { confirmPassword, ...data } = this.form.value;
    this.authService.signup(data).subscribe({
      next: () => {
        this.router.navigate(['/dashboard']);
      },
      error: (err) => {
        this.loading = false;
        this.errorMessage =
          err.error?.detail ||
          (err.status === 0
            ? 'Cannot reach the server. Check your connection and try again.'
            : 'We could not create your account. Please try again.');
      },
    });
  }
}
