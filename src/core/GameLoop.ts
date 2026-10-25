/**
 * Fixed-timestep loop: simulation runs at a constant rate, rendering runs every animation
 * frame and receives an interpolation factor between the last two simulation states.
 */
export class GameLoop {
  timeScale = 1;
  private accumulator = 0;
  private lastTime = 0;
  private running = false;
  private rafId = 0;

  constructor(
    private readonly step: number,
    private readonly maxFrameTime: number,
    private readonly update: (dt: number) => void,
    private readonly render: (alpha: number, frameDt: number) => void,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  private tick = (now: number): void => {
    if (!this.running) return;
    const frameDt = Math.min((now - this.lastTime) / 1000, this.maxFrameTime);
    this.lastTime = now;

    this.accumulator += frameDt * this.timeScale;
    while (this.accumulator >= this.step) {
      this.update(this.step);
      this.accumulator -= this.step;
    }

    this.render(this.accumulator / this.step, frameDt);
    this.rafId = requestAnimationFrame(this.tick);
  };
}
