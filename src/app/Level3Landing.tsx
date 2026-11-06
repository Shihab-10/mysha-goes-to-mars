/**
 * MYSHA GOES TO MARS — LEVEL 03: MARS LANDING ("THE RED DESCENT")
 * Drop-in replacement for src/app/Level3Landing.tsx
 *
 * Same API as before:  <Level3Landing onBackToLevel2={...} onLevel4={...} />  (both props optional)
 * No new packages. Uses: react, three, @react-three/fiber, @react-three/drei.
 * Audio is procedural (Web Audio). All values, controls and the 100-point budget are
 * fictional educational game mechanics, not real spacecraft data.
 *
 * NEW in this version:
 *  - ONE shared landing simulation (flightRef) viewed from two cameras: INTERIOR and EXTERIOR.
 *    Switch with the INTERIOR | EXTERIOR toggle or the C key. The simulation never resets.
 *  - Reference-style landing HUD, 100-point planning screen (ring, +/- buttons), success screen.
 *  - Real terrain, better lander, Mysha on the surface after touchdown.
 * The START LEVEL 3 intro screen is unchanged.
 */
import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, Stars, useFBX, useTexture } from "@react-three/drei";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import * as THREE from "three";

/* ───────────────────────── types & constants ───────────────────────── */
type Stage = "intro" | "tutorial" | "practice" | "mars" | "plan" | "approach" | "landing" | "success" | "retry" | "next";
type AllocationKey = "supplies" | "shielding" | "power" | "stability";
type Allocation = Record<AllocationKey, number>;
type Flight = { altitude: number; speed: number; fuel: number; lateral: number; vx: number; elapsed: number };
type Mood = "approach" | "anomaly" | "plan" | "landing" | "success" | "fail";
type Sound =
  | "hover" | "button" | "tutorial" | "aura" | "scan" | "warning" | "allocate" | "ready" | "camera"
  | "thruster" | "steer" | "align" | "fuel" | "contact" | "land" | "complete" | "fail";
type Overlay = null | "help" | "briefing";
type Outcome = null | "practice-win" | "practice-lose";
type CamMode = "interior" | "exterior";

const BASE = import.meta.env.BASE_URL;
const LEVEL3_ART = `${BASE}images/level3/level3-mars-landing.png`;
const MODEL = `${BASE}models/characters/Meshy_AI_Animation_Walking_withSkin.fbx`;
const SKIN = `${BASE}textures/characters/texture_0.png`;
const TUTORIAL_KEY = "mysha-goes-to-mars:level3:tutorial:v1";
const RESULT_KEY = "mysha-goes-to-mars:level3:v1";
const ART_FOCUS_DESKTOP = "50% 40%";
const ART_FOCUS_MOBILE = "50% 32%";

const GROUND = -2.7; // world height of the landing plain
const FOOT = 1.1; // distance from lander centre to the foot pads (after scale)
const shipY = (alt: number) => GROUND + FOOT + Math.min(5.5, Math.max(0, alt / 190));
const shipZ = (alt: number) => -5 + Math.min(1, Math.max(0, alt / 900)) * 30; // the lander approaches the target from far away

const KEYS: AllocationKey[] = ["supplies", "shielding", "power", "stability"];
const INITIAL_PLAN: Allocation = { supplies: 35, shielding: 20, power: 20, stability: 25 };
const SUGGESTED_PLAN: Allocation = { supplies: 15, shielding: 30, power: 27, stability: 28 };
const MINIMUMS = { shielding: 28, power: 25, stability: 25 };
const LIMITS: Record<AllocationKey, { min: number; max: number; label: string; icon: string; info: string }> = {
  supplies: { min: 10, max: 60, label: "Food & Water", icon: "◈", info: "Keep a safe reserve for survival." },
  shielding: { min: 10, max: 50, label: "Radiation Protection", icon: "☢", info: "Raise priority because radiation is elevated." },
  power: { min: 10, max: 50, label: "Power Systems", icon: "ϟ", info: "Also sets the lander's fuel in this game." },
  stability: { min: 10, max: 45, label: "Landing Stability", icon: "⌖", info: "Better braking and steadier descent." },
};
const INSTRUMENTS: { name: string; icon: string; text: string }[] = [
  { name: "ALTITUDE", icon: "▲", text: "Altitude tells you how far the lander is above the simulated surface." },
  { name: "DESCENT SPEED", icon: "⇣", text: "Descent speed tells you how quickly the lander is moving downward." },
  { name: "FUEL", icon: "◍", text: "Fuel represents the remaining resource available for the fictional landing controls." },
  { name: "TARGET ALIGNMENT", icon: "⌖", text: "The target indicator helps you stay within the designated landing area." },
  { name: "STABILITY", icon: "≋", text: "The stability indicator provides feedback about the simulated landing conditions." },
];

const clean = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const readFlag = (key: string) => { try { return window.localStorage.getItem(key) === "true"; } catch { return false; } };
const writeFlag = (key: string) => { try { window.localStorage.setItem(key, "true"); } catch { /* storage is optional */ } };
const recordLevel = (plan: Allocation, success: boolean) => {
  try { window.localStorage.setItem(RESULT_KEY, JSON.stringify({ completed: success, allocation: plan, updatedAt: Date.now() })); } catch { /* storage is optional */ }
};

const isFlying = (s: Stage) => s === "landing" || s === "practice";
const isDescent = (s: Stage) => s === "landing" || s === "practice" || s === "success" || s === "retry";

function makeFlight(practice: boolean, plan: Allocation): Flight {
  return practice
    ? { altitude: 420, speed: 28, fuel: 70, lateral: 1.6, vx: 0, elapsed: 0 }
    : { altitude: 900, speed: 52, fuel: Math.round(20 + plan.power * 0.7), lateral: 1.15, vx: 0, elapsed: 0 };
}
function simConfig(practice: boolean, plan: Allocation) {
  return { gravity: practice ? 3 : 3.45, brake: (practice ? 21 : 17.5) + (plan.stability - 25) * 0.13, burn: practice ? 3.2 : 4.6, steer: 0.8 };
}
function limitsFor(practice: boolean, guided: boolean) {
  return practice || guided ? { speed: 32, lat: 1.15 } : { speed: 25, lat: 0.8 };
}
function stabilityOf(f: Flight, plan: Allocation) {
  return clean(100 - Math.abs(f.vx) * 45 - Math.max(0, f.speed - 25) * 0.55 - Math.max(0, Math.abs(f.lateral) - 0.8) * 14 + (plan.stability - 25) * 0.6, 0, 100);
}
function alignmentOf(f: Flight, lim: { speed: number; lat: number }) {
  const a = Math.abs(f.lateral);
  return Math.round(clean(100 - Math.min(a, lim.lat) / lim.lat * 30 - Math.max(0, a - lim.lat) / lim.lat * 70, 0, 100));
}
function statusOf(f: Flight, lim: { speed: number; lat: number }): "ok" | "caution" | "critical" {
  const bad = f.speed > lim.speed || Math.abs(f.lateral) > lim.lat;
  if (f.altitude < 300 && bad) return f.altitude < 150 ? "critical" : "caution";
  return "ok";
}
function auraMessage(f: Flight, lim: { speed: number; lat: number }): string {
  const off = Math.abs(f.lateral) > lim.lat, fast = f.speed > lim.speed;
  if (f.fuel <= 0) return "Fuel reserves are empty. Keep the lander centered for touchdown.";
  if (f.altitude < 150 && fast) return "Warning: touchdown speed is too high. Hold SPACE now.";
  if (f.fuel < 20) return "Fuel reserves are getting low. Use short braking bursts.";
  if (f.altitude < 300 && off) return "Check the target alignment.";
  if (f.altitude < 300 && fast) return "Watch the descent-speed indicator.";
  if (off) return "Steer toward the center of the target.";
  if (f.altitude < 450) return "You are approaching the landing zone.";
  return "Good correction. Keep the target centered.";
}
function practiceHint(f: Flight, lim: { speed: number; lat: number }): string {
  if (Math.abs(f.lateral) > lim.lat * 0.6) return "Try moving toward the landing target. Press A or D, or use the on-screen arrows.";
  if (f.speed > lim.speed - 6) return "Good. Watch how the alignment indicator changes. Now observe the descent-speed display and hold SPACE to slow down.";
  return "Great. Keep it steady and let the lander touch down gently.";
}

/* ───────────────────────── audio ───────────────────────── */
const MOODS: Record<Mood, { freqs: number[]; gains: number[] }> = {
  approach: { freqs: [73.4, 110, 146.8], gains: [0.035, 0.016, 0.012] },
  anomaly: { freqs: [65.4, 69.3, 98], gains: [0.035, 0.02, 0.012] },
  plan: { freqs: [98, 147, 196], gains: [0.03, 0.016, 0.014] },
  landing: { freqs: [55, 82.4, 110], gains: [0.04, 0.02, 0.012] },
  success: { freqs: [130.8, 164.8, 196], gains: [0.04, 0.03, 0.024] },
  fail: { freqs: [73.4, 87.3, 110], gains: [0.03, 0.014, 0.01] },
};

class LandingAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private bed: { osc: OscillatorNode; gain: GainNode }[] = [];
  private music = true;
  private sfx = true;
  private volume = 0.8;
  private current: Mood = "approach";
  unlock() {
    if (typeof window === "undefined") return;
    try {
      const Ctor = window.AudioContext;
      if (!Ctor) return;
      if (!this.ctx) {
        const c = new Ctor(); this.ctx = c;
        this.master = c.createGain(); this.master.gain.value = this.volume * 0.2; this.master.connect(c.destination);
        this.musicBus = c.createGain(); this.musicBus.gain.value = this.music ? 1 : 0.0001; this.musicBus.connect(this.master);
        this.sfxBus = c.createGain(); this.sfxBus.gain.value = this.sfx ? 1 : 0.0001; this.sfxBus.connect(this.master);
        MOODS[this.current].freqs.forEach((freq, i) => {
          const osc = c.createOscillator(), gain = c.createGain();
          osc.type = "sine"; osc.frequency.value = freq; gain.gain.value = MOODS[this.current].gains[i];
          osc.connect(gain); gain.connect(this.musicBus!); osc.start(); this.bed.push({ osc, gain });
        });
      }
      if (this.ctx.state === "suspended") void this.ctx.resume().catch(() => {});
    } catch { /* audio must never block gameplay */ }
  }
  mood(name: Mood) {
    this.current = name;
    const c = this.ctx; if (!c) return;
    const m = MOODS[name];
    this.bed.forEach((b, i) => {
      b.osc.frequency.setTargetAtTime(m.freqs[i], c.currentTime, 0.9);
      b.gain.gain.setTargetAtTime(m.gains[i], c.currentTime, 0.9);
    });
  }
  setMusic(on: boolean) { this.music = on; if (on) this.unlock(); if (this.ctx && this.musicBus) this.musicBus.gain.setTargetAtTime(on ? 1 : 0.0001, this.ctx.currentTime, 0.08); }
  setSfx(on: boolean) { this.sfx = on; if (on) this.unlock(); if (this.ctx && this.sfxBus) this.sfxBus.gain.setTargetAtTime(on ? 1 : 0.0001, this.ctx.currentTime, 0.04); }
  setVolume(v: number) { this.volume = v; if (this.ctx && this.master) this.master.gain.setTargetAtTime(v * 0.2, this.ctx.currentTime, 0.05); }
  private tone(f0: number, f1: number, dur: number, type: OscillatorType, vol: number, delay = 0) {
    const c = this.ctx, bus = this.sfxBus;
    if (!c || !bus || !this.sfx || c.state !== "running") return;
    const t = c.currentTime + delay;
    const osc = c.createOscillator(), gain = c.createGain();
    osc.type = type; osc.frequency.setValueAtTime(f0, t); osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    gain.gain.setValueAtTime(0.0001, t); gain.gain.exponentialRampToValueAtTime(vol, t + 0.025); gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain); gain.connect(bus); osc.start(t); osc.stop(t + dur + 0.03);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  }
  cue(kind: Sound) {
    switch (kind) {
      case "hover": this.tone(900, 1000, 0.05, "sine", 0.04); break;
      case "button": this.tone(470, 720, 0.12, "sine", 0.12); break;
      case "tutorial": this.tone(520, 780, 0.14, "triangle", 0.1); this.tone(780, 1040, 0.14, "triangle", 0.08, 0.09); break;
      case "aura": this.tone(600, 900, 0.2, "sine", 0.09); this.tone(900, 1200, 0.2, "sine", 0.07, 0.12); break;
      case "scan": this.tone(240, 1220, 0.65, "triangle", 0.12); break;
      case "warning": this.tone(720, 380, 0.46, "sawtooth", 0.07); break;
      case "allocate": this.tone(400, 530, 0.12, "sine", 0.1); break;
      case "ready": this.tone(330, 880, 0.55, "triangle", 0.12); this.tone(660, 990, 0.5, "triangle", 0.09, 0.2); break;
      case "camera": this.tone(300, 900, 0.18, "triangle", 0.09); this.tone(900, 520, 0.14, "sine", 0.05, 0.1); break;
      case "thruster": this.tone(110, 55, 0.27, "sawtooth", 0.09); break;
      case "steer": this.tone(260, 200, 0.1, "square", 0.025); break;
      case "align": this.tone(880, 1175, 0.2, "sine", 0.08); break;
      case "fuel": this.tone(520, 430, 0.25, "square", 0.05); this.tone(520, 430, 0.25, "square", 0.05, 0.32); break;
      case "contact": this.tone(90, 40, 0.4, "triangle", 0.2); break;
      case "land": [330, 415, 495, 660].forEach((f, i) => this.tone(f, f * 1.01, 0.7, "sine", 0.1, i * 0.14)); break;
      case "complete": [392, 494, 587, 784].forEach((f, i) => this.tone(f, f * 1.01, 1, "triangle", 0.1, i * 0.18)); break;
      case "fail": this.tone(180, 75, 0.8, "triangle", 0.11); break;
    }
  }
  dispose() {
    this.bed.forEach(b => { try { b.osc.stop(); } catch { /* already stopped */ } });
    this.bed = [];
    const c = this.ctx; this.ctx = null; this.master = null; this.musicBus = null; this.sfxBus = null;
    if (c && c.state !== "closed") void c.close().catch(() => {});
  }
}

/* ───────────────────────── 3D helpers ───────────────────────── */
function marsTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas"); canvas.width = 768; canvas.height = 384;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#a95232"; ctx.fillRect(0, 0, 768, 384);
  let seed = 72; const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 4900; i++) {
    const x = random() * 768, y = random() * 384, r = 1.6 + random() * 24;
    ctx.fillStyle = random() > 0.5 ? `rgba(238,152,92,${0.015 + random() * 0.09})` : `rgba(43,19,23,${0.01 + random() * 0.12})`;
    ctx.beginPath(); ctx.ellipse(x, y, r * (1 + random()), r * 0.45, random() * 6, 0, Math.PI * 2); ctx.fill();
  }
  for (let i = 0; i < 100; i++) {
    const x = random() * 768, y = random() * 384, r = 1.5 + random() * 7;
    ctx.strokeStyle = "rgba(59,24,26,.18)"; ctx.lineWidth = Math.max(0.7, r * 0.25);
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}

/** Terrain height in world coordinates. Flat around the landing target, hills and ridges further away. */
const terrainH = (x: number, zw: number) => {
  const d = Math.hypot(x, zw + 5);
  const flat = clean((d - 8) / 12, 0, 1);
  const far = clean((-zw - 35) / 70, 0, 1);
  const hills = Math.sin(x * 0.13) * Math.cos(zw * 0.11) * 1.1 + Math.sin(x * 0.41 + zw * 0.23) * 0.35 + Math.sin(zw * 0.07 + 1.3) * Math.cos(x * 0.05) * 1.6;
  return (hills + far * far * 9) * flat;
};
function makeTerrain(): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(220, 200, 110, 100); g.rotateX(-Math.PI / 2);
  const p = g.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), zw = p.getZ(i) - 4; // the mesh sits at z = -4
    const h = terrainH(x, zw);
    p.setY(i, h);
    const t = clean(0.5 + h * 0.09 + Math.sin(x * 0.9 + zw * 0.7) * 0.05, 0, 1);
    col[i * 3] = 0.42 + t * 0.26; col[i * 3 + 1] = 0.19 + t * 0.14; col[i * 3 + 2] = 0.13 + t * 0.09;
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/** Game-ready lander: tapered crew module, heat shield, engine bell, four landing legs. */
function Lander({ pulse = false }: { pulse?: boolean }) {
  const glow = useRef<THREE.Group>(null);
  useFrame(({ clock }) => { if (glow.current) glow.current.scale.setScalar(pulse ? 1 + Math.sin(clock.elapsedTime * 9) * 0.12 : 1); });
  return (
    <group>
      <mesh castShadow><cylinderGeometry args={[0.62, 0.78, 1.1, 24]} /><meshStandardMaterial color="#d9dcd8" metalness={0.55} roughness={0.38} /></mesh>
      <mesh position={[0, 0.9, 0]} castShadow><cylinderGeometry args={[0.34, 0.62, 0.7, 24]} /><meshStandardMaterial color="#e6e8e4" metalness={0.5} roughness={0.35} /></mesh>
      <mesh position={[0, 1.38, 0]}><cylinderGeometry args={[0.16, 0.34, 0.26, 20]} /><meshStandardMaterial color="#9aa8b3" metalness={0.7} roughness={0.4} /></mesh>
      <mesh position={[0, 0.33, 0]}><cylinderGeometry args={[0.7, 0.71, 0.07, 24]} /><meshStandardMaterial color="#e4793f" roughness={0.5} /></mesh>
      <mesh position={[0, -0.65, 0]}><cylinderGeometry args={[0.78, 0.7, 0.2, 24]} /><meshStandardMaterial color="#2b3a47" metalness={0.8} roughness={0.5} /></mesh>
      <mesh position={[0, -0.86, 0]}><cylinderGeometry args={[0.2, 0.34, 0.3, 16]} /><meshStandardMaterial color="#1c2630" metalness={0.85} roughness={0.4} /></mesh>
      <mesh position={[0, 0.85, -0.47]} rotation={[0.35, 0, 0]}><boxGeometry args={[0.34, 0.2, 0.04]} /><meshBasicMaterial color="#58d8f0" /></mesh>
      <mesh position={[0.3, 1.05, 0.2]}><boxGeometry args={[0.2, 0.12, 0.02]} /><meshBasicMaterial color="#7fe9ff" /></mesh>
      {[0, 1, 2, 3].map(i => (
        <group key={i} rotation={[0, i * Math.PI / 2 + Math.PI / 4, 0]} position={[0, -0.3, 0]}>
          <mesh position={[0.87, -0.475, 0]} rotation={[0, 0, 0.4855]}><cylinderGeometry args={[0.04, 0.05, 1.073, 8]} /><meshStandardMaterial color="#b8c4cb" metalness={0.7} roughness={0.4} /></mesh>
          <mesh position={[0.66, -0.2, 0]} rotation={[0, 0, -0.9]}><cylinderGeometry args={[0.025, 0.025, 0.5, 6]} /><meshStandardMaterial color="#8a97a0" metalness={0.7} /></mesh>
          <mesh position={[1.12, -0.97, 0]}><cylinderGeometry args={[0.2, 0.24, 0.06, 14]} /><meshStandardMaterial color="#cfd6da" metalness={0.6} roughness={0.5} /></mesh>
        </group>
      ))}
      <group ref={glow} position={[0, -1.2, 0]}>
        <mesh rotation={[0, 0, Math.PI]}><coneGeometry args={[0.32, 0.8, 18]} /><meshBasicMaterial color={pulse ? "#ffb168" : "#e58953"} transparent opacity={pulse ? 0.85 : 0.3} depthWrite={false} /></mesh>
        <pointLight intensity={pulse ? 2.2 : 0.4} distance={7} color="#ffa664" />
      </group>
    </group>
  );
}

/** Cockpit frame. It is attached to the camera every frame, so it always sits around the player's view. */
function Cockpit() {
  const metal = { color: "#1a2937", metalness: 0.7, roughness: 0.45 } as const;
  return (
    <group>
      <mesh position={[0, -0.68, -0.95]} rotation={[0.28, 0, 0]}><boxGeometry args={[3.6, 0.3, 0.5]} /><meshStandardMaterial {...metal} /></mesh>
      <mesh position={[0, -0.5, -0.86]} rotation={[0.28, 0, 0]}><boxGeometry args={[3.7, 0.03, 0.3]} /><meshStandardMaterial color="#0e1822" metalness={0.8} roughness={0.35} /></mesh>
      {[-1, 1].map(s => (
        <group key={s}>
          <mesh position={[s * 1.15, 0.05, -0.95]} rotation={[0, 0, -s * 0.16]}><boxGeometry args={[0.11, 2.1, 0.14]} /><meshStandardMaterial {...metal} /></mesh>
          <mesh position={[s * 1.25, -0.42, -0.9]} rotation={[0.2, -s * 0.3, 0]}><boxGeometry args={[0.55, 0.45, 0.3]} /><meshStandardMaterial {...metal} /></mesh>
          <mesh position={[s * 1.22, -0.33, -0.74]} rotation={[0.2, -s * 0.3, 0]}><planeGeometry args={[0.38, 0.2]} /><meshBasicMaterial color="#58d8f0" transparent opacity={0.85} /></mesh>
          <mesh position={[s * 0.62, -0.5, -0.79]} rotation={[-0.2, 0, 0]}><planeGeometry args={[0.6, 0.12]} /><meshBasicMaterial color="#58d8f0" transparent opacity={0.75} /></mesh>
        </group>
      ))}
      <mesh position={[0, 0.66, -0.95]}><boxGeometry args={[3.0, 0.13, 0.22]} /><meshStandardMaterial {...metal} /></mesh>
      <mesh position={[0, 0.58, -0.84]}><planeGeometry args={[1.2, 0.05]} /><meshBasicMaterial color="#ff9a5c" transparent opacity={0.8} /></mesh>
      <mesh position={[0, -0.52, -0.8]} rotation={[-0.2, 0, 0]}><planeGeometry args={[0.5, 0.1]} /><meshBasicMaterial color="#ff8a4a" transparent opacity={0.9} /></mesh>
      <pointLight position={[0, 0.3, -0.4]} intensity={1.1} distance={3} color="#ffb27a" />
      <pointLight position={[0, -0.45, -0.5]} intensity={0.8} distance={2} color="#4fd8ff" />
    </group>
  );
}

function AuraHologram({ alarm }: { alarm: boolean }) {
  const g = useRef<THREE.Group>(null);
  useFrame((_, dt) => { if (g.current) { g.current.rotation.y += dt * 0.6; g.current.rotation.x += dt * 0.2; } });
  const c = alarm ? "#ff6a5f" : "#58e0ff";
  return (
    <group ref={g} position={[0.45, 0.6, 1.3]} scale={0.36}>
      <mesh><icosahedronGeometry args={[1, 1]} /><meshBasicMaterial color={c} wireframe transparent opacity={0.8} /></mesh>
      <mesh scale={0.55}><sphereGeometry args={[1, 16, 12]} /><meshBasicMaterial color={c} transparent opacity={0.25} depthWrite={false} /></mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} scale={1.5}><torusGeometry args={[1, 0.02, 8, 64]} /><meshBasicMaterial color={c} /></mesh>
    </group>
  );
}

function AstronautModel({ position = [-2.1, -0.98, 1.15], rotationY = 0.2 }: { position?: [number, number, number]; rotationY?: number }) {
  const fbx = useFBX(MODEL);
  const skin = useTexture(SKIN);
  const prepared = useMemo(() => {
    const copy = cloneSkeleton(fbx);
    const mats: THREE.Material[] = [];
    const texture = skin.clone(); texture.colorSpace = THREE.SRGBColorSpace; texture.flipY = true; texture.needsUpdate = true;
    copy.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      node.visible = true; node.frustumCulled = false; node.castShadow = true;
      const replace = (m: THREE.Material): THREE.Material => {
        const original = m as THREE.MeshPhongMaterial;
        const next = new THREE.MeshStandardMaterial({ map: original.map ?? texture, roughness: /hair/i.test(m.name) ? 0.42 : 0.62, metalness: 0.02, side: THREE.DoubleSide });
        mats.push(next); return next;
      };
      node.material = Array.isArray(node.material) ? node.material.map(replace) : replace(node.material);
    });
    const box = new THREE.Box3().setFromObject(copy); const size = box.getSize(new THREE.Vector3());
    if (size.y > 0.001) copy.scale.multiplyScalar(1.65 / size.y);
    const fitted = new THREE.Box3().setFromObject(copy), center = fitted.getCenter(new THREE.Vector3());
    copy.position.sub(new THREE.Vector3(center.x, fitted.min.y, center.z));
    copy.rotation.y = 0.14;
    return { copy, mats, texture };
  }, [fbx, skin]);
  useEffect(() => () => { prepared.mats.forEach(m => m.dispose()); prepared.texture.dispose(); }, [prepared]);
  // Your original Mysha FBX is kept. The suit pieces are small stylised overlays (neck ring, slim
  // chest panel, slim backpack). A fully rigged astronaut suit asset would be needed for a real suit.
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <primitive object={prepared.copy} />
      <mesh position={[0, 1.4, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.12, 0.035, 10, 24]} /><meshStandardMaterial color="#e8ecee" metalness={0.3} roughness={0.4} /></mesh>
      <mesh position={[0, 1.17, 0.2]}><boxGeometry args={[0.3, 0.2, 0.06]} /><meshStandardMaterial color="#e6ebed" metalness={0.25} roughness={0.42} /></mesh>
      <mesh position={[0, 1.18, 0.235]}><boxGeometry args={[0.16, 0.08, 0.01]} /><meshBasicMaterial color="#68d8ef" /></mesh>
      <mesh position={[0, 1.15, -0.2]}><boxGeometry args={[0.34, 0.5, 0.14]} /><meshStandardMaterial color="#b9cad3" metalness={0.4} roughness={0.5} /></mesh>
    </group>
  );
}

class CrewBoundary extends Component<{ children: ReactNode; onLoadError: (message: string) => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(e: unknown) { console.error("[Level3] Mysha asset error", MODEL, SKIN, e); this.props.onLoadError("Mysha's character model could not load. Check the FBX and texture paths."); }
  render() { return this.state.failed ? null : this.props.children; }
}

function Dust({ flightRef, braking, settling }: { flightRef: { current: Flight }; braking: boolean; settling: boolean }) {
  const N = 80;
  const br = useRef(braking); br.current = braking;
  const st = useRef(settling); st.current = settling;
  const settle = useRef(1);
  const mat = useRef<THREE.PointsMaterial>(null);
  const pts = useRef<THREE.Points>(null);
  const geo = useMemo(() => { const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3), 3)); return g; }, []);
  useEffect(() => () => geo.dispose(), [geo]);
  useFrame(({ clock }, dt) => {
    const f = flightRef.current, t = clock.elapsedTime;
    let strength: number;
    if (st.current) { settle.current = Math.max(0, settle.current - dt * 0.22); strength = settle.current * 0.9; }
    else { settle.current = 1; strength = clean(1 - f.altitude / 200, 0, 1) * (br.current ? 1 : 0.35); }
    if (pts.current) pts.current.visible = strength > 0.01;
    if (mat.current) mat.current.opacity = strength * 0.55;
    if (strength <= 0.01) return;
    const pos = geo.attributes.position as THREE.BufferAttribute, cx = f.lateral * 0.92, cz = shipZ(f.altitude);
    for (let i = 0; i < N; i++) {
      const ph = (t * 0.5 + i / N) % 1, ang = i * 2.399, rad = 0.3 + ph * 3.4;
      pos.setXYZ(i, cx + Math.cos(ang) * rad, GROUND + 0.05 + ph * (1 - ph) * 2.2, cz + Math.sin(ang) * rad * 0.8);
    }
    pos.needsUpdate = true;
  });
  return <points ref={pts} geometry={geo} frustumCulled={false}><pointsMaterial ref={mat} color="#d58b62" size={0.1} transparent opacity={0} depthWrite={false} /></points>;
}

type Ref3<T> = { current: T | null };

/** One camera rig for everything. Interior and exterior both read the SAME flightRef, so switching never touches the simulation. */
function LandingCamera({ stage, flightRef, camMode, shipRef, cockpitRef }: { stage: Stage; flightRef: { current: Flight }; camMode: CamMode; shipRef: Ref3<THREE.Group>; cockpitRef: Ref3<THREE.Group> }) {
  const camera = useThree(s => s.camera) as THREE.PerspectiveCamera;
  const look = useRef(new THREE.Vector3(0, 0.4, -5));
  const dest = useRef(new THREE.Vector3()), target = useRef(new THREE.Vector3());
  const sw = useRef({ key: "", t: -10 });
  useFrame(({ clock }, dt) => {
    const f = flightRef.current, now = clock.elapsedTime;
    const cx = f.lateral * 0.92, sy = shipY(f.altitude), sz = shipZ(f.altitude);
    const key = stage === "success" ? "success" : isDescent(stage) ? camMode : "story";
    if (sw.current.key !== key) { sw.current.key = key; sw.current.t = now; }
    const slow = key === "story" || key === "success" || now - sw.current.t < 1.4;
    const k = 1 - Math.exp(-(slow ? 2.6 : 9) * Math.min(0.05, dt));
    let fov = 52;
    if (key === "success") {
      const a = now * 0.12;
      dest.current.set(cx + 4.6 + Math.sin(a) * 0.6, -1.5, -0.2 + Math.cos(a) * 0.4);
      target.current.set(cx + 0.9, -1.4, -4.2); fov = 44;
    } else if (key === "interior") {
      const pitch = THREE.MathUtils.degToRad(10 + 30 * (1 - clean(f.altitude / 600, 0, 1)));
      dest.current.set(cx, sy + 0.95, sz - 0.1);
      target.current.set(cx * 0.7, dest.current.y - Math.sin(pitch) * 10, dest.current.z - Math.cos(pitch) * 10); fov = 68;
    } else if (key === "exterior") {
      dest.current.set(cx * 0.8 + 3.4, Math.max(sy + 1.7, GROUND + 1.2), sz + 7.2);
      target.current.set(cx, sy - 0.2, sz - 0.8);
    } else { dest.current.set(0.6, 2.0, 10.5); target.current.set(0, 0.4, -5); }
    camera.position.lerp(dest.current, k);
    look.current.lerp(target.current, k);
    camera.lookAt(look.current);
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov += (fov - camera.fov) * k; camera.updateProjectionMatrix(); }
    const near = key === "interior" && camera.position.distanceTo(dest.current) < 0.8;
    if (cockpitRef.current) { cockpitRef.current.visible = near; cockpitRef.current.position.copy(camera.position); cockpitRef.current.quaternion.copy(camera.quaternion); }
    if (shipRef.current) shipRef.current.visible = !near;
  });
  return null;
}

function MarsScene({ stage, flightRef, alarm, zoom, braking, camMode, onLoadError }: { stage: Stage; flightRef: { current: Flight }; alarm: boolean; zoom: number; braking: boolean; camMode: CamMode; onLoadError: (s: string) => void }) {
  const tex = useMemo(marsTexture, []);
  const terrain = useMemo(makeTerrain, []);
  useEffect(() => () => tex.dispose(), [tex]);
  useEffect(() => () => terrain.dispose(), [terrain]);
  const descent = isDescent(stage);
  const planet = useRef<THREE.Group>(null);
  const shipRef = useRef<THREE.Group>(null), cockpitRef = useRef<THREE.Group>(null), blobRef = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    if (planet.current) {
      planet.current.rotation.y += dt * 0.023;
      const s = THREE.MathUtils.lerp(planet.current.scale.x, 0.72 + zoom * 0.55, 1 - Math.exp(-1.6 * dt));
      planet.current.scale.setScalar(s);
    }
    const f = flightRef.current;
    if (shipRef.current) { shipRef.current.position.set(f.lateral * 0.92, shipY(f.altitude), shipZ(f.altitude)); shipRef.current.rotation.z = -f.vx * 0.12; }
    if (blobRef.current) {
      blobRef.current.position.set(f.lateral * 0.92, GROUND + 0.03, shipZ(f.altitude));
      blobRef.current.scale.setScalar(1 + f.altitude / 300);
      (blobRef.current.material as THREE.MeshBasicMaterial).opacity = clean(0.5 - f.altitude / 600, 0.1, 0.5);
    }
  });
  const rocks = useMemo(() => Array.from({ length: 44 }, (_, i) => {
    const x = Math.sin(i * 23.7) * 48, zw = -5 + Math.cos(i * 3.1) * 50 - 8;
    if (Math.hypot(x, zw + 5) < 10) return null;
    const size = 0.4 + (i % 5) * 0.34;
    return { x, y: GROUND + terrainH(x, zw) + size * 0.3, z: zw, size, ry: i * 0.83, tone: i % 2 ? "#7f352b" : "#be6942" };
  }).filter((r): r is NonNullable<typeof r> => r !== null), []);

  return (
    <>
      <color attach="background" args={[descent ? "#b4684a" : "#020711"]} />
      <ambientLight intensity={descent ? 0.9 : 0.7} color={descent ? "#ffd0b0" : "#95adc5"} />
      <directionalLight position={[6, 12, -1]} intensity={2.2} color="#ffd4a6" castShadow shadow-mapSize={[1024, 1024]} shadow-camera-left={-18} shadow-camera-right={18} shadow-camera-top={18} shadow-camera-bottom={-18} shadow-camera-far={60} />
      {!descent && <Stars radius={100} depth={55} count={1400} factor={3} fade speed={0.2} />}
      {!descent && (
        <>
          <group ref={planet} position={[2.8, -0.8, -21]} scale={0.72}>
            <mesh><sphereGeometry args={[8.5, 64, 48]} /><meshStandardMaterial map={tex} roughness={1} /></mesh>
            <mesh scale={1.035}><sphereGeometry args={[8.5, 48, 32]} /><meshBasicMaterial color="#e47848" transparent opacity={0.1} side={THREE.BackSide} depthWrite={false} /></mesh>
          </group>
          <group position={[2.6, 0.1, -4.5]} rotation={[0, 0, 0.12]} scale={0.6}><Lander /></group>
          <group>
            <mesh position={[-0.2, -2.8, 2]}><boxGeometry args={[9, 0.36, 5]} /><meshStandardMaterial color="#233545" metalness={0.73} roughness={0.35} /></mesh>
            {[-3.8, 3.8].map(x => <mesh key={x} position={[x, 0.4, 2.4]}><boxGeometry args={[0.18, 5.5, 0.2]} /><meshStandardMaterial color="#4b7088" metalness={0.75} /></mesh>)}
            <mesh position={[0, 3, 1.8]}><boxGeometry args={[8.6, 0.19, 0.36]} /><meshStandardMaterial color="#4b667c" metalness={0.75} /></mesh>
            <mesh position={[0, 0.2, 1.9]}><torusGeometry args={[4.4, 0.1, 10, 72, Math.PI]} /><meshStandardMaterial color="#3a5a72" metalness={0.8} roughness={0.35} /></mesh>
            <mesh position={[0, -1.9, 1.2]}><boxGeometry args={[3.5, 1.4, 0.45]} /><meshStandardMaterial color="#1c344a" metalness={0.8} /></mesh>
            {[-1, 0, 1].map((x, i) => <mesh key={i} position={[x * 1.07, -1.68, 1.48]}><boxGeometry args={[0.72, 0.4, 0.05]} /><meshBasicMaterial color={alarm ? "#f15d64" : "#5cc9e2"} /></mesh>)}
            <pointLight position={[-3, 1, 2.5]} intensity={1.4} distance={9} color="#ff9a5a" />
            <pointLight position={[3, 0.5, 2.5]} intensity={1.2} distance={9} color="#4fb8ff" />
          </group>
          <AuraHologram alarm={alarm} />
          <Suspense fallback={<Html center><span style={{ color: "#bce7ed" }}>Loading Mysha…</span></Html>}>
            <CrewBoundary onLoadError={onLoadError}><AstronautModel /></CrewBoundary>
          </Suspense>
        </>
      )}
      {descent && (
        <>
          <fog attach="fog" args={["#b4684a", 28, 130]} />
          <mesh geometry={terrain} position={[0, GROUND, -4]} receiveShadow><meshStandardMaterial vertexColors roughness={1} /></mesh>
          {rocks.map((r, i) => <mesh key={i} position={[r.x, r.y, r.z]} rotation={[0, r.ry, 0]} scale={[1, 0.7, 1]}><dodecahedronGeometry args={[r.size, 0]} /><meshStandardMaterial color={r.tone} roughness={1} flatShading /></mesh>)}
          {[-70, -42, -14, 16, 44, 72].map((x, i) => <mesh key={x} position={[x, 1.5, -92 - (i % 3) * 8]} scale={[1, 0.6 + (i % 2) * 0.3, 1]}><coneGeometry args={[12 + i * 1.5, 12, 6]} /><meshStandardMaterial color="#7a3a2c" roughness={1} flatShading /></mesh>)}
          <mesh position={[-34, 16, -118]}><sphereGeometry args={[3, 24, 16]} /><meshBasicMaterial color="#fff0d2" fog={false} /></mesh>
          {/* landing target */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, GROUND + 0.04, -5]}><ringGeometry args={[1.6, 1.75, 64]} /><meshBasicMaterial color="#8af4db" transparent opacity={0.9} side={THREE.DoubleSide} /></mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, GROUND + 0.04, -5]}><ringGeometry args={[0.3, 0.38, 32]} /><meshBasicMaterial color="#8af4db" transparent opacity={0.7} side={THREE.DoubleSide} /></mesh>
          {[-1, 1].map(s => <mesh key={s} rotation={[-Math.PI / 2, 0, 0]} position={[s * 1.5, GROUND + 0.04, -5]}><planeGeometry args={[0.2, 2.1]} /><meshBasicMaterial color="#8af4db" transparent opacity={0.35} side={THREE.DoubleSide} /></mesh>)}
          <mesh position={[0, GROUND + 3, -5]}><cylinderGeometry args={[0.04, 0.04, 6, 8]} /><meshBasicMaterial color="#8af4db" transparent opacity={0.3} depthWrite={false} /></mesh>
          <mesh ref={blobRef} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[1.1, 24]} /><meshBasicMaterial color="#1b0a08" transparent opacity={0.35} depthWrite={false} /></mesh>
          <group ref={shipRef} scale={0.85}><Lander pulse={isFlying(stage) && braking} /></group>
          <group ref={cockpitRef} visible={false}><Cockpit /></group>
          <Dust flightRef={flightRef} braking={braking} settling={stage === "success"} />
          {stage === "success" && (
            <Suspense fallback={null}>
              <CrewBoundary onLoadError={onLoadError}><AstronautModel position={[flightRef.current.lateral * 0.92 + 2.6, GROUND, -3]} rotationY={0.9} /></CrewBoundary>
            </Suspense>
          )}
        </>
      )}
      <LandingCamera stage={stage} flightRef={flightRef} camMode={camMode} shipRef={shipRef} cockpitRef={cockpitRef} />
    </>
  );
}

/* ───────────────────────── styles ───────────────────────── */
const css = `
.l3-root,.l3-root *{box-sizing:border-box}
.l3-root{--focus:${ART_FOCUS_DESKTOP};position:fixed;inset:0;background:#020712;color:#eaf5fd;font:500 15px/1.48 Bahnschrift,"Segoe UI",system-ui,sans-serif;overflow:hidden;isolation:isolate}
.l3-root button{font:inherit;cursor:pointer;transition:background .22s,border-color .22s,transform .2s,box-shadow .22s}
.l3-root button:focus-visible,.l3-root input:focus-visible{outline:2px solid #b8f6ff;outline-offset:3px}
.l3-scene{position:absolute;inset:0;z-index:0}
.l3-vignette{position:absolute;inset:0;pointer-events:none;z-index:1;background:linear-gradient(90deg,#020814a0 0%,transparent 51%),linear-gradient(0deg,#020711d9 0%,transparent 27%,transparent 73%,#02071173 100%),radial-gradient(ellipse at center,transparent 58%,#0206118c)}
.l3-scanlines{position:absolute;inset:0;z-index:1;pointer-events:none;opacity:.13;background:repeating-linear-gradient(0deg,transparent 0 4px,#b8eaff0a 5px 6px)}
.l3-scan{position:absolute;z-index:2;left:0;right:0;height:22%;top:-22%;pointer-events:none;background:linear-gradient(180deg,transparent,#4fd9ff1f 70%,#8af4ff66 98%,transparent);animation:l3-scanband 3.6s ease-in-out infinite}
.l3-redwash{position:absolute;inset:0;z-index:2;pointer-events:none;background:radial-gradient(ellipse at center,transparent 50%,#ff3b3b38);animation:l3-breathe 2.4s ease-in-out infinite}
.l3-top{position:absolute;z-index:9;top:0;left:0;right:0;padding:calc(14px + env(safe-area-inset-top,0px)) clamp(12px,3vw,48px) 14px;display:flex;justify-content:space-between;align-items:flex-start;gap:12px;background:linear-gradient(#020711b8,transparent);pointer-events:none}
.l3-top>*{pointer-events:auto}
.l3-brand small{display:block;font-size:10px;font-weight:800;letter-spacing:.24em;color:#8ee3fa}
.l3-brand strong{display:block;font-weight:900;letter-spacing:.14em;font-size:clamp(15px,1.8vw,22px)}
.l3-tools{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;position:relative}
.l3-btn{border:1px solid #7cb4cd91;border-radius:999px;background:#071c31d9;color:#e9f7ff;padding:11px 17px;font-size:12px!important;font-weight:850!important;letter-spacing:.09em;backdrop-filter:blur(10px)}
.l3-btn:hover{border-color:#c0f3ff;background:#174460e6;box-shadow:0 0 24px #49bbff3d}
.l3-btn:active{transform:scale(.97)}
.l3-btn:disabled{opacity:.4;cursor:not-allowed}
.l3-primary{background:linear-gradient(96deg,#fb874d,#fa533c);border-color:#ffad75;box-shadow:0 8px 30px #ff6b4654}
.l3-primary:hover{background:linear-gradient(96deg,#ffa65b,#fd6341);box-shadow:0 10px 34px #ff815b6f}
.l3-big{padding:17px 34px;font-size:15px!important;letter-spacing:.16em}
.l3-audio{position:absolute;top:100%;right:0;margin-top:8px;width:230px;padding:14px;border:1px solid #79bed76e;border-radius:14px;background:#071b2bf2;display:grid;gap:10px}
.l3-audio label{display:grid;gap:4px;font-size:11px;letter-spacing:.1em;font-weight:800}
.l3-art{position:absolute;inset:0;z-index:5;background:#020712;overflow:hidden}
.l3-art.failed{background:transparent}
.l3-art-img{position:absolute;inset:-3%;width:106%;height:106%;object-fit:cover;object-position:var(--focus);transform:translate3d(calc(var(--px,0)*-10px),calc(var(--py,0)*-6px),0);transition:transform .3s ease-out;animation:l3-reveal 3s ease-out both}
.l3-art-fade{position:absolute;inset:0;background:linear-gradient(0deg,#020712 0%,#020712e6 18%,#02071299 36%,transparent 58%),radial-gradient(ellipse at 50% 45%,transparent 55%,#020712b0 100%)}
.l3-art-glow{position:absolute;inset:0;pointer-events:none;mix-blend-mode:screen;background:radial-gradient(ellipse at 50% 60%,#ff7b3a38,transparent 60%);animation:l3-breathe 5s ease-in-out infinite}
.l3-art-scan{position:absolute;left:0;right:0;height:2px;top:0;background:linear-gradient(90deg,transparent,#8af4ff88,transparent);animation:l3-sweep 7s linear infinite;pointer-events:none}
.l3-art-blackout{position:absolute;inset:0;background:#020712;pointer-events:none;animation:l3-fadeout 2.4s ease-out forwards}
.l3-dock{position:absolute;left:0;right:0;bottom:0;padding:24px 20px calc(26px + env(safe-area-inset-bottom,0px));display:flex;flex-direction:column;align-items:center;text-align:center;gap:14px}
.l3-dock-tag{font-size:clamp(12px,1.6vw,16px);letter-spacing:.34em;font-weight:900;color:#ffc18c;animation:l3-raise 1.2s .9s both}
.l3-dock-quote{max-width:560px;color:#d3e4ee;font-size:clamp(14px,1.7vw,18px);font-style:italic;animation:l3-raise 1.2s 1.2s both}
.l3-dock-actions{display:flex;flex-wrap:wrap;gap:12px;justify-content:center;animation:l3-raise 1.2s 1.5s both}
.l3-start{animation:l3-pulse 2.8s ease-in-out infinite}
.l3-dock small{color:#9db8c6;font-size:11px;max-width:520px}
.l3-fallback-title{font-size:clamp(36px,7vw,84px);font-weight:1000;letter-spacing:-.04em;line-height:1;margin:0}
.l3-fallback-title em{display:block;font-style:normal;background:linear-gradient(90deg,#ffc18c,#fa6857);background-clip:text;-webkit-background-clip:text;color:transparent}
.l3-center{position:absolute;z-index:6;inset:0;display:grid;place-items:center;padding:85px 20px 30px;overflow:auto}
.l3-shell{position:relative;width:min(980px,100%);margin:auto;background:linear-gradient(132deg,#06172ff2,#071a2cd9);border:1px solid #77bcd666;border-radius:24px;box-shadow:0 22px 100px #0009,inset 0 1px #c7ecff23;backdrop-filter:blur(18px);padding:clamp(20px,3vw,40px);animation:l3-raise .65s ease-out both}
.l3-kicker{display:inline-flex;gap:9px;align-items:center;font-size:11px;letter-spacing:.24em;font-weight:900;color:#91eaff}
.l3-kicker:before{content:"";width:8px;height:8px;border-radius:50%;background:#ff9165;box-shadow:0 0 18px #ff9165}
.l3-shell h2{font-size:clamp(26px,3.5vw,42px);margin:9px 0 13px;line-height:1.13;letter-spacing:-.03em}
.l3-shell p{color:#d3e2eb;line-height:1.6}
.l3-warning{padding:14px 17px;border:1px solid #ec876e8a;border-radius:13px;background:#531f287a;color:#ffd7ca!important;font-size:13px}
.l3-note{padding:14px 17px;border:1px solid #74c8e577;border-radius:13px;background:#0b2c44a8;color:#cfeaf5!important;font-size:13px;margin-top:12px}
.l3-row{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.l3-actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:22px}
.l3-data{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:20px 0}
.l3-data>div{border:1px solid #8bbbd058;background:#0b2438be;border-radius:14px;padding:14px}
.l3-data b{display:block;color:#a0e9ff;font-size:10px;letter-spacing:.17em}
.l3-data strong{font-size:clamp(16px,2.4vw,28px);display:block;margin-top:6px}
.l3-danger{color:#ffb59c!important}
.l3-plan{display:grid;grid-template-columns:1fr 250px;gap:20px;align-items:start;margin-top:14px}
.l3-rows{display:grid;gap:10px}
.l3-r4{display:grid;grid-template-columns:34px minmax(130px,1.1fr) 1.8fr 32px 46px 32px;gap:10px;align-items:center;padding:12px 14px;border:1px solid #74b6cf66;border-radius:12px;background:#0b2337d8}
.l3-r4.low{border-color:#ec876e8a}
.l3-r4 .ico{font-size:24px;color:#ffb067;text-align:center}
.l3-r4 .nm b{display:block;font-size:13px;letter-spacing:.02em}
.l3-r4 .nm small{display:block;color:#9eb8c5;font-size:11px;line-height:1.3}
.l3-r4 .v{font-size:24px;font-weight:900;color:#f6c08f;font-variant-numeric:tabular-nums;text-align:center}
.l3-r4 button.pm{width:32px;height:32px;border-radius:8px;border:1px solid #7cb4cd91;background:#0d2c44;color:#e9f7ff;font-size:18px;font-weight:900;padding:0;line-height:1}
.l3-r4 button.pm:hover{background:#174460;border-color:#c0f3ff}
.l3-range{width:100%;accent-color:#4fd8ff;height:28px}
.l3-side{display:grid;gap:12px;justify-items:center}
.l3-ring{position:relative;width:200px;height:200px}
.l3-ring svg{width:100%;height:100%;transform:rotate(-90deg)}
.l3-ring .mid{position:absolute;inset:0;display:grid;place-content:center;text-align:center}
.l3-ring .mid strong{font-size:46px;line-height:1;font-variant-numeric:tabular-nums}
.l3-ring .mid span{font-size:11px;letter-spacing:.14em;color:#a0e9ff}
.l3-ring .mid em{font-style:normal;font-size:12px;color:#ffb59c;margin-top:4px}
.l3-side .l3-btn{width:100%}
.l3-why{display:flex;gap:12px;align-items:flex-start}
.l3-why i{flex:none;width:30px;height:30px;border-radius:50%;border:2px solid #5fd8f0;color:#5fd8f0;display:grid;place-items:center;font-style:normal;font-weight:900}
.l3-why b{display:block;font-size:12px;letter-spacing:.12em;color:#a0e9ff;margin-bottom:2px}
.l3-foot{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-top:16px}
.l3-foot small{color:#9eb8c5;font-size:11px;max-width:520px}
.l3-inst{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin:18px 0}
.l3-inst>div{border:1px solid #6aa9c04a;background:#0b2438a0;border-radius:12px;padding:12px 8px;text-align:center;font-size:10px;letter-spacing:.08em;font-weight:800;opacity:.5;transition:all .3s}
.l3-inst>div span{display:block;font-size:22px;margin-bottom:4px}
.l3-inst>div.on{opacity:1;border-color:#9eeaff;box-shadow:0 0 28px #49d2ff55;background:#123b55;animation:l3-pulse 1.8s ease-in-out infinite}
.l3-keys{display:flex;flex-wrap:wrap;gap:16px;margin:18px 0}
.l3-keycard{display:flex;align-items:center;gap:10px;font-size:13px;flex:1 1 230px;border:1px solid #6aa9c04a;border-radius:12px;padding:10px 12px;background:#0b2438a0}
.l3-key{min-width:42px;padding:8px 10px;border:1px solid #b8f6ff;border-bottom-width:4px;border-radius:8px;text-align:center;font-weight:900;color:#d8f7ff;background:#102f45;animation:l3-keypress 2s ease-in-out infinite}
.l3-key.b{animation-delay:1s}
.l3-dots{display:flex;gap:7px;margin-bottom:6px}
.l3-dots i{width:26px;height:4px;border-radius:3px;background:#2a4a60}
.l3-dots i.on{background:#ff9165}
.l3-mode{position:absolute;z-index:4;top:calc(70px + env(safe-area-inset-top,0px));left:50%;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:8px}
.l3-mode-title{padding:8px 28px;border:1px solid #8bd6ea;border-radius:10px;background:#06243ae0;font-weight:900;letter-spacing:.2em;font-size:13px;box-shadow:0 0 24px #49d2ff33;white-space:nowrap}
.l3-cam{display:inline-flex;border:1px solid #7cb4cd91;border-radius:999px;background:#071c31e6;overflow:hidden;backdrop-filter:blur(10px)}
.l3-cam button{min-height:40px;padding:8px 18px;background:transparent;color:#bfe4f2;border:0;font-weight:850;font-size:12px;letter-spacing:.1em}
.l3-cam button[aria-pressed="true"]{background:linear-gradient(96deg,#fb874d,#fa533c);color:#fff}
.l3-camkey{font-size:10px;letter-spacing:.16em;color:#a9d8e8;font-weight:800}
.l3-hudL,.l3-hudR{position:absolute;z-index:3;top:calc(86px + env(safe-area-inset-top,0px));display:grid;gap:7px;width:min(260px,30vw);align-content:start}
.l3-hudL{left:clamp(12px,3vw,42px)}
.l3-hudR{right:clamp(12px,3vw,42px)}
.l3-meter{background:#071b2be6;border:1px solid #79bed76e;border-radius:12px;padding:9px 13px;backdrop-filter:blur(12px)}
.l3-meter>div:first-child{display:flex;align-items:center;justify-content:space-between;font-size:11px;letter-spacing:.09em;font-weight:900}
.l3-meter b{font-size:19px;font-variant-numeric:tabular-nums;color:#b7f2ff}
.l3-meter i{display:block;height:6px;background:#173549;border-radius:6px;overflow:hidden;margin-top:7px}
.l3-meter i em{display:block;height:100%;background:linear-gradient(90deg,#5dc6e7,#a1f5df);transition:width .2s}
.l3-meter.critical{border-color:#ff8f78}.l3-meter.critical b{color:#ffc0a6}.l3-meter.critical i em{background:linear-gradient(90deg,#f04e50,#ffab67)}
.l3-meter.caution i em{background:linear-gradient(90deg,#f0a64e,#ffd267)}
.l3-status{padding:9px 13px;border-radius:12px;border:1px solid #79bed76e;background:#071b2be6;font-size:12px;font-weight:900;letter-spacing:.09em}
.l3-status.caution{border-color:#ffc16b;color:#ffd9a0}.l3-status.critical{border-color:#ff8f78;color:#ffc0a6}.l3-status.ok{color:#a1f5df}
.l3-lane-line{position:relative;margin-top:14px;height:14px;border-radius:20px;background:#8e3d3b}
.l3-lane-safe{position:absolute;top:0;bottom:0;border-radius:20px;background:#3f9a8b}
.l3-lane-dot{position:absolute;top:-7px;width:28px;height:28px;transform:translateX(-50%);border:3px solid #eafff8;border-radius:50%;background:#ff8558;box-shadow:0 0 18px #ff8558}
.l3-meter small{display:block;margin-top:9px;color:#bdd6e0;font-size:11px}
.l3-bottom{position:absolute;z-index:3;bottom:0;left:0;right:0;display:flex;align-items:flex-end;justify-content:space-between;gap:20px;padding:30px clamp(12px,3vw,48px) calc(18px + env(safe-area-inset-bottom,0px));background:linear-gradient(0deg,#020916f5,transparent)}
.l3-guide{max-width:560px;background:#061b2fcf;border:1px solid #72b7d46d;padding:12px 16px;border-radius:12px;backdrop-filter:blur(10px);font-size:13px}
.l3-guide b{color:#9eeaff;letter-spacing:.1em;font-size:11px}
.l3-guide small{display:block;color:#9eb8c5;margin-top:3px}
.l3-controls{display:flex;gap:8px;align-items:center;justify-content:flex-end;flex-wrap:wrap}
.l3-controls button{min-height:55px;touch-action:none;user-select:none;-webkit-user-select:none;border:1px solid #9ad6e5ad;border-radius:13px;background:#0b3248de;color:#e7f8ff;padding:10px 17px;font-weight:900;letter-spacing:.07em}
.l3-controls button.brake{background:linear-gradient(94deg,#f17c49,#f0523e);border-color:#ffb582}
.l3-controls button.held{transform:scale(.96);box-shadow:0 0 25px #ff986794}
.l3-controls button.hint{animation:l3-hint 1s ease-in-out infinite;border-color:#fff}
.l3-controls kbd{display:block;font-size:9px;font-weight:800;letter-spacing:.12em;opacity:.8}
.l3-overlay{position:absolute;z-index:12;inset:0;display:grid;place-items:center;padding:20px;background:#020814c5;backdrop-filter:blur(9px);overflow:auto}
.l3-overlay.clear{background:linear-gradient(90deg,transparent 35%,#020814d0);backdrop-filter:none;place-items:center end;padding-right:clamp(16px,5vw,80px)}
.l3-outcome{text-align:center;max-width:680px}
.l3-outcome .l3-actions{justify-content:center}
.l3-win{max-width:430px;border-color:#52e08f99;box-shadow:0 22px 100px #0009,0 0 60px #2fdc7a33}
.l3-win h2{color:#7dfba9;text-shadow:0 0 28px #2fdc7a66}
.l3-win .l3-kicker{color:#9cffc2}
.l3-win .sub{font-size:clamp(16px,2vw,20px);font-weight:800;color:#f0f8ff;margin:0 0 4px}
.l3-win .lvl{display:inline-block;margin:10px 0;color:#ffd48a;font-weight:900;letter-spacing:.22em;font-size:13px}
.l3-symbol{font-size:52px;filter:drop-shadow(0 0 20px #b7f2ff66)}
.l3-outcome h2{font-size:clamp(32px,5vw,60px);line-height:1;margin:12px 0}
.l3-win h2{font-size:clamp(28px,3.4vw,40px)}
.l3-subtitle{position:absolute;z-index:6;left:0;right:0;bottom:0;padding:24px clamp(14px,4vw,60px) calc(28px + env(safe-area-inset-bottom,0px));background:linear-gradient(0deg,#020712f2 40%,transparent);display:flex;flex-direction:column;gap:14px;align-items:flex-start}
.l3-subtitle .l3-quote{max-width:760px;font-size:clamp(16px,2vw,22px);line-height:1.5;animation:l3-raise .8s both}
.l3-subtitle .l3-quote b{color:#9eeaff;font-size:12px;letter-spacing:.18em;display:block;margin-bottom:6px}
.l3-alert{display:grid;gap:8px;max-width:520px;animation:l3-raise .8s both}
.l3-alert div{border:1px solid #ff8f78;background:#531f28b0;border-radius:12px;padding:10px 14px;font-weight:900;letter-spacing:.07em;font-size:13px;color:#ffd7ca}
.l3-alert .head{border-color:#ff5a5f;background:#7a1f2acc;font-size:15px;animation:l3-hint 1.3s infinite}
.l3-oldnote{display:inline-block;padding:12px 18px;border:1px dashed #ffd9a0;background:#2a2113cc;color:#ffe8c4;border-radius:6px;font-family:Georgia,serif;font-size:clamp(18px,2.4vw,26px);transform:rotate(-1.2deg);animation:l3-raise .8s both}
.l3-worldnote{position:absolute;z-index:12;bottom:24%;left:50%;transform:translateX(-50%);max-width:min(520px,90vw);padding:13px 20px;border-radius:12px;border:1px solid #ffb59c;background:#25171de8;color:#ffe2d7;text-align:center}
.l3-banner{position:absolute;z-index:6;left:50%;top:22%;transform:translateX(-50%);text-align:center;width:min(720px,92vw);animation:l3-raise 1.2s both}
.l3-banner h2{font-size:clamp(30px,6vw,72px);margin:0;letter-spacing:-.03em;text-shadow:0 4px 40px #000}
.l3-banner p{font-size:clamp(15px,2vw,22px);color:#ffe2c8;text-shadow:0 2px 14px #000}
.l3-spark{position:absolute;width:4px;height:4px;border-radius:50%;background:#ffd9a0;opacity:0;animation:l3-float 6s linear infinite}
.l3-stamp{display:inline-grid;place-items:center;width:70px;height:70px;border-radius:50%;border:3px solid #8af4db;color:#8af4db;font-size:38px;animation:l3-stamp .8s cubic-bezier(.2,1.4,.3,1) both}
.l3-check{display:inline-grid;place-items:center;width:54px;height:54px;border-radius:50%;background:#1d8f50;color:#fff;font-size:30px;box-shadow:0 0 30px #2fdc7a88;animation:l3-stamp .8s cubic-bezier(.2,1.4,.3,1) both}
@keyframes l3-raise{from{opacity:0;transform:translateY(22px) scale(.985)}to{opacity:1;transform:none}}
@keyframes l3-reveal{from{opacity:0;filter:brightness(.25) saturate(.8)}to{opacity:1;filter:none}}
@keyframes l3-fadeout{from{opacity:1}to{opacity:0;visibility:hidden}}
@keyframes l3-breathe{0%,100%{opacity:.45}50%{opacity:.9}}
@keyframes l3-sweep{from{top:-2%}to{top:102%}}
@keyframes l3-scanband{from{top:-22%}to{top:100%}}
@keyframes l3-pulse{0%,100%{box-shadow:0 8px 30px #ff6b4654}50%{box-shadow:0 8px 46px #ff815b99}}
@keyframes l3-hint{0%,100%{box-shadow:0 0 0 #ffd9a000}50%{box-shadow:0 0 26px #ffd9a0cc}}
@keyframes l3-keypress{0%,40%,100%{transform:none;border-bottom-width:4px}50%,70%{transform:translateY(3px);border-bottom-width:1px;background:#1b5a7a}}
@keyframes l3-float{0%{opacity:0;transform:translateY(40px)}20%{opacity:.9}100%{opacity:0;transform:translateY(-220px)}}
@keyframes l3-stamp{from{opacity:0;transform:scale(2.4) rotate(-20deg)}to{opacity:1;transform:none}}
@media(max-width:900px){.l3-plan{grid-template-columns:1fr}.l3-ring{width:150px;height:150px}.l3-ring .mid strong{font-size:34px}}
@media(max-width:760px){
.l3-root{--focus:${ART_FOCUS_MOBILE}}
.l3-brand strong{font-size:13px}.l3-tools .l3-btn{padding:8px 10px;font-size:10px!important}
.l3-center{padding:92px 12px 24px}.l3-shell{padding:18px}.l3-data{grid-template-columns:1fr 1fr}
.l3-inst{grid-template-columns:repeat(3,1fr)}
.l3-r4{grid-template-columns:28px 1fr 32px 42px 32px}.l3-r4 .l3-range{grid-column:1/-1;order:9}
.l3-mode{top:calc(62px + env(safe-area-inset-top,0px))}.l3-mode-title{display:none}.l3-camkey{display:none}
.l3-hudL,.l3-hudR{top:calc(112px + env(safe-area-inset-top,0px));width:calc(50% - 16px);gap:4px}
.l3-hudL{left:10px}.l3-hudR{right:10px}
.l3-meter{padding:6px 9px}.l3-meter b{font-size:15px}.l3-meter>div:first-child{font-size:9px}.l3-meter small{display:none}
.l3-bottom{padding:12px 10px calc(12px + env(safe-area-inset-bottom,0px));display:block}.l3-guide{margin-bottom:8px;font-size:11px}.l3-guide small{display:none}
.l3-controls{justify-content:center}.l3-controls button{flex:1;min-height:56px;padding:8px}
.l3-status{font-size:10px;padding:6px 9px}
.l3-big{padding:15px 22px;font-size:13px!important}
.l3-subtitle .l3-quote{font-size:15px}
.l3-overlay.clear{place-items:end center;padding:12px}}
@media(max-height:620px){.l3-center{padding-top:70px}.l3-hudL,.l3-hudR{top:110px}.l3-guide small{display:none}}
@media(prefers-reduced-motion:reduce){.l3-root *{animation:none!important;transition:none!important}.l3-art-blackout{display:none}}
`;

/* ───────────────────────── small UI pieces ───────────────────────── */
function Readout({ title, value, percent, level = "ok" }: { title: string; value: string; percent: number; level?: "ok" | "caution" | "critical" }) {
  const mark = level === "critical" ? "✖ " : level === "caution" ? "▲ " : "";
  return <div className={`l3-meter ${level === "ok" ? "" : level}`}><div><span>{mark}{title}</span><b>{value}</b></div><i><em style={{ width: `${clean(percent, 0, 100)}%` }} /></i></div>;
}

/* ───────────────────────── main component ───────────────────────── */
export function Level3Landing({ onBackToLevel2, onLevel4 }: { onBackToLevel2?: () => void; onLevel4?: () => void } = {}) {
  const [stage, setStage] = useState<Stage>("intro");
  const [plan, setPlan] = useState<Allocation>({ ...INITIAL_PLAN });
  const [flight, setFlight] = useState<Flight>(() => makeFlight(false, INITIAL_PLAN));
  const [error, setError] = useState("");
  const [modelError, setModelError] = useState("");
  const [paused, setPaused] = useState(false);
  const [braking, setBraking] = useState(false);
  const [held, setHeld] = useState({ left: false, right: false, brake: false });
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [marsStep, setMarsStep] = useState(0);
  const [tutStep, setTutStep] = useState(0);
  const [instIdx, setInstIdx] = useState(0);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [failReason, setFailReason] = useState("");
  const [tutorialDone, setTutorialDone] = useState<boolean>(() => readFlag(TUTORIAL_KEY));
  const [guided, setGuided] = useState<boolean>(() => !readFlag(TUTORIAL_KEY));
  const [musicOn, setMusicOn] = useState(true);
  const [sfxOn, setSfxOn] = useState(true);
  const [volume, setVolume] = useState(0.8);
  const [audioOpen, setAudioOpen] = useState(false);
  const [artFailed, setArtFailed] = useState(false);
  const [showComplete, setShowComplete] = useState(false);
  const [auraNote, setAuraNote] = useState("");
  const [coarse, setCoarse] = useState(false);
  const [camMode, setCamMode] = useState<CamMode>("interior");
  const [seenCams, setSeenCams] = useState({ interior: false, exterior: false });

  const audio = useRef<LandingAudio | null>(null);
  if (!audio.current) audio.current = new LandingAudio();
  const rootRef = useRef<HTMLDivElement>(null);
  const flightRef = useRef<Flight>(makeFlight(false, INITIAL_PLAN));
  const keyRef = useRef(new Set<string>());
  const heldRef = useRef({ left: false, right: false, brake: false });
  const stageRef = useRef<Stage>("intro");
  const tweenRef = useRef(0);
  const lastThruster = useRef(0);
  const lastSteer = useRef(0);
  const lastAlign = useRef(0);
  const fuelWarned = useRef(false);
  const wasAligned = useRef(false);

  const remaining = 100 - KEYS.reduce((n, k) => n + plan[k], 0);
  const ready = remaining === 0 && plan.supplies >= LIMITS.supplies.min && plan.shielding >= MINIMUMS.shielding && plan.power >= MINIMUMS.power && plan.stability >= MINIMUMS.stability;
  const practice = stage === "practice";
  const lim = limitsFor(practice, guided);
  const flying = isFlying(stage);
  const running = flying && !paused && overlay === null && outcome === null;

  const cue = useCallback((kind: Sound) => audio.current?.cue(kind), []);
  const beginAudio = useCallback(() => audio.current?.unlock(), []);
  const go = useCallback((next: Stage) => { stageRef.current = next; setStage(next); setError(""); }, []);

  useEffect(() => { const a = audio.current; return () => { cancelAnimationFrame(tweenRef.current); a?.dispose(); }; }, []);
  useEffect(() => { stageRef.current = stage; }, [stage]);
  useEffect(() => { audio.current?.setMusic(musicOn); }, [musicOn]);
  useEffect(() => { audio.current?.setSfx(sfxOn); }, [sfxOn]);
  useEffect(() => { audio.current?.setVolume(volume); }, [volume]);
  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const update = () => setCoarse(mq.matches); update();
    mq.addEventListener("change", update); return () => mq.removeEventListener("change", update);
  }, []);
  // remember which camera views the player has actually seen (used by the practice hint)
  useEffect(() => { if (flying) setSeenCams(s => (s[camMode] ? s : { ...s, [camMode]: true })); }, [flying, camMode]);

  // music mood follows the story
  useEffect(() => {
    let m: Mood = "approach";
    if (stage === "mars") m = marsStep === 1 ? "anomaly" : "approach";
    else if (stage === "plan" || stage === "approach" || stage === "tutorial") m = "plan";
    else if (stage === "landing" || stage === "practice") m = "landing";
    else if (stage === "success" || stage === "next") m = "success";
    else if (stage === "retry") m = "fail";
    audio.current?.mood(m);
  }, [stage, marsStep]);

  // cinematic touchdown timing
  useEffect(() => {
    if (stage !== "success") { setShowComplete(false); return; }
    const t = window.setTimeout(() => { setShowComplete(true); cue("complete"); }, 4600);
    return () => window.clearTimeout(t);
  }, [stage, cue]);

  // keyboard
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Escape") { setOverlay(o => (o ? null : "help")); return; }
      if (!isFlying(stageRef.current)) return;
      if (["Space", "ArrowLeft", "ArrowRight", "KeyA", "KeyD"].includes(e.code)) e.preventDefault();
      keyRef.current.add(e.code);
      if (e.code === "KeyP" && !e.repeat) setPaused(v => !v);
      if (e.code === "KeyC" && !e.repeat) { cue("camera"); setCamMode(m => (m === "interior" ? "exterior" : "interior")); }
    };
    const up = (e: KeyboardEvent) => { if (e.code === "Space" && isFlying(stageRef.current)) e.preventDefault(); keyRef.current.delete(e.code); };
    const blur = () => { keyRef.current.clear(); heldRef.current = { left: false, right: false, brake: false }; setHeld({ left: false, right: false, brake: false }); setBraking(false); };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up); window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", blur); };
  }, [cue]);

  // flight simulation: ONE loop, used by practice and the main landing. Both cameras only READ flightRef.
  useEffect(() => {
    if (!running) return;
    let active = true, frame = 0, last = performance.now(), uiAt = 0;
    const isPractice = stage === "practice";
    const cfg = simConfig(isPractice, plan);
    const L = limitsFor(isPractice, guided);
    const loop = (now: number) => {
      if (!active) return;
      const dt = clean((now - last) / 1000, 0, 0.05); last = now;
      const f = flightRef.current;
      const left = keyRef.current.has("KeyA") || keyRef.current.has("ArrowLeft") || heldRef.current.left;
      const right = keyRef.current.has("KeyD") || keyRef.current.has("ArrowRight") || heldRef.current.right;
      const brake = (keyRef.current.has("Space") || heldRef.current.brake) && f.fuel > 0;
      const dir = Number(right) - Number(left);
      f.elapsed += dt;
      f.speed = clean(f.speed + (cfg.gravity - (brake ? cfg.brake : 0)) * dt, 11, 128);
      f.altitude = Math.max(0, f.altitude - f.speed * 0.72 * dt);
      f.vx += (dir * cfg.steer - f.vx) * Math.min(1, dt * 5);
      f.lateral = clean(f.lateral + f.vx * dt + Math.sin(f.elapsed * 0.9) * dt * (isPractice ? 0.01 : 0.03), -2.6, 2.6);
      f.fuel = clean(f.fuel - (brake ? cfg.burn : 0) * dt, 0, 100);

      if (brake && now - lastThruster.current > 1100) { lastThruster.current = now; cue("thruster"); }
      if (dir !== 0 && now - lastSteer.current > 450) { lastSteer.current = now; cue("steer"); }
      if (f.fuel < 20 && !fuelWarned.current) { fuelWarned.current = true; cue("fuel"); }
      const aligned = Math.abs(f.lateral) <= L.lat;
      if (aligned && !wasAligned.current && now - lastAlign.current > 2500) { lastAlign.current = now; cue("align"); }
      wasAligned.current = aligned;

      if (now - uiAt > 70) { setFlight({ ...f }); setBraking(brake); uiAt = now; }

      if (f.altitude <= 0) {
        setFlight({ ...f }); setBraking(false); cue("contact");
        const fast = f.speed > L.speed, off = Math.abs(f.lateral) > L.lat;
        const safe = !fast && !off && (isPractice || (plan.shielding >= MINIMUMS.shielding && plan.power >= MINIMUMS.power && plan.stability >= MINIMUMS.stability));
        const reason = fast && off ? "The lander arrived too fast and away from the target ring." : fast ? "The lander arrived faster than the safe touchdown speed." : off ? "The lander touched down outside the target ring." : "";
        if (isPractice) {
          if (safe) { writeFlag(TUTORIAL_KEY); setTutorialDone(true); cue("land"); setOutcome("practice-win"); }
          else { cue("fail"); setFailReason(reason); setOutcome("practice-lose"); }
        } else {
          recordLevel(plan, safe);
          if (safe) { cue("land"); go("success"); } else { cue("fail"); setFailReason(reason); go("retry"); }
        }
        return;
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => { active = false; cancelAnimationFrame(frame); };
  }, [running, stage, plan, guided, cue, go]);

  /* ───── actions ───── */
  function resetSim(isPractice: boolean) {
    const f = makeFlight(isPractice, plan);
    flightRef.current = f; setFlight({ ...f });
    keyRef.current.clear(); heldRef.current = { left: false, right: false, brake: false }; setHeld({ left: false, right: false, brake: false });
    fuelWarned.current = false; wasAligned.current = false; setPaused(false); setOutcome(null); setBraking(false); setFailReason("");
  }
  function startPractice() { beginAudio(); cue("button"); resetSim(true); go("practice"); }
  function startLanding() { beginAudio(); cue("button"); resetSim(false); go("landing"); }
  function startOver() { beginAudio(); cue("button"); setPlan({ ...INITIAL_PLAN }); setAuraNote(""); resetSim(false); setMarsStep(0); go("intro"); }
  function pressStart() {
    beginAudio(); cue("button");
    if (!tutorialDone) { setTutStep(0); setInstIdx(0); go("tutorial"); } else { setMarsStep(0); go("mars"); }
  }
  function finishTutorialToStory() { cue("aura"); setMarsStep(0); go("mars"); }
  function openOverlay(o: Overlay) { beginAudio(); cue("button"); setOverlay(o); }
  function replayTutorial() { cue("tutorial"); setOverlay(null); setTutStep(0); setInstIdx(0); resetSim(false); go("tutorial"); }
  function chooseCam(m: CamMode) { if (m !== camMode) { beginAudio(); cue("camera"); setCamMode(m); } }
  function setAlloc(key: AllocationKey, raw: number) {
    beginAudio();
    setError("");
    setPlan(prev => {
      const others = KEYS.reduce((n, k) => (k === key ? n : n + prev[k]), 0);
      const v = clean(Math.round(raw), LIMITS[key].min, Math.min(LIMITS[key].max, 100 - others));
      if (v === prev[key]) return prev;
      cue("allocate"); return { ...prev, [key]: v };
    });
  }
  function tweenTo(target: Allocation) {
    cancelAnimationFrame(tweenRef.current);
    const from = { ...plan }, start = performance.now();
    const step = (now: number) => {
      const p = clean((now - start) / 650, 0, 1), e = 1 - Math.pow(1 - p, 3);
      if (p >= 1) { setPlan({ ...target }); return; }
      const next = {} as Allocation;
      KEYS.forEach(k => { next[k] = Math.round(from[k] + (target[k] - from[k]) * e); });
      setPlan(next); tweenRef.current = requestAnimationFrame(step);
    };
    tweenRef.current = requestAnimationFrame(step);
  }
  function suggestPlan() {
    beginAudio(); cue("aura"); setError(""); tweenTo(SUGGESTED_PLAN);
    setAuraNote("AURA's reasoning: radiation protection rises because of the elevated reading; power rises because it also sets fuel for the descent; landing stability rises for steadier braking. Food & water drops to a smaller but still adequate reserve. These are abstract planning points, not real conversions. Feel free to change anything.");
  }
  function acceptPlan() {
    beginAudio();
    if (!ready) {
      setError(remaining !== 0 ? `Allocate exactly 100 points. ${remaining > 0 ? remaining + " points unallocated." : "Reduce the total."}` : `AURA recommends at least ${MINIMUMS.shielding} for protection, ${MINIMUMS.power} for power and ${MINIMUMS.stability} for landing stability, with food & water kept at ${LIMITS.supplies.min} or more.`);
      cue("warning"); return;
    }
    cue("ready"); go("approach");
  }
  function pointer(key: "left" | "right" | "brake", value: boolean) {
    heldRef.current[key] = value; setHeld({ ...heldRef.current });
    if (key === "brake") setBraking(value);
    if (value) beginAudio();
  }
  const touchProps = (key: "left" | "right" | "brake") => ({
    onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => { try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* optional */ } pointer(key, true); },
    onPointerUp: () => pointer(key, false),
    onPointerCancel: () => pointer(key, false),
    onLostPointerCapture: () => pointer(key, false),
  });
  function onArtMove(e: ReactMouseEvent) {
    const el = rootRef.current; if (!el) return;
    el.style.setProperty("--px", String((e.clientX / window.innerWidth - 0.5) * 2));
    el.style.setProperty("--py", String((e.clientY / window.innerHeight - 0.5) * 2));
  }

  /* ───── derived ───── */
  const level = statusOf(flight, lim);
  const stab = stabilityOf(flight, plan);
  const align = alignmentOf(flight, lim);
  const bothSeen = seenCams.interior && seenCams.exterior;
  const camHint = practice && !bothSeen ? ` Also try the camera: ${coarse ? "tap INTERIOR / EXTERIOR" : "press C"} to see the other view.` : "";
  const guideText = (practice ? practiceHint(flight, lim) : auraMessage(flight, lim)) + camHint;
  const assist = guided || practice;
  const hintLeft = assist && flight.lateral > lim.lat * 0.7, hintRight = assist && flight.lateral < -lim.lat * 0.7;
  const hintBrake = assist && flight.speed > lim.speed - 4 && flight.altitude < 380;
  const zoom = stage === "mars" ? [0.2, 0.7, 1][marsStep] ?? 0 : 0;
  const hudSafeLeft = clean(50 - lim.lat * 18, 0, 100), hudSafeWidth = lim.lat * 36;
  const keyHints = !coarse;
  const allocated = 100 - remaining;
  const ringLen = 2 * Math.PI * 52;
  const stabLabel = stab >= 60 ? "GOOD" : stab >= 35 ? "CAUTION" : "CRITICAL";

  const sparks = useMemo(() => Array.from({ length: 16 }, (_, i) => ({ left: `${(i * 37) % 100}%`, top: `${60 + ((i * 17) % 35)}%`, delay: `${(i % 7) * 0.8}s` })), []);

  return (
    <div className="l3-root" ref={rootRef} aria-label="Level 3 Mars Landing" onMouseMove={stage === "intro" ? onArtMove : undefined}>
      <style>{css}</style>
      <div className="l3-scene">
        <Canvas shadows dpr={[1, 1.5]} frameloop={stage === "intro" && !artFailed ? "demand" : "always"} camera={{ position: [0.6, 2, 10.5], fov: 52, near: 0.1, far: 300 }} gl={{ antialias: true, powerPreference: "high-performance" }}>
          <MarsScene stage={stage} flightRef={flightRef} alarm={stage === "mars" ? marsStep >= 1 : stage !== "intro"} zoom={zoom} braking={braking} camMode={camMode} onLoadError={setModelError} />
        </Canvas>
      </div>
      <div className="l3-vignette" /><div className="l3-scanlines" />
      {stage === "mars" && marsStep === 1 && <><div className="l3-scan" /><div className="l3-redwash" /></>}

      {/* top bar. On the intro screen the title is already part of the artwork, so the brand is hidden there. */}
      <header className="l3-top">
        <div className="l3-brand">{stage !== "intro" && <><small>MYSHA GOES TO MARS · MISSION 03</small><strong>MARS LANDING</strong></>}</div>
        <div className="l3-tools">
          <button type="button" className="l3-btn" onClick={() => { beginAudio(); setAudioOpen(v => !v); }} aria-expanded={audioOpen} aria-label="Audio settings">♪ AUDIO</button>
          <button type="button" className="l3-btn" onClick={() => openOverlay("help")} aria-label="How to play">? HOW TO PLAY</button>
          {onBackToLevel2 && !flying && stage !== "intro" && <button type="button" className="l3-btn" onClick={onBackToLevel2}>◂ LEVEL 2</button>}
          {audioOpen && (
            <div className="l3-audio" role="group" aria-label="Audio settings">
              <button type="button" className="l3-btn" aria-pressed={musicOn} onClick={() => { setMusicOn(!musicOn); }}>MUSIC {musicOn ? "ON" : "OFF"}</button>
              <button type="button" className="l3-btn" aria-pressed={sfxOn} onClick={() => { setSfxOn(!sfxOn); }}>SOUND EFFECTS {sfxOn ? "ON" : "OFF"}</button>
              <label>MASTER VOLUME<input className="l3-range" type="range" min={0} max={1} step={0.05} value={volume} onChange={e => setVolume(Number(e.target.value))} /></label>
            </div>
          )}
        </div>
      </header>
      {modelError && !flying && <div role="alert" className="l3-worldnote">{modelError} The mission simulation remains playable.</div>}

      {/* ───── INTRO (artwork, unchanged) ───── */}
      {stage === "intro" && (
        <div className={`l3-art ${artFailed ? "failed" : ""}`}>
          {!artFailed && <img className="l3-art-img" src={LEVEL3_ART} alt="Mysha in an astronaut suit inside the cockpit of a lander, looking at Mars on final approach." onError={() => setArtFailed(true)} draggable={false} />}
          {!artFailed && <><div className="l3-art-fade" /><div className="l3-art-glow" /><div className="l3-art-scan" /></>}
          {artFailed && <div className="l3-art-fade" />}
          <div className="l3-art-blackout" />
          <div className="l3-dock">
            {artFailed && <h1 className="l3-fallback-title">LEVEL 03<em>MARS LANDING</em></h1>}
            <div className="l3-dock-tag">THE RED DESCENT</div>
            <div className="l3-dock-quote">“New data. A changing environment. One chance to adapt.”</div>
            <div className="l3-dock-actions">
              <button className="l3-btn l3-primary l3-big l3-start" onMouseEnter={() => cue("hover")} onClick={pressStart}>START LEVEL 3</button>
              <button className="l3-btn" onMouseEnter={() => cue("hover")} onClick={() => openOverlay("briefing")}>MISSION BRIEFING</button>
              <button className="l3-btn" onMouseEnter={() => cue("hover")} onClick={() => openOverlay("help")}>HOW TO PLAY</button>
            </div>
            <small>Inspired by real space-science concepts. Sensors, controls and resource points are fictional gameplay simulations.</small>
          </div>
        </div>
      )}

      {/* ───── TUTORIAL ───── */}
      {stage === "tutorial" && (
        <div className="l3-center"><section className="l3-shell" style={{ maxWidth: 820 }}>
          <div className="l3-dots">{[0, 1, 2, 3].map(i => <i key={i} className={i <= tutStep ? "on" : ""} />)}</div>
          {tutStep === 0 && <>
            <div className="l3-kicker">AURA · GUIDED TUTORIAL</div><h2>WELCOME TO MARS LANDING</h2>
            <p>“Welcome to your final approach, Mysha. I will guide you through the landing simulation.”</p>
            <div className="l3-note">Your objective: review the new data, update the mission plan, and safely land on Mars.</div>
            <div className="l3-actions"><button className="l3-btn l3-primary" onClick={() => { cue("tutorial"); setTutStep(1); setInstIdx(0); }}>LET'S BEGIN</button><button className="l3-btn" onClick={() => { cue("button"); setMarsStep(0); go("mars"); }}>SKIP FOR NOW</button></div>
          </>}
          {tutStep === 1 && <>
            <div className="l3-kicker">AURA · INSTRUMENTS {instIdx + 1} / 5</div><h2>{INSTRUMENTS[instIdx].name}</h2>
            <div className="l3-inst">{INSTRUMENTS.map((it, i) => <div key={it.name} className={i === instIdx ? "on" : ""}><span>{it.icon}</span>{it.name}</div>)}</div>
            <p>“{INSTRUMENTS[instIdx].text}”</p>
            <div className="l3-actions"><button className="l3-btn l3-primary" onClick={() => { cue("tutorial"); if (instIdx < 4) setInstIdx(instIdx + 1); else setTutStep(2); }}>NEXT</button></div>
          </>}
          {tutStep === 2 && <>
            <div className="l3-kicker">AURA · CONTROLS</div><h2>{coarse ? "TOUCH CONTROLS" : "KEYBOARD CONTROLS"}</h2>
            {coarse ? <>
              <div className="l3-keys"><div className="l3-keycard"><span className="l3-key">◀ ▶</span>Hold the left or right buttons to move the lander sideways.</div><div className="l3-keycard"><span className="l3-key b">SLOW</span>Hold the orange button to apply the descent-control burn.</div><div className="l3-keycard"><span className="l3-key">CAM</span>Tap INTERIOR or EXTERIOR to change the camera view.</div></div>
            </> : <>
              <div className="l3-keys">
                <div className="l3-keycard"><span className="l3-key">A</span><span className="l3-key">←</span>Move the simulated lander left.</div>
                <div className="l3-keycard"><span className="l3-key b">D</span><span className="l3-key b">→</span>Move the simulated lander right.</div>
                <div className="l3-keycard"><span className="l3-key">SPACE</span>Hold to apply the descent-control burn (slows you down, uses fuel).</div>
                <div className="l3-keycard"><span className="l3-key b">C</span>Switch camera: INTERIOR cockpit or EXTERIOR view. The landing keeps going.</div>
                <div className="l3-keycard"><span className="l3-key">P</span>Pause. <span className="l3-key b">ESC</span>Help.</div>
              </div>
              <small style={{ color: "#9eb8c5" }}>On-screen buttons also work with mouse or touch.</small>
            </>}
            <div className="l3-actions"><button className="l3-btn l3-primary" onClick={() => { cue("tutorial"); setTutStep(3); }}>NEXT</button></div>
          </>}
          {tutStep === 3 && <>
            <div className="l3-kicker">AURA · PRACTICE LANDING</div><h2>TRY IT IN A SAFE SIMULATION.</h2>
            <p>“A short practice descent starts you low, with extra fuel and forgiving touchdown limits (speed up to {limitsFor(true, true).speed}, within the target ring). You will see hints and your controls will glow when they matter. Try both camera views. You can retry as often as you like.”</p>
            <div className="l3-note">Practice assist is ON and clearly marked. The real landing uses its own settings, which you choose before you start it.</div>
            <div className="l3-actions"><button className="l3-btn l3-primary" onClick={startPractice}>START PRACTICE LANDING</button><button className="l3-btn" onClick={() => { cue("button"); setMarsStep(0); go("mars"); }}>SKIP PRACTICE</button></div>
          </>}
        </section></div>
      )}

      {/* ───── MARS CINEMATIC ───── */}
      {stage === "mars" && (
        <div className="l3-subtitle">
          {marsStep === 0 && <div className="l3-quote"><b>AURA · MARS IN VIEW</b>“Mars is now in view. Beginning final environmental assessment.”</div>}
          {marsStep === 1 && <>
            <div className="l3-alert" role="alert"><div className="head">⚠ ENVIRONMENTAL DATA ANOMALY</div><div>▲ RADIATION READING: ELEVATED</div><div>▲ LOCAL ATMOSPHERIC DENSITY: ABOVE FORECAST</div></div>
            <div className="l3-quote"><b>AURA · SENSOR REPORT</b>“New observations differ from the original environmental forecast.” <span style={{ color: "#a9c6d5", fontSize: "0.8em" }}>(Above the <i>local mission forecast</i>. Mars's air is still far thinner than Earth's. Values here are fictional game data, not NASA telemetry.)</span></div>
          </>}
          {marsStep === 2 && <>
            <div className="l3-oldnote">“Based on Earth-orbit data.”</div>
            <div className="l3-quote"><b>AURA · REVISING THE MODEL</b>“Environmental conditions are different. We must update the plan using the latest observations.” <span style={{ color: "#a9c6d5", fontSize: "0.8em" }}>Lesson: scientific models must be revised when new evidence becomes available.</span></div>
          </>}
          <div className="l3-row">
            {marsStep < 2
              ? <button className="l3-btn l3-primary" onClick={() => { beginAudio(); const n = marsStep + 1; setMarsStep(n); cue(n === 1 ? "warning" : "aura"); if (n === 1) window.setTimeout(() => cue("scan"), 250); }}>CONTINUE</button>
              : <button className="l3-btn l3-primary" onClick={() => { beginAudio(); cue("scan"); go("plan"); }}>REBUILD THE 100-POINT PLAN</button>}
          </div>
        </div>
      )}

      {/* ───── PLAN ───── */}
      {stage === "plan" && (
        <div className="l3-center"><section className="l3-shell">
          <div className="l3-kicker">MISSION REPLANNING · NEW SENSOR DATA</div><h2>MISSION REPLANNING</h2>
          <p>Redistribute the <b>100 points</b> based on the new data.</p>
          <div className="l3-plan">
            <div className="l3-rows">{KEYS.map(key => {
              const cfg = LIMITS[key]; const minReq = key === "supplies" ? cfg.min : MINIMUMS[key];
              const low = plan[key] < minReq;
              return <div className={`l3-r4 ${low ? "low" : ""}`} key={key}>
                <span className="ico" aria-hidden>{cfg.icon}</span>
                <div className="nm"><b>{cfg.label}</b><small>{low ? `▲ Below AURA's minimum of ${minReq}` : cfg.info}</small></div>
                <input className="l3-range" type="range" min={cfg.min} max={cfg.max} step={1} value={plan[key]} onChange={e => setAlloc(key, Number(e.target.value))} aria-label={`${cfg.label} points`} />
                <button type="button" className="pm" onClick={() => setAlloc(key, plan[key] - 1)} aria-label={`Decrease ${cfg.label}`}>−</button>
                <span className="v" aria-live="polite">{plan[key]}</span>
                <button type="button" className="pm" onClick={() => setAlloc(key, plan[key] + 1)} aria-label={`Increase ${cfg.label}`}>+</button>
              </div>;
            })}</div>
            <div className="l3-side">
              <div className="l3-ring" role="img" aria-label={`${allocated} of 100 points allocated`}>
                <svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" fill="none" stroke="#173549" strokeWidth="9" /><circle cx="60" cy="60" r="52" fill="none" stroke={remaining === 0 ? "#6ff0cf" : "#ffa05c"} strokeWidth="9" strokeLinecap="round" strokeDasharray={ringLen} strokeDashoffset={ringLen * (1 - clean(allocated, 0, 100) / 100)} style={{ transition: "stroke-dashoffset .5s cubic-bezier(.2,.8,.2,1),stroke .3s" }} /></svg>
                <div className="mid"><strong>{allocated}</strong><span>/ 100 POINTS</span>{remaining !== 0 && <em>{remaining > 0 ? `${remaining} left` : "Over budget"}</em>}</div>
              </div>
              <button type="button" className="l3-btn" onClick={suggestPlan}>★ AURA SUGGESTED PLAN</button>
            </div>
          </div>
          <div className="l3-note l3-why"><i aria-hidden>i</i><div><b>WHY IT MATTERS?</b>More protection and power are needed because of higher radiation and atmospheric density, but you must still keep enough supplies for survival.</div></div>
          {auraNote && <div className="l3-note" role="status">{auraNote}</div>}
          {error && <div className="l3-warning" role="alert" style={{ marginTop: 12 }}>{error}</div>}
          <div className="l3-foot"><small>Learning note: these points are abstract planning priorities, not physical conversions of food or water into radiation shielding. Vital supplies must remain adequate.</small>
            <button type="button" className="l3-btn l3-primary l3-big" onClick={acceptPlan}>CONFIRM PLAN ✓</button></div>
        </section></div>
      )}

      {/* ───── APPROVAL / PRE-LANDING ───── */}
      {stage === "approach" && (
        <div className="l3-center"><section className="l3-shell" style={{ maxWidth: 780 }}>
          <div className="l3-row"><span className="l3-stamp" aria-hidden>✔</span><div><div className="l3-kicker">AURA · PLAN APPROVED</div><h2 style={{ margin: "4px 0 0" }}>THE NEW DESCENT PLAN IS READY.</h2></div></div>
          <p>“Good adaptation, Mysha. Protection ({plan.shielding}), power ({plan.power}) and landing stability ({plan.stability}) were raised in response to the new readings, while food &amp; water was trimmed to {plan.supplies}, still an adequate reserve in this simulation.”</p>
          <div className="l3-data"><div><b>FUEL RESERVE (FROM POWER)</b><strong>{makeFlight(false, plan).fuel}%</strong></div><div><b>BRAKE STRENGTH (FROM STABILITY)</b><strong>{(17.5 + (plan.stability - 25) * 0.13).toFixed(1)}</strong></div><div><b>PROTECTION PRIORITY</b><strong>{plan.shielding} PTS</strong></div></div>
          <div className="l3-warning">CONTROLS: {coarse ? "hold the on-screen buttons; tap INTERIOR / EXTERIOR for the camera" : <>hold <b>SPACE</b> to slow descent, <b>A / D</b> to steer, <b>C</b> to switch Interior / Exterior camera</>}. Safe touchdown: speed {lim.speed} or less and inside the green target zone. Game values are not real spacecraft parameters.</div>
          <div className="l3-note">
            <label style={{ display: "flex", gap: 10, alignItems: "center", cursor: "pointer" }}>
              <input type="checkbox" checked={guided} onChange={e => { cue("button"); setGuided(e.target.checked); }} style={{ width: 20, height: 20, accentColor: "#ff9165" }} />
              <span><b>GUIDED LANDING MODE {guided ? "ON" : "OFF"}</b>: {guided ? `forgiving limits (speed ≤ ${limitsFor(false, true).speed}, within ±${limitsFor(false, true).lat}), glowing control hints and early warnings.` : `standard limits (speed ≤ ${limitsFor(false, false).speed}, within ±${limitsFor(false, false).lat}), no control hints.`}</span>
            </label>
          </div>
          <div className="l3-actions"><button className="l3-btn l3-primary" onClick={startLanding}>TAKE MANUAL CONTROL</button><button className="l3-btn" onClick={() => { cue("button"); go("plan"); }}>◂ ADJUST PLAN</button></div>
        </section></div>
      )}

      {/* ───── LANDING HUD (practice + main). Same HUD for both cameras. ───── */}
      {flying && <>
        <div className="l3-mode">
          <div className="l3-mode-title">{practice ? "PRACTICE LANDING" : "MANUAL LANDING MODE"}</div>
          <div className="l3-cam" role="group" aria-label="Camera view">
            <button type="button" aria-pressed={camMode === "interior"} onClick={() => chooseCam("interior")}>INTERIOR</button>
            <button type="button" aria-pressed={camMode === "exterior"} onClick={() => chooseCam("exterior")}>EXTERIOR</button>
          </div>
          <small className="l3-camkey">{keyHints ? "C · SWITCH CAMERA" : "TAP TO SWITCH CAMERA"}</small>
        </div>
        <aside className="l3-hudL" aria-label="Lander status">
          {practice && <div className="l3-status ok">PRACTICE · ASSIST ON</div>}
          <Readout title="ALTITUDE" value={`${Math.ceil(flight.altitude).toLocaleString("en-US")} m`} percent={flight.altitude / (practice ? 420 : 900) * 100} />
          <Readout title="DESCENT SPEED" value={`-${flight.speed.toFixed(0)} m/s`} percent={flight.speed / 120 * 100} level={flight.speed > lim.speed && flight.altitude < 300 ? (flight.altitude < 150 ? "critical" : "caution") : "ok"} />
          <Readout title="FUEL" value={`${Math.ceil(flight.fuel)}%`} percent={flight.fuel} level={flight.fuel < 10 ? "critical" : flight.fuel < 25 ? "caution" : "ok"} />
        </aside>
        <aside className="l3-hudR" aria-label="Target and stability">
          <div className={`l3-meter ${Math.abs(flight.lateral) > lim.lat ? "caution" : ""}`}>
            <div><span>TARGET ALIGNMENT</span><b>{align}%</b></div>
            <div className="l3-lane-line"><span className="l3-lane-safe" style={{ left: `${hudSafeLeft}%`, width: `${hudSafeWidth}%` }} /><span className="l3-lane-dot" style={{ left: `${clean(50 + flight.lateral * 18, 5, 95)}%` }} /></div>
            <small>{Math.abs(flight.lateral) <= lim.lat ? "✔ Within target corridor" : flight.lateral > 0 ? "▲ Off target: steer LEFT" : "▲ Off target: steer RIGHT"}</small>
          </div>
          <Readout title="STABILITY" value={stabLabel} percent={stab} level={stab < 35 ? "critical" : stab < 60 ? "caution" : "ok"} />
          <div className={`l3-status ${level}`} role="status">{level === "ok" ? "✔ ON TRACK" : level === "caution" ? "▲ CAUTION" : "✖ CRITICAL"}</div>
        </aside>
        <footer className="l3-bottom">
          <div className="l3-guide" aria-live="polite"><b>AURA · {practice ? "PRACTICE" : "DESCENT"} GUIDANCE · {camMode.toUpperCase()} VIEW</b><div>{guideText}</div>{keyHints && <small>A / D steer · hold SPACE to slow · C camera · P pause · Esc help</small>}</div>
          <div className="l3-controls">
            <button className={`${held.left ? "held" : ""} ${hintLeft ? "hint" : ""}`} {...touchProps("left")}>{keyHints && <kbd>A</kbd>}◀ LEFT</button>
            <button className={`brake ${braking ? "held" : ""} ${hintBrake ? "hint" : ""}`} {...touchProps("brake")}>{keyHints && <kbd>SPACE</kbd>}HOLD TO SLOW</button>
            <button className={`${held.right ? "held" : ""} ${hintRight ? "hint" : ""}`} {...touchProps("right")}>{keyHints && <kbd>D</kbd>}RIGHT ▶</button>
            <button onClick={() => setPaused(true)} aria-label="Pause landing simulation">Ⅱ</button>
          </div>
        </footer>
      </>}

      {/* ───── OVERLAYS ───── */}
      {paused && flying && overlay === null && <div className="l3-overlay"><section className="l3-shell l3-outcome"><h2>MISSION PAUSED</h2><p>The simulation clock is stopped.</p><div className="l3-actions"><button className="l3-btn l3-primary" onClick={() => setPaused(false)}>▶ RESUME DESCENT</button><button className="l3-btn" onClick={() => openOverlay("help")}>? HOW TO PLAY</button></div></section></div>}

      {overlay === "help" && <div className="l3-overlay" role="dialog" aria-modal="true" aria-label="How to play"><section className="l3-shell" style={{ maxWidth: 760 }}>
        <div className="l3-kicker">MISSION HELP</div><h2>HOW TO PLAY</h2>
        <p><b>Goal:</b> review the new data, rebuild the 100-point plan, then land inside the green target ring at a safe speed.</p>
        <div className="l3-keys">
          {coarse ? <div className="l3-keycard"><span className="l3-key">◀ ▶</span>Hold the on-screen arrows to steer. Hold the orange button to slow descent. Tap INTERIOR / EXTERIOR to change camera. Ⅱ pauses.</div> :
            <><div className="l3-keycard"><span className="l3-key">A</span><span className="l3-key">D</span>Steer left / right (arrow keys also work)</div><div className="l3-keycard"><span className="l3-key">SPACE</span>Hold to slow descent (uses fuel)</div><div className="l3-keycard"><span className="l3-key">C</span>Switch Interior / Exterior camera (same landing, nothing resets)</div><div className="l3-keycard"><span className="l3-key">P</span>Pause <span className="l3-key">ESC</span>Help</div></>}
        </div>
        <div className="l3-note"><b>Instruments:</b> Altitude = height above the surface · Descent speed = how fast you fall · Fuel = what's left for burns · Target alignment = how close you are to the ring · Stability = how steady the descent is.</div>
        <div className="l3-note">Cyan/green = fine · orange ▲ = caution · red ✖ = critical. Every status also has a symbol and text.</div>
        <div className="l3-actions"><button className="l3-btn l3-primary" onClick={() => { cue("button"); setOverlay(null); }}>CLOSE</button><button className="l3-btn" onClick={replayTutorial}>↺ REPLAY TUTORIAL</button></div>
      </section></div>}

      {overlay === "briefing" && <div className="l3-overlay" role="dialog" aria-modal="true" aria-label="Mission briefing"><section className="l3-shell" style={{ maxWidth: 760 }}>
        <div className="l3-kicker">MISSION BRIEFING</div><h2>THE RED DESCENT</h2>
        <p>After a long journey, Mysha finally approaches Mars. Early planning said the landing area would be suitable, but AURA now reports elevated radiation and a local atmospheric-density reading above the mission forecast.</p>
        <p>The old checklist says “Based on Earth-orbit data.” Mysha must revise the plan using the 100-point budget, then take manual control of the simulated lander.</p>
        <div className="l3-note">Real-world links: Mars's atmosphere is much thinner than Earth's and varies locally and over time; radiation matters for mission planning; and good scientists update their models when new evidence arrives. Everything on screen is a simplified, fictional game simulation, not real spacecraft procedure.</div>
        <div className="l3-actions"><button className="l3-btn l3-primary" onClick={() => { cue("button"); setOverlay(null); }}>CLOSE</button></div>
      </section></div>}

      {outcome === "practice-win" && <div className="l3-overlay"><section className="l3-shell l3-outcome"><div className="l3-symbol">✔</div><div className="l3-kicker">AURA · PRACTICE COMPLETE</div><h2>GREAT. YOU ARE READY.</h2><p>“Great. You are ready for the full simulation.” The tutorial is saved and will not open automatically again. You can replay it from HOW TO PLAY.</p><div className="l3-actions"><button className="l3-btn l3-primary" onClick={() => { setOutcome(null); finishTutorialToStory(); }}>CONTINUE TO MARS APPROACH</button><button className="l3-btn" onClick={startPractice}>↺ PRACTICE AGAIN</button></div></section></div>}
      {outcome === "practice-lose" && <div className="l3-overlay"><section className="l3-shell l3-outcome"><div className="l3-symbol">⌁</div><div className="l3-kicker">AURA · PRACTICE</div><h2>NOT QUITE. TRY AGAIN.</h2><p>{failReason} Steer onto the ring, then hold SPACE as you get close to slow down. The tutorial is not marked complete until you land.</p><div className="l3-actions"><button className="l3-btn l3-primary" onClick={startPractice}>↺ RETRY PRACTICE</button><button className="l3-btn" onClick={() => { setOutcome(null); setMarsStep(0); go("mars"); }}>SKIP PRACTICE</button></div></section></div>}

      {stage === "success" && !showComplete && <div className="l3-banner" role="status"><h2>TOUCHDOWN CONFIRMED</h2><p>“Touchdown confirmed. Mysha, welcome to Mars.”</p></div>}
      {stage === "success" && showComplete && <div className="l3-overlay clear">
        {sparks.map((s, i) => <span key={i} className="l3-spark" style={{ left: s.left, top: s.top, animationDelay: s.delay }} />)}
        <section className="l3-shell l3-outcome l3-win"><span className="l3-check" aria-hidden>✓</span><h2>TOUCHDOWN SUCCESSFUL!</h2><p className="sub">Welcome to Mars, Mysha!</p><div className="l3-kicker">AURA · LANDING CONFIRMED</div><br /><span className="l3-lvl lvl">— LEVEL 3 COMPLETE —</span>
          <div className="l3-data" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}><div><b>SPEED</b><strong>{flight.speed.toFixed(0)}</strong></div><div><b>FUEL</b><strong>{Math.ceil(flight.fuel)}%</strong></div><div><b>PLAN</b><strong>100</strong></div></div>
          <p style={{ fontSize: 13 }}>Science takeaway: scientific models must be revised when new evidence becomes available.</p>
          <div className="l3-actions"><button className="l3-btn l3-primary l3-big" onClick={() => (onLevel4 ? onLevel4() : go("next"))}>CONTINUE →</button><button className="l3-btn" onClick={startOver}>↺ REPLAY LEVEL 3</button></div></section></div>}
      {stage === "retry" && <div className="l3-overlay"><section className="l3-shell l3-outcome"><div className="l3-symbol">⌁</div><div className="l3-kicker">AURA · TRAINING SIMULATION</div><h2>TOUCHDOWN NOT VERIFIED</h2><p>{failReason} Your confirmed plan is kept. Slow the lander earlier and center it on the target, then try again. No earlier levels need replaying.</p>
        <div className="l3-data"><div><b>FINAL SPEED</b><strong className={flight.speed > lim.speed ? "l3-danger" : ""}>{flight.speed.toFixed(1)}</strong></div><div><b>OFF-CENTER</b><strong className={Math.abs(flight.lateral) > lim.lat ? "l3-danger" : ""}>{Math.abs(flight.lateral).toFixed(2)}</strong></div><div><b>FUEL LEFT</b><strong>{Math.ceil(flight.fuel)}%</strong></div></div>
        <div className="l3-actions"><button className="l3-btn l3-primary" onClick={startLanding}>↺ RETRY LANDING</button><button className="l3-btn" onClick={() => { cue("button"); go("plan"); }}>REPLAN RESOURCES</button><button className="l3-btn" onClick={() => { cue("button"); go("approach"); }}>REVIEW CONTROLS</button></div></section></div>}
      {stage === "next" && <div className="l3-overlay"><section className="l3-shell l3-outcome"><div className="l3-kicker">MARS SURFACE · NEXT CHAPTER</div><h2>LEVEL 4 — COMING SOON</h2><p>Mysha is on Mars. The next chapter begins on the surface.</p><div className="l3-actions"><button className="l3-btn l3-primary" onClick={startOver}>REPLAY LEVEL 3</button>{onBackToLevel2 && <button className="l3-btn" onClick={onBackToLevel2}>BACK TO LEVEL 2</button>}</div></section></div>}
    </div>
  );
}