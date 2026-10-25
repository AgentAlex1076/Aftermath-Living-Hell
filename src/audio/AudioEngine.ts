import { clamp } from '../core/math';

export interface PlayOpts {
  /** World position; omit for UI / non-positional sounds. */
  x?: number;
  z?: number;
  volume?: number;
  /** Frequency multiplier. */
  pitch?: number;
  /** Free 0..1 knob a recipe can read (gun weight, wall material, thunder distance...). */
  param?: number;
  /** Seconds from now. */
  delay?: number;
}

export interface SynthCtx {
  ctx: AudioContext;
  /** Where the recipe should connect its output. */
  out: AudioNode;
  t: number;
  pitch: number;
  param: number;
  noise: AudioBuffer;
}

/** Builds and schedules a sound; returns how long it rings, in seconds. */
export type Synth = (s: SynthCtx) => number;

export type Bus = 'sfx' | 'ui' | 'amb' | 'music';

interface Entry {
  synth: Synth;
  bus: Bus;
  /** Max overlapping voices of this sound. */
  limit: number;
  /** Min seconds between two starts. */
  gap: number;
  gain: number;
  active: number[];
  last: number;
}

const STORE_KEY = 'aftermath.audio';
const HEAR_RANGE = 55;
const MAX_VOICES = 48;

/**
 * Procedural audio. Sounds are registered by id as small synth recipes, so any of them can later
 * be swapped for a sample without touching gameplay. The context starts on the first user gesture.
 */
export class AudioEngine {
  ctx: AudioContext | null = null;
  readonly buses = {} as Record<Bus, GainNode>;
  reverb: ConvolverNode | null = null;
  noise: AudioBuffer | null = null;
  muted = false;
  volume = 0.8;
  private master: GainNode | null = null;
  private duck = 1;
  private readonly registry = new Map<string, Entry>();
  private readonly unlockHandlers: (() => void)[] = [];
  private voices = 0;
  private lx = 0;
  private lz = 0;
  private rx = 1;
  private rz = 0;

  constructor() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}') as { muted?: boolean; volume?: number };
      this.muted = !!saved.muted;
      if (typeof saved.volume === 'number') this.volume = clamp(saved.volume, 0, 1);
    } catch {
      // Corrupt settings just fall back to defaults.
    }
    const unlock = () => {
      this.unlock();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  get ready(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  get now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  register(id: string, synth: Synth, opts: { bus?: Bus; limit?: number; gap?: number; gain?: number } = {}): void {
    this.registry.set(id, {
      synth,
      bus: opts.bus ?? 'sfx',
      limit: opts.limit ?? 6,
      gap: opts.gap ?? 0.02,
      gain: opts.gain ?? 1,
      active: [],
      last: -1,
    });
  }

  has(id: string): boolean {
    return this.registry.has(id);
  }

  /** Runs once the context exists (immediately if it already does). */
  onUnlock(fn: () => void): void {
    if (this.ctx) fn();
    else this.unlockHandlers.push(fn);
  }

  setListener(x: number, z: number, rightX: number, rightZ: number): void {
    this.lx = x;
    this.lz = z;
    const len = Math.hypot(rightX, rightZ) || 1;
    this.rx = rightX / len;
    this.rz = rightZ / len;
  }

  /** Volume multiplier for the whole mix, e.g. while paused. */
  setDuck(v: number): void {
    this.duck = v;
    this.applyMaster(0.25);
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    this.applyMaster(0.05);
    this.save();
    return this.muted;
  }

  setVolume(v: number): void {
    this.volume = clamp(v, 0, 1);
    this.applyMaster(0.05);
    this.save();
  }

  /** 0..1 loudness a sound at (x, z) would have; 0 if out of earshot. */
  audibility(x: number, z: number): number {
    const d = Math.hypot(x - this.lx, z - this.lz);
    if (d >= HEAR_RANGE) return 0;
    return clamp(1 / (1 + Math.max(0, d - 5) * 0.11), 0, 1) * (1 - d / HEAR_RANGE);
  }

  play(id: string, opts: PlayOpts = {}): void {
    const ctx = this.ctx;
    const e = this.registry.get(id);
    if (!ctx || !e || ctx.state !== 'running' || !this.noise) return;
    const now = ctx.currentTime;
    const t = now + Math.max(0, opts.delay ?? 0);
    if (t - e.last < e.gap) return;
    e.active = e.active.filter((end) => end > now);
    if (e.active.length >= e.limit || this.voices >= MAX_VOICES) return;

    const positional = opts.x !== undefined && opts.z !== undefined;
    let vol = (opts.volume ?? 1) * e.gain;
    let pan = 0;
    let dist = 0;
    if (positional) {
      const dx = opts.x! - this.lx;
      const dz = opts.z! - this.lz;
      dist = Math.hypot(dx, dz);
      vol *= this.audibility(opts.x!, opts.z!);
      pan = clamp((dx * this.rx + dz * this.rz) / 14, -0.85, 0.85);
    }
    if (vol < 0.015) return;

    const input = ctx.createGain();
    input.gain.value = vol;
    const nodes: AudioNode[] = [input];
    let tail: AudioNode = input;
    if (positional) {
      const frac = clamp(dist / HEAR_RANGE, 0, 1);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 900 + 19000 * (1 - frac) ** 2.2;
      const panner = ctx.createStereoPanner();
      panner.pan.value = pan;
      tail.connect(lp);
      lp.connect(panner);
      tail = panner;
      nodes.push(lp, panner);
      if (this.reverb) {
        const send = ctx.createGain();
        send.gain.value = 0.06 + 0.5 * frac;
        panner.connect(send);
        send.connect(this.reverb);
        nodes.push(send);
      }
    }
    tail.connect(this.buses[e.bus]);

    let dur = 0.5;
    try {
      dur = e.synth({ ctx, out: input, t, pitch: opts.pitch ?? 1, param: opts.param ?? 0.5, noise: this.noise });
    } catch (err) {
      console.warn(`sound ${id} failed`, err);
    }
    e.last = t;
    e.active.push(t + dur);
    this.voices++;
    window.setTimeout(() => {
      this.voices--;
      for (const n of nodes) n.disconnect();
    }, (t - now + dur + 0.4) * 1000);
  }

  private unlock(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor({ latencyHint: 'interactive' });
    this.ctx = ctx;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 12;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.22;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.connect(comp);
    this.applyMaster(0);

    const levels: Record<Bus, number> = { sfx: 0.9, ui: 0.55, amb: 0.7, music: 0.55 };
    for (const bus of Object.keys(levels) as Bus[]) {
      const g = ctx.createGain();
      g.gain.value = levels[bus];
      g.connect(this.master);
      this.buses[bus] = g;
    }

    this.noise = makeNoise(ctx, 2);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = makeImpulse(ctx, 2.4, 2.6);
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    this.reverb.connect(wet);
    wet.connect(this.master);

    void ctx.resume();
    for (const fn of this.unlockHandlers.splice(0)) fn();
  }

  private applyMaster(ramp: number): void {
    if (!this.ctx || !this.master) return;
    const target = this.muted ? 0 : this.volume * this.duck;
    const g = this.master.gain;
    g.cancelScheduledValues(this.ctx.currentTime);
    g.setTargetAtTime(target, this.ctx.currentTime, Math.max(0.001, ramp / 3));
  }

  private save(): void {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ muted: this.muted, volume: this.volume }));
    } catch {
      // Storage can be full or blocked; settings just won't persist.
    }
  }
}

function makeNoise(ctx: AudioContext, seconds: number): AudioBuffer {
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function makeImpulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const data = buf.getChannelData(c);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** decay;
  }
  return buf;
}

export const audio = new AudioEngine();

/** Fire-and-forget sound effect. Silent until the player has clicked or pressed a key once. */
export function sfx(id: string, opts?: PlayOpts): void {
  audio.play(id, opts);
}
