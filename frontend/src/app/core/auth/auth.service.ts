import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { TokenService } from './token.service';
import { User, TokenResponse, LoginRequest, SignupRequest } from '../models/user.model';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private tokenService = inject(TokenService);

  private currentUserSubject = new BehaviorSubject<User | null>(null);
  currentUser$ = this.currentUserSubject.asObservable();

  private apiUrl = environment.apiBaseUrl;

  signup(data: SignupRequest): Observable<TokenResponse> {
    return this.http.post<TokenResponse>(`${this.apiUrl}/auth/signup`, data).pipe(
      tap((res) => {
        this.tokenService.setTokens(res.access_token, res.refresh_token);
        this.loadCurrentUser();
      })
    );
  }

  login(data: LoginRequest): Observable<TokenResponse> {
    return this.http.post<TokenResponse>(`${this.apiUrl}/auth/login`, data).pipe(
      tap((res) => {
        this.tokenService.setTokens(res.access_token, res.refresh_token);
        this.loadCurrentUser();
      })
    );
  }

  logout(): void {
    this.tokenService.clearTokens();
    this.currentUserSubject.next(null);
    this.router.navigate(['/login']);
  }

  loadCurrentUser(): void {
    if (!this.tokenService.isLoggedIn()) return;
    this.http.get<User>(`${this.apiUrl}/auth/me`).subscribe({
      next: (user) => this.currentUserSubject.next(user),
      error: () => this.logout(),
    });
  }

  get currentUser(): User | null {
    return this.currentUserSubject.value;
  }
}
