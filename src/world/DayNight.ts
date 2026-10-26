import { CONFIG } from '../data/config';
import { smoothstep } from '../core/math';

export type DayPhase = 'dawn' | 'day' | 'dusk' | 'night';

/** Minutes after midnight when the cycle starts (first light). */
const CYCLE_START_MINUTES = 5 * 60;

/** The run's clock: one real second is one game minute, starting at first light. */
export class DayNight {
  /** Seconds into the current cycle. */
  time: number = CONFIG.dayNight.start;
  /** Days survived so far (starts at 1). */
  day = 1;

  update(dt: number): void {
    this.time += dt;
    const { cycle } = CONFIG.dayNight;
    while (this.time >= cycle) {
      this.time -= cycle;
      this.day++;
    }
  }

  /** Debug: jump to where a phase looks most like itself (day count moves forward if that means wrapping). */
  skipTo(phase: DayPhase): void {
    const { dawn, day, dusk } = CONFIG.dayNight;
    const at = { dawn: dawn * 0.65, day: dawn + 1, dusk: dawn + day + dusk * 0.35, night: dawn + day + dusk + 1 }[phase];
    if (at < this.time) this.day++;
    this.time = at;
  }

  get phase(): DayPhase {
    const { dawn, day, dusk } = CONFIG.dayNight;
    if (this.time < dawn) return 'dawn';
    if (this.time < dawn + day) return 'day';
    if (this.time < dawn + day + dusk) return 'dusk';
    return 'night';
  }

  /** 1 in full day, 0 at night, easing through dawn and dusk. */
  get daylight(): number {
    const { dawn, day, dusk } = CONFIG.dayNight;
    const t = this.time;
    if (t < dawn) return smoothstep(0, dawn, t);
    if (t < dawn + day) return 1;
    if (t < dawn + day + dusk) return 1 - smoothstep(dawn + day, dawn + day + dusk, t);
    return 0;
  }

  get night(): number {
    return 1 - this.daylight;
  }

  /** 0..1 strength of the low, warm dawn/dusk light; peaks while it's still fairly bright (daylight ≈ 0.6). */
  get twilight(): number {
    const p = this.phase;
    if (p !== 'dawn' && p !== 'dusk') return 0;
    return Math.sin(Math.pow(this.daylight, 1.36) * Math.PI);
  }

  /** 0 at sunrise, 1 at sunset; how far the sun has crossed the sky. */
  get sunProgress(): number {
    const { dawn, day, dusk } = CONFIG.dayNight;
    return Math.min(1, Math.max(0, (this.time - dawn * 0.5) / (day + dawn * 0.5 + dusk * 0.5)));
  }

  /** "07:30" style clock. */
  get clock(): string {
    const minutes = Math.floor(CYCLE_START_MINUTES + this.time) % (24 * 60);
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  }
}
