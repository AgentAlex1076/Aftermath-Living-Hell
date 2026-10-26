const SLOW_MS = 1000 / 50;
const VERY_SLOW_MS = 1000 / 30;
const FAST_MS = 1000 / 57;
const WINDOW_S = 0.75;
const STEP = 0.125;
/** Seconds of headroom needed before trying a sharper image again. */
const CLIMB_AFTER = 3;

/**
 * Picks the 3D render resolution (as a pixel ratio) from recent frame times: drops it when frames
 * run long, and creeps back up once there's headroom. Each window averages its frames minus the
 * slowest tenth, so one-off hitches (chunk streaming) don't blur the picture. A median would not
 * work: a GPU-bound browser queues frames ahead and then stalls, so most frames look fast.
 */
export class AdaptiveResolution {
  readonly max: number;
  readonly min: number;
  current: number;
  private readonly samples: number[] = [];
  private windowT = 0;
  private fastT = 0;
  /** Grows each time a step up immediately had to be undone, so the image doesn't pump. */
  private climbHold = 0;
  private holdT = 0;
  private lastClimb = -Infinity;
  private clock = 0;

  constructor(maxPixelRatio: number) {
    this.max = maxPixelRatio;
    this.min = maxPixelRatio >= 1.5 ? 1 : maxPixelRatio * 0.75;
    this.current = Math.min(maxPixelRatio, Math.max(this.min, 1.5));
  }

  /** Feed every frame. Returns the new pixel ratio when it changes, otherwise null. */
  sample(frameDt: number): number | null {
    this.clock += frameDt;
    this.holdT = Math.max(0, this.holdT - frameDt);
    this.samples.push(frameDt * 1000);
    this.windowT += frameDt;
    if (this.windowT < WINDOW_S || this.samples.length < 8) return null;

    this.samples.sort((a, b) => a - b);
    const keep = this.samples.length - Math.floor(this.samples.length / 10);
    let sum = 0;
    for (let i = 0; i < keep; i++) sum += this.samples[i];
    const avg = sum / keep;
    const elapsed = this.windowT;
    this.samples.length = 0;
    this.windowT = 0;

    let next = this.current;
    if (avg > SLOW_MS) {
      this.fastT = 0;
      next = Math.max(this.min, this.current - (avg > VERY_SLOW_MS ? STEP * 2 : STEP));
      if (this.clock - this.lastClimb < CLIMB_AFTER * 2) this.climbHold = Math.min(60, Math.max(8, this.climbHold * 2));
      this.holdT = this.climbHold;
    } else if (avg < FAST_MS) {
      this.fastT += elapsed;
      if (this.fastT >= CLIMB_AFTER && this.holdT <= 0 && this.current < this.max) {
        this.fastT = 0;
        this.lastClimb = this.clock;
        next = Math.min(this.max, this.current + STEP);
      }
    } else {
      this.fastT = 0;
    }

    if (next === this.current) return null;
    this.current = next;
    return next;
  }
}
