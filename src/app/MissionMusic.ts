import { Howl } from "howler";

// Optional real music file. If it is missing, the game makes ambient music by code.
const FILE_URL = `${import.meta.env.BASE_URL}audio/space-ambient.mp3`;

const CHORD_SECONDS = 12;

// Am9 -> Fmaj7 -> Cadd9 -> G (slow, calm, spacey)
const CHORDS: number[][] = [
  [110.0, 164.81, 220.0, 261.63, 329.63, 493.88],
  [87.31, 130.81, 174.61, 220.0, 261.63, 329.63],
  [130.81, 196.0, 261.63, 329.63, 392.0, 587.33],
  [98.0, 146.83, 196.0, 246.94, 293.66, 392.0],
];

// High, soft "star" notes (A minor pentatonic)
const SHIMMER = [659.25, 783.99, 880.0, 987.77, 1174.66, 1318.5];

export class MissionMusic {
  private howl: Howl | null = null;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private dry: GainNode | null = null;
  private reverbIn: GainNode | null = null;
  private lfoDepth: GainNode | null = null;
  private timers: number[] = [];
  private chordTimer = 0;
  private shimmerTimer = 0;
  private chordIndex = 0;
  private running = false;
  private synth = false;
  private enabled = true;
  private level = 1;

  /** Safe to call many times. Call it again after a click or key press to wake the audio. */
  start() {
    if (this.running) {
      this.resume();
      return;
    }
    this.running = true;
    this.loadFile();
  }

  setEnabled(value: boolean) {
    this.enabled = value;
    this.apply(value ? 1.2 : 0.8);
    if (value) this.resume();
  }

  /** 1 = calm. Higher = a little louder and busier (used for the finish and launch). */
  setMood(level: number) {
    this.level = level;
    this.apply(1.5);
  }

  stop() {
    this.timers.forEach((id) => window.clearTimeout(id));
    this.timers = [];
    window.clearInterval(this.chordTimer);
    window.clearTimeout(this.shimmerTimer);
    if (this.howl) {
      this.howl.unload();
      this.howl = null;
    }
    const ctx = this.ctx;
    this.ctx = null;
    this.master = null;
    this.dry = null;
    this.reverbIn = null;
    this.lfoDepth = null;
    if (ctx && ctx.state !== "closed") void ctx.close().catch(() => undefined);
    this.chordIndex = 0;
    this.synth = false;
    this.running = false;
  }

  // ---------- internals ----------

  private target() {
    if (!this.enabled) return 0.0001;
    return (this.synth ? 0.32 : 0.5) * this.level;
  }

  private resume() {
    const ctx = this.ctx;
    if (ctx && ctx.state === "suspended") void ctx.resume().catch(() => undefined);
  }

  private apply(seconds: number) {
    const target = this.target();
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(target, this.ctx.currentTime, seconds / 3);
    }
    const h = this.howl;
    if (h && h.state() === "loaded") {
      if (this.enabled) {
        if (!h.playing()) h.play();
        h.fade(Number(h.volume()), target, seconds * 1000);
      } else {
        h.fade(Number(h.volume()), 0, seconds * 1000);
        this.timers.push(
          window.setTimeout(() => {
            if (!this.enabled && this.howl === h) h.pause();
          }, seconds * 1000 + 60)
        );
      }
    }
  }

  private loadFile() {
    const howl = new Howl({
      src: [FILE_URL],
      loop: true,
      volume: 0,
      onload: () => {
        if (this.howl !== howl) return;
        this.apply(3);
      },
      onloaderror: () => {
        if (this.howl !== howl) return;
        howl.unload();
        this.howl = null;
        this.startSynth();
      },
    });
    this.howl = howl;
  }

  private impulse(ctx: AudioContext, seconds: number) {
    const rate = ctx.sampleRate;
    const length = Math.floor(rate * seconds);
    const buffer = ctx.createBuffer(2, length, rate);
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3);
      }
    }
    return buffer;
  }

  private startSynth() {
    if (!this.running || this.ctx || typeof window === "undefined" || !window.AudioContext) return;
    try {
      const ctx = new window.AudioContext();
      this.ctx = ctx;
      this.synth = true;

      const master = ctx.createGain();
      master.gain.value = 0.0001;
      const compressor = ctx.createDynamicsCompressor();
      master.connect(compressor);
      compressor.connect(ctx.destination);

      const convolver = ctx.createConvolver();
      convolver.buffer = this.impulse(ctx, 5.5);
      const wet = ctx.createGain();
      wet.gain.value = 0.55;
      const reverbIn = ctx.createGain();
      reverbIn.connect(convolver);
      convolver.connect(wet);
      wet.connect(master);

      const dry = ctx.createGain();
      dry.gain.value = 0.7;
      dry.connect(master);

      // Slow movement in the sound (a very slow wave opens and closes the filters)
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.07;
      const lfoDepth = ctx.createGain();
      lfoDepth.gain.value = 260;
      lfo.connect(lfoDepth);
      lfo.start();

      // Deep drone
      const sub = ctx.createOscillator();
      sub.type = "sine";
      sub.frequency.value = 55;
      const subGain = ctx.createGain();
      subGain.gain.value = 0.09;
      sub.connect(subGain);
      subGain.connect(dry);
      sub.start();

      this.master = master;
      this.dry = dry;
      this.reverbIn = reverbIn;
      this.lfoDepth = lfoDepth;

      this.apply(4);
      this.resume();

      this.nextChord();
      this.chordTimer = window.setInterval(() => this.nextChord(), CHORD_SECONDS * 1000);
      this.shimmerTimer = window.setTimeout(this.shimmerLoop, 4000);
    } catch {
      // If audio is not available, the game still works without music.
    }
  }

  private nextChord() {
    const ctx = this.ctx;
    if (!ctx) return;
    const notes = CHORDS[this.chordIndex % CHORDS.length];
    this.chordIndex += 1;
    const t = ctx.currentTime + 0.05;
    notes.forEach((freq, i) => this.pad(freq, t + i * 0.35, CHORD_SECONDS, i === 0 ? 0.07 : 0.045));
  }

  private pad(freq: number, t: number, duration: number, volume: number) {
    const ctx = this.ctx, dry = this.dry, rev = this.reverbIn, depth = this.lfoDepth;
    if (!ctx || !dry || !rev || !depth) return;
    const attack = 4;
    const release = 5;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 850;
    filter.Q.value = 0.6;
    depth.connect(filter.frequency);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(volume, t + attack);
    gain.gain.setValueAtTime(volume, t + duration);
    gain.gain.linearRampToValueAtTime(0.0001, t + duration + release);

    const a = ctx.createOscillator();
    a.type = "sawtooth";
    a.frequency.value = freq;
    a.detune.value = -7;
    const b = ctx.createOscillator();
    b.type = "triangle";
    b.frequency.value = freq;
    b.detune.value = 6;

    a.connect(filter);
    b.connect(filter);
    filter.connect(gain);
    gain.connect(dry);
    gain.connect(rev);

    const end = t + duration + release + 0.1;
    a.start(t);
    b.start(t);
    a.stop(end);
    b.stop(end);
    a.onended = () => {
      try { depth.disconnect(filter.frequency); } catch { /* already closed */ }
      a.disconnect();
      b.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
  }

  private shimmerLoop = () => {
    if (!this.ctx) return;
    this.bell();
    const wait = (3500 + Math.random() * 5000) / this.level;
    this.shimmerTimer = window.setTimeout(this.shimmerLoop, wait);
  };

  private bell() {
    const ctx = this.ctx, rev = this.reverbIn;
    if (!ctx || !rev) return;
    const freq = SHIMMER[Math.floor(Math.random() * SHIMMER.length)];
    const t = ctx.currentTime + 0.02;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.05, t + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 6);

    const a = ctx.createOscillator();
    a.type = "sine";
    a.frequency.value = freq;
    const b = ctx.createOscillator();
    b.type = "sine";
    b.frequency.value = freq * 2.01;
    const bGain = ctx.createGain();
    bGain.gain.value = 0.25;

    a.connect(gain);
    b.connect(bGain);
    bGain.connect(gain);
    gain.connect(rev);

    a.start(t);
    b.start(t);
    a.stop(t + 6.1);
    b.stop(t + 6.1);
    a.onended = () => {
      a.disconnect();
      b.disconnect();
      bGain.disconnect();
      gain.disconnect();
    };
  }
}