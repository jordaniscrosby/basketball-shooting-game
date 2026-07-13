import { tuning } from '../config/tuning';

export interface LoopCallbacks {
  /** Called at a fixed rate (tuning.world.stepHz) with dt in seconds. */
  update: (dt: number) => void;
  /** Called once per animation frame; alpha ∈ [0,1) interpolates prev→curr physics state. */
  render: (alpha: number, frameDt: number) => void;
}

/**
 * Gaffer-style fixed timestep: accumulate real frame time (clamped), step the
 * simulation at exactly 1/stepHz, and hand the renderer the leftover fraction
 * so it can interpolate between the previous and current physics states.
 * Identical inputs → identical trajectories, which is what makes the
 * deterministic shot-replay tool possible.
 */
export class FixedLoop {
  private last = 0;
  private accumulator = 0;
  private rafId = 0;
  private running = false;

  /** Exponential moving average of raw frame dt, for the fps readout. */
  smoothedFps = 60;

  constructor(private readonly cb: LoopCallbacks) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const frame = (now: number) => {
      if (!this.running) return;
      this.rafId = requestAnimationFrame(frame);
      const h = 1 / tuning.world.stepHz;
      let frameDt = (now - this.last) / 1000;
      this.last = now;
      if (frameDt > 0) {
        this.smoothedFps += (1 / frameDt - this.smoothedFps) * 0.05;
      }
      frameDt = Math.min(frameDt, tuning.world.maxFrameDt);
      this.accumulator += frameDt;
      while (this.accumulator >= h) {
        this.cb.update(h);
        this.accumulator -= h;
      }
      this.cb.render(this.accumulator / h, frameDt);
    };
    this.rafId = requestAnimationFrame(frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }
}
