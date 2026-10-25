// Web Audio API procedural sound engine for cinematic and comic effects
class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;

  private init(): boolean {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return false;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.55, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return true;
  }

  /** Plays toxic bubbling, sizzling and hissing sound when the text melts */
  playAcidMelt(): void {
    if (!this.init() || !this.ctx || !this.masterGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // 1. Noise hiss/fizz
    const bufferSize = ctx.sampleRate * 1.5;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const whiteNoise = ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(800, now);
    filter.frequency.exponentialRampToValueAtTime(3200, now + 1.2);
    filter.Q.setValueAtTime(3.0, now);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.01, now);
    noiseGain.gain.linearRampToValueAtTime(0.28, now + 0.2);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 1.4);

    whiteNoise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.masterGain);

    whiteNoise.start(now);
    whiteNoise.stop(now + 1.5);

    // 2. Liquid bubbling pops
    for (let i = 0; i < 9; i++) {
      const popTime = now + 0.1 + i * 0.12 + Math.random() * 0.06;
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();

      const startFreq = 250 + Math.random() * 200;
      const endFreq = startFreq + 350 + Math.random() * 250;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(startFreq, popTime);
      osc.frequency.exponentialRampToValueAtTime(endFreq, popTime + 0.08);

      oscGain.gain.setValueAtTime(0.18, popTime);
      oscGain.gain.exponentialRampToValueAtTime(0.001, popTime + 0.08);

      osc.connect(oscGain);
      oscGain.connect(this.masterGain);

      osc.start(popTime);
      osc.stop(popTime + 0.09);
    }
  }

  /** Dramatic cinematic zoom whoosh / riser */
  playZoomWhoosh(): void {
    if (!this.init() || !this.ctx || !this.masterGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(60, now);
    osc.frequency.exponentialRampToValueAtTime(260, now + 0.7);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(150, now);
    filter.frequency.exponentialRampToValueAtTime(3800, now + 0.65);

    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.35, now + 0.55);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.75);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.8);
  }

  /** Cartoonish falling whistle dropping down in pitch */
  playSkyFall(): void {
    if (!this.init() || !this.ctx || !this.masterGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    // Classic falling slide from high to low
    osc.frequency.setValueAtTime(1400, now);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.95);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.linearRampToValueAtTime(0.4, now + 0.75);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.98);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 1.0);
  }

  /** Heavy comic splat: deep sub thud + wet squelch */
  playImpactSplat(): void {
    if (!this.init() || !this.ctx || !this.masterGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Sub bass thud / explosion
    const thud = ctx.createOscillator();
    const thudGain = ctx.createGain();
    thud.type = 'triangle';
    thud.frequency.setValueAtTime(130, now);
    thud.frequency.exponentialRampToValueAtTime(28, now + 0.45);

    thudGain.gain.setValueAtTime(0.8, now);
    thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

    thud.connect(thudGain);
    thudGain.connect(this.masterGain);

    thud.start(now);
    thud.stop(now + 0.55);

    // Wet squelch noise
    const bufferSize = Math.floor(ctx.sampleRate * 0.35);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.08));
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1200, now);
    filter.frequency.exponentialRampToValueAtTime(180, now + 0.3);

    const squelchGain = ctx.createGain();
    squelchGain.gain.setValueAtTime(0.6, now);
    squelchGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    noise.connect(filter);
    filter.connect(squelchGain);
    squelchGain.connect(this.masterGain);

    noise.start(now);
    noise.stop(now + 0.38);
  }

  /** Muffled rapid heartbeat inside the mask */
  playHeartbeat(): void {
    if (!this.init() || !this.ctx || !this.masterGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    for (let beat = 0; beat < 2; beat++) {
      const beatTime = now + beat * 0.16;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(85 - beat * 15, beatTime);
      osc.frequency.exponentialRampToValueAtTime(32, beatTime + 0.12);

      gain.gain.setValueAtTime(0.55 - beat * 0.15, beatTime);
      gain.gain.exponentialRampToValueAtTime(0.001, beatTime + 0.14);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(beatTime);
      osc.stop(beatTime + 0.15);
    }
  }

  /** Heavy toxic wind storm and atmospheric drop roar */
  playHorrorDropStorm(): void {
    if (!this.init() || !this.ctx || !this.masterGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const bufferSize = ctx.sampleRate * 2.2;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const whiteNoise = ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(220, now);
    filter.frequency.exponentialRampToValueAtTime(1400, now + 0.7);
    filter.frequency.exponentialRampToValueAtTime(180, now + 2.0);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.linearRampToValueAtTime(0.45, now + 0.6);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 2.2);

    whiteNoise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    whiteNoise.start(now);
    whiteNoise.stop(now + 2.3);
  }

  /** Distant toxic thunder crash with low sub roll */
  playThunder(): void {
    if (!this.init() || !this.ctx || !this.masterGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const bufferSize = ctx.sampleRate * 2.0;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.4));
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(320, now);
    filter.frequency.exponentialRampToValueAtTime(70, now + 1.8);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.65, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 2.0);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    noise.start(now);
    noise.stop(now + 2.1);
  }

  /** Gas mask pneumatic regulator inhalation, valve click, and heavy exhale */
  playMaskBreathing(): void {
    if (!this.init() || !this.ctx || !this.masterGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // 1. Regulator intake click
    const click = ctx.createOscillator();
    const clickGain = ctx.createGain();
    click.type = 'triangle';
    click.frequency.setValueAtTime(540, now);
    click.frequency.exponentialRampToValueAtTime(80, now + 0.05);
    clickGain.gain.setValueAtTime(0.4, now);
    clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    click.connect(clickGain);
    clickGain.connect(this.masterGain);
    click.start(now);
    click.stop(now + 0.06);

    // 2. Inhale rasp through filter canister
    const bufferSize = Math.floor(ctx.sampleRate * 1.0);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1);
    }
    const inhale = ctx.createBufferSource();
    inhale.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(950, now);
    filter.frequency.exponentialRampToValueAtTime(1400, now + 0.5);
    filter.Q.setValueAtTime(4.0, now);

    const inhaleGain = ctx.createGain();
    inhaleGain.gain.setValueAtTime(0.01, now);
    inhaleGain.gain.linearRampToValueAtTime(0.38, now + 0.4);
    inhaleGain.gain.exponentialRampToValueAtTime(0.001, now + 0.95);

    inhale.connect(filter);
    filter.connect(inhaleGain);
    inhaleGain.connect(this.masterGain);

    inhale.start(now);
    inhale.stop(now + 1.0);
  }
}

export const sound = new SoundEngine();
