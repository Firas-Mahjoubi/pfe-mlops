import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { RouterLink, Router } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { LogoComponent } from '../../../shared/ui/logo/logo.component';
import { BtnComponent } from '../../../shared/ui/btn/btn.component';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, LogoComponent, BtnComponent],
  template: `
    <div class="min-h-screen grid grid-cols-1 md:grid-cols-2 bg-bg">
      <!-- brand side -->
      <div class="hidden md:flex flex-col justify-between p-10 bg-gradient-to-br from-[#0F1420] via-[#141B2A] to-[#1B2438] border-r border-line">
        <div class="flex items-center gap-2">
          <app-logo className="w-7 h-7"></app-logo>
          <span class="text-[17px] font-semibold tracking-tight">MLOps</span>
        </div>
        <div>
          <h2 class="text-[28px] font-semibold tracking-tight leading-tight">Ship ML to production with confidence.</h2>
          <p class="text-[13px] text-ink3 mt-3 max-w-md">Track experiments, version models, deploy with one click. Built on MLflow, Kubeflow and Pipelines.</p>
          <div class="mt-6 flex items-center gap-3">
            <span class="mono text-[11px] text-cyan3">● tracking</span>
            <span class="mono text-[11px] text-cyan2">● pipelines</span>
            <span class="mono text-[11px] text-cyan1">● serving</span>
          </div>
        </div>
        <div class="text-[11px] text-ink3 mono">V1</div>
      </div>

      <!-- form side -->
      <div class="flex items-center justify-center px-6 py-12">
        <div class="w-full max-w-sm">
          <div class="md:hidden flex items-center gap-2 mb-6">
            <app-logo className="w-6 h-6"></app-logo>
            <span class="font-semibold tracking-tight">MLOps</span>
          </div>
          <h1 class="text-[22px] font-semibold tracking-tight">Sign in</h1>
          <p class="text-[12.5px] text-ink3 mt-1">Welcome back. Enter your credentials to continue.</p>

          @if (errorMessage) {
            <div class="mt-5 px-3 py-2 rounded-md bg-bad/10 border border-bad/20 text-bad text-[12px]">
              {{ errorMessage }}
            </div>
          }

          <form [formGroup]="form" (ngSubmit)="onSubmit()" class="mt-5 space-y-3.5">
            <div>
              <label class="block text-[11.5px] text-ink2 mb-1.5">Email</label>
              <input
                type="email"
                formControlName="email"
                placeholder="you@example.com"
                class="w-full h-9 px-3 rounded-md bg-bg/60 border border-white/10 hover:border-white/20 focus:border-cyan3/40 focus-cyan text-[12.5px] text-ink outline-none placeholder:text-ink3"
              />
            </div>
            <div>
              <label class="block text-[11.5px] text-ink2 mb-1.5">Password</label>
              <input
                type="password"
                formControlName="password"
                placeholder="••••••••"
                class="w-full h-9 px-3 rounded-md bg-bg/60 border border-white/10 hover:border-white/20 focus:border-cyan3/40 focus-cyan mono text-[12.5px] text-ink outline-none placeholder:text-ink3"
              />
            </div>

            <app-btn type="submit" variant="primary" size="lg" [disabled]="form.invalid || loading" className="w-full justify-center mt-2">
              {{ loading ? 'Signing in…' : 'Sign in' }}
            </app-btn>
          </form>

          <p class="mt-6 text-center text-[12px] text-ink3">
            Don't have an account?
            <a routerLink="/signup" class="text-cyan3 hover:text-cyan2 font-medium">Sign up</a>
          </p>
        </div>
      </div>
    </div>
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
