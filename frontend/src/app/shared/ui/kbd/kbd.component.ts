import { Component } from '@angular/core';

@Component({
  selector: 'app-kbd',
  standalone: true,
  template: `<kbd class="mono text-[10px] px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-ink2"><ng-content></ng-content></kbd>`,
})
export class KbdComponent {}
