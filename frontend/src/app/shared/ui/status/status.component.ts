import { Component, Input } from '@angular/core';

export type StatusKey =
  | 'running' | 'queued' | 'success' | 'failed' | 'canceled'
  | 'healthy' | 'degraded' | 'stopped'
  | 'active' | 'idle' | 'archived'
  | 'production' | 'staging';

interface StatusStyle {
  bg: string;
  text: string;
  ring: string;
  dot: string;
  label: string;
}

@Component({
  selector: 'app-status',
  standalone: true,
  template: `
    <span [class]="wrapperClasses">
      <span [class]="'w-1.5 h-1.5 rounded-full ' + style.dot"></span>
      {{ style.label }}
    </span>
  `,
})
export class StatusComponent {
  @Input() s: StatusKey = 'idle';

  private map: Record<StatusKey, StatusStyle> = {
    running:    { bg: 'bg-cyan3/10', text: 'text-cyan3', ring: 'ring-cyan3/30', dot: 'bg-cyan3 animate-pulse', label: 'RUNNING' },
    queued:     { bg: 'bg-white/5',  text: 'text-ink2',  ring: 'ring-white/10', dot: 'bg-ink3', label: 'QUEUED' },
    success:    { bg: 'bg-good/10',  text: 'text-good',  ring: 'ring-good/20',  dot: 'bg-good', label: 'SUCCESS' },
    failed:     { bg: 'bg-bad/10',   text: 'text-bad',   ring: 'ring-bad/20',   dot: 'bg-bad',  label: 'FAILED' },
    canceled:   { bg: 'bg-white/5',  text: 'text-ink3',  ring: 'ring-white/10', dot: 'bg-ink3', label: 'CANCELED' },
    healthy:    { bg: 'bg-good/10',  text: 'text-good',  ring: 'ring-good/20',  dot: 'bg-good', label: 'HEALTHY' },
    degraded:   { bg: 'bg-warn/10',  text: 'text-warn',  ring: 'ring-warn/20',  dot: 'bg-warn animate-pulse', label: 'DEGRADED' },
    stopped:    { bg: 'bg-white/5',  text: 'text-ink3',  ring: 'ring-white/10', dot: 'bg-ink3', label: 'STOPPED' },
    active:     { bg: 'bg-cyan3/10', text: 'text-cyan3', ring: 'ring-cyan3/20', dot: 'bg-cyan3', label: 'ACTIVE' },
    idle:       { bg: 'bg-white/5',  text: 'text-ink2',  ring: 'ring-white/10', dot: 'bg-ink3', label: 'IDLE' },
    archived:   { bg: 'bg-white/5',  text: 'text-ink3',  ring: 'ring-white/10', dot: 'bg-ink3', label: 'ARCHIVED' },
    production: { bg: 'bg-good/10',  text: 'text-good',  ring: 'ring-good/20',  dot: 'bg-good', label: 'PRODUCTION' },
    staging:    { bg: 'bg-cyan3/10', text: 'text-cyan3', ring: 'ring-cyan3/20', dot: 'bg-cyan3', label: 'STAGING' },
  };

  get style(): StatusStyle {
    return this.map[this.s] ?? this.map['idle'];
  }

  get wrapperClasses(): string {
    const c = this.style;
    return `inline-flex items-center gap-1.5 px-1.5 py-[2px] rounded text-[10px] font-semibold tracking-[0.08em] ring-1 ${c.bg} ${c.text} ${c.ring}`;
  }
}
