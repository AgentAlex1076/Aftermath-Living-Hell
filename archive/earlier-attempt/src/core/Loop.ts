/**
 * Fixed-timestep simulation with variable-rate rendering.
 * `render` receives the interpolation factor between the last two simulation states.
 */
export class Loop {
  private readonly stepSeconds: number;
  private accumulator = 0;
  private last = 0;
  private running = false;

  constructor(
    private readonly step: (dt: number) => void,
    private readonly render: (alpha: number, frameDt: number) => void,
    hz = 60,
  ) {
    this.stepSeconds = 1 / hz;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this.frame);
  }

  private frame = (now: number) => {
    if (!this.running) return;
    const frameDt = Math.min((now - this.last) / 1000, 0.25);
    this.last = now;
    this.accumulator += frameDt;
    while (this.accumulator >= this.stepSeconds) {
      this.step(this.stepSeconds);
      this.accumulator -= this.stepSeconds;
    }
    this.render(this.accumulator / this.stepSeconds, frameDt);
    requestAnimationFrame(this.frame);
  };
}
