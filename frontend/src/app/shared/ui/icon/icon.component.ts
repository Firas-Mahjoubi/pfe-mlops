import { Component, Input } from '@angular/core';

export type IconName =
  | 'dashboard' | 'projects' | 'beaker' | 'pipeline' | 'model' | 'rocket'
  | 'search' | 'plus' | 'bell' | 'chevron' | 'chevronDown' | 'chevronLeft'
  | 'dot' | 'play' | 'stop' | 'refresh' | 'logs' | 'upload' | 'file' | 'folder'
  | 'command' | 'gear' | 'help' | 'gitBranch' | 'cpu' | 'activity' | 'zap'
  | 'check' | 'x' | 'warn' | 'filter' | 'sort' | 'kebab' | 'terminal'
  | 'sun' | 'moon';

@Component({
  selector: 'app-icon',
  standalone: true,
  template: `
    <svg
      [attr.viewBox]="'0 0 24 24'"
      fill="none"
      stroke="currentColor"
      [attr.stroke-width]="stroke"
      stroke-linecap="round"
      stroke-linejoin="round"
      [class]="className"
    >
      @switch (name) {
        @case ('dashboard') { <g><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></g> }
        @case ('projects')  { <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/> }
        @case ('beaker')    { <g><path d="M10 3h4"/><path d="M10 3v6L4 19a2 2 0 0 0 1.73 3h12.54A2 2 0 0 0 20 19l-6-10V3"/><path d="M7 14h10"/></g> }
        @case ('pipeline')  { <g><circle cx="5" cy="6" r="2"/><circle cx="5" cy="18" r="2"/><circle cx="19" cy="12" r="2"/><path d="M7 6h4a4 4 0 0 1 4 4v.2"/><path d="M7 18h4a4 4 0 0 0 4-4v-.2"/></g> }
        @case ('model')     { <g><path d="M12 2l9 5-9 5-9-5 9-5z"/><path d="M3 12l9 5 9-5"/><path d="M3 17l9 5 9-5"/></g> }
        @case ('rocket')    { <g><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></g> }
        @case ('search')    { <g><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></g> }
        @case ('plus')      { <g><path d="M12 5v14"/><path d="M5 12h14"/></g> }
        @case ('bell')      { <g><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21a2 2 0 0 0 4 0"/></g> }
        @case ('chevron')   { <path d="m9 6 6 6-6 6"/> }
        @case ('chevronDown') { <path d="m6 9 6 6 6-6"/> }
        @case ('chevronLeft') { <path d="m15 18-6-6 6-6"/> }
        @case ('dot')       { <circle cx="12" cy="12" r="3"/> }
        @case ('play')      { <polygon points="6 3 20 12 6 21 6 3"/> }
        @case ('stop')      { <rect x="5" y="5" width="14" height="14" rx="1"/> }
        @case ('refresh')   { <g><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></g> }
        @case ('logs')      { <g><path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h10"/></g> }
        @case ('upload')    { <g><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/></g> }
        @case ('file')      { <g><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></g> }
        @case ('folder')    { <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/> }
        @case ('command')   { <path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z"/> }
        @case ('gear')      { <g><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></g> }
        @case ('help')      { <g><circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></g> }
        @case ('gitBranch') { <g><circle cx="6" cy="3" r="2"/><circle cx="6" cy="21" r="2"/><circle cx="18" cy="12" r="2"/><path d="M6 5v14"/><path d="M18 10V9a4 4 0 0 0-4-4H8"/></g> }
        @case ('cpu')       { <g><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3"/><path d="M15 1v3"/><path d="M9 20v3"/><path d="M15 20v3"/><path d="M20 9h3"/><path d="M20 14h3"/><path d="M1 9h3"/><path d="M1 14h3"/></g> }
        @case ('activity')  { <path d="M22 12h-4l-3 9L9 3l-3 9H2"/> }
        @case ('zap')       { <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/> }
        @case ('check')     { <path d="M20 6 9 17l-5-5"/> }
        @case ('x')         { <g><path d="M18 6 6 18"/><path d="m6 6 12 12"/></g> }
        @case ('warn')      { <g><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.3 3.86a2 2 0 0 1 3.4 0l8.17 14.14A2 2 0 0 1 20.17 21H3.83a2 2 0 0 1-1.7-3L10.3 3.86z"/></g> }
        @case ('filter')    { <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/> }
        @case ('sort')      { <g><path d="M3 6h13"/><path d="M3 12h9"/><path d="M3 18h5"/><path d="m16 18 4-4 4 4"/><path d="M20 14v7"/></g> }
        @case ('kebab')     { <g><circle cx="12" cy="6" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="18" r="1"/></g> }
        @case ('terminal')  { <g><path d="m4 17 6-6-6-6"/><path d="M12 19h8"/></g> }
        @case ('sun')       { <g><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></g> }
        @case ('moon')      { <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/> }
      }
    </svg>
  `,
})
export class IconComponent {
  @Input() name!: IconName;
  @Input() className: string = 'w-4 h-4';
  @Input() stroke: number = 1.75;
}
