import { events } from '../core/EventBus';
import { clamp } from '../core/math';
import { audio, sfx, type SynthCtx } from './AudioEngine';
import { drive, noise, registerSounds, tone } from './sounds';

export interface SoundState {
  playing: boolean;
  paused: boolean;
  dead: boolean;
  raid: boolean;
  boss: boolean;
  /** Seconds until a called or forced raid lands; Infinity when none is coming (ignored during a raid). */
  countdown: number;
  gas: number;
  rain: number;
  /** Player ground speed in m/s and whether they're sprinting. */
  speed: number;
  sprinting: boolean;
  /** Wading through a ford. */
  wading: boolean;
  /** 0..1 stamina. */
  stamina: number;
  x: number;
  z: number;
}

interface Loop {
  gain: GainNode;
  filter: BiquadFilterNode;
}

const BPM = 100;
const STEP = 60 / BPM / 4;
const E2 = 82.41;
const NOTE = { E: E2, D: 73.42, F: 87.31, G: 98, A: 110, Bb: 116.54, B: 123.47 } as const;
type Note = keyof typeof NOTE | null;
const BASS: Note[][] = [
  ['E', 'E', null, 'E', null, 'E', 'G', null, 'E', 'E', null, 'E', 'Bb', null, 'A', null],
  ['E', 'E', null, 'E', null, 'E', 'G', null, 'E', null, 'D', null, 'F', null, 'E', null],
];
const KICK = new Set([0, 4, 7, 8, 12]);
const CLANK = new Set([4, 12]);

/**
 * Everything you hear that isn't a one-off hit: wind, rain, gas hiss, the respirator,
 * footsteps, distant horrors, the pre-raid drone and the raid track. Also maps game events to stingers.
 */
export class Soundscape {
  private wind: Loop | null = null;
  private rain: Loop | null = null;
  private gas: Loop | null = null;
  private drone: GainNode | null = null;
  private music: GainNode | null = null;
  private time = 0;
  private stepDist = 0;
  private breathT = 1.5;
  private inhale = true;
  private ambT = 6;
  private beatT = 0;
  private musicOn = false;
  private nextStep = 0;
  private step = 0;
  private bar = 0;

  constructor() {
    registerSounds();
    audio.onUnlock(() => this.start());
    events.on('raid:warning', ({ seconds }) => sfx('raid.siren', { param: seconds <= 10 ? 1 : seconds <= 30 ? 0.5 : 0 }));
    events.on('raid:calling', () => {
      sfx('raid.siren', { param: 0.5 });
      sfx('raid.siren', { param: 1, delay: 1.4 });
    });
    events.on('raid:inbound', () => sfx('raid.siren', { param: 0 }));
    events.on('horde:stir', ({ level }) => sfx('amb.scream', { volume: level >= 75 ? 1.6 : 1.2, pitch: 0.8 }));
    events.on('raid:start', ({ raid }) => {
      sfx('raid.horn');
      if (raid % 5 === 0) sfx('boss.roar', { delay: 1.6 });
    });
    events.on('raid:end', ({ result }) => sfx(result === 'breached' ? 'raid.penalty' : 'raid.clear', { delay: 0.3 }));
    events.on('raid:siege', () => sfx('raid.horn', { volume: 0.6 }));
    events.on('raid:engage', () => sfx('raid.horn'));
    events.on('player:dodge', () => sfx('whoosh'));
    events.on('build:placed', () => sfx('build.place'));
    events.on('recipe:made', () => sfx('craft.done'));
    events.on('gun:assembled', () => sfx('gun.ready'));
    events.on('toast', ({ tone: t }) => {
      if (t === 'danger' || t === 'toxic') sfx('ui.toast', { pitch: t === 'danger' ? 0.7 : 0.85 });
    });
    document.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('button, .btn')) sfx('ui.click');
    }, true);
  }

  update(dt: number, s: SoundState): void {
    if (!audio.ready) return;
    this.time += dt;
    const ctx = audio.ctx!;
    const now = ctx.currentTime;
    audio.setDuck(s.paused ? 0.35 : s.dead ? 0.6 : 1);

    if (this.wind) {
      const gust = 0.5 + 0.5 * Math.sin(this.time * 0.21) * Math.sin(this.time * 0.067 + 1.3);
      this.wind.gain.gain.setTargetAtTime(0.05 + gust * 0.07 + s.rain * 0.05, now, 0.5);
      this.wind.filter.frequency.setTargetAtTime(260 + gust * 520, now, 0.6);
    }
    this.rain?.gain.gain.setTargetAtTime(s.rain * 0.22, now, 0.8);
    this.gas?.gain.gain.setTargetAtTime(clamp(s.gas, 0, 1) * 0.09, now, 0.3);

    const tense = s.playing && !s.raid && s.countdown <= 30;
    this.drone?.gain.setTargetAtTime(tense ? 0.06 + (1 - s.countdown / 30) * 0.08 : 0, now, tense ? 1.2 : 0.6);
    if (tense && s.countdown <= 12) {
      this.beatT -= dt;
      if (this.beatT <= 0) {
        this.beatT = 0.85;
        this.oneShot((c) => {
          tone(c, 'sine', 62, 40, c.t, 0.16, 0.45);
          tone(c, 'sine', 58, 38, c.t + 0.2, 0.14, 0.3);
          return 0.5;
        });
      }
    }

    if (!s.playing || s.paused || s.dead) {
      this.updateMusic(now, false, s.boss);
      return;
    }
    this.updateMusic(now, s.raid, s.boss);
    this.footsteps(dt, s);
    this.breathe(dt, s);
    this.ambience(dt, s);
  }

  private start(): void {
    const ctx = audio.ctx!;
    this.wind = this.loop('bandpass', 400, 0.8, audio.buses.amb);
    this.rain = this.loop('highpass', 1100, 0.4, audio.buses.amb);
    const rainTop = ctx.createBiquadFilter();
    rainTop.type = 'lowpass';
    rainTop.frequency.value = 7000;
    this.rain.filter.disconnect();
    this.rain.filter.connect(rainTop);
    rainTop.connect(this.rain.gain);
    this.gas = this.loop('highpass', 3200, 0.7, audio.buses.amb);

    this.drone = ctx.createGain();
    this.drone.gain.value = 0;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 180;
    lp.connect(this.drone);
    this.drone.connect(audio.buses.music);
    for (const f of [41.2, 41.7, 61.7]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.connect(lp);
      o.start();
    }

    this.music = ctx.createGain();
    this.music.gain.value = 0;
    this.music.connect(audio.buses.music);
  }

  private loop(type: BiquadFilterType, freq: number, q: number, bus: AudioNode): Loop {
    const ctx = audio.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = audio.noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(bus);
    src.start(0, Math.random() * 1.5);
    return { gain, filter };
  }

  /** Schedules an ad-hoc synth straight onto a bus (no positioning). */
  private oneShot(fn: (s: SynthCtx) => number, bus: AudioNode = audio.buses.amb, t = audio.now): void {
    const ctx = audio.ctx!;
    const out = ctx.createGain();
    out.connect(bus);
    const dur = fn({ ctx, out, t, pitch: 1, param: 0.5, noise: audio.noise! });
    window.setTimeout(() => out.disconnect(), (t - ctx.currentTime + dur + 0.5) * 1000);
  }

  private footsteps(dt: number, s: SoundState): void {
    if (s.speed < 0.6) {
      this.stepDist = 0.9;
      return;
    }
    this.stepDist += s.speed * dt;
    const stride = s.sprinting ? 1.55 : 1.15;
    if (this.stepDist < stride) return;
    this.stepDist = 0;
    if (s.wading) sfx('step.water', { x: s.x, z: s.z, pitch: 0.85 + Math.random() * 0.3 });
    else sfx('step', { x: s.x, z: s.z, param: (s.sprinting ? 0.8 : 0.35) + s.rain * 0.2, pitch: 0.9 + Math.random() * 0.2 });
  }

  /** The respirator: slow and quiet normally, ragged when sprinting, exhausted or in gas. */
  private breathe(dt: number, s: SoundState): void {
    this.breathT -= dt;
    if (this.breathT > 0) return;
    const strain = Math.max(s.sprinting ? 0.6 : 0, 1 - s.stamina, s.gas > 0.05 ? 0.5 : 0);
    const period = 2.1 - strain * 1.1;
    this.breathT = period * (0.9 + Math.random() * 0.2);
    const loud = 0.05 + strain * 0.07 + (s.gas > 0.05 ? 0.05 : 0);
    const inhale = this.inhale;
    this.inhale = !inhale;
    this.oneShot((c) => {
      const len = period * 0.8;
      noise(c, c.t, len, loud, {
        f0: inhale ? 700 : 1100, f1: inhale ? 1300 : 600, q: 1.6, attack: len * 0.35,
      });
      if (inhale && s.gas > 0.05) tone(c, 'square', 1800, 1700, c.t + len * 0.9, 0.015, 0.03);
      return len;
    }, audio.buses.ui);
  }

  private ambience(dt: number, s: SoundState): void {
    this.ambT -= dt;
    if (this.ambT > 0) return;
    this.ambT = 5 + Math.random() * 10;
    const a = Math.random() * Math.PI * 2;
    const r = 18 + Math.random() * 26;
    const x = s.x + Math.sin(a) * r;
    const z = s.z + Math.cos(a) * r;
    const roll = Math.random();
    const id = roll < 0.3 ? 'amb.scream' : roll < 0.55 ? 'amb.creak' : roll < 0.8 ? 'amb.clank' : 'amb.drip';
    sfx(id, id === 'amb.drip' ? { x: s.x + Math.sin(a) * 4, z: s.z + Math.cos(a) * 4 } : { x, z, volume: 1.4 });
  }

  private updateMusic(now: number, on: boolean, boss: boolean): void {
    if (!this.music) return;
    if (on !== this.musicOn) {
      this.musicOn = on;
      this.music.gain.cancelScheduledValues(now);
      this.music.gain.setTargetAtTime(on ? 0.9 : 0, now, on ? 0.6 : 1.4);
      if (on) {
        this.nextStep = now + 0.1;
        this.step = 0;
        this.bar = 0;
      }
    }
    if (!on && this.music.gain.value < 0.01) return;
    if (this.nextStep < now - 0.25) this.nextStep = now + 0.05;
    while (this.nextStep < now + 0.2) {
      this.playStep(this.nextStep, boss);
      this.nextStep += STEP;
      this.step = (this.step + 1) % 16;
      if (this.step === 0) this.bar++;
    }
  }

  private playStep(t: number, boss: boolean): void {
    const out = this.music!;
    const i = this.step;
    const full = this.bar >= 2;
    this.oneShot((c) => {
      if (KICK.has(i) || (boss && this.bar % 2 === 1 && i >= 13)) {
        tone(c, 'sine', 150, 42, t, 0.22, 1.0);
        noise(c, t, 0.02, 0.3, { type: 'highpass', f0: 3000 });
      }
      if (CLANK.has(i)) {
        noise(c, t, 0.16, 0.45, { f0: 1700, q: 1.1 });
        for (const [f, g] of [[340, 0.2], [938, 0.12], [1836, 0.07]] as const) tone(c, 'sine', f, f * 0.98, t, 0.3, g);
      }
      if (full && i % 2 === 1) noise(c, t, 0.03, i % 4 === 3 ? 0.14 : 0.07, { type: 'highpass', f0: 7500 });
      const note = BASS[this.bar % 2][i];
      if (note && (full || i < 8 || this.bar > 0)) {
        const ws = drive(c.ctx, 0.75);
        const lp = c.ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(900, t);
        lp.frequency.exponentialRampToValueAtTime(180, t + STEP * 1.6);
        ws.connect(lp);
        lp.connect(c.out);
        tone(c, 'sawtooth', NOTE[note], NOTE[note], t, STEP * 1.7, 0.32, { dest: ws, attack: 0.005 });
        tone(c, 'square', NOTE[note] / 2, NOTE[note] / 2, t, STEP * 1.7, 0.2, { dest: ws, attack: 0.005 });
      }
      if (full && i === 0 && this.bar % 4 === 2) {
        for (const [f, g] of [[196, 0.18], [541, 0.1], [1058, 0.06], [1750, 0.04]] as const) tone(c, 'sine', f, f, t, 1.6, g);
      }
      if (boss && i === 0 && this.bar % 2 === 0) {
        const ws = drive(c.ctx, 0.9);
        const lp = c.ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(300, t);
        lp.frequency.linearRampToValueAtTime(1400, t + STEP * 16);
        ws.connect(lp);
        lp.connect(c.out);
        for (const [f, d] of [[E2, 0], [E2 * 1.5, 7], [E2 * 2, -9]] as const) {
          tone(c, 'sawtooth', f, f, t, STEP * 30, 0.07, { dest: ws, attack: STEP * 8, detune: d });
        }
      }
      return boss ? STEP * 32 : 1.8;
    }, out, t);
  }
}
