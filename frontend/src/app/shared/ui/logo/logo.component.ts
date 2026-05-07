import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-logo',
  standalone: true,
  template: `
    <svg viewBox="0 0 24 24" [class]="className" fill="none">
      <path d="M3 7l9-4 9 4-9 4-9-4z"  stroke="#42C2FF" stroke-width="1.5" stroke-linejoin="round"/>
      <path d="M3 12l9 4 9-4" stroke="#85F4FF" stroke-width="1.5" stroke-linejoin="round" opacity="0.75"/>
      <path d="M3 17l9 4 9-4" stroke="#B8FFF9" stroke-width="1.5" stroke-linejoin="round" opacity="0.5"/>
    </svg>
  `,
})
export class LogoComponent {
  @Input() className: string = 'w-5 h-5';
}
