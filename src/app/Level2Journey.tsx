/**
 * MYSHA GOES TO MARS — LEVEL 2 · SPACE JOURNEY · OXYGEN CRISIS IN DEEP SPACE
 * Drop-in replacement for src/app/Level2Journey.tsx
 *
 * EASY TUNING VALUES (search for these names):
 *   ART_TOP_CROP     - share of the intro image (from the top) that is cut away to hide the baked-in header.
 *   ART_POSITION     - which part of the image stays visible on wide / tall screens.
 *   SUIT_FRONT_SIGN  - flip to -1 if the backpack shows on Mysha's chest instead of her back.
 */
import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, useFBX, useTexture } from "@react-three/drei";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import * as THREE from "three";
import { Level3With4 as Level3Landing } from "./Level3With4";

type Stage = "intro" | "quiet" | "alarm" | "aura" | "consequence" | "repair" | "repairing" | "sealed" | "power" | "ending";
type Decision = "backup" | "conserve" | null;
type MoodName = "calm" | "urgent" | "suspense" | "hopeful" | "mystery";
type Mood = MoodName | "off";
type Cue = "tap" | "hover" | "alarm" | "auraOn" | "auraMsg" | "choose" | "step" | "run" | "holo" | "panel" | "repair" | "verify" | "stable" | "power" | "complete" | "scan";
type CamMode = "follow" | "intro" | "repair" | "closeup" | "pullback";
type Kind = "story" | "science" | "objective" | "warning" | "result";
type Ref<T> = { current: T };
type Point = { x: number; z: number };

// ---------------------------------------------------------------- assets & tuning
const MODEL_URL = `${import.meta.env.BASE_URL}models/characters/Meshy_AI_Animation_Walking_withSkin.fbx`;
const TEXTURE_URL = `${import.meta.env.BASE_URL}textures/characters/texture_0.png`;
const LEVEL2_ART = `${import.meta.env.BASE_URL}images/level2/level2-oxygen-crisis.png`;

// The generated artwork has a navigation header printed into its top edge. We never show it:
// the image is scaled up from its BOTTOM edge so this share of the top is pushed off-screen,
// and a dark gradient covers anything left. Raise this if you still see header pixels.
const ART_TOP_CROP = 0.12;
const ART_POSITION = "50% 100%";
const TARGET_HEIGHT = 1.72;
const SUIT_FRONT_SIGN = 1; // +1 = Mysha's front faces +Z (matches Level 1).

const PLAYER_SPAWN: Point = { x: 0.1, z: 5.6 };
const LEAK: Point = { x: -2.45, z: -6.65 };
const OBSTACLES = [{ x: 1.95, z: -1.6, r: 0.55 }];
const OX_FLOOR = 18;
const QUIET_SECONDS = 10;
const STORAGE_KEY = "mysha-goes-to-mars:level2:v1";
const MYSHA_LINE = "AURA, where is the leak?";
const AURA_LINE = "Pressure loss detected in the life-support section. I have marked the suspected location on your ship map.";
const FONT = 'Bahnschrift,"Segoe UI Variable Display","Segoe UI",system-ui,sans-serif';

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const reducedMotion = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------------------------------------------------------------- procedural audio
// No audio files are required. Music = slow generative pads per mood. SFX = small synth cues.
class CabinAudio {
  private ctx: AudioContext | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private moods: Partial<Record<MoodName, GainNode>> = {};
  private sources: AudioScheduledSourceNode[] = [];
  private musicOn = true;
  private sfxOn = true;
  private level = 0.5;
  private mood: Mood = "off";

  unlock() {
    if (typeof window === "undefined") return;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    try {
      const ctx = this.ctx ?? this.build(new Ctor());
      if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
    } catch { /* audio is optional */ }
  }

  private build(ctx: AudioContext): AudioContext {
    this.ctx = ctx;
    const master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
    const music = ctx.createGain();
    music.gain.value = 0.0001;
    music.connect(master);
    const sfx = ctx.createGain();
    sfx.gain.value = this.sfxOn ? 0.9 : 0.0001;
    sfx.connect(master);
    this.musicBus = music;
    this.sfxBus = sfx;

    // Ventilation ambience: filtered noise + a very low hum.
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const air = ctx.createBufferSource();
    air.buffer = buf;
    air.loop = true;
    const airLp = ctx.createBiquadFilter();
    airLp.type = "lowpass";
    airLp.frequency.value = 220;
    const airGain = ctx.createGain();
    airGain.gain.value = 0.05;
    air.connect(airLp); airLp.connect(airGain); airGain.connect(sfx);
    air.start();
    const hum = ctx.createOscillator();
    const humGain = ctx.createGain();
    hum.frequency.value = 58;
    humGain.gain.value = 0.012;
    hum.connect(humGain); humGain.connect(sfx);
    hum.start();
    this.sources.push(air, hum);

    this.addMood(ctx, "calm", [110, 164.8, 220, 329.6], "sine", 0.12, 0.35, 1400);
    this.addMood(ctx, "urgent", [55, 110, 116.5, 220], "sawtooth", 2.1, 0.6, 700);
    this.addMood(ctx, "suspense", [73.4, 110, 155.6, 233], "triangle", 0.45, 0.5, 1000);
    this.addMood(ctx, "hopeful", [130.8, 196, 261.6, 329.6, 392], "triangle", 0.18, 0.25, 1800);
    this.addMood(ctx, "mystery", [65.4, 98, 138.6, 207.7], "sine", 0.09, 0.45, 1200);
    this.applyMood();
    this.fadeMusic(this.level, 1.8);
    return ctx;
  }

  private addMood(ctx: AudioContext, name: MoodName, notes: number[], type: OscillatorType, rate: number, depth: number, cutoff: number) {
    const music = this.musicBus;
    if (!music) return;
    const mood = ctx.createGain();
    mood.gain.value = 0.0001;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = cutoff;
    const trem = ctx.createGain();
    trem.gain.value = 1 - depth;
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = rate;
    lfoGain.gain.value = depth;
    lfo.connect(lfoGain); lfoGain.connect(trem.gain);
    lfo.start();
    notes.forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.value = f;
      o.detune.value = i % 2 ? 5 : -5;
      g.gain.value = 0.22 / notes.length;
      o.connect(g); g.connect(trem);
      o.start();
      this.sources.push(o);
    });
    trem.connect(lp); lp.connect(mood); mood.connect(music);
    this.sources.push(lfo);
    this.moods[name] = mood;
  }

  private applyMood() {
    const ctx = this.ctx;
    if (!ctx) return;
    (Object.keys(this.moods) as MoodName[]).forEach((k) => {
      const g = this.moods[k];
      if (g) g.gain.setTargetAtTime(k === this.mood ? 0.55 : 0.0001, ctx.currentTime, 1.1);
    });
  }

  setMood(mood: Mood) { this.mood = mood; this.applyMood(); }

  fadeMusic(level: number, seconds: number) {
    this.level = level;
    const ctx = this.ctx, bus = this.musicBus;
    if (!ctx || !bus) return;
    bus.gain.setTargetAtTime(this.musicOn ? Math.max(0.0001, level) : 0.0001, ctx.currentTime, Math.max(0.02, seconds / 3));
  }

  setMusicEnabled(on: boolean) { this.musicOn = on; this.fadeMusic(this.level, 0.2); }

  setSfxEnabled(on: boolean) {
    this.sfxOn = on;
    const ctx = this.ctx, bus = this.sfxBus;
    if (ctx && bus) bus.gain.setTargetAtTime(on ? 0.9 : 0.0001, ctx.currentTime, 0.03);
  }

  private tone(f1: number, f2: number, dur: number, vol: number, type: OscillatorType = "sine", delay = 0) {
    const ctx = this.ctx, bus = this.sfxBus;
    if (!ctx || !bus || !this.sfxOn || ctx.state !== "running") return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f1, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f2), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + Math.min(0.03, dur / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus);
    o.start(t); o.stop(t + dur + 0.02);
    o.onended = () => { o.disconnect(); g.disconnect(); };
  }

  private noise(dur: number, vol: number, cutoff: number, delay = 0) {
    const ctx = this.ctx, bus = this.sfxBus;
    if (!ctx || !bus || !this.sfxOn || ctx.state !== "running") return;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = cutoff;
    const g = ctx.createGain();
    const t = ctx.currentTime + delay;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + Math.min(0.05, dur / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(lp); lp.connect(g); g.connect(bus);
    src.start(t); src.stop(t + dur + 0.01);
    src.onended = () => { src.disconnect(); lp.disconnect(); g.disconnect(); };
  }

  play(cue: Cue) {
    switch (cue) {
      case "tap": this.tone(520, 780, 0.1, 0.1); break;
      case "hover": this.tone(900, 1000, 0.04, 0.025); break;
      case "alarm":
        this.tone(660, 520, 0.28, 0.07, "square");
        this.tone(660, 520, 0.28, 0.07, "square", 0.36);
        this.noise(0.5, 0.04, 500);
        break;
      case "auraOn":
        [392, 523, 659, 784].forEach((f, i) => this.tone(f, f * 1.01, 0.22, 0.09, "sine", i * 0.07));
        break;
      case "auraMsg": this.tone(880, 1175, 0.09, 0.07); this.tone(1320, 1480, 0.09, 0.05, "sine", 0.09); break;
      case "choose": this.tone(400, 590, 0.25, 0.14, "triangle"); this.tone(580, 900, 0.36, 0.1, "sine", 0.13); break;
      case "step": this.noise(0.07, 0.1, 420); this.tone(110, 60, 0.07, 0.11, "triangle"); break;
      case "run": this.noise(0.06, 0.12, 520); this.tone(130, 70, 0.06, 0.12, "triangle"); break;
      case "holo": this.tone(200, 1400, 0.9, 0.06, "sine"); this.tone(300, 1800, 0.9, 0.035, "triangle", 0.1); break;
      case "panel": this.noise(0.12, 0.14, 2200); this.tone(180, 90, 0.14, 0.14, "square"); break;
      case "scan": this.tone(300, 1200, 0.5, 0.05, "sawtooth"); break;
      case "repair": this.tone(1200, 900, 0.05, 0.06, "square"); this.tone(160, 120, 0.14, 0.09, "triangle"); break;
      case "verify": this.tone(660, 880, 0.15, 0.11); this.tone(880, 1320, 0.25, 0.11, "sine", 0.14); break;
      case "stable": [392, 494, 587].forEach((f, i) => this.tone(f, f * 1.005, 0.9, 0.09, "sine", i * 0.12)); break;
      case "power": this.tone(220, 70, 1.1, 0.16, "sawtooth"); this.noise(0.8, 0.07, 300); break;
      case "complete": [440, 554, 659, 880].forEach((f, i) => this.tone(f, f * 1.01, 0.8, 0.1, "sine", i * 0.2)); break;
    }
  }

  dispose() {
    this.sources.forEach((s) => { try { s.stop(); } catch { /* already stopped */ } s.disconnect(); });
    this.sources = [];
    const ctx = this.ctx;
    this.ctx = null; this.musicBus = null; this.sfxBus = null; this.moods = {};
    if (ctx && ctx.state !== "closed") void ctx.close().catch(() => undefined);
  }
}

// ---------------------------------------------------------------- Mysha (existing FBX + attached suit gear)
type Disposable = { dispose: () => void };

/**
 * Attaches suit gear to the REAL skeleton bones so everything moves with her.
 * Gear is placed using the bind-pose bone positions, so it works whatever the bone axis conventions are.
 * HONEST LIMIT: these are simple modelled pieces (backpack, chest unit, helmet, gloves, boots, belt),
 * not a fitted, skinned spacesuit. A rigged astronaut-suit asset is needed for true realism.
 */
function attachSuit(character: THREE.Object3D, track: Disposable[]) {
  character.updateMatrixWorld(true);
  const bones: THREE.Bone[] = [];
  character.traverse((o) => { if (o instanceof THREE.Bone) bones.push(o); });
  const pick = (re: RegExp, ex?: RegExp) => bones.find((b) => re.test(b.name) && !(ex && ex.test(b.name))) ?? null;
  const chest = pick(/(spine_?0?2|upper_?chest|chest)$/i) ?? pick(/spine_?0?1$/i) ?? pick(/spine$/i);
  const head = pick(/head$/i, /top|end/i);
  const neck = pick(/neck$/i);
  const hips = pick(/(hips|pelvis)$/i);
  const handL = pick(/(left_?hand|hand_?l|l_hand)$/i);
  const handR = pick(/(right_?hand|hand_?r|r_hand)$/i);
  const footL = pick(/(left_?foot|foot_?l|l_foot)$/i);
  const footR = pick(/(right_?foot|foot_?r|r_foot)$/i);
  const F = SUIT_FRONT_SIGN;
  const H = TARGET_HEIGHT;

  const where = (b: THREE.Object3D | null, fallback: [number, number, number]) => {
    const v = new THREE.Vector3(...fallback);
    if (b) b.getWorldPosition(v);
    return v;
  };
  const mat = <T extends THREE.Material>(m: T) => { track.push(m); return m; };
  const white = mat(new THREE.MeshStandardMaterial({ color: "#e9eef2", roughness: 0.42, metalness: 0.18 }));
  const gray = mat(new THREE.MeshStandardMaterial({ color: "#8f9eab", roughness: 0.35, metalness: 0.65 }));
  const cyan = mat(new THREE.MeshStandardMaterial({ color: "#4fd8ff", emissive: "#1b9fc8", emissiveIntensity: 0.9 }));
  const red = mat(new THREE.MeshStandardMaterial({ color: "#d6402f", roughness: 0.6 }));
  const navy = mat(new THREE.MeshStandardMaterial({ color: "#1d3550", roughness: 0.5, metalness: 0.3 }));
  const glass = mat(new THREE.MeshPhysicalMaterial({ color: "#bfe8ff", transparent: true, opacity: 0.13, roughness: 0.04, depthWrite: false, side: THREE.DoubleSide }));
  const mk = (geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
    track.push(geo);
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    return mesh;
  };
  const mount = (bone: THREE.Object3D | null, child: THREE.Object3D, at: THREE.Vector3) => {
    const parent = bone ?? character;
    parent.updateWorldMatrix(true, false);
    const ws = new THREE.Vector3();
    const pq = new THREE.Quaternion();
    parent.getWorldScale(ws);
    parent.getWorldQuaternion(pq);
    const holder = new THREE.Group();
    holder.scale.set(1 / ws.x, 1 / ws.y, 1 / ws.z);
    holder.quaternion.copy(pq).invert();
    holder.position.copy(parent.worldToLocal(at.clone()));
    holder.add(child);
    parent.add(holder);
  };

  // Life-support backpack
  const pack = new THREE.Group();
  pack.add(mk(new THREE.BoxGeometry(0.34, 0.44, 0.15), white));
  pack.add(mk(new THREE.BoxGeometry(0.3, 0.05, 0.16), gray, 0, 0.245, 0));
  [-0.09, 0.09].forEach((x) => pack.add(mk(new THREE.CylinderGeometry(0.05, 0.05, 0.36, 14), gray, x, -0.02, -F * 0.09)));
  pack.add(mk(new THREE.BoxGeometry(0.22, 0.025, 0.01), cyan, 0, 0.12, -F * 0.08));
  const c = where(chest, [0, 0.5 * H + 0.2, 0]);
  mount(chest, pack, new THREE.Vector3(c.x, c.y - 0.03, c.z - F * 0.18));

  // Chest control unit with mission patch
  const unit = new THREE.Group();
  unit.add(mk(new THREE.BoxGeometry(0.26, 0.17, 0.035), white));
  unit.add(mk(new THREE.BoxGeometry(0.15, 0.07, 0.01), cyan, 0, 0.03, F * 0.02));
  [-0.07, 0, 0.07].forEach((x) => unit.add(mk(new THREE.CylinderGeometry(0.014, 0.014, 0.012, 10).rotateX(Math.PI / 2), red, x, -0.045, F * 0.02)));
  unit.add(mk(new THREE.CircleGeometry(0.035, 16), navy, -0.2, 0.08, F * 0.021));
  mount(chest, unit, new THREE.Vector3(c.x, c.y - 0.03, c.z + F * 0.125));

  // Belt
  const hp = where(hips, [0, 0.95, 0]);
  const belt = mk(new THREE.TorusGeometry(0.17, 0.022, 8, 28).rotateX(Math.PI / 2), gray);
  belt.scale.set(1, 1, 0.72);
  mount(hips, belt, new THREE.Vector3(hp.x, hp.y + 0.08, hp.z));

  // Helmet (open, transparent bubble so her face stays visible) + neck ring
  const hd = where(head, [0, 1.6, 0]);
  mount(head, mk(new THREE.SphereGeometry(0.17, 28, 20), glass), new THREE.Vector3(hd.x, hd.y + 0.07, hd.z));
  const nk = where(neck, [0, 1.48, 0]);
  const ring = new THREE.Group();
  ring.add(mk(new THREE.TorusGeometry(0.095, 0.024, 10, 28).rotateX(Math.PI / 2), white));
  ring.add(mk(new THREE.BoxGeometry(0.04, 0.02, 0.02), cyan, 0, 0, F * 0.1));
  mount(neck ?? head, ring, new THREE.Vector3(nk.x, nk.y - 0.02, nk.z));

  // Gloves and boots
  ([handL, handR] as const).forEach((b) => {
    const p = where(b, [0.5, 0.9, 0]);
    const g = mk(new THREE.SphereGeometry(0.055, 14, 12), white);
    g.scale.set(1, 1.2, 0.85);
    mount(b, g, p);
  });
  ([footL, footR] as const).forEach((b) => {
    const p = where(b, [0.1, 0.06, 0]);
    mount(b, mk(new THREE.BoxGeometry(0.11, 0.1, 0.27), white), new THREE.Vector3(p.x, p.y - 0.01, p.z + F * 0.05));
  });
}

type MyshaProps = { position: Ref<THREE.Vector3>; heading: Ref<number>; moving: Ref<boolean>; running: Ref<boolean> };

function SuitMysha({ position, heading, moving, running }: MyshaProps) {
  const fbx = useFBX(MODEL_URL);
  const skin = useTexture(TEXTURE_URL);
  const body = useRef<THREE.Group>(null);
  const speed = useRef(0);

  const prepared = useMemo(() => {
    const track: Disposable[] = [];
    const character = cloneSkeleton(fbx);
    const texture = skin.clone();
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.flipY = true;
    texture.needsUpdate = true;
    track.push(texture);

    const convert = (src: THREE.Material) => {
      const s = src as THREE.MeshPhongMaterial;
      const m = new THREE.MeshStandardMaterial({
        map: s.map ?? texture,
        normalMap: s.normalMap ?? null,
        color: "#ffffff",
        roughness: /hair/i.test(src.name) ? 0.42 : 0.66,
        metalness: 0.02,
        side: THREE.DoubleSide,
      });
      m.name = src.name;
      track.push(m);
      return m;
    };
    character.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      o.visible = true;
      o.frustumCulled = false;
      o.castShadow = true;
      o.receiveShadow = true;
      o.material = Array.isArray(o.material) ? o.material.map(convert) : convert(o.material);
    });
    character.updateMatrixWorld(true);
    character.traverse((o) => {
      if (o instanceof THREE.SkinnedMesh) { o.skeleton.update(); o.computeBoundingBox(); o.computeBoundingSphere(); }
    });
    const size = new THREE.Box3().setFromObject(character).getSize(new THREE.Vector3());
    character.scale.setScalar(size.y > 0.00001 ? TARGET_HEIGHT / size.y : 1);
    character.updateMatrixWorld(true);
    const fitted = new THREE.Box3().setFromObject(character);
    const center = fitted.getCenter(new THREE.Vector3());
    character.position.x -= center.x;
    character.position.z -= center.z;
    character.position.y -= fitted.min.y;
    character.updateMatrixWorld(true);
    attachSuit(character, track);
    const clip = fbx.animations.find((c) => /walk/i.test(c.name)) ?? fbx.animations[0] ?? null;
    return { character, clip, track };
  }, [fbx, skin]);

  const mixer = useMemo(() => new THREE.AnimationMixer(prepared.character), [prepared.character]);

  useEffect(() => {
    if (!prepared.clip) return;
    const action = mixer.clipAction(prepared.clip);
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.play();
    mixer.update(0);
    return () => { action.stop(); mixer.stopAllAction(); mixer.uncacheRoot(prepared.character); };
  }, [mixer, prepared]);

  useEffect(() => () => { prepared.track.forEach((d) => d.dispose()); }, [prepared]);

  useFrame((_, dt) => {
    const g = body.current;
    if (!g) return;
    g.position.copy(position.current);
    const diff = THREE.MathUtils.euclideanModulo(heading.current - g.rotation.y + Math.PI, Math.PI * 2) - Math.PI;
    g.rotation.y += diff * (1 - Math.exp(-10 * dt));
    // Smooth start / stop instead of an instant freeze.
    const target = moving.current ? (running.current ? 1.6 : 1) : 0;
    speed.current += (target - speed.current) * (1 - Math.exp(-9 * dt));
    if (speed.current > 0.03) mixer.update(Math.min(0.05, dt) * speed.current);
  });

  return (
    <group ref={body}>
      <primitive object={prepared.character} />
      <mesh position={[0, 0.014, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.5, 32]} />
        <meshBasicMaterial color="#020712" transparent opacity={0.35} depthWrite={false} />
      </mesh>
    </group>
  );
}

class CharacterBoundary extends Component<{ children: ReactNode; onError: (m: string) => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) {
    console.error("[Level 2 Mysha] could not load", MODEL_URL, TEXTURE_URL, error);
    this.props.onError(`MYSHA FAILED TO LOAD. Check ${MODEL_URL} and ${TEXTURE_URL}`);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return <Html center zIndexRange={[1, 0]}><div className="l2-worldtag">MYSHA MODEL NOT LOADED · OPEN BROWSER CONSOLE (F12)</div></Html>;
  }
}

// ---------------------------------------------------------------- spacecraft environment
function makeSpaceTexture(mars: boolean) {
  const c = document.createElement("canvas");
  c.width = 1024; c.height = 512;
  const g = c.getContext("2d");
  const tex = new THREE.CanvasTexture(c);
  if (g) {
    const bg = g.createLinearGradient(0, 0, 0, 512);
    bg.addColorStop(0, "#02040c"); bg.addColorStop(1, "#0a1428");
    g.fillStyle = bg; g.fillRect(0, 0, 1024, 512);
    let s = 7;
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let i = 0; i < 340; i++) {
      g.fillStyle = `rgba(200,225,255,${0.25 + rnd() * 0.75})`;
      g.beginPath(); g.arc(rnd() * 1024, rnd() * 512, rnd() < 0.06 ? 1.8 : 0.8, 0, 7); g.fill();
    }
    if (mars) {
      const grad = g.createRadialGradient(690, 300, 6, 700, 310, 58);
      grad.addColorStop(0, "#f0a36b"); grad.addColorStop(0.7, "#b5532f"); grad.addColorStop(1, "#4a1f16");
      g.fillStyle = grad; g.beginPath(); g.arc(700, 310, 54, 0, 7); g.fill();
    }
  }
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function useSpaceTextures() {
  const t = useMemo(() => ({ plain: makeSpaceTexture(false), mars: makeSpaceTexture(true) }), []);
  useEffect(() => () => { t.plain.dispose(); t.mars.dispose(); }, [t]);
  return t;
}

function ScreenPanel({ position, danger = false }: { position: [number, number, number]; danger?: boolean }) {
  return (
    <group position={position}>
      <mesh castShadow><boxGeometry args={[1.8, 1.28, 0.17]} /><meshStandardMaterial color="#192e41" metalness={0.74} roughness={0.28} /></mesh>
      <mesh position={[0, 0, -0.095]}><planeGeometry args={[1.58, 1.03]} /><meshBasicMaterial color={danger ? "#6d2633" : "#0b5778"} /></mesh>
      {[-0.38, -0.12, 0.14, 0.4].map((y, i) => (
        <mesh key={y} position={[-0.14, y, -0.104]}><planeGeometry args={[1.05, i % 2 === 0 ? 0.035 : 0.065]} /><meshBasicMaterial color={danger ? "#ff858c" : "#7bdaf1"} transparent opacity={i % 2 === 0 ? 0.9 : 0.6} /></mesh>
      ))}
    </group>
  );
}

function Rib({ z, alert, powerCritical, reduced }: { z: number; alert: boolean; powerCritical: boolean; reduced: boolean }) {
  const light = useRef<THREE.PointLight>(null);
  useFrame(({ clock }) => {
    const l = light.current;
    if (!l) return;
    const base = alert ? 2.1 : powerCritical ? 0.7 : 1.5;
    l.intensity = alert && !reduced ? base * (0.7 + 0.3 * Math.sin(clock.elapsedTime * 2.6)) : base;
  });
  const color = alert ? "#ff6074" : powerCritical ? "#d99070" : "#a8eaff";
  return (
    <group>
      <mesh position={[0, 4.4, z]}><boxGeometry args={[8.9, 0.35, 0.22]} /><meshStandardMaterial color="#69849a" metalness={0.74} /></mesh>
      {[-4.12, 4.12].map((x) => <mesh key={x} position={[x, 2.38, z]}><boxGeometry args={[0.34, 4.44, 0.28]} /><meshStandardMaterial color="#4f677d" metalness={0.77} /></mesh>)}
      <mesh position={[0, 4.4, z]}><boxGeometry args={[4.2, 0.08, 0.38]} /><meshBasicMaterial color={alert ? "#ff4d61" : powerCritical ? "#c9684c" : "#98e8ff"} /></mesh>
      <pointLight ref={light} position={[0, 3.8, z]} intensity={1.5} distance={7.8} color={color} />
    </group>
  );
}

function HoloTable({ active, repaired, reduced }: { active: boolean; repaired: boolean; reduced: boolean }) {
  const ship = useRef<THREE.Group>(null);
  const scan = useRef<THREE.Mesh>(null);
  useFrame(({ clock }, dt) => {
    if (ship.current && !reduced) ship.current.rotation.y += dt * 0.5;
    if (scan.current) {
      scan.current.visible = active;
      scan.current.position.y = 0.95 + (Math.sin(clock.elapsedTime * 2.2) * 0.5 + 0.5) * 0.7;
    }
  });
  const opacity = active ? 0.95 : 0.45;
  return (
    <group position={[1.95, 0, -1.6]}>
      <mesh castShadow receiveShadow position={[0, 0.38, 0]}><cylinderGeometry args={[0.52, 0.62, 0.76, 24]} /><meshStandardMaterial color="#14283b" metalness={0.75} roughness={0.3} /></mesh>
      <mesh position={[0, 0.77, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.3, 0.46, 40]} /><meshBasicMaterial color="#6fdcff" transparent opacity={0.8} side={THREE.DoubleSide} /></mesh>
      <group ref={ship} position={[0, 1.3, 0]}>
        <mesh><boxGeometry args={[0.9, 0.13, 0.2]} /><meshBasicMaterial color="#6fdcff" wireframe transparent opacity={opacity} /></mesh>
        <mesh position={[0.55, 0, 0]} rotation={[0, 0, -Math.PI / 2]}><coneGeometry args={[0.1, 0.25, 4]} /><meshBasicMaterial color="#6fdcff" wireframe transparent opacity={opacity} /></mesh>
        <mesh position={[-0.35, 0, 0]}><boxGeometry args={[0.2, 0.3, 0.5]} /><meshBasicMaterial color="#6fdcff" wireframe transparent opacity={opacity} /></mesh>
        <mesh position={[0.28, 0.02, -0.12]}><sphereGeometry args={[0.045, 12, 10]} /><meshBasicMaterial color={repaired ? "#5ef0cf" : "#ff4d5d"} /></mesh>
      </group>
      <mesh ref={scan} rotation={[-Math.PI / 2, 0, 0]} visible={false}><circleGeometry args={[0.5, 32]} /><meshBasicMaterial color="#6fdcff" transparent opacity={0.22} side={THREE.DoubleSide} depthWrite={false} /></mesh>
    </group>
  );
}

function GuidePath({ player, active }: { player: Ref<THREE.Vector3>; active: boolean }) {
  const group = useRef<THREE.Group>(null);
  const idx = useMemo(() => Array.from({ length: 9 }, (_, i) => i), []);
  useFrame(({ clock }) => {
    const g = group.current;
    if (!g) return;
    const p = player.current;
    const dx = LEAK.x - p.x, dz = LEAK.z - p.z;
    const d = Math.hypot(dx, dz);
    g.visible = active && d > 2.6;
    if (!g.visible) return;
    g.position.set(p.x, 0.05, p.z);
    g.rotation.y = Math.atan2(dx, dz);
    g.children.forEach((c, i) => {
      const s = 0.55 + 0.45 * Math.max(0, Math.sin(clock.elapsedTime * 4 - i * 0.7));
      c.position.set(0, 0, 1 + (i * (d - 2.4)) / 9);
      c.scale.setScalar(s);
    });
  });
  return (
    <group ref={group} visible={false}>
      {idx.map((i) => (
        <mesh key={i} rotation={[Math.PI / 2, 0, 0]}><coneGeometry args={[0.13, 0.34, 3]} /><meshBasicMaterial color="#69e8ff" transparent opacity={0.85} /></mesh>
      ))}
    </group>
  );
}

function Vapor({ active, reduced }: { active: boolean; reduced: boolean }) {
  const ref = useRef<THREE.Points>(null);
  const seeds = useMemo(() => Array.from({ length: 48 }, (_, i) => (Math.sin(i * 12.9898) * 43758.5453) % 1), []);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(48 * 3), 3));
    return g;
  }, []);
  useEffect(() => () => geo.dispose(), [geo]);
  useFrame(({ clock }) => {
    const pts = ref.current;
    if (!pts) return;
    pts.visible = active;
    if (!active || reduced) return;
    const arr = geo.attributes.position.array as Float32Array;
    seeds.forEach((s0, i) => {
      const s = Math.abs(s0);
      const ph = (clock.elapsedTime * 0.55 + s) % 1;
      arr[i * 3] = -3.7 + ph * 1.6;
      arr[i * 3 + 1] = 1.35 + Math.sin(s * 20 + ph * 5) * 0.25 + ph * 0.4;
      arr[i * 3 + 2] = LEAK.z + (s - 0.5) * 0.9;
    });
    geo.attributes.position.needsUpdate = true;
  });
  return <points ref={ref} geometry={geo}><pointsMaterial color="#d8f3ff" size={0.07} transparent opacity={0.5} depthWrite={false} /></points>;
}

function Dust({ reduced }: { reduced: boolean }) {
  const ref = useRef<THREE.Points>(null);
  const base = useMemo(() => Array.from({ length: 70 }, (_, i) => ({
    x: Math.sin(i * 91.7) * 3.6, y: 0.4 + Math.abs(Math.sin(i * 37.1)) * 3.6, z: Math.sin(i * 17.3) * 10, p: i * 0.37,
  })), []);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const a = new Float32Array(base.length * 3);
    base.forEach((b, i) => { a[i * 3] = b.x; a[i * 3 + 1] = b.y; a[i * 3 + 2] = b.z; });
    g.setAttribute("position", new THREE.BufferAttribute(a, 3));
    return g;
  }, [base]);
  useEffect(() => () => geo.dispose(), [geo]);
  useFrame(({ clock }) => {
    if (reduced) return;
    const arr = geo.attributes.position.array as Float32Array;
    base.forEach((b, i) => {
      arr[i * 3] = b.x + Math.sin(clock.elapsedTime * 0.12 + b.p) * 0.25;
      arr[i * 3 + 1] = b.y + Math.sin(clock.elapsedTime * 0.09 + b.p * 2) * 0.2;
    });
    geo.attributes.position.needsUpdate = true;
  });
  return <points ref={ref} geometry={geo}><pointsMaterial color="#cfe6ff" size={0.025} transparent opacity={0.55} depthWrite={false} /></points>;
}

function Cabin({ alert, repaired, powerCritical, scanning, holo, reduced }: {
  alert: boolean; repaired: boolean; powerCritical: boolean; scanning: boolean; holo: boolean; reduced: boolean;
}) {
  const { plain, mars } = useSpaceTextures();
  const leakLight = useRef<THREE.PointLight>(null);
  useFrame(({ clock }) => {
    const l = leakLight.current;
    if (!l) return;
    l.intensity = repaired ? 1.5 : scanning ? 3 + Math.sin(clock.elapsedTime * 30) * 1.2 : alert ? 3.3 : 0.3;
  });
  const trim = alert ? "#ff5a4a" : powerCritical ? "#d9744f" : "#7cc8e7";
  const ribs = [-8, -4, 0, 4, 8];
  return (
    <group>
      <ambientLight intensity={powerCritical ? 0.22 : 0.55} color="#9fc4e6" />
      <hemisphereLight args={["#b7e4ff", "#0a101b", powerCritical ? 0.35 : 0.9]} />
      {/* shell */}
      <mesh position={[0, -0.17, 0]} receiveShadow><boxGeometry args={[9, 0.32, 23]} /><meshStandardMaterial color="#20384d" metalness={0.62} roughness={0.34} /></mesh>
      <mesh position={[0, 4.6, 0]}><boxGeometry args={[9, 0.28, 23]} /><meshStandardMaterial color="#203345" metalness={0.72} roughness={0.34} /></mesh>
      {[-4.5, 4.5].map((x) => <mesh key={x} position={[x, 2.25, 0]} receiveShadow><boxGeometry args={[0.24, 4.65, 23]} /><meshStandardMaterial color="#263d52" metalness={0.65} roughness={0.34} /></mesh>)}
      {[11.5, -11.5].map((z) => <mesh key={z} position={[0, 2.23, z]}><boxGeometry args={[9, 4.55, 0.34]} /><meshStandardMaterial color="#1b3045" metalness={0.6} /></mesh>)}
      {/* curved coving + angled ceiling panels */}
      {[[-4.05, 0.28], [4.05, 0.28], [-4.05, 4.3], [4.05, 4.3]].map(([x, y]) => (
        <mesh key={`${x}-${y}`} position={[x, y, 0]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.42, 0.42, 22.6, 16]} /><meshStandardMaterial color="#2c4660" metalness={0.7} roughness={0.32} /></mesh>
      ))}
      {[-1, 1].map((s) => <mesh key={s} position={[s * 3.5, 4.1, 0]} rotation={[0, 0, s * Math.PI / 4]}><boxGeometry args={[1.5, 0.16, 22.4]} /><meshStandardMaterial color="#35506a" metalness={0.72} roughness={0.3} /></mesh>)}
      <gridHelper args={[8, 16, "#5889a2", "#34576d"]} position={[0, 0.012, 0]} />
      <mesh position={[0, 0.023, 0]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[3, 22]} /><meshBasicMaterial color="#3f86a8" transparent opacity={0.14} depthWrite={false} /></mesh>
      {ribs.map((z) => <Rib key={z} z={z} alert={alert} powerCritical={powerCritical} reduced={reduced} />)}
      {/* side walls: light strips, panels, pillars, windows, vents */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh position={[s * 3.9, 4.1, 0]}><boxGeometry args={[0.11, 0.16, 22]} /><meshBasicMaterial color={trim} transparent opacity={0.9} /></mesh>
          <mesh position={[s * 3.7, 0.07, 0]}><boxGeometry args={[0.08, 0.08, 21.7]} /><meshBasicMaterial color="#60cee9" /></mesh>
          {[-7, -2.5, 2, 6.5].map((z, i) => (
            <group key={z} position={[s * 3.85, 1.8, z]} rotation={[0, s === 1 ? Math.PI / 2 : -Math.PI / 2, 0]}>
              <ScreenPanel position={[0, 0, 0]} danger={alert && i === 1 && s === -1} />
            </group>
          ))}
          {[-6, 0, 6].map((z) => <mesh key={z} position={[s * 3.65, 3, z]}><cylinderGeometry args={[0.1, 0.1, 3.6, 10]} /><meshStandardMaterial color="#7998b1" metalness={0.84} /></mesh>)}
          {[-4.75, 4.25].map((z) => (
            <group key={z} position={[s * 4.34, 3.25, z]} rotation={[0, s === 1 ? -Math.PI / 2 : Math.PI / 2, 0]}>
              <mesh position={[0, 0, -0.01]}><boxGeometry args={[2.6, 1.25, 0.06]} /><meshStandardMaterial color="#0f2234" metalness={0.8} roughness={0.25} /></mesh>
              <mesh><planeGeometry args={[2.4, 1.05]} /><meshBasicMaterial map={plain} /></mesh>
            </group>
          ))}
          {/* ventilation grille */}
          <group position={[s * 4.36, 2.1, 4.25]} rotation={[0, s === 1 ? -Math.PI / 2 : Math.PI / 2, 0]}>
            <mesh><boxGeometry args={[1.3, 0.7, 0.05]} /><meshStandardMaterial color="#1a2c3d" metalness={0.7} /></mesh>
            {[-0.24, -0.08, 0.08, 0.24].map((y) => <mesh key={y} position={[0, y, 0.03]}><boxGeometry args={[1.1, 0.04, 0.02]} /><meshStandardMaterial color="#5f7d94" metalness={0.8} /></mesh>)}
          </group>
        </group>
      ))}
      {/* crew support: lockers (aft), science console (right) */}
      {[7.9, 8.7, 9.5].map((z) => <mesh key={z} position={[3.95, 1, z]} castShadow><boxGeometry args={[0.55, 2, 0.74]} /><meshStandardMaterial color="#2d4660" metalness={0.6} roughness={0.38} /></mesh>)}
      <group position={[3.5, 0, 4.25]}>
        <mesh castShadow><boxGeometry args={[0.7, 0.95, 2.2]} /><meshStandardMaterial color="#1f3347" metalness={0.65} roughness={0.34} /></mesh>
        <mesh position={[-0.1, 1.2, 0]} rotation={[0, 0, -0.35]}><boxGeometry args={[0.05, 0.55, 1.5]} /><meshBasicMaterial color="#4dbfe6" /></mesh>
        <mesh position={[-0.2, 0.52, 0.5]}><boxGeometry args={[0.04, 0.08, 0.6]} /><meshBasicMaterial color="#7be4ff" /></mesh>
      </group>
      <mesh position={[-3.95, 1.1, -0.25]} castShadow><boxGeometry args={[0.6, 2.2, 1.7]} /><meshStandardMaterial color="#2b4560" metalness={0.6} roughness={0.38} /></mesh>
      {/* forward viewing gallery with Mars in the distance */}
      <mesh position={[0, 2.9, -11.32]}><boxGeometry args={[6.9, 2.15, 0.1]} /><meshStandardMaterial color="#061527" metalness={0.6} roughness={0.22} /></mesh>
      <mesh position={[0, 2.9, -11.25]}><planeGeometry args={[6.48, 1.72]} /><meshBasicMaterial map={mars} /></mesh>
      <HoloTable active={holo} repaired={repaired} reduced={reduced} />
      <Dust reduced={reduced} />
      {/* maintenance compartment (life-support bay) */}
      <group position={[-3.85, 1.5, LEAK.z]} rotation={[0, Math.PI / 2, 0]}>
        <mesh castShadow><boxGeometry args={[2.2, 1.95, 0.28]} /><meshStandardMaterial color="#52697e" metalness={0.65} roughness={0.32} /></mesh>
        <mesh position={[0, 0, -0.17]}><boxGeometry args={[1.62, 1.38, 0.055]} /><meshStandardMaterial color="#0e293d" metalness={0.65} /></mesh>
        <mesh position={[0, 0.35, -0.21]}><boxGeometry args={[0.94, 0.08, 0.04]} /><meshBasicMaterial color={repaired ? "#5ef0cf" : "#fa667b"} /></mesh>
        <mesh position={[0, -0.16, -0.21]} rotation={[0, 0, 0.5]}><boxGeometry args={[0.9, 0.12, 0.08]} /><meshStandardMaterial color={repaired ? "#76b3b4" : "#ed657b"} emissive={repaired ? "#295d55" : "#bd304d"} emissiveIntensity={0.48} /></mesh>
        {[-1, 1].map((s) => <mesh key={s} position={[s * 1.15, 0, -0.05]}><cylinderGeometry args={[0.07, 0.07, 2.1, 10]} /><meshStandardMaterial color="#8aa4b8" metalness={0.85} roughness={0.3} /></mesh>)}
        {[-0.95, -0.55, -0.15, 0.25, 0.65].map((x, i) => <mesh key={x} position={[x, 1.02, -0.02]}><boxGeometry args={[0.3, 0.07, 0.3]} /><meshStandardMaterial color={i % 2 ? "#1a1a1a" : "#e8b23a"} /></mesh>)}
      </group>
      <pointLight ref={leakLight} position={[-3.4, 1.8, LEAK.z]} color={repaired ? "#72ffe0" : "#ff5073"} intensity={0.3} distance={5} />
      <Vapor active={alert && !repaired} reduced={reduced} />
      <mesh position={[-2.5, 0.03, LEAK.z]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.82, 0.92, 48]} /><meshBasicMaterial color={repaired ? "#54e8bf" : "#ff5768"} transparent opacity={0.85} side={THREE.DoubleSide} /></mesh>
      {scanning && <mesh position={[-3.7, 1.5, LEAK.z]} rotation={[0, Math.PI / 2, 0]}><planeGeometry args={[2.2, 2]} /><meshBasicMaterial color="#6fdcff" transparent opacity={0.16} side={THREE.DoubleSide} depthWrite={false} /></mesh>}
      <Html position={[-2.8, 2.9, LEAK.z]} center distanceFactor={9} zIndexRange={[1, 0]} style={{ pointerEvents: "none" }}>
        <div className={`l2-worldtag ${repaired ? "safe" : ""}`}>{repaired ? "SYSTEM SEALED · VERIFIED" : "O₂ LIFE-SUPPORT BAY"}</div>
      </Html>
    </group>
  );
}

function PlayerLights({ player, alert }: { player: Ref<THREE.Vector3>; alert: boolean }) {
  const dir = useRef<THREE.DirectionalLight>(null);
  const rim = useRef<THREE.PointLight>(null);
  const target = useMemo(() => new THREE.Object3D(), []);
  useFrame(() => {
    const p = player.current;
    if (dir.current) dir.current.position.set(p.x + 2.5, 7, p.z + 3.5);
    target.position.set(p.x, 0, p.z);
    target.updateMatrixWorld();
    if (rim.current) rim.current.position.set(p.x - 1.4, 2.3, p.z - 1.2);
  });
  return (
    <>
      <primitive object={target} />
      <directionalLight ref={dir} target={target} intensity={1.5} color={alert ? "#ffd0c8" : "#cfe8ff"} castShadow
        shadow-mapSize={[1024, 1024]} shadow-camera-left={-4} shadow-camera-right={4} shadow-camera-top={4} shadow-camera-bottom={-4}
        shadow-camera-near={1} shadow-camera-far={22} shadow-bias={-0.0004} />
      <pointLight ref={rim} intensity={3} distance={6} color={alert ? "#ff7a6a" : "#8fd8ff"} />
    </>
  );
}

// ---------------------------------------------------------------- movement + cinematic camera
function Rig({ player, heading, moving, running, keys, enabled, paused, camMode, onNear, onStep }: {
  player: Ref<THREE.Vector3>; heading: Ref<number>; moving: Ref<boolean>; running: Ref<boolean>;
  keys: Ref<Set<string>>; enabled: Ref<boolean>; paused: Ref<boolean>; camMode: Ref<CamMode>;
  onNear: (near: boolean) => void; onStep: (run: boolean) => void;
}) {
  const camera = useThree((s) => s.camera);
  const nearRef = useRef(false);
  const stepAcc = useRef(0);
  const clock = useRef(0);
  const lastMode = useRef<CamMode>("follow");
  const eye = useMemo(() => new THREE.Vector3(), []);
  const look = useMemo(() => new THREE.Vector3(), []);
  const lookCur = useMemo(() => new THREE.Vector3(PLAYER_SPAWN.x, 1.2, PLAYER_SPAWN.z - 1.8), []);

  useFrame((_, dt) => {
    const t = Math.min(dt, 0.045);
    if (lastMode.current !== camMode.current) { lastMode.current = camMode.current; clock.current = 0; }
    clock.current += t;
    const k = keys.current;
    const can = enabled.current && !paused.current;
    const fwd = Number(k.has("KeyW") || k.has("ArrowUp")) - Number(k.has("KeyS") || k.has("ArrowDown"));
    const side = Number(k.has("KeyD") || k.has("ArrowRight")) - Number(k.has("KeyA") || k.has("ArrowLeft"));
    const mag = Math.hypot(fwd, side);
    const go = can && mag > 0.01;
    moving.current = go;
    running.current = go && (k.has("ShiftLeft") || k.has("ShiftRight"));
    const p = player.current;
    if (go) {
      const sp = running.current ? 4.4 : 2.75;
      let ax = clamp(p.x + (side / mag) * sp * t, -2.98, 2.98);
      let az = clamp(p.z - (fwd / mag) * sp * t, -9.25, 8.2);
      for (const o of OBSTACLES) {
        const dx = ax - o.x, dz = az - o.z, d = Math.hypot(dx, dz), min = o.r + 0.32;
        if (d < min && d > 0.0001) { ax = o.x + (dx / d) * min; az = o.z + (dz / d) * min; }
      }
      p.x = clamp(ax, -2.98, 2.98);
      p.z = clamp(az, -9.25, 8.2);
      heading.current = Math.atan2(side, -fwd);
      stepAcc.current += t;
      if (stepAcc.current > (running.current ? 0.27 : 0.44)) { stepAcc.current = 0; onStep(running.current); }
    } else stepAcc.current = 0;
    const near = Math.hypot(p.x - LEAK.x, p.z - LEAK.z) < 2.0;
    if (near !== nearRef.current) { nearRef.current = near; onNear(near); }

    const mode = camMode.current;
    let fov = 59;
    if (mode === "intro") {
      eye.set(p.x + 3.4, 1.75, p.z + 3.4 + clock.current * 0.22); look.set(p.x, 1.35, p.z - 0.6); fov = 48;
    } else if (mode === "repair") {
      eye.set(p.x + 1.9, 1.7, p.z + 2.0); look.set(-3.7, 1.4, LEAK.z); fov = 50;
    } else if (mode === "closeup") {
      if (!go) heading.current = 0.12;
      eye.set(p.x + 0.35, 1.6, p.z + 1.45); look.set(p.x, 1.56, p.z); fov = 34;
    } else if (mode === "pullback") {
      const f = Math.min(1, clock.current / 5);
      eye.set(p.x + 0.35 + 1.6 * f, 1.6 + 1.1 * f, p.z + 1.45 + 3.4 * f);
      look.set(p.x, 1.56 - 0.3 * f, p.z - 0.5 * f); fov = 34 + 24 * f;
    } else {
      eye.set(p.x + 2, 2.85, p.z + 5); look.set(p.x, 1.24, p.z - 1.8);
    }
    // Keep the camera inside the hull so it never clips through walls.
    eye.x = clamp(eye.x, -3.9, 3.9); eye.y = clamp(eye.y, 0.9, 4.2); eye.z = clamp(eye.z, -10.2, 10.5);
    const rate = 1 - Math.exp(-(mode === "follow" ? 5 : 2.6) * t);
    camera.position.lerp(eye, rate);
    lookCur.lerp(look, rate);
    camera.lookAt(lookCur);
    const cam = camera as THREE.PerspectiveCamera;
    if (Math.abs(cam.fov - fov) > 0.05) { cam.fov += (fov - cam.fov) * rate; cam.updateProjectionMatrix(); }
  });
  return null;
}

// ---------------------------------------------------------------- UI pieces
const KIND_LABEL: Record<Kind, string> = { story: "STORY", science: "SCIENCE", objective: "OBJECTIVE", warning: "WARNING", result: "GAME RESULT" };

function Callout({ kind, title, children }: { kind: Kind; title?: string; children: ReactNode }) {
  return <div className={`l2-callout k-${kind}`}><span className="l2-tag">{title ?? KIND_LABEL[kind]}</span><div>{children}</div></div>;
}

function AuraOrb({ size = 54 }: { size?: number }) {
  return (
    <svg className="l2-orb" width={size} height={size} viewBox="-30 -30 60 60" aria-hidden="true">
      <circle r="27" className="ring" />
      <polygon className="tri a" points="0,-24 20.8,12 -20.8,12" />
      <polygon className="tri b" points="0,24 20.8,-12 -20.8,-12" />
      <circle r="8" className="core" />
    </svg>
  );
}

const mapX = (z: number) => 150 - (z / 11) * 118;
const mapY = (x: number) => 60 + x * 10;

function ShipMap({ detail = false, safe = false, scanning = false, pos }: { detail?: boolean; safe?: boolean; scanning?: boolean; pos: Point }) {
  const lx = mapX(LEAK.z), ly = mapY(LEAK.x);
  const tone = safe ? "#5bedbd" : "#fa556c";
  return (
    <svg viewBox="0 0 300 120" role="img" aria-label="Simplified spacecraft map. The life-support bay is on the forward left side.">
      <rect x="26" y="10" width="248" height="100" rx="26" fill="#061a2b" stroke="#4fb0d2" strokeWidth="1.6" />
      <path d="M30 60 H270" stroke="#245a78" strokeDasharray="5 5" />
      <rect x="190" y="16" width="62" height="34" rx="5" fill={safe ? "#16473f" : "#4a2030"} stroke={tone} />
      <rect x="130" y="70" width="52" height="34" rx="5" fill="#17435a" stroke="#598aa5" />
      <rect x="40" y="16" width="70" height="34" rx="5" fill="#17435a" stroke="#598aa5" />
      <rect x="40" y="70" width="70" height="34" rx="5" fill="#17435a" stroke="#598aa5" />
      {scanning && <rect y="12" width="3" height="96" fill="#7be8ff" opacity=".6"><animate attributeName="x" from="30" to="270" dur="2.4s" repeatCount="indefinite" /></rect>}
      {!safe && <circle cx={lx} cy={ly} r="8" fill="none" stroke={tone} strokeWidth="1.5"><animate attributeName="r" values="8;20" dur="1.6s" repeatCount="indefinite" /><animate attributeName="opacity" values=".9;0" dur="1.6s" repeatCount="indefinite" /></circle>}
      <circle cx={lx} cy={ly} r="7" fill={tone} stroke="#fff" strokeWidth="1.2" />
      <circle cx={mapX(pos.z)} cy={mapY(pos.x)} r="4.5" fill="#96f0ff" stroke="#09192d" strokeWidth="1.5" />
      {detail && <g fill="#c9e9f8" fontSize="8" textAnchor="middle"><text x="221" y="62">LIFE SUPPORT</text><text x="156" y="114">COMMAND</text><text x="75" y="62">CREW</text><text x="75" y="114">SCIENCE</text></g>}
    </svg>
  );
}

function useTypewriter(text: string, run: boolean, reduced: boolean) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!run) { setN(0); return; }
    if (reduced) { setN(text.length); return; }
    setN(0);
    let i = 0;
    const id = window.setInterval(() => { i += 2; setN(Math.min(text.length, i)); if (i >= text.length) window.clearInterval(id); }, 22);
    return () => window.clearInterval(id);
  }, [text, run, reduced]);
  return text.slice(0, n);
}

/** Abstract, safe "seal alignment" activity: stop the sliding marker inside the green zone 3 times. */
function SealMinigame({ reduced, play, onDone }: { reduced: boolean; play: (c: Cue) => void; onDone: () => void }) {
  const ZONES = [{ c: 0.5, w: 0.26 }, { c: 0.3, w: 0.22 }, { c: 0.68, w: 0.18 }];
  const [locked, setLocked] = useState(0);
  const [miss, setMiss] = useState(0);
  const [verifying, setVerifying] = useState(false);
  const [flash, setFlash] = useState<"ok" | "miss" | null>(null);
  const marker = useRef<HTMLSpanElement>(null);
  const pos = useRef(0);
  const dir = useRef(1);
  const lockedRef = useRef(0);
  const busy = useRef(false);

  useEffect(() => {
    let raf = 0, last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const sp = (reduced ? 0.3 : 0.55) + 0.12 * lockedRef.current;
      pos.current += dir.current * sp * dt;
      if (pos.current > 1) { pos.current = 1; dir.current = -1; }
      if (pos.current < 0) { pos.current = 0; dir.current = 1; }
      if (marker.current) marker.current.style.left = `${pos.current * 100}%`;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);

  useEffect(() => {
    if (!verifying) return;
    const id = window.setTimeout(onDone, 1300);
    return () => window.clearTimeout(id);
  }, [verifying, onDone]);

  const lock = useCallback(() => {
    if (busy.current) return;
    const z = ZONES[lockedRef.current];
    if (Math.abs(pos.current - z.c) <= z.w / 2) {
      lockedRef.current += 1;
      setLocked(lockedRef.current);
      setFlash("ok");
      play("verify");
      if (lockedRef.current >= 3) { busy.current = true; setVerifying(true); play("scan"); }
    } else {
      setMiss((m) => m + 1);
      setFlash("miss");
      play("repair");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [play]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "Enter" || e.code === "KeyE") { e.preventDefault(); if (!e.repeat) lock(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lock]);

  const zone = ZONES[Math.min(locked, 2)];
  return (
    <div className="l2-work" role="dialog" aria-modal="true" aria-label="Seal alignment activity">
      <div className="l2-eyebrow">AURA · VIRTUAL MAINTENANCE PANEL</div>
      <h2>ALIGN THE SEAL INDICATOR</h2>
      <p>Stop the marker inside the green zone. Three clean locks complete the simulated seal. This is a game activity, not a real repair procedure.</p>
      <div className="l2-track" aria-hidden="true">
        {!verifying && <span className="l2-zone" style={{ left: `${(zone.c - zone.w / 2) * 100}%`, width: `${zone.w * 100}%` }} />}
        <span ref={marker} className={`l2-marker ${flash ?? ""}`} />
      </div>
      <div className="l2-locks" aria-label={`${locked} of 3 locks`}>{[0, 1, 2].map((i) => <i key={i} className={i < locked ? "on" : ""} />)}</div>
      {verifying
        ? <div className="l2-verify" role="status">VERIFYING SEAL…</div>
        : <button type="button" className="l2-btn primary wide" onClick={lock} autoFocus>LOCK SEAL · SPACE</button>}
      {miss >= 2 && !verifying && <button type="button" className="l2-btn wide" style={{ marginTop: 10 }} onClick={() => { busy.current = true; setLocked(3); setVerifying(true); play("scan"); }}>AURA ASSIST · AUTO-ALIGN</button>}
      <div className="l2-feedback" aria-live="polite">{flash === "miss" ? "Marker outside the zone. Try again." : flash === "ok" ? "Lock accepted." : "\u00a0"}</div>
    </div>
  );
}

function TouchControl({ code, text, keys }: { code: string; text: string; keys: Ref<Set<string>> }) {
  const down = (e: ReactPointerEvent<HTMLButtonElement>) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); keys.current.add(code); };
  const up = (e: ReactPointerEvent<HTMLButtonElement>) => { e.preventDefault(); keys.current.delete(code); };
  return <button className="l2-touch" aria-label={text} type="button" onPointerDown={down} onPointerUp={up} onPointerCancel={up}>{text}</button>;
}

// ---------------------------------------------------------------- styles
const l2Css = `
.l2-root{--f:${FONT};--red:#ff5a45;--cyan:#6fe0ff;--ink:#040a14;--text:#eaf5fc;position:absolute;inset:0;z-index:45;background:#020611;color:var(--text);overflow:hidden;font-family:var(--f);isolation:isolate}
.l2-root *{box-sizing:border-box}
.l2-scene{position:absolute;inset:0;z-index:0}
.l2-vignette{position:absolute;inset:0;z-index:1;pointer-events:none;background:radial-gradient(ellipse at center,transparent 45%,#01040acc 100%),linear-gradient(0deg,#030a1a99,transparent 24%,transparent 78%,#030a1a77)}
.l2-alertv{position:absolute;inset:0;z-index:1;pointer-events:none;background:radial-gradient(ellipse at center,transparent 50%,#d4183740 100%);animation:l2-pulse 2.6s ease-in-out infinite}
.l2-bars i{position:absolute;left:0;right:0;z-index:6;height:7vh;background:#000;pointer-events:none;animation:l2-bar .9s ease both}
.l2-bars i:first-child{top:0;--s:-100%}.l2-bars i:last-child{bottom:0;--s:100%}
.l2-top{position:absolute;z-index:5;top:0;left:0;right:0;display:flex;justify-content:space-between;align-items:flex-start;gap:14px;padding:clamp(12px,2vw,26px);pointer-events:none}
.l2-top>*{pointer-events:auto}
.l2-brand{border-left:3px solid var(--cyan);padding:3px 0 3px 12px;text-shadow:0 2px 14px #02050d}
.l2-brand small{display:block;font-size:11px;letter-spacing:.2em;color:#9bdff5}
.l2-brand strong{display:block;font-size:clamp(15px,1.7vw,24px);letter-spacing:.04em;margin-top:5px}
.l2-brand span{display:block;font-size:11px;color:#b4cadd;margin-top:4px;letter-spacing:.08em}
.l2-hud-r{display:flex;flex-direction:column;align-items:flex-end;gap:8px}
.l2-meters{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
.l2-meter{width:clamp(118px,13vw,178px);padding:9px 12px;background:#071c30d9;border:1px solid #8fc7de55;border-radius:8px;backdrop-filter:blur(10px)}
.l2-meter label{display:flex;justify-content:space-between;align-items:baseline;font-size:11px;font-weight:700;letter-spacing:.12em;color:#9bcee3}
.l2-meter b{font-size:clamp(16px,1.7vw,24px);color:#fff;font-variant-numeric:tabular-nums}
.l2-track-bar{height:5px;border-radius:9px;margin-top:7px;background:#325065;overflow:hidden}
.l2-track-bar i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#4eabdd,#9cf7fb);transition:width .3s}
.l2-meter.danger{border-color:#f96d7b99}.l2-meter.danger i{background:linear-gradient(90deg,#b7284a,#ff8a81)}.l2-meter.danger b{color:#ffc1c4}
.l2-chip{display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:8px;background:#071c30d9;border:1px solid #8fc7de55;font-size:11px;letter-spacing:.14em;font-weight:700;color:#bfeaff}
.l2-chip .dot{width:8px;height:8px;border-radius:50%;background:var(--cyan);box-shadow:0 0 10px var(--cyan)}
.l2-chip.alert{color:#ffc8c0;border-color:#ff7a6a88}.l2-chip.alert .dot{background:var(--red);box-shadow:0 0 10px var(--red)}
.l2-ctrls{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
.l2-btn,.l2-iconbtn{cursor:pointer;font:700 12px var(--f);letter-spacing:.12em;border:1px solid #a4e9ff66;border-radius:8px;background:#09263cde;color:var(--text);padding:11px 15px;min-height:42px;transition:background .2s,transform .15s,border-color .2s}
.l2-btn:hover,.l2-iconbtn:hover{background:#154765;border-color:#d4f5ff}.l2-btn:active,.l2-iconbtn:active{transform:scale(.97)}
.l2-btn:focus-visible,.l2-iconbtn:focus-visible,.l2-touch:focus-visible,.l2-choice:focus-visible,.l2-start:focus-visible{outline:2px solid #fff;outline-offset:3px}
.l2-btn.primary{background:linear-gradient(100deg,#ff8a4a,#e8423a);border-color:#ffc9a6;color:#fff;box-shadow:0 8px 34px #e8423a55}
.l2-btn.primary:hover{filter:brightness(1.1)}.l2-btn.wide{width:100%;padding:15px}
.l2-progress{position:absolute;z-index:5;top:clamp(12px,2vw,26px);left:50%;transform:translateX(-50%);display:flex;gap:5px;pointer-events:none}
.l2-progress i{width:clamp(22px,4vw,54px);height:4px;border-radius:3px;background:#3a5568;transition:background .4s}
.l2-progress i.on{background:var(--cyan)}.l2-progress i.hot{background:var(--red)}
.l2-bottom{position:absolute;z-index:5;left:clamp(12px,2vw,28px);right:clamp(12px,2vw,28px);bottom:clamp(12px,2vw,28px);display:flex;justify-content:space-between;align-items:flex-end;gap:14px;pointer-events:none}
.l2-bottom>*{pointer-events:auto}
.l2-callout{display:flex;gap:12px;align-items:flex-start;padding:12px 16px;border-radius:8px;background:#061a2bdb;border:1px solid #96d5e747;border-left-width:4px;backdrop-filter:blur(12px);font-size:13px;line-height:1.55;color:#e3f3fa;max-width:min(520px,100%)}
.l2-callout p{margin:0}.l2-callout+.l2-callout{margin-top:10px}
.l2-tag{flex:none;font-size:10px;letter-spacing:.16em;font-weight:800;padding:3px 7px;border-radius:4px;margin-top:2px;white-space:nowrap}
.k-story{border-left-color:#6fe0ff}.k-story .l2-tag{background:#12475a;color:#a8ecff}
.k-science{border-left-color:#74e8b2}.k-science .l2-tag{background:#12482f;color:#a7f5cd}
.k-objective{border-left-color:#ffb35c}.k-objective .l2-tag{background:#5a3a12;color:#ffd6a0}
.k-warning{border-left-color:#ff5a45}.k-warning .l2-tag{background:#5a1a1a;color:#ffc2b8}
.k-result{border-left-color:#b79bff}.k-result .l2-tag{background:#33265a;color:#d9ccff}
.l2-near{display:flex;align-items:center;gap:10px;background:linear-gradient(100deg,#ffa05a,#ee6247);color:#0a1420;padding:14px 20px;border-radius:10px;border:0;cursor:pointer;font:800 13px var(--f);letter-spacing:.08em;box-shadow:0 12px 35px #ff934d66}
.l2-near kbd{background:#082132;color:#fff;padding:4px 8px;border-radius:5px;font:inherit}
.l2-map{position:absolute;z-index:4;right:clamp(12px,2vw,26px);top:clamp(150px,13vw,190px);width:clamp(170px,19vw,250px);background:#061a2bdc;border:1px solid #84c9e659;border-radius:10px;padding:10px 12px;backdrop-filter:blur(12px)}
.l2-map h4{margin:0 0 6px;font-size:10px;letter-spacing:.18em;color:#9bdef3}.l2-map svg{display:block;width:100%}.l2-map p{margin:6px 0 0;font-size:10px;letter-spacing:.06em;color:#ffb5b1}.l2-map p.ok{color:#9ff5d8}
.l2-modal{position:absolute;z-index:12;inset:0;display:flex;justify-content:center;align-items:center;padding:20px;background:#020815b3;backdrop-filter:blur(10px);animation:l2-in .5s both;overflow-y:auto}
.l2-card{position:relative;width:min(700px,100%);max-height:calc(100dvh - 40px);overflow:auto;border:1px solid #85d9f56e;border-radius:14px;padding:clamp(22px,3.6vw,40px);background:linear-gradient(136deg,#112e46f2,#071a2ff7 60%,#081321f7);box-shadow:0 30px 110px #000e;animation:l2-rise .55s both}
.l2-card.danger{border-color:#ff758577}.l2-card.center{text-align:center}
.l2-eyebrow{font-size:11px;letter-spacing:.22em;font-weight:800;color:#8bdff6}.l2-eyebrow.danger{color:#ffb5a9}.l2-eyebrow.ok{color:#9ff5d8}
.l2-card h1,.l2-card h2{margin:14px 0;font-weight:800;line-height:1.05;letter-spacing:-.01em;font-size:clamp(30px,4.6vw,56px)}
.l2-card p{font-size:clamp(14px,1.3vw,16px);line-height:1.7;color:#c8ddea;margin:10px 0 18px}
.l2-grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:16px 0}
.l2-box{padding:14px;border-radius:8px;background:#0b31486a;border:1px solid #6fbad35d}.l2-box b{display:block;font-size:10px;letter-spacing:.14em;color:#8fe5ee}.l2-box p{margin:7px 0 0;font-size:13px;line-height:1.55}
.l2-box.limit b{color:#ffb78a}.l2-box.game b{color:#d9ccff}
.l2-delta{display:flex;flex-wrap:wrap;gap:8px;margin:6px 0 14px}.l2-delta span{padding:7px 11px;border-radius:6px;font-size:12px;font-weight:700;letter-spacing:.06em;background:#0b3148;border:1px solid #6fbad35d}.l2-delta .up{color:#9ff5d8}.l2-delta .down{color:#ffb0a6}.l2-delta .flat{color:#cfe0ea}
.l2-dock{position:absolute;z-index:11;right:clamp(12px,2vw,28px);top:clamp(84px,9vw,110px);bottom:clamp(12px,2vw,28px);width:min(430px,calc(100% - 24px));overflow:auto;padding:18px;border-radius:12px;background:linear-gradient(150deg,#0b2740f2,#061523f5);border:1px solid #79d3f066;box-shadow:0 20px 70px #000a;animation:l2-slide .55s both}
.l2-aura-head{display:flex;align-items:center;gap:12px;margin-bottom:12px}.l2-aura-head small{display:block;font-size:10px;letter-spacing:.18em;color:#9fd9ec}.l2-aura-head b{font-size:14px;letter-spacing:.08em}.l2-aura-head .l2-btn{margin-left:auto;min-height:34px;padding:7px 10px;font-size:10px}
.l2-line{margin:8px 0;padding:10px 12px;border-radius:8px;background:#0a2a42a0}.l2-line small{font-size:10px;letter-spacing:.16em;font-weight:800;color:#8fe5ee}.l2-line.mysha small{color:#ffcfa3}.l2-line p{margin:5px 0 0;font-size:14px;line-height:1.55;color:#eaf5fc;min-height:22px}
.l2-schematic{background:#041221c9;border:1px solid #589cc46b;border-radius:8px;padding:8px;margin:10px 0}.l2-schematic svg{display:block;width:100%}
.l2-choice{display:block;width:100%;text-align:left;margin-top:10px;padding:14px 16px;border-radius:10px;border:1px solid #8ddcf56e;background:#08233ad9;color:var(--text);cursor:pointer;font-family:var(--f);transition:transform .2s,background .2s,border-color .2s}
.l2-choice:hover{transform:translateY(-2px);background:#17415b;border-color:#bfeeff}
.l2-choice small{font-size:10px;letter-spacing:.16em;font-weight:800;color:#8bd9f0}.l2-choice b{display:block;font-size:16px;margin:6px 0;letter-spacing:.02em}.l2-choice span{display:block;font-size:12px;line-height:1.55;color:#b7d0dd}
.l2-orb .ring{fill:none;stroke:#6fdcff;stroke-width:1;opacity:.5}.l2-orb .tri{fill:none;stroke:#8be8ff;stroke-width:1.4;transform-origin:0 0}.l2-orb .a{animation:l2-spin 14s linear infinite}.l2-orb .b{animation:l2-spin 20s linear infinite reverse}.l2-orb .core{fill:#bff6ff;filter:drop-shadow(0 0 5px #6fdcff);animation:l2-pulse 2.4s ease-in-out infinite}
.l2-work{position:absolute;z-index:14;left:50%;top:50%;transform:translate(-50%,-50%);width:min(480px,92vw);padding:28px;text-align:center;background:#081e32f4;border:1px solid #9edcfa99;border-radius:14px;box-shadow:0 25px 90px #000b}
.l2-work h2{margin:10px 0;font-size:22px;letter-spacing:.06em}.l2-work p{font-size:13px;line-height:1.6;color:#c9e1eb}
.l2-track{position:relative;height:30px;margin:18px 0 12px;border-radius:6px;background:#0b2234;border:1px solid #4f8fae}
.l2-zone{position:absolute;top:0;bottom:0;background:#3fe0a455;border:1px solid #7ff3c8}
.l2-marker{position:absolute;top:-5px;width:4px;height:38px;margin-left:-2px;border-radius:2px;background:#fff;box-shadow:0 0 12px #fff}.l2-marker.miss{background:#ff8d84}
.l2-locks{display:flex;justify-content:center;gap:10px;margin-bottom:16px}.l2-locks i{width:30px;height:8px;border-radius:4px;background:#2c4a5f}.l2-locks i.on{background:#7ff3c8;box-shadow:0 0 10px #7ff3c8}
.l2-verify{font-weight:800;letter-spacing:.16em;color:#9ff5d8;animation:l2-pulse 1s ease-in-out infinite}.l2-feedback{min-height:20px;margin-top:10px;font-size:12px;color:#b7d0dd}
.l2-worldtag{background:#1a3243c9;border:1px solid #ff8e9575;padding:9px 12px;border-radius:6px;font-size:11px;color:#ffb8b6;white-space:nowrap;font-weight:800;letter-spacing:.12em}.l2-worldtag.safe{border-color:#89ebcc;color:#bcffee}
.l2-lower{position:absolute;z-index:7;left:clamp(12px,2vw,28px);bottom:calc(7vh + 18px);width:min(460px,calc(100% - 24px))}
.l2-banner{position:absolute;z-index:8;top:22%;left:0;right:0;text-align:center;pointer-events:none;animation:l2-in .6s both}
.l2-banner small{display:block;font-size:clamp(12px,1.4vw,16px);letter-spacing:.4em;font-weight:800;color:#ffb5a9}.l2-banner b{display:block;margin-top:8px;font-size:clamp(26px,4.6vw,60px);letter-spacing:.06em;color:#fff;text-shadow:0 0 30px #ff3b2e88}
.l2-daycard{position:absolute;z-index:8;left:50%;top:50%;transform:translate(-50%,-50%);text-align:center;width:min(92vw,820px);pointer-events:none;animation:l2-in 1.2s both}
.l2-daycard b{display:block;font-size:clamp(28px,5.5vw,70px);letter-spacing:.12em}.l2-daycard span{display:block;margin-top:10px;font-size:clamp(12px,1.5vw,18px);letter-spacing:.3em;color:#bfe8ff}.l2-daycard small{display:block;margin-top:14px;font-size:11px;color:#8fb1c4;letter-spacing:.1em}
.l2-ending{position:absolute;z-index:20;inset:0;display:grid;place-items:center;padding:20px;background:radial-gradient(ellipse at 50% 40%,#12243a99,#030918ee);animation:l2-in 1.2s both}
.l2-ending h2{margin:10px 0 4px}.l2-status2{display:flex;flex-direction:column;gap:6px;margin:14px 0 6px;font-weight:800;letter-spacing:.2em;font-size:clamp(13px,1.6vw,18px)}.l2-status2 .g{color:#9ff5d8}.l2-status2 .r{color:#ff9d90}
.l2-next{margin:18px 0 6px;font-size:clamp(20px,3vw,32px);font-weight:800;letter-spacing:.14em;color:#ffd0a9}
.l2-touchpad{display:none;position:absolute;z-index:9;bottom:14px;left:10px;gap:5px;grid-template-columns:repeat(3,50px);grid-template-rows:repeat(2,48px)}
.l2-touch{touch-action:none;border-radius:10px;border:1px solid #a9e5f2;background:#0e3754d6;color:#e8faff;font-size:19px;user-select:none}
.l2-paused{position:absolute;z-index:25;inset:0;display:grid;place-items:center;background:#020815cc;backdrop-filter:blur(8px)}
.l2-worldnote{position:absolute;z-index:4;left:12px;top:50%;font-size:11px;color:#ffd9be;background:#071b30cc;padding:8px 10px;border:1px solid #fa9c72;border-radius:6px;max-width:260px}
/* ---------- intro ---------- */
.l2i{position:absolute;inset:0;z-index:30;background:#020611;overflow:hidden;transition:opacity 1s ease;--crop-scale:${(1 / (1 - ART_TOP_CROP)).toFixed(4)}}
.l2i.leaving{opacity:0;pointer-events:none}
.l2i-par{position:absolute;inset:-2.5%;transform:translate3d(var(--px,0px),var(--py,0px),0);transition:transform .6s ease-out}
.l2i-crop{position:absolute;inset:0;overflow:hidden;background:radial-gradient(ellipse at 60% 35%,#3a0f18,#050a16 70%)}
.l2i-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:var(--art-pos,${ART_POSITION});transform-origin:50% 100%;transform:scale(var(--crop-scale));opacity:0;transition:opacity 1.4s ease;animation:l2-drift 28s ease-in-out infinite alternate}
.l2i-img.ready{opacity:1}
.l2i-topfade{position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,#020611 0,#020611ee 8%,#02061188 16%,transparent 30%)}
.l2i-side{position:absolute;inset:0;pointer-events:none;background:linear-gradient(90deg,#020611f0 0,#020611b0 28%,transparent 58%),linear-gradient(0deg,#020611f2 0,#020611aa 24%,transparent 52%)}
.l2i-red{position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at 62% 28%,#ff2a1a33,transparent 60%);animation:l2-pulse 4s ease-in-out infinite}
.l2i-scan{position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(0deg,#9fe8ff07 0 1px,transparent 1px 3px)}
.l2i-sweep{position:absolute;left:0;right:0;height:20%;pointer-events:none;background:linear-gradient(180deg,transparent,#6fe0ff12,transparent);animation:l2-sweep 10s linear infinite}
.l2i-dust i{position:absolute;bottom:-10px;width:3px;height:3px;border-radius:50%;background:#d6ecff;opacity:0;animation:l2-float var(--t,16s) linear infinite;animation-delay:var(--dl,0s);left:var(--l,50%)}
.l2i-vig{position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at center,transparent 50%,#01030bcc 100%)}
.l2i-ui{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:space-between;padding:clamp(16px,3vw,40px);padding-bottom:max(clamp(16px,3vw,40px),env(safe-area-inset-bottom,0px));padding-top:max(clamp(16px,3vw,40px),env(safe-area-inset-top,0px))}
.l2i-bar{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
.l2i-logo{font-size:12px;letter-spacing:.3em;font-weight:700;color:#cfe8f5;display:flex;align-items:center;gap:12px}.l2i-logo i{display:block;width:34px;height:1px;background:linear-gradient(90deg,var(--red),transparent)}
.l2i-main{display:flex;justify-content:space-between;align-items:flex-end;gap:24px;flex-wrap:wrap}
.l2i-copy{max-width:min(620px,100%)}
.l2i-kicker{display:flex;align-items:center;gap:10px;font-size:clamp(11px,1.2vw,14px);letter-spacing:.34em;font-weight:700;color:#ff9a8a}.l2i-kicker:before{content:"";width:8px;height:8px;border-radius:50%;background:var(--red);box-shadow:0 0 14px var(--red);animation:l2-pulse 1.6s ease-in-out infinite}
.l2i h1{margin:14px 0 8px;font-weight:800;line-height:.96;font-size:clamp(38px,7vw,102px);letter-spacing:.01em;text-shadow:0 6px 40px #000}
.l2i h1 span{display:block}.l2i h1 .sub{font-size:.46em;letter-spacing:.34em;font-weight:600;color:#cfe8f5;margin-top:12px}
.l2i p.lede{margin:16px 0 26px;font-size:clamp(14px,1.4vw,18px);line-height:1.65;color:#c7dbe8;max-width:520px;text-shadow:0 2px 14px #000}
.l2i-actions{display:flex;gap:12px;flex-wrap:wrap;align-items:center}
.l2-start{position:relative;overflow:hidden;cursor:pointer;padding:19px 38px;border-radius:10px;border:1px solid #ffb18a;background:linear-gradient(100deg,#ff7a3d,#e0382f);color:#fff;font:800 clamp(14px,1.3vw,16px) var(--f);letter-spacing:.2em;box-shadow:0 0 0 1px #ff5a4533,0 10px 44px #ff4a2d66;transition:transform .15s,box-shadow .3s}
.l2-start:before{content:"";position:absolute;inset:0;background:radial-gradient(circle 120px at var(--mx,50%) var(--my,50%),#ffffff55,transparent 70%);opacity:0;transition:opacity .25s}
.l2-start:hover{box-shadow:0 0 0 1px #ff8a6a66,0 14px 60px #ff5a3daa}.l2-start:hover:before{opacity:1}.l2-start:active{transform:scale(.97)}
.l2-start span{position:relative}
.l2i-status{display:flex;flex-direction:column;gap:8px;min-width:230px}
.l2i-stat{display:flex;justify-content:space-between;gap:20px;padding:10px 14px;border-radius:8px;background:#06142299;border:1px solid #7fcbe83d;backdrop-filter:blur(8px);font-size:11px;letter-spacing:.16em;font-weight:700;color:#bfe3f3}
.l2i-stat em{font-style:normal;color:#fff}.l2i-stat.hot em{color:#ff9d90}
.l2i-o2{height:4px;border-radius:3px;background:#2b4558;overflow:hidden;margin-top:-2px}.l2i-o2 i{display:block;height:100%;background:linear-gradient(90deg,#ff5a45,#ffb08a);animation:l2-o2 16s ease-in-out infinite alternate}
.l2i-reveal{opacity:0;transform:translateY(16px);animation:l2-reveal .9s cubic-bezier(.2,.8,.2,1) forwards;animation-delay:var(--d,0s)}
.l2i-brief{position:absolute;inset:0;z-index:5;display:grid;place-items:center;padding:20px;background:#020815c4;backdrop-filter:blur(8px)}
.l2i-brief .l2-card h3{margin:18px 0 6px;font-size:12px;letter-spacing:.2em;color:#8bdff6}.l2i-brief .l2-card p{margin:0 0 8px}
@keyframes l2-in{from{opacity:0}to{opacity:1}}@keyframes l2-rise{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:none}}
@keyframes l2-slide{from{opacity:0;transform:translateX(30px)}to{opacity:1;transform:none}}
@keyframes l2-pulse{50%{opacity:.4}}@keyframes l2-spin{to{transform:rotate(360deg)}}
@keyframes l2-bar{from{transform:translateY(var(--s))}to{transform:none}}
@keyframes l2-reveal{to{opacity:1;transform:none}}
@keyframes l2-drift{from{transform:scale(var(--crop-scale)) translate3d(0,0,0)}to{transform:scale(calc(var(--crop-scale) * 1.04)) translate3d(0,.6%,0)}}
@keyframes l2-sweep{from{top:-25%}to{top:110%}}
@keyframes l2-float{0%{transform:translateY(0);opacity:0}15%{opacity:.7}85%{opacity:.5}100%{transform:translateY(-105vh);opacity:0}}
@keyframes l2-o2{from{width:94%}to{width:68%}}
@media(max-width:780px){
.l2-top{flex-wrap:wrap}.l2-brand span{display:none}.l2-meter{width:104px;padding:7px 9px}.l2-meter label{font-size:9px}.l2-chip{display:none}
.l2-map{top:auto;bottom:calc(150px + env(safe-area-inset-bottom,0px));right:10px;width:128px;padding:6px}.l2-map h4,.l2-map p{display:none}
.l2-progress{top:auto;bottom:6px}
.l2-bottom{bottom:calc(112px + env(safe-area-inset-bottom,0px));left:10px;right:10px;flex-direction:column;align-items:stretch}
.l2-touchpad{display:grid;bottom:calc(10px + env(safe-area-inset-bottom,0px))}
.l2-dock{top:auto;left:10px;right:10px;bottom:10px;width:auto;max-height:72dvh}
.l2-grid2{grid-template-columns:1fr}.l2-card{padding:22px}
.l2-lower{bottom:calc(7vh + 120px)}
.l2i-main{flex-direction:column;align-items:stretch}.l2i-status{min-width:0;flex-direction:row;flex-wrap:wrap}.l2i-stat{flex:1 1 140px}
.l2i-img{--art-pos:62% 100%}
.l2i-side{background:linear-gradient(0deg,#020611f5 0,#020611cc 40%,transparent 72%)}
.l2-start{width:100%;padding:18px 20px}
}
@media(prefers-reduced-motion:reduce){.l2-root *{animation:none!important;transition:none!important}.l2i-reveal{opacity:1!important;transform:none!important}.l2i-img{opacity:1!important}}
`;

// ---------------------------------------------------------------- main component
const MOOD_FOR: Record<Stage, Mood> = {
  intro: "calm", quiet: "calm", alarm: "urgent", aura: "urgent", consequence: "urgent",
  repair: "suspense", repairing: "suspense", sealed: "hopeful", power: "mystery", ending: "mystery",
};
const PROGRESS_INDEX: Record<Stage, number> = {
  intro: 0, quiet: 1, alarm: 2, aura: 3, consequence: 3, repair: 4, repairing: 4, sealed: 5, power: 5, ending: 5,
};
const modeFor = (s: Stage): CamMode => (s === "quiet" ? "intro" : s === "repairing" ? "repair" : s === "power" ? "closeup" : s === "ending" ? "pullback" : "follow");
const DUST = Array.from({ length: 26 }, (_, i) => ({ l: `${(i * 37) % 100}%`, t: `${14 + (i * 7) % 12}s`, dl: `${-((i * 5) % 16)}s` }));

export function Level2Journey({ onReplayLevel1 }: { onReplayLevel1?: () => void } = {}) {
  const [level3Started, setLevel3Started] = useState(false);
  if (level3Started) {
    return <Level3Landing onBackToLevel2={() => setLevel3Started(false)} />;
  }
  return <Level2Mission onReplayLevel1={onReplayLevel1} onBeginLevel3={() => setLevel3Started(true)} />;
}

function Level2Mission({ onReplayLevel1, onBeginLevel3 }: { onReplayLevel1?: () => void; onBeginLevel3: () => void }) {
  const [stage, setStage] = useState<Stage>("intro");
  const [intro, setIntro] = useState<"show" | "leaving" | "gone">("show");
  const [briefing, setBriefing] = useState(false);
  const [artState, setArtState] = useState<"loading" | "ready" | "failed">("loading");
  const [oxygen, setOxygen] = useState(100);
  const [power, setPower] = useState(100);
  const [decision, setDecision] = useState<Decision>(null);
  const [nearLeak, setNearLeak] = useState(false);
  const [musicOn, setMusicOn] = useState(true);
  const [sfxOn, setSfxOn] = useState(true);
  const [paused, setPaused] = useState(false);
  const [auraStep, setAuraStep] = useState(0);
  const [beat, setBeat] = useState(0);
  const [mapPos, setMapPos] = useState<Point>(PLAYER_SPAWN);
  const [characterError, setCharacterError] = useState<string | null>(null);

  const reduced = useMemo(() => reducedMotion(), []);
  const audio = useRef<CabinAudio | null>(null);
  if (!audio.current) audio.current = new CabinAudio();
  const player = useRef(new THREE.Vector3(PLAYER_SPAWN.x, 0, PLAYER_SPAWN.z));
  const heading = useRef(Math.PI);
  const moving = useRef(false);
  const running = useRef(false);
  const keys = useRef(new Set<string>());
  const enabled = useRef(false);
  const pausedRef = useRef(false);
  const camMode = useRef<CamMode>("follow");
  const stageRef = useRef<Stage>("intro");
  const stageTime = useRef(0);
  const tickN = useRef(0);
  const beatRef = useRef(0);
  const auraRef = useRef(0);
  const oxRef = useRef(100);
  const powRef = useRef(100);
  const decisionRef = useRef<Decision>(null);
  const nearRef = useRef(false);
  const busy = useRef(false);
  const introRef = useRef<"show" | "leaving" | "gone">("show");
  const timers = useRef<number[]>([]);
  const parRef = useRef<HTMLDivElement>(null);

  const alert = stage === "alarm" || stage === "aura" || stage === "consequence" || stage === "repair" || stage === "repairing";
  const repaired = stage === "sealed" || stage === "power" || stage === "ending";
  const powerCritical = stage === "power" || stage === "ending";

  const play = useCallback((cue: Cue) => audio.current?.play(cue), []);
  const unlock = useCallback(() => audio.current?.unlock(), []);
  const commit = useCallback(() => { setOxygen(oxRef.current); setPower(powRef.current); }, []);

  const goStage = useCallback((s: Stage) => {
    stageRef.current = s;
    stageTime.current = 0;
    beatRef.current = 0;
    setBeat(0);
    if (s === "aura") { auraRef.current = 0; setAuraStep(0); }
    enabled.current = s === "quiet" || s === "alarm" || s === "repair";
    camMode.current = modeFor(s);
    if (!enabled.current) { keys.current.clear(); moving.current = false; }
    setStage(s);
  }, []);

  const setBeatTo = useCallback((b: number) => {
    if (beatRef.current < b) { beatRef.current = b; setBeat(b); }
  }, []);

  // cleanup
  useEffect(() => {
    const t = timers.current, k = keys.current, a = audio.current;
    return () => { t.forEach((id) => window.clearTimeout(id)); k.clear(); a?.dispose(); };
  }, []);

  // Show Level 2 completion briefly, then automatically open Level 3.
  // The CONTINUE button allows an immediate transition instead.
  useEffect(() => {
    if (stage !== "ending") return;
    const id = window.setTimeout(onBeginLevel3, 8500);
    return () => window.clearTimeout(id);
  }, [stage, onBeginLevel3]);

  // intro: wake the music on the first interaction (browser autoplay rules)
  useEffect(() => {
    const wake = () => { audio.current?.unlock(); audio.current?.setMood("calm"); };
    window.addEventListener("pointerdown", wake, { once: true });
    window.addEventListener("keydown", wake, { once: true });
    return () => { window.removeEventListener("pointerdown", wake); window.removeEventListener("keydown", wake); };
  }, []);

  // music mood + stage cues
  useEffect(() => {
    const a = audio.current;
    if (!a) return;
    a.setMood(MOOD_FOR[stage]);
    if (stage === "quiet") a.fadeMusic(0.5, 2);
    if (stage === "alarm") { play("alarm"); play("panel"); }
    if (stage === "aura") play("auraOn");
    if (stage === "sealed") play("stable");
    if (stage === "power") play("power");
    if (stage === "ending") {
      play("complete");
      try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ complete: true, decision: decisionRef.current ?? "none", engineerNote: true })); } catch { /* optional save */ }
    }
  }, [stage, play]);

  // the one game clock (4 Hz). Pause-safe. Refs are the truth; state is mirrored for the HUD.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (pausedRef.current) return;
      const s = stageRef.current;
      if (s === "intro") return;
      stageTime.current += 0.25;
      tickN.current += 1;
      const t = stageTime.current;
      switch (s) {
        case "quiet":
          if (t >= 4.6) setBeatTo(1);
          if (camMode.current === "intro" && t > 4.4) camMode.current = "follow";
          if (t >= QUIET_SECONDS) goStage("alarm");
          break;
        case "alarm":
          if (t >= 3.5) setBeatTo(1);
          oxRef.current = Math.max(OX_FLOOR, oxRef.current - 4.6 * 0.25);
          if (tickN.current % 13 === 0) play("alarm");
          if (oxRef.current <= OX_FLOOR) goStage("aura");
          break;
        case "aura":
          if (t >= 2.4 && auraRef.current < 1) { auraRef.current = 1; setAuraStep(1); play("auraMsg"); play("holo"); }
          if (t >= 7 && auraRef.current < 2) { auraRef.current = 2; setAuraStep(2); play("auraMsg"); }
          break;
        case "repair": {
          const d = decisionRef.current;
          oxRef.current = Math.max(OX_FLOOR, oxRef.current - (d === "backup" ? 0.95 : 2.1) * 0.25);
          powRef.current = Math.max(0, powRef.current - (d === "conserve" ? 0.2 : 0.8) * 0.25);
          if (tickN.current % 24 === 0) play("alarm");
          break;
        }
        case "sealed":
          oxRef.current = Math.min(62, oxRef.current + 1.5 * 0.25);
          break;
        case "power":
          powRef.current = Math.max(11, powRef.current - 5.8 * 0.25);
          if (t >= 3.2) setBeatTo(1);
          if (t >= 6.4) setBeatTo(2);
          if (t >= 6.5 && camMode.current === "closeup") camMode.current = "pullback";
          if (t >= 11) goStage("ending");
          break;
        default: break;
      }
      const p = player.current;
      setMapPos((m) => (Math.abs(m.x - p.x) > 0.12 || Math.abs(m.z - p.z) > 0.12 ? { x: p.x, z: p.z } : m));
      commit();
    }, 250);
    return () => window.clearInterval(id);
  }, [goStage, play, commit, setBeatTo]);

  // ---- actions
  const startLevel = useCallback(() => {
    if (introRef.current !== "show") return;
    introRef.current = "leaving";
    unlock(); play("tap");
    audio.current?.fadeMusic(0, 0.9);
    setBriefing(false);
    setIntro("leaving");
    timers.current.push(window.setTimeout(() => goStage("quiet"), 750));
    timers.current.push(window.setTimeout(() => { introRef.current = "gone"; setIntro("gone"); }, 1600));
  }, [goStage, play, unlock]);

  const askAura = useCallback(() => {
    if (stageRef.current !== "alarm") return;
    unlock(); goStage("aura");
  }, [goStage, unlock]);

  const skipAura = () => { if (auraRef.current < 2) { auraRef.current = 2; setAuraStep(2); play("auraMsg"); } };

  const choose = (v: "backup" | "conserve") => {
    if (stageRef.current !== "aura" || auraRef.current < 2) return;
    unlock(); play("choose");
    decisionRef.current = v;
    setDecision(v);
    if (v === "backup") {
      oxRef.current = clamp(Math.max(oxRef.current + 24, 79), 0, 100);
      powRef.current = clamp(powRef.current - 27, 0, 100);
    } else {
      powRef.current = clamp(powRef.current - 2, 0, 100);
    }
    commit();
    goStage("consequence");
  };

  const beginRepair = useCallback(() => {
    if (stageRef.current !== "repair" || !nearRef.current || busy.current) return;
    busy.current = true;
    keys.current.clear();
    moving.current = false;
    const p = player.current;
    heading.current = Math.atan2(-3.85 - p.x, LEAK.z - p.z);
    play("panel");
    goStage("repairing");
  }, [goStage, play]);

  const completeRepair = useCallback(() => {
    busy.current = false;
    oxRef.current = Math.max(oxRef.current, 35);
    commit();
    goStage("sealed");
  }, [commit, goStage]);

  const continueAfterSeal = () => {
    unlock(); play("tap");
    powRef.current = Math.min(powRef.current, decisionRef.current === "conserve" ? 62 : 46);
    commit();
    goStage("power");
  };

  const act = useCallback(() => {
    if (pausedRef.current) return;
    if (stageRef.current === "alarm") askAura();
    else if (stageRef.current === "repair" && nearRef.current) beginRepair();
  }, [askAura, beginRepair]);

  const togglePause = useCallback(() => {
    if (stageRef.current === "intro") return;
    const next = !pausedRef.current;
    pausedRef.current = next;
    keys.current.clear();
    moving.current = false;
    setPaused(next);
    audio.current?.fadeMusic(next ? 0.18 : 0.5, 0.3);
  }, []);

  const replay = () => {
    unlock(); play("tap");
    keys.current.clear(); busy.current = false;
    player.current.set(PLAYER_SPAWN.x, 0, PLAYER_SPAWN.z);
    heading.current = Math.PI; moving.current = false;
    oxRef.current = 100; powRef.current = 100; decisionRef.current = null;
    setDecision(null); setNearLeak(false); nearRef.current = false; commit();
    goStage("quiet");
  };

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code) && stageRef.current !== "intro") e.preventDefault();
      if (e.code === "KeyE" && !e.repeat) { unlock(); act(); }
      if ((e.code === "KeyP" || e.code === "Escape") && !e.repeat) togglePause();
      if (enabled.current) keys.current.add(e.code);
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.code);
    const blur = () => keys.current.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", blur); };
  }, [act, togglePause, unlock]);

  const onNear = useCallback((v: boolean) => { nearRef.current = v; setNearLeak(v); if (v && stageRef.current === "repair") audio.current?.play("scan"); }, []);
  const onStep = useCallback((run: boolean) => audio.current?.play(run ? "run" : "step"), []);

  const toggleMusic = () => { const n = !musicOn; setMusicOn(n); unlock(); audio.current?.setMusicEnabled(n); };
  const toggleSfx = () => { const n = !sfxOn; setSfxOn(n); unlock(); audio.current?.setSfxEnabled(n); if (n) audio.current?.play("tap"); };

  // intro pointer effects (no React state per move)
  const onIntroMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (reduced || introRef.current !== "show") return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    parRef.current?.style.setProperty("--px", `${(-x * 14).toFixed(1)}px`);
    parRef.current?.style.setProperty("--py", `${(-y * 9).toFixed(1)}px`);
  };
  const onStartMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
  };

  const mLine = useTypewriter(MYSHA_LINE, stage === "aura", reduced);
  const aLine = useTypewriter(AURA_LINE, stage === "aura" && auraStep >= 1, reduced);
  const powerLine = useTypewriter("Oxygen pressure stabilized. However, power reserves are below the recommended mission threshold.", stage === "power", reduced);

  const playing = stage !== "intro";
  const progIdx = PROGRESS_INDEX[stage];
  const auraStatus = stage === "aura" ? "SCANNING" : alert ? "ALERT" : repaired ? "MONITORING" : "ONLINE";
  const cinematicBars = (stage === "quiet" && beat === 0) || stage === "power" || stage === "ending";
  const showMap = playing && stage !== "ending" && stage !== "aura";
  const artStyle = { "--crop-scale": (1 / (1 - ART_TOP_CROP)).toFixed(4) } as CSSProperties;

  return (
    <div className="l2-root" aria-label="Level 2: Space Journey">
      <style>{l2Css}</style>

      <div className="l2-scene">
        <Canvas shadows frameloop={stage === "intro" ? "demand" : "always"} dpr={[1, 1.5]} camera={{ position: [2.2, 2.85, 10], fov: 59, near: 0.1, far: 180 }} gl={{ antialias: true, powerPreference: "high-performance" }}>
          <color attach="background" args={["#030b18"]} />
          <fog attach="fog" args={["#09192c", 20, 75]} />
          <Suspense fallback={<Html center zIndexRange={[1, 0]}><div className="l2-worldtag">LOADING SPACECRAFT…</div></Html>}>
            <Cabin alert={alert} repaired={repaired} powerCritical={powerCritical} scanning={stage === "repairing" || (stage === "aura" && auraStep === 1)} holo={stage === "aura" || stage === "repair"} reduced={reduced} />
            <PlayerLights player={player} alert={alert && !repaired} />
            <GuidePath player={player} active={stage === "repair"} />
            <CharacterBoundary onError={setCharacterError}>
              <SuitMysha position={player} heading={heading} moving={moving} running={running} />
            </CharacterBoundary>
            <Rig player={player} heading={heading} moving={moving} running={running} keys={keys} enabled={enabled} paused={pausedRef} camMode={camMode} onNear={onNear} onStep={onStep} />
          </Suspense>
        </Canvas>
      </div>
      <div className="l2-vignette" aria-hidden="true" />
      {alert && !repaired && !reduced && <div className="l2-alertv" aria-hidden="true" />}
      {cinematicBars && <div className="l2-bars" aria-hidden="true"><i /><i /></div>}

      {/* ---------------- HUD ---------------- */}
      {playing && <>
        <header className="l2-top">
          <div className="l2-brand"><small>LEVEL 02 · SPACE JOURNEY</small><strong>OXYGEN CRISIS IN DEEP SPACE</strong><span>MISSION DAY 143 · EN ROUTE TO MARS</span></div>
          <div className="l2-hud-r">
            <div className="l2-meters">
              <div className={`l2-meter ${oxygen < 48 && !repaired ? "danger" : ""}`}><label>OXYGEN <b>{Math.round(oxygen)}%</b></label><div className="l2-track-bar"><i style={{ width: `${oxygen}%` }} /></div></div>
              <div className={`l2-meter ${power < 30 ? "danger" : ""}`}><label>POWER <b>{Math.round(power)}%</b></label><div className="l2-track-bar"><i style={{ width: `${power}%` }} /></div></div>
            </div>
            <div className={`l2-chip ${alert && !repaired ? "alert" : ""}`}><span className="dot" />AURA · {auraStatus}</div>
            <div className="l2-ctrls">
              <button type="button" className="l2-iconbtn" onClick={toggleMusic} aria-pressed={musicOn}>♪ MUSIC {musicOn ? "ON" : "OFF"}</button>
              <button type="button" className="l2-iconbtn" onClick={toggleSfx} aria-pressed={sfxOn}>◖)) SFX {sfxOn ? "ON" : "OFF"}</button>
              <button type="button" className="l2-iconbtn" onClick={togglePause}>{paused ? "▶ RESUME" : "❚❚ PAUSE"}</button>
            </div>
          </div>
        </header>
        <div className="l2-progress" aria-label="Level progress">{[1, 2, 3, 4, 5].map((n) => <i key={n} className={n <= progIdx ? (n >= 2 && n <= 4 && !repaired ? "hot" : "on") : ""} />)}</div>
        {showMap && <div className="l2-map"><h4>AURA · SHIP MAP</h4><ShipMap safe={repaired} pos={mapPos} /><p className={repaired ? "ok" : ""}>{repaired ? "LIFE SUPPORT: SEALED" : stage === "quiet" ? "ALL SECTIONS NOMINAL" : "ANOMALY: LIFE-SUPPORT BAY"}</p></div>}
        {characterError && <div className="l2-worldnote" role="alert">{characterError}</div>}
      </>}

      {stage === "quiet" && beat === 0 && <div className="l2-daycard"><b>MISSION DAY 143</b><span>DEEP SPACE — EN ROUTE TO MARS</span><small>Fictional story details, not real mission data.</small></div>}
      {stage === "alarm" && beat === 0 && <div className="l2-banner" role="alert"><small>CRITICAL ALERT</small><b>OXYGEN LEAK DETECTED</b></div>}

      {(stage === "quiet" && beat >= 1) && <footer className="l2-bottom"><Callout kind="objective" title="MISSION STATUS"><p>All systems nominal. Walk around the cabin with W A S D (Shift to run). AURA is monitoring the ship.</p></Callout><button type="button" className="l2-btn" onClick={() => goStage("alarm")}>SKIP ▸</button></footer>}
      {stage === "alarm" && <footer className="l2-bottom"><div><Callout kind="warning"><p>Oxygen is falling. Ask AURA where the pressure loss is.</p></Callout></div><button className="l2-near" type="button" onClick={askAura}><kbd>E</kbd> ASK AURA · SCAN</button></footer>}
      {stage === "repair" && <footer className="l2-bottom"><div><Callout kind="objective"><p>Follow AURA&apos;s cyan path to the red life-support bay and press E.</p></Callout>{decision && <Callout kind="result"><p>{decision === "backup" ? "Reserve active: oxygen falls slowly, power drains faster." : "Conservation active: power drains slowly, oxygen still falls."}</p></Callout>}</div>{nearLeak && <button className="l2-near" type="button" onClick={beginRepair}><kbd>E</kbd> OPEN MAINTENANCE PANEL</button>}</footer>}
      {(stage === "quiet" || stage === "alarm" || stage === "repair") && <div className="l2-touchpad"><span /><TouchControl text="▲" code="KeyW" keys={keys} /><span /><TouchControl text="◀" code="KeyA" keys={keys} /><TouchControl text="▼" code="KeyS" keys={keys} /><TouchControl text="▶" code="KeyD" keys={keys} /></div>}

      {/* ---------------- AURA dialogue + decision ---------------- */}
      {stage === "aura" && (
        <aside className="l2-dock" role="dialog" aria-label="AURA oxygen leak analysis">
          <div className="l2-aura-head"><AuraOrb /><div><small>AURA · SHIP INTELLIGENCE</small><b>{auraStep < 2 ? "DIAGNOSTIC RUNNING" : "DIAGNOSTIC COMPLETE"}</b></div>{auraStep < 2 && <button type="button" className="l2-btn" onClick={skipAura}>SKIP</button>}</div>
          <div className="l2-line mysha"><small>MYSHA</small><p>{mLine}</p></div>
          {auraStep >= 1 && <div className="l2-line"><small>AURA</small><p>{aLine}</p></div>}
          {auraStep >= 1 && <div className="l2-schematic"><ShipMap detail scanning={auraStep < 2} pos={mapPos} /></div>}
          {auraStep >= 2 && <>
            <Callout kind="warning" title="DECISION"><p>Choose a response. Neither option fixes the leak by itself.</p></Callout>
            <button type="button" className="l2-choice" onMouseEnter={() => play("hover")} onClick={() => choose("backup")}><small>OPTION A</small><b>ACTIVATE EMERGENCY OXYGEN RESERVE</b><span>Temporarily stabilizes oxygen, but increases demand on limited mission resources (simulation).</span></button>
            <button type="button" className="l2-choice" onMouseEnter={() => play("hover")} onClick={() => choose("conserve")}><small>OPTION B</small><b>ENTER POWER CONSERVATION MODE</b><span>Reduces non-essential power use. It does not repair or stop the oxygen leak.</span></button>
          </>}
        </aside>
      )}

      {/* ---------------- educational consequence ---------------- */}
      {stage === "consequence" && decision && (
        <div className="l2-modal"><div className="l2-card" role="dialog" aria-modal="true" aria-label="Decision explained">
          <div className="l2-eyebrow">DECISION LOGGED · MOVEMENT PAUSED</div>
          <h2>{decision === "backup" ? "EMERGENCY OXYGEN RESERVE" : "POWER CONSERVATION MODE"}</h2>
          <div className="l2-grid2">
            <div className="l2-box"><b>WHY IT MATTERS</b><p>{decision === "backup" ? "Backup supplies give temporary redundancy when a primary system is not enough." : "Spacecraft run on limited electrical power. Cutting non-essential loads stretches the reserve for the systems that matter."}</p></div>
            <div className="l2-box limit"><b>IMPORTANT LIMITATION</b><p>{decision === "backup" ? "Backup resources are finite. A leak still has to be isolated and addressed." : "Saving power does not make oxygen. Turning things off does not repair a leak."}</p></div>
          </div>
          <div className="l2-box game"><b>GAME CONSEQUENCE</b>
            <div className="l2-delta" style={{ marginTop: 10 }}>
              {decision === "backup"
                ? <><span className="up">OXYGEN +24%</span><span className="down">POWER −27%</span><span className="up">LEAK LOSS SLOWED</span><span className="down">POWER DRAIN FASTER</span></>
                : <><span className="flat">OXYGEN NO CHANGE</span><span className="down">POWER −2%</span><span className="up">POWER DRAIN SLOWED</span><span className="down">OXYGEN LOSS CONTINUES</span></>}
            </div>
            <p style={{ margin: 0, fontSize: 12 }}>A simplified learning simulation. It is not a real NASA procedure.</p>
          </div>
          <button type="button" className="l2-btn primary wide" style={{ marginTop: 18 }} onClick={() => { unlock(); play("tap"); goStage("repair"); }} autoFocus>CONTINUE · INVESTIGATE THE LEAK</button>
        </div></div>
      )}

      {stage === "repairing" && <SealMinigame reduced={reduced} play={play} onDone={completeRepair} />}

      {/* ---------------- success ---------------- */}
      {stage === "sealed" && (
        <div className="l2-modal"><div className="l2-card" role="dialog" aria-modal="true" aria-label="Leak contained">
          <div className="l2-eyebrow ok">✓ AURA VERIFICATION</div>
          <h2>LEAK CONTAINED</h2>
          <div className="l2-eyebrow ok" style={{ fontSize: 13 }}>OXYGEN LEVEL STABILIZED</div>
          <Callout kind="story" title="AURA"><p>&ldquo;Seal verified, Mysha. Cabin pressure is holding.&rdquo;</p></Callout>
          <div className="l2-grid2">
            <div className="l2-box"><b>WHAT WAS THE PROBLEM?</b><p>A crew cabin needs a sealed, controlled atmosphere. A leak can drain its oxygen.</p></div>
            <div className="l2-box game"><b>YOUR CHOICE</b><p>{decision === "backup" ? "The reserve bought time but spent power." : "Saving power helped the budget, but only the repair stopped the leak."}</p></div>
          </div>
          <button type="button" className="l2-btn primary wide" onClick={continueAfterSeal} autoFocus>CONTINUE · CHECK SHIP POWER</button>
        </div></div>
      )}

      {/* ---------------- power crisis cliffhanger (lower third keeps Mysha's face visible) ---------------- */}
      {stage === "power" && (
        <div className="l2-lower" role="status" aria-live="polite">
          <Callout kind="story" title="AURA"><p>&ldquo;{powerLine}&rdquo;</p></Callout>
          {beat >= 1 && <Callout kind="warning" title="COMMUNICATION DELAY — EARTH"><p>Messages between Earth and Mars can take several minutes one way, depending on where the planets are. Help will not be instant.</p></Callout>}
          {beat >= 2 && <Callout kind="story" title="MYSHA"><p>&ldquo;So this one is up to me.&rdquo;</p></Callout>}
          <button type="button" className="l2-btn" style={{ marginTop: 10 }} onClick={() => goStage("ending")}>SKIP ▸</button>
        </div>
      )}

      {stage === "ending" && (
        <div className="l2-ending"><div className="l2-card center">
          <div className="l2-eyebrow">LEVEL 02 COMPLETE</div>
          <div className="l2-status2"><span className="g">OXYGEN STABILIZED</span><span className="r">POWER CRISIS DETECTED</span></div>
          <div className="l2-next">WHAT HAPPENS NEXT?</div>
          <Callout kind="story" title="AURA"><p>&ldquo;Mysha… the power reserve is still falling.&rdquo;</p></Callout>
          <p style={{ fontSize: 12, letterSpacing: ".14em" }}>NEXT · MARS LANDING · AUTO CONTINUE IN A FEW SECONDS</p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <button type="button" className="l2-btn primary" onClick={onBeginLevel3}>▶ CONTINUE TO LEVEL 3 — MARS LANDING</button>
            <button type="button" className="l2-btn" onClick={replay}>↺ REPLAY LEVEL 2</button>
            {onReplayLevel1 && <button type="button" className="l2-btn" onClick={onReplayLevel1}>REPLAY LEVEL 1</button>}
          </div>
        </div></div>
      )}

      {paused && <div className="l2-paused" role="dialog" aria-modal="true" aria-label="Paused"><div className="l2-card center" style={{ width: "min(380px,92vw)" }}><div className="l2-eyebrow">PAUSED</div><h2 style={{ fontSize: 32 }}>MISSION PAUSED</h2><button type="button" className="l2-btn primary wide" onClick={togglePause} autoFocus>▶ RESUME</button></div></div>}

      {/* ---------------- cinematic introduction ---------------- */}
      {intro !== "gone" && (
        <div className={`l2i ${intro === "leaving" ? "leaving" : ""}`} style={artStyle} onPointerMove={onIntroMove}>
          <div className="l2i-par" ref={parRef}>
            <div className="l2i-crop">
              {artState !== "failed" && <img className={`l2i-img ${artState === "ready" ? "ready" : ""}`} src={LEVEL2_ART} alt="" draggable={false} onLoad={() => setArtState("ready")} onError={() => { console.error("[Level 2] intro art not found:", LEVEL2_ART); setArtState("failed"); }} />}
            </div>
          </div>
          <div className="l2i-topfade" /><div className="l2i-side" /><div className="l2i-red" /><div className="l2i-scan" /><div className="l2i-sweep" />
          {!reduced && <div className="l2i-dust" aria-hidden="true">{DUST.map((d, i) => <i key={i} style={{ "--l": d.l, "--t": d.t, "--dl": d.dl } as CSSProperties} />)}</div>}
          <div className="l2i-vig" />
          <div className="l2i-ui">
            <div className="l2i-bar">
              <div className="l2i-logo"><i />MYSHA GOES TO MARS</div>
              <div className="l2-ctrls">
                {onReplayLevel1 && <button type="button" className="l2-iconbtn" onClick={onReplayLevel1}>◂ BACK TO LEVEL 1</button>}
                <button type="button" className="l2-iconbtn" onClick={toggleMusic} aria-pressed={musicOn}>♪ MUSIC {musicOn ? "ON" : "OFF"}</button>
                <button type="button" className="l2-iconbtn" onClick={toggleSfx} aria-pressed={sfxOn}>◖)) SFX {sfxOn ? "ON" : "OFF"}</button>
              </div>
            </div>
            <div className="l2i-main">
              <div className="l2i-copy">
                <div className="l2i-kicker l2i-reveal" style={{ "--d": ".5s" } as CSSProperties}>LEVEL 02 — SPACE JOURNEY</div>
                <h1><span className="l2i-reveal" style={{ "--d": ".9s" } as CSSProperties}>OXYGEN CRISIS</span><span className="sub l2i-reveal" style={{ "--d": "1.3s" } as CSSProperties}>IN DEEP SPACE</span></h1>
                <p className="lede l2i-reveal" style={{ "--d": "1.7s" } as CSSProperties}>Day 143. Mars is still weeks away when AURA reports a pressure drop. Decide fast, find the leak, and keep Mysha breathing.</p>
                <div className="l2i-actions l2i-reveal" style={{ "--d": "2.1s" } as CSSProperties}>
                  <button type="button" className="l2-start" onClick={startLevel} onPointerMove={onStartMove} onPointerEnter={() => play("hover")} autoFocus><span>START LEVEL 2</span></button>
                  <button type="button" className="l2-btn" onClick={() => { unlock(); play("tap"); setBriefing(true); }}>MISSION BRIEFING</button>
                </div>
              </div>
              <div className="l2i-status l2i-reveal" style={{ "--d": "2.5s" } as CSSProperties}>
                <div className="l2i-stat hot"><span>O₂ RESERVE</span><em>FALLING</em></div>
                <div className="l2i-o2"><i /></div>
                <div className="l2i-stat"><span>AURA</span><em>ONLINE</em></div>
                <div className="l2i-stat"><span>MISSION DAY</span><em>143</em></div>
              </div>
            </div>
          </div>
          {briefing && (
            <div className="l2i-brief" onClick={() => setBriefing(false)}>
              <div className="l2-card" role="dialog" aria-modal="true" aria-label="Mission briefing" onClick={(e) => e.stopPropagation()}>
                <div className="l2-eyebrow">MISSION BRIEFING</div>
                <h2 style={{ fontSize: "clamp(26px,3.6vw,42px)" }}>WHAT HAPPENS IN LEVEL 2</h2>
                <h3>THE STORY</h3>
                <p>The cabin is calm until the oxygen alarm sounds. Ask AURA where the leak is, choose how to respond, then repair the problem.</p>
                <h3>WHAT YOU WILL LEARN</h3>
                <p>Why spacecraft need life support, why backup supplies are finite, and why Earth cannot answer instantly from Mars. Mission numbers are a fictional simulation.</p>
                <h3>CONTROLS</h3>
                <p>W A S D or arrow keys to walk, Shift to run, E to interact, P to pause. On phones the on-screen pad moves Mysha and the orange buttons interact; running is keyboard only.</p>
                <button type="button" className="l2-btn primary wide" style={{ marginTop: 14 }} onClick={() => setBriefing(false)} autoFocus>CLOSE BRIEFING</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}