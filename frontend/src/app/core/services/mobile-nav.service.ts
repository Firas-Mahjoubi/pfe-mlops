import { Injectable, signal } from '@angular/core';

/**
 * Shared state for the mobile slide-in navigation drawer. The sidebar reads
 * `isOpen()` to decide whether to translate itself on-canvas; the topbar's
 * hamburger button calls `toggle()`; the layout shell renders a backdrop
 * when open and calls `close()` on backdrop tap.
 */
@Injectable({ providedIn: 'root' })
export class MobileNavService {
  readonly isOpen = signal(false);

  open(): void {
    this.isOpen.set(true);
  }

  close(): void {
    this.isOpen.set(false);
  }

  toggle(): void {
    this.isOpen.update(v => !v);
  }
}
