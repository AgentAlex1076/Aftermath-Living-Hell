import { audio, type SynthCtx } from './AudioEngine';

const MIN = 0.0001;
const curves = new Map<number, Float32Array>();

/** Soft-clip curve for grit; cached per amount. */
export function drive(ctx: BaseAudioContext, amount: number): WaveShaperNode {
  let curve = curves.get(amount);
  if (!curve) {
    curve = new Float32Array(1024);
    const k = amount * 60;
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
    }
    curves.set(amount, curve);
  }
  const ws = ctx.createWaveShaper();
  ws.curve = curve as Float32Array<ArrayBuffer>;
  ws.oversample = '2x';
  return ws;
}

interface ToneOpts {
  attack?: number;
  dest?: AudioNode;
  /** Linear pitch glide instead of exponential. */
  linear?: boolean;
  detune?: number;
}

/** One oscillator with a pitch glide and an attack/decay envelope. */
export function tone(s: SynthCtx, type: OscillatorType, f0: number, f1: number, t0: number, dur: number, gain: number, o: ToneOpts = {}): void {
  const { ctx } = s;
  const osc = ctx.createOscillator();
  osc.type = type;
  if (o.detune) osc.detune.value = o.detune;
  osc.frequency.setValueAtTime(Math.max(1, f0 * s.pitch), t0);
  if (o.linear) osc.frequency.linearRampToValueAtTime(Math.max(1, f1 * s.pitch), t0 + dur);
  else osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1 * s.pitch), t0 + dur);
  const g = ctx.createGain();
  const a = o.attack ?? 0.004;
  g.gain.setValueAtTime(MIN, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + a);
  g.gain.exponentialRampToValueAtTime(MIN, t0 + Math.max(dur, a + 0.01));
  osc.connect(g);
  g.connect(o.dest ?? s.out);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

interface NoiseOpts {
  type?: BiquadFilterType;
  f0?: number;
  f1?: number;
  q?: number;
  attack?: number;
  dest?: AudioNode;
  /** Hold at full level for this fraction of the duration before decaying. */
  hold?: number;
}

/** Filtered white noise burst. */
export function noise(s: SynthCtx, t0: number, dur: number, gain: number, o: NoiseOpts = {}): void {
  const { ctx } = s;
  const src = ctx.createBufferSource();
  src.buffer = s.noise;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = o.type ?? 'bandpass';
  f.Q.value = o.q ?? 1;
  const f0 = (o.f0 ?? 1200) * s.pitch;
  f.frequency.setValueAtTime(f0, t0);
  if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1 * s.pitch, t0 + dur);
  const g = ctx.createGain();
  const a = o.attack ?? 0.003;
  g.gain.setValueAtTime(MIN, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + a);
  if (o.hold) g.gain.setValueAtTime(gain, t0 + a + dur * o.hold);
  g.gain.exponentialRampToValueAtTime(MIN, t0 + Math.max(dur, a + 0.01));
  src.connect(f);
  f.connect(g);
  g.connect(o.dest ?? s.out);
  src.start(t0, Math.random() * 1.5);
  src.stop(t0 + dur + 0.05);
}

/** A metallic strike: inharmonic partials ringing down. */
function clang(s: SynthCtx, t0: number, base: number, dur: number, gain: number, dest?: AudioNode): void {
  for (const [ratio, g] of [[1, 1], [2.76, 0.6], [5.4, 0.35], [8.93, 0.2]] as const) {
    tone(s, 'sine', base * ratio, base * ratio * 0.995, t0, dur * (1.2 - g * 0.4), gain * g, { dest });
  }
  noise(s, t0, 0.04, gain * 0.8, { type: 'highpass', f0: 3000, dest });
}

/** Through-the-mask creature voice: buzzy source, two formants, glide and rasp. */
function voice(s: SynthCtx, o: { f0: number; f1: number; dur: number; rasp: number; formant: [number, number]; wobble?: number; drive?: number; gain?: number }): number {
  const { ctx, t } = s;
  const out = ctx.createGain();
  out.gain.value = o.gain ?? 0.5;
  const ws = drive(ctx, o.drive ?? 0.3);
  ws.connect(out);
  out.connect(s.out);
  const f1 = ctx.createBiquadFilter();
  f1.type = 'bandpass';
  f1.frequency.value = o.formant[0] * s.pitch;
  f1.Q.value = 3;
  const f2 = ctx.createBiquadFilter();
  f2.type = 'bandpass';
  f2.frequency.value = o.formant[1] * s.pitch;
  f2.Q.value = 4;
  f1.connect(ws);
  f2.connect(ws);
  const bus = ctx.createGain();
  bus.connect(f1);
  bus.connect(f2);

  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(o.f0 * s.pitch, t);
  osc.frequency.exponentialRampToValueAtTime(o.f1 * s.pitch, t + o.dur);
  if (o.wobble) {
    const lfo = ctx.createOscillator();
    lfo.frequency.value = o.wobble;
    const depth = ctx.createGain();
    depth.gain.value = o.f0 * s.pitch * 0.08;
    lfo.connect(depth);
    depth.connect(osc.frequency);
    lfo.start(t);
    lfo.stop(t + o.dur + 0.05);
  }
  const g = ctx.createGain();
  g.gain.setValueAtTime(MIN, t);
  g.gain.linearRampToValueAtTime(1.6, t + o.dur * 0.15);
  g.gain.setValueAtTime(1.4, t + o.dur * 0.6);
  g.gain.exponentialRampToValueAtTime(MIN, t + o.dur);
  osc.connect(g);
  g.connect(bus);
  osc.start(t);
  osc.stop(t + o.dur + 0.05);
  if (o.rasp > 0) noise(s, t, o.dur, o.rasp, { f0: o.formant[0] * 1.4, q: 1.5, attack: o.dur * 0.15, dest: bus });
  return o.dur + 0.1;
}

/** Registers every procedural sound. Ids are what gameplay passes to `sfx()`. */
export function registerSounds(): void {
  // --- Guns ------------------------------------------------------------------------------------
  audio.register('gun.shot', (s) => {
    const heavy = s.param;
    const { ctx, t } = s;
    const ws = drive(ctx, 0.25 + heavy * 0.5);
    ws.connect(s.out);
    noise(s, t, 0.05, 0.9, { type: 'highpass', f0: 2500, dest: ws });
    noise(s, t, 0.16 + heavy * 0.2, 0.9, { type: 'bandpass', f0: 2200 - heavy * 900, f1: 500, q: 0.8, dest: ws });
    tone(s, 'sine', 160 - heavy * 40, 42, t, 0.14 + heavy * 0.18, 0.9 + heavy * 0.3, { dest: ws });
    noise(s, t + 0.02, 0.35 + heavy * 0.4, 0.18, { type: 'lowpass', f0: 900, f1: 200 });
    return 0.8;
  }, { limit: 10, gap: 0.03 });
  audio.register('gun.dry', (s) => {
    tone(s, 'square', 1900, 1500, s.t, 0.02, 0.18);
    noise(s, s.t, 0.02, 0.3, { type: 'highpass', f0: 4000 });
    return 0.1;
  }, { limit: 2, gap: 0.12 });
  audio.register('gun.jam', (s) => {
    for (const [dt, f] of [[0, 2100], [0.07, 1700], [0.16, 2400]] as const) {
      noise(s, s.t + dt, 0.035, 0.5, { f0: f, q: 4 });
    }
    clang(s, s.t + 0.05, 620, 0.25, 0.08);
    return 0.4;
  }, { limit: 1 });
  audio.register('gun.reload', (s) => {
    for (const [dt, f, g] of [[0, 1500, 0.4], [0.14, 900, 0.5], [0.34, 2000, 0.35]] as const) {
      noise(s, s.t + dt, 0.05, g, { f0: f, q: 3 });
      tone(s, 'triangle', f * 0.3, f * 0.2, s.t + dt, 0.04, 0.12);
    }
    return 0.5;
  }, { limit: 1 });
  audio.register('gun.ready', (s) => {
    noise(s, s.t, 0.05, 0.45, { f0: 1100, q: 3 });
    noise(s, s.t + 0.09, 0.07, 0.6, { f0: 700, q: 2.5 });
    tone(s, 'triangle', 240, 160, s.t + 0.09, 0.06, 0.2);
    return 0.25;
  }, { limit: 1 });

  // --- Melee, gathering, impacts ---------------------------------------------------------------
  audio.register('swing', (s) => {
    noise(s, s.t, 0.22, 0.22, { f0: 380, f1: 1500, q: 1.4, attack: 0.08 });
    return 0.25;
  }, { limit: 2, gap: 0.08 });
  audio.register('whoosh', (s) => {
    noise(s, s.t, 0.32, 0.3, { f0: 260, f1: 900, q: 1.2, attack: 0.1 });
    noise(s, s.t + 0.05, 0.2, 0.08, { type: 'lowpass', f0: 300 });
    return 0.35;
  }, { limit: 1, gap: 0.15 });
  audio.register('hit.flesh', (s) => {
    tone(s, 'sine', 120, 55, s.t, 0.12, 0.7);
    noise(s, s.t, 0.09, 0.55, { type: 'lowpass', f0: 1100, f1: 300 });
    noise(s, s.t + 0.01, 0.12, 0.25, { f0: 900, f1: 500, q: 5 });
    return 0.2;
  }, { limit: 6, gap: 0.03 });
  audio.register('hit.wood', (s) => {
    tone(s, 'triangle', 240, 170, s.t, 0.09, 0.55);
    noise(s, s.t, 0.07, 0.45, { f0: 1300, q: 2 });
    noise(s, s.t, 0.2, 0.1, { type: 'lowpass', f0: 500 });
    return 0.25;
  }, { limit: 3, gap: 0.04 });
  audio.register('hit.stone', (s) => {
    noise(s, s.t, 0.06, 0.7, { type: 'highpass', f0: 2400 });
    tone(s, 'sine', 420, 300, s.t, 0.05, 0.3);
    noise(s, s.t + 0.02, 0.25, 0.16, { f0: 700, q: 0.7 });
    return 0.3;
  }, { limit: 3, gap: 0.04 });
  audio.register('hit.metal', (s) => {
    clang(s, s.t, 420 + Math.random() * 120, 0.5, 0.18);
    noise(s, s.t, 0.05, 0.3, { f0: 2600, q: 2 });
    return 0.6;
  }, { limit: 3, gap: 0.04 });
  audio.register('hit.goo', (s) => {
    noise(s, s.t, 0.18, 0.5, { type: 'lowpass', f0: 900, f1: 250 });
    tone(s, 'sine', 220, 90, s.t, 0.15, 0.4);
    return 0.25;
  }, { limit: 3, gap: 0.04 });

  // --- Mutants ---------------------------------------------------------------------------------
  audio.register('voice.shambler', (s) => voice(s, { f0: 95, f1: 70, dur: 1.1, rasp: 0.25, formant: [480, 1100], wobble: 5 }), { bus: 'sfx', limit: 3, gap: 0.2, gain: 0.7 });
  audio.register('voice.crawler', (s) => voice(s, { f0: 420, f1: 300, dur: 0.45, rasp: 0.6, formant: [1500, 3100], wobble: 22, drive: 0.5 }), { limit: 3, gap: 0.2, gain: 0.55 });
  audio.register('voice.bloater', (s) => voice(s, { f0: 70, f1: 55, dur: 1.2, rasp: 0.3, formant: [300, 700], wobble: 11 }), { limit: 2, gap: 0.3, gain: 0.8 });
  audio.register('voice.brute', (s) => voice(s, { f0: 58, f1: 44, dur: 1.3, rasp: 0.4, formant: [350, 850], wobble: 3, drive: 0.7 }), { limit: 2, gap: 0.3, gain: 0.9 });
  audio.register('voice.spitter', (s) => voice(s, { f0: 180, f1: 120, dur: 0.8, rasp: 0.7, formant: [800, 2200], wobble: 14, drive: 0.4 }), { limit: 2, gap: 0.3, gain: 0.6 });
  audio.register('voice.screamer', (s) => voice(s, { f0: 600, f1: 420, dur: 0.6, rasp: 0.3, formant: [1300, 2800], wobble: 9, drive: 0.6 }), { limit: 2, gap: 0.3, gain: 0.45 });
  audio.register('voice.stalker', (s) => voice(s, { f0: 140, f1: 120, dur: 1.4, rasp: 1.1, formant: [700, 1800], wobble: 2, gain: 0.35 }), { limit: 2, gap: 0.4, gain: 0.6 });
  audio.register('voice.climber', (s) => {
    for (let i = 0; i < 6; i++) noise(s, s.t + i * 0.06 + Math.random() * 0.02, 0.025, 0.5, { f0: 2200 + Math.random() * 1500, q: 6 });
    return voice({ ...s, t: s.t + 0.35 }, { f0: 260, f1: 190, dur: 0.5, rasp: 0.5, formant: [1100, 2500], wobble: 18 }) + 0.35;
  }, { limit: 2, gap: 0.3, gain: 0.6 });
  audio.register('voice.chemist', (s) => {
    noise(s, s.t, 1.1, 0.35, { f0: 1800, q: 0.9, attack: 0.3 });
    return voice({ ...s, t: s.t + 0.2 }, { f0: 110, f1: 90, dur: 1.0, rasp: 0.3, formant: [600, 1500], wobble: 4, gain: 0.4 }) + 0.2;
  }, { limit: 1, gap: 0.5, gain: 0.8 });
  audio.register('voice.patientZero', (s) => voice(s, { f0: 46, f1: 34, dur: 1.8, rasp: 0.6, formant: [260, 640], wobble: 2.5, drive: 0.9, gain: 0.7 }), { limit: 1, gap: 0.6, gain: 1 });

  audio.register('enemy.swipe', (s) => {
    noise(s, s.t, 0.18, 0.28, { f0: 300, f1: 1000, q: 1.5, attack: 0.06 });
    return 0.2;
  }, { limit: 4, gap: 0.05 });
  audio.register('enemy.death', (s) => {
    tone(s, 'sine', 180, 38, s.t, 0.3, 0.6);
    noise(s, s.t, 0.4, 0.6, { type: 'lowpass', f0: 1400, f1: 180 });
    noise(s, s.t + 0.05, 0.2, 0.3, { f0: 700, f1: 300, q: 6 });
    return 0.5;
  }, { limit: 5, gap: 0.04 });
  audio.register('pop.wet', (s) => {
    const ws = drive(s.ctx, 0.6);
    ws.connect(s.out);
    tone(s, 'sine', 90, 30, s.t, 0.5, 1, { dest: ws });
    noise(s, s.t, 0.6, 0.9, { type: 'lowpass', f0: 1800, f1: 160, dest: ws });
    for (let i = 0; i < 5; i++) tone(s, 'sine', 300 + Math.random() * 500, 120, s.t + 0.1 + i * 0.07, 0.08, 0.15);
    noise(s, s.t + 0.1, 1.4, 0.15, { type: 'highpass', f0: 2500, attack: 0.2 });
    return 1.6;
  }, { limit: 3, gap: 0.05 });
  audio.register('spit', (s) => {
    noise(s, s.t, 0.12, 0.6, { f0: 700, f1: 1500, q: 2 });
    tone(s, 'sine', 320, 110, s.t, 0.1, 0.4);
    return 0.2;
  }, { limit: 3, gap: 0.05 });
  audio.register('acid', (s) => {
    noise(s, s.t, 0.12, 0.5, { type: 'lowpass', f0: 1200, f1: 300 });
    noise(s, s.t + 0.04, 0.9, 0.35, { type: 'highpass', f0: 3500, hold: 0.2 });
    for (let i = 0; i < 8; i++) noise(s, s.t + 0.05 + Math.random() * 0.7, 0.015, 0.25, { type: 'highpass', f0: 5000 });
    return 1;
  }, { limit: 4, gap: 0.04 });
  audio.register('scream', (s) => {
    const { ctx, t } = s;
    const ws = drive(ctx, 0.8);
    const g = ctx.createGain();
    g.gain.value = 0.35;
    ws.connect(g);
    g.connect(s.out);
    for (const [f, d] of [[880, 0], [1210, 8], [1460, -12]] as const) {
      tone(s, 'sawtooth', f * 0.8, f * 1.15, t, 1.25, 0.4, { dest: ws, attack: 0.08, linear: true, detune: d });
    }
    noise(s, t, 1.2, 0.5, { f0: 2400, q: 1.2, attack: 0.1, dest: ws });
    return 1.4;
  }, { limit: 2, gap: 0.3 });
  audio.register('boss.slam', (s) => {
    const ws = drive(s.ctx, 0.7);
    ws.connect(s.out);
    tone(s, 'sine', 70, 24, s.t, 0.9, 1.2, { dest: ws });
    noise(s, s.t, 1.2, 0.9, { type: 'lowpass', f0: 1600, f1: 90, dest: ws });
    for (let i = 0; i < 6; i++) noise(s, s.t + 0.05 + Math.random() * 0.4, 0.06, 0.3, { f0: 600 + Math.random() * 1600, q: 3 });
    return 1.5;
  }, { limit: 2, gap: 0.1 });

  // --- Explosions, gas -------------------------------------------------------------------------
  audio.register('explosion', (s) => {
    const ws = drive(s.ctx, 0.8);
    ws.connect(s.out);
    tone(s, 'sine', 95, 26, s.t, 1.0, 1.3, { dest: ws });
    noise(s, s.t, 0.12, 1.0, { type: 'highpass', f0: 1800, dest: ws });
    noise(s, s.t, 1.8, 1.0, { type: 'lowpass', f0: 3200, f1: 120, dest: ws, hold: 0.05 });
    for (let i = 0; i < 7; i++) noise(s, s.t + 0.2 + Math.random() * 0.9, 0.05, 0.2, { f0: 800 + Math.random() * 2400, q: 3 });
    return 2.2;
  }, { limit: 3, gap: 0.05 });
  audio.register('gas.burst', (s) => {
    noise(s, s.t, 1.6, 0.55, { type: 'highpass', f0: 2600, f1: 1600, attack: 0.03, hold: 0.15 });
    noise(s, s.t, 0.5, 0.3, { f0: 600, q: 0.8 });
    return 1.8;
  }, { limit: 3, gap: 0.1 });
  audio.register('flame', (s) => {
    noise(s, s.t, 0.28, 0.35, { type: 'lowpass', f0: 1400, f1: 700, attack: 0.04 });
    for (let i = 0; i < 3; i++) noise(s, s.t + Math.random() * 0.2, 0.02, 0.25, { type: 'highpass', f0: 4000 });
    return 0.32;
  }, { limit: 3, gap: 0.12 });

  // --- Building --------------------------------------------------------------------------------
  audio.register('build.place', (s) => {
    tone(s, 'sine', 170, 85, s.t, 0.16, 0.7);
    noise(s, s.t, 0.12, 0.5, { type: 'lowpass', f0: 900 });
    noise(s, s.t + 0.06, 0.05, 0.35, { f0: 1800, q: 3 });
    return 0.25;
  }, { limit: 2, gap: 0.06 });
  audio.register('build.hit', (s) => {
    if (s.param > 0.5) {
      clang(s, s.t, 300 + Math.random() * 80, 0.45, 0.16);
      noise(s, s.t, 0.06, 0.35, { type: 'lowpass', f0: 700 });
    } else {
      tone(s, 'triangle', 180, 120, s.t, 0.1, 0.5);
      noise(s, s.t, 0.12, 0.5, { f0: 900, q: 1.2 });
      noise(s, s.t + 0.03, 0.12, 0.2, { type: 'highpass', f0: 3000 });
    }
    return 0.5;
  }, { limit: 4, gap: 0.05 });
  audio.register('build.break', (s) => {
    noise(s, s.t, 0.9, 0.8, { type: 'lowpass', f0: 2400, f1: 200, hold: 0.1 });
    tone(s, 'sine', 110, 40, s.t, 0.4, 0.7);
    for (let i = 0; i < 6; i++) {
      const dt = 0.05 + Math.random() * 0.6;
      if (s.param > 0.5) clang(s, s.t + dt, 200 + Math.random() * 400, 0.3, 0.06);
      else noise(s, s.t + dt, 0.06, 0.35, { f0: 600 + Math.random() * 900, q: 2 });
    }
    return 1.1;
  }, { limit: 3, gap: 0.05 });
  audio.register('build.repair', (s) => {
    clang(s, s.t, 980, 0.25, 0.12);
    tone(s, 'triangle', 300, 220, s.t, 0.06, 0.3);
    return 0.35;
  }, { limit: 2, gap: 0.06 });
  audio.register('build.upgrade', (s) => {
    for (let i = 0; i < 4; i++) noise(s, s.t + i * 0.07, 0.04, 0.4, { f0: 900 + i * 400, q: 5 });
    clang(s, s.t + 0.3, 520, 0.6, 0.16);
    return 0.9;
  }, { limit: 1 });

  // --- Player, items, UI -----------------------------------------------------------------------
  audio.register('step', (s) => {
    noise(s, s.t, 0.06, 0.18 + s.param * 0.12, { type: 'lowpass', f0: 380 + s.param * 300, q: 0.7 });
    noise(s, s.t, 0.03, 0.05, { f0: 2000, q: 1 });
    return 0.08;
  }, { limit: 2, gap: 0.12, gain: 0.7 });
  audio.register('player.hurt', (s) => {
    const { ctx } = s;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    lp.connect(s.out);
    tone(s, 'sawtooth', 160, 105, s.t, 0.22, 0.4, { dest: lp, attack: 0.02 });
    noise(s, s.t, 0.25, 0.25, { f0: 700, q: 1, dest: lp });
    tone(s, 'sine', 90, 50, s.t, 0.1, 0.6);
    return 0.3;
  }, { bus: 'ui', limit: 1, gap: 0.25 });
  audio.register('pickup', (s) => {
    tone(s, 'sine', 640, 960, s.t, 0.07, 0.25);
    tone(s, 'triangle', 960, 1280, s.t + 0.05, 0.06, 0.12);
    return 0.15;
  }, { bus: 'ui', limit: 2, gap: 0.06 });
  audio.register('rummage', (s) => {
    for (let i = 0; i < 5; i++) noise(s, s.t + i * 0.06 + Math.random() * 0.03, 0.06, 0.3, { f0: 800 + Math.random() * 1600, q: 1.5 });
    return 0.4;
  }, { limit: 1, gap: 0.2 });
  audio.register('eat', (s) => {
    for (let i = 0; i < 3; i++) noise(s, s.t + i * 0.13, 0.07, 0.4, { type: 'lowpass', f0: 1600, q: 1.5 });
    return 0.45;
  }, { bus: 'ui', limit: 1 });
  audio.register('filter', (s) => {
    noise(s, s.t, 0.04, 0.5, { f0: 2400, q: 4 });
    tone(s, 'square', 900, 700, s.t + 0.06, 0.03, 0.12);
    noise(s, s.t + 0.1, 0.6, 0.25, { type: 'highpass', f0: 3200, attack: 0.05 });
    return 0.75;
  }, { bus: 'ui', limit: 1 });
  audio.register('ui.click', (s) => {
    tone(s, 'square', 1400, 1100, s.t, 0.025, 0.08);
    noise(s, s.t, 0.02, 0.1, { type: 'highpass', f0: 3000 });
    return 0.05;
  }, { bus: 'ui', limit: 2, gap: 0.03 });
  audio.register('ui.open', (s) => {
    noise(s, s.t, 0.16, 0.22, { f0: 1200, f1: 3200, q: 0.8, attack: 0.05 });
    return 0.2;
  }, { bus: 'ui', limit: 1, gap: 0.08 });
  audio.register('ui.close', (s) => {
    noise(s, s.t, 0.14, 0.2, { f0: 3000, f1: 1000, q: 0.8, attack: 0.03 });
    return 0.18;
  }, { bus: 'ui', limit: 1, gap: 0.08 });
  audio.register('ui.toast', (s) => {
    tone(s, 'triangle', 880, 880, s.t, 0.05, 0.08);
    return 0.08;
  }, { bus: 'ui', limit: 1, gap: 0.15 });
  audio.register('craft.done', (s) => {
    clang(s, s.t, 520, 0.3, 0.1);
    noise(s, s.t, 0.06, 0.4, { f0: 900, q: 2 });
    clang(s, s.t + 0.14, 390, 0.4, 0.12);
    noise(s, s.t + 0.14, 0.08, 0.5, { type: 'lowpass', f0: 600 });
    return 0.6;
  }, { bus: 'ui', limit: 1, gap: 0.1 });

  // --- Raid stingers ---------------------------------------------------------------------------
  audio.register('raid.siren', (s) => {
    const { ctx, t } = s;
    const len = 1.6 + s.param * 1.4;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1800;
    const ws = drive(ctx, 0.35);
    lp.connect(ws);
    const g = ctx.createGain();
    g.gain.value = 0.32;
    ws.connect(g);
    g.connect(s.out);
    for (const type of ['sawtooth', 'square'] as const) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(260, t);
      osc.frequency.linearRampToValueAtTime(680, t + len * 0.45);
      osc.frequency.linearRampToValueAtTime(560, t + len * 0.7);
      osc.frequency.linearRampToValueAtTime(240, t + len);
      const env = ctx.createGain();
      env.gain.setValueAtTime(MIN, t);
      env.gain.linearRampToValueAtTime(type === 'square' ? 0.25 : 0.5, t + 0.3);
      env.gain.setValueAtTime(type === 'square' ? 0.25 : 0.5, t + len * 0.75);
      env.gain.exponentialRampToValueAtTime(MIN, t + len);
      osc.connect(env);
      env.connect(lp);
      osc.start(t);
      osc.stop(t + len + 0.05);
    }
    return len + 0.2;
  }, { bus: 'ui', limit: 1, gap: 1 });
  audio.register('raid.horn', (s) => {
    const { ctx, t } = s;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(200, t);
    lp.frequency.linearRampToValueAtTime(1400, t + 0.6);
    lp.frequency.linearRampToValueAtTime(300, t + 2.2);
    const ws = drive(ctx, 0.5);
    lp.connect(ws);
    ws.connect(s.out);
    for (const [f, d] of [[73.4, 0], [73.4, 12], [110, -8], [146.8, 5]] as const) {
      tone(s, 'sawtooth', f, f * 0.97, t, 2.3, 0.22, { dest: lp, attack: 0.25, detune: d });
    }
    tone(s, 'sine', 80, 28, t, 0.8, 1.1);
    noise(s, t, 1.2, 0.5, { type: 'lowpass', f0: 1200, f1: 100 });
    return 2.5;
  }, { bus: 'ui', limit: 1, gap: 1 });
  audio.register('raid.clear', (s) => {
    for (const [i, f] of [196, 246.9, 293.7, 392].entries()) {
      tone(s, 'triangle', f, f, s.t + i * 0.09, 1.4, 0.16, { attack: 0.02 });
      tone(s, 'sine', f * 2, f * 2, s.t + i * 0.09, 0.9, 0.05);
    }
    return 1.8;
  }, { bus: 'ui', limit: 1, gap: 1 });
  audio.register('raid.penalty', (s) => {
    for (let i = 0; i < 6; i++) tone(s, 'square', i % 2 ? 660 : 880, i % 2 ? 660 : 880, s.t + i * 0.16, 0.14, 0.12, { attack: 0.005 });
    noise(s, s.t, 0.5, 0.4, { type: 'lowpass', f0: 600, f1: 120 });
    return 1.1;
  }, { bus: 'ui', limit: 1, gap: 1 });
  audio.register('death.sting', (s) => {
    const { ctx, t } = s;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1600, t);
    lp.frequency.exponentialRampToValueAtTime(140, t + 3.2);
    const ws = drive(ctx, 0.5);
    lp.connect(ws);
    ws.connect(s.out);
    for (const [f, d] of [[110, 0], [130.8, 6], [155.6, -5], [55, 0]] as const) {
      tone(s, 'sawtooth', f, f * 0.5, t, 3.4, 0.16, { dest: lp, attack: 0.05, detune: d });
    }
    tone(s, 'sine', 70, 25, t, 1.4, 0.9);
    noise(s, t, 2.4, 0.3, { type: 'lowpass', f0: 800, f1: 80, attack: 0.05 });
    return 3.6;
  }, { bus: 'ui', limit: 1, gap: 2 });
  audio.register('boss.roar', (s) => {
    const r = voice(s, { f0: 55, f1: 38, dur: 2.4, rasp: 0.8, formant: [300, 720], wobble: 3, drive: 1, gain: 0.9 });
    tone(s, 'sine', 60, 30, s.t, 2, 0.6, { attack: 0.3 });
    return r;
  }, { bus: 'ui', limit: 1, gap: 2 });

  // --- Weather & ambience ----------------------------------------------------------------------
  audio.register('thunder', (s) => {
    const near = 1 - s.param;
    const len = 2.6 + s.param * 2;
    if (near > 0.5) noise(s, s.t, 0.25, 0.9 * near, { type: 'highpass', f0: 1400, f1: 400 });
    noise(s, s.t + 0.05, len, 0.9, { type: 'lowpass', f0: 500 + near * 900, f1: 90, attack: 0.15, hold: 0.1 });
    tone(s, 'sine', 55, 30, s.t + 0.05, len * 0.6, 0.6, { attack: 0.3 });
    for (let i = 0; i < 4; i++) noise(s, s.t + 0.3 + Math.random() * len * 0.6, 0.6, 0.35, { type: 'lowpass', f0: 300, attack: 0.1 });
    return len + 0.3;
  }, { bus: 'amb', limit: 2, gap: 0.5 });
  audio.register('amb.scream', (s) => {
    const r = voice(s, { f0: 520 + Math.random() * 300, f1: 300, dur: 1.4, rasp: 0.2, formant: [1100, 2600], wobble: 7, drive: 0.5, gain: 0.12 });
    return r;
  }, { bus: 'amb', limit: 1, gap: 3 });
  audio.register('amb.drip', (s) => {
    tone(s, 'sine', 1500 + Math.random() * 600, 800, s.t, 0.05, 0.08);
    tone(s, 'sine', 1300, 700, s.t + 0.32, 0.04, 0.03);
    return 0.4;
  }, { bus: 'amb', limit: 2, gap: 0.2 });
  audio.register('amb.creak', (s) => {
    const { ctx } = s;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 600;
    bp.Q.value = 6;
    bp.connect(s.out);
    tone(s, 'sawtooth', 70, 52, s.t, 1.6, 0.25, { dest: bp, attack: 0.4, linear: true });
    return 1.7;
  }, { bus: 'amb', limit: 1, gap: 3 });
  audio.register('amb.clank', (s) => {
    clang(s, s.t, 180 + Math.random() * 120, 1.2, 0.05);
    return 1.3;
  }, { bus: 'amb', limit: 1, gap: 3 });
}
