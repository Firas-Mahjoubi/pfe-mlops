import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from './auth.service';

/** Allows only authenticated administrators; others are sent to /dashboard. */
export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.ensureCurrentUser().pipe(
    map((u) => (u && u.role === 'admin' ? true : router.createUrlTree(['/dashboard']))),
  );
};
