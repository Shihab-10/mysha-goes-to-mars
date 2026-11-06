import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, Html, useFBX, useTexture } from "@react-three/drei";
import * as THREE from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { MissionMusic } from "./MissionMusic";
import { Level2Journey } from "./Level2Journey";
import { Level1DepartureCinematic } from "./Level1DepartureCinematic";
import type { CinematicResult } from "./Level1DepartureCinematic";
import { updateStoryProgress } from "./storyProgress";

type GearId = "suit" | "helmet" | "oxygen" | "water" | "food" | "medical" | "comms" | "tools";
type Phase = "room" | "pad" | "boarding" | "cinematic" | "complete" | "level2";
type Near = GearId | "gate" | "rocket" | null;
type Gear = {
  id: GearId;
  name: string;
  short: string;
  label: string;
  what: string;
  why: string;
  when: string;
  fact: string;
  source: string;
  position: [number, number, number];
  color: string;
};

const MODEL = `${import.meta.env.BASE_URL}models/characters/Meshy_AI_Animation_Walking_withSkin.fbx`;
const SKIN = `${import.meta.env.BASE_URL}textures/characters/texture_0.png`;

// ---- Level 1 departure cinematic ----
// Both formats are supported. The player checks real files on the same origin
// and uses a single 30-sec MP4 if found, otherwise three 10-sec MP4 clips.
// Put the video(s) inside public/videos/level1/ .
// NEVER use absolute C:\ paths, file:// URLs, or hard-coded localhost URLs.
const VIDEO_ROOT = `${import.meta.env.BASE_URL}videos/level1/`;
const DEPARTURE_PLAYLISTS: readonly (readonly string[])[] = [
  [`${VIDEO_ROOT}level1-departure.mp4`],
  [
    `${VIDEO_ROOT}departure-part1.mp4`,
    `${VIDEO_ROOT}departure-part2.mp4`,
    `${VIDEO_ROOT}departure-part3.mp4`,
  ],
];

// ---- Easy tuning values ----
// Mysha's height in game units (about metres).
const TARGET_HEIGHT = 1.72;
// If Mysha walks BACKWARDS, change 0 to Math.PI.
const FACING_OFFSET = 0;
// If her skin texture looks scrambled or upside down, change true to false.
const TEXTURE_FLIP_Y = true;
// Simple box gear on her body is only a placeholder. Real models come in a later step.
// Set to true if you want to see the placeholder boxes again.
const SHOW_PLACEHOLDER_GEAR = false;
// Camera: how far to the side, how high, how far behind Mysha.
const CAM_SIDE = 2.4;
const CAM_HEIGHT = 2.9;
const CAM_BACK = 5.0;
const SPAWN_Z = 8.5;

const GEAR: Gear[] = [
  {
    id: "suit", name: "Spacesuit", short: "SPACESUIT", label: "01 / PERSONAL PROTECTION",
    what: "A spacesuit is a wearable, pressurized garment that gives an astronaut a protected environment outside a spacecraft cabin.",
    why: "Space has almost no air pressure and extreme temperature swings. A suit keeps pressure around the body, helps manage temperature and shields against small particles.",
    when: "Spacewalk suits are worn outside a spacecraft. Crews also use different suits for launch and landing.",
    fact: "Spacewalk suits used outside the International Space Station work like small, self-contained spacecraft with their own life support.",
    source: "Context: Earth-orbit (ISS-era) suits. Suits for Mars surface work are still being designed.",
    position: [-7.2, 0, 5], color: "#8be6ff",
  },
  {
    id: "helmet", name: "Space Helmet", short: "HELMET", label: "02 / HEAD PROTECTION",
    what: "The helmet encloses the astronaut's head in the suit's pressurized, breathable environment and holds the visor.",
    why: "It gives clear vision and a sealed place to breathe. It works together with the communication system and the rest of the suit.",
    when: "Used with a compatible suit during spacewalks and other mission phases that need a sealed suit.",
    fact: "Helmets on International Space Station spacewalk suits have a gold-coated outer visor that helps reduce glare and heat from the Sun.",
    source: "Context: Earth-orbit spacewalk suit design.",
    position: [7.1, 0, 6], color: "#9fd5ff",
  },
  {
    id: "oxygen", name: "Oxygen Module", short: "OXYGEN MODULE", label: "03 / LIFE SUPPORT",
    what: "The oxygen module represents the life-support supply of breathable oxygen and the equipment that helps manage cabin air.",
    why: "Crew members use oxygen all the time and breathe out carbon dioxide. A spacecraft must supply oxygen and remove carbon dioxide to keep the air safe.",
    when: "Checked before departure and monitored throughout any mission that depends on life support.",
    fact: "An astronaut may require approximately 0.84 kg of oxygen per day under certain Earth-orbit planning assumptions. NASA planning documents list this as an average; the range depends on activity.",
    source: "Based on Earth-orbit life-support reference data (NASA technical reports). Not an exact requirement for every astronaut or for Mars missions.",
    position: [-7, 0, -2.1], color: "#77e3d1",
  },
  {
    id: "water", name: "Water Supply", short: "WATER SUPPLY", label: "04 / CREW RESOURCES",
    what: "Water for drinking and for preparing food, stored and tracked by the crew.",
    why: "Water is heavy and expensive to launch. Recovering and recycling it, for example from moisture in cabin air, reduces what must be carried from Earth.",
    when: "Used every day, and conserved carefully on long-duration missions.",
    fact: "In one NASA planning assumption, a crew member needs roughly 2.4 kg of drinking and food-preparation water per day.",
    source: "Earth-orbit planning assumption. A Mars mission would be planned with its own numbers.",
    position: [7.3, 0, -2.1], color: "#63b7ff",
  },
  {
    id: "food", name: "Food Supplies", short: "FOOD SUPPLIES", label: "05 / NUTRITION",
    what: "Packaged, shelf-stable meals and snacks chosen to stay safe and nutritious for a long time.",
    why: "Astronauts need energy and nutrients to stay healthy and work well. Mission planners must decide how much food to carry and how to store it.",
    when: "Eaten daily, with menus planned in advance for the whole mission.",
    fact: "NASA planning documents use about 0.62 kg of dry food solids per crew member per day, before packaging and added water.",
    source: "Earth-orbit life-support planning value. Real food mass is higher once packaging and water in food are included.",
    position: [-3.6, 0, 1.5], color: "#b8e57a",
  },
  {
    id: "medical", name: "Medical Kit", short: "MEDICAL KIT", label: "06 / CREW HEALTH",
    what: "A kit of supplies for first aid and basic medical care.",
    why: "A crew can be far from a hospital. Trained crew members handle routine problems and get advice from doctors on the ground when they can.",
    when: "Carried on every mission and used for injuries or illness, from small to serious.",
    fact: "One-way radio delay between Earth and Mars is about 3 to 22 minutes, so a Mars crew could not rely on instant advice.",
    source: "Context: Earth-orbit practice, plus general Mars-mission planning concerns.",
    position: [3.6, 0, -5.2], color: "#ff8f8f",
  },
  {
    id: "comms", name: "Communications Radio", short: "COMMS RADIO", label: "07 / MISSION CONNECTION",
    what: "Radio equipment that lets crew members talk to each other and to Mission Control.",
    why: "Teams on the ground send instructions and data and watch the health of spacecraft systems. Good communication keeps everyone informed.",
    when: "Used during equipment checks, navigation and everyday mission operations.",
    fact: "Radio signals travel at the speed of light, yet the one-way delay between Earth and Mars still ranges from roughly 3 to 22 minutes.",
    source: "Physics of Earth-Mars distance. The mission calls in this game are fictional.",
    position: [-6.8, 0, -9], color: "#ffce82",
  },
  {
    id: "tools", name: "Mission Tool Kit", short: "TOOL KIT", label: "08 / MAINTENANCE",
    what: "Hand tools, fasteners and spare parts used to maintain and repair equipment.",
    why: "Life-support, cooling and other systems need regular maintenance. On a long trip, supplies cannot simply be delivered, so repairs matter.",
    when: "Used for routine maintenance and for fixing problems when they happen.",
    fact: "Space station crews do regular maintenance, and spare parts are launched from Earth. For Mars, planners are still studying which spares to carry.",
    source: "Context: Earth-orbit practice. Mars logistics are an active area of study.",
    position: [6.8, 0, -9], color: "#f6a781",
  },
];

const ICONS: Record<GearId, string> = {
  suit: "♙", helmet: "◉", oxygen: "O₂", water: "◈", food: "◍", medical: "✚", comms: "⌁", tools: "⚒",
};

// Lightweight procedural audio: no MP3 assets or external packages required.
// The browser creates AudioContext only after a user gesture (keyboard/touch/click).
type MissionCue = "step" | "near" | "pickup" | "equip" | "gate" | "complete" | "ui";

class MissionSound {
  private ctx: AudioContext | null = null;
  private bus: GainNode | null = null;
  private enabled = true;
  private lastNear = 0;

  unlock() {
    if (!this.enabled || typeof window === "undefined" || !window.AudioContext) return;
    try {
      if (!this.ctx) {
        this.ctx = new window.AudioContext();
        this.bus = this.ctx.createGain();
        this.bus.gain.value = 0.19;
        this.bus.connect(this.ctx.destination);
      }
      if (this.ctx.state === "suspended") void this.ctx.resume().catch(() => undefined);
    } catch {
      // Unsupported or unavailable audio never prevents the mission from playing.
    }
  }

  setEnabled(value: boolean) {
    this.enabled = value;
    if (!value && this.bus && this.ctx) {
      this.bus.gain.setTargetAtTime(0.0001, this.ctx.currentTime, .018);
    } else if (value) {
      this.unlock();
      if (this.bus && this.ctx) this.bus.gain.setTargetAtTime(.19, this.ctx.currentTime, .025);
    }
  }

  private tone(from: number, to: number, duration: number, volume: number,
    shape: OscillatorType = "sine", offset = 0) {
    const c = this.ctx, bus = this.bus;
    if (!c || !bus || c.state !== "running") return;
    const t = c.currentTime + offset;
    const oscillator = c.createOscillator();
    const gain = c.createGain();
    oscillator.type = shape;
    oscillator.frequency.setValueAtTime(Math.max(1, from), t);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + duration);
    gain.gain.setValueAtTime(.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(.0002, volume), t + Math.min(.028, duration / 3));
    gain.gain.exponentialRampToValueAtTime(.0001, t + duration);
    oscillator.connect(gain);
    gain.connect(bus);
    oscillator.start(t);
    oscillator.stop(t + duration + .02);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }

  private noise(duration: number, volume: number, cutoff: number, offset = 0) {
    const c = this.ctx, bus = this.bus;
    if (!c || !bus || c.state !== "running") return;
    const length = Math.max(1, Math.floor(c.sampleRate * duration));
    const buffer = c.createBuffer(1, length, c.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) samples[i] = Math.random() * 2 - 1;
    const source = c.createBufferSource();
    source.buffer = buffer;
    const low = c.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.value = cutoff;
    const gain = c.createGain();
    const t = c.currentTime + offset;
    gain.gain.setValueAtTime(.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(.0002, volume), t + Math.min(.12, duration / 4));
    gain.gain.exponentialRampToValueAtTime(.0001, t + duration);
    source.connect(low);
    low.connect(gain);
    gain.connect(bus);
    source.start(t);
    source.stop(t + duration + .01);
    source.onended = () => { source.disconnect(); low.disconnect(); gain.disconnect(); };
  }

  play(cue: MissionCue) {
    if (!this.enabled) return;
    const c = this.ctx;
    if (!c || c.state !== "running") return;
    switch (cue) {
      case "step":
        this.noise(.085, .13, 330);
        this.tone(96, 55, .08, .18, "triangle");
        break;
      case "near":
        if (performance.now() - this.lastNear < 1000) return;
        this.lastNear = performance.now();
        this.tone(510, 690, .13, .10);
        break;
      case "ui":
        this.tone(480, 690, .11, .12, "sine");
        break;
      case "pickup":
        this.noise(.21, .12, 1600);
        this.tone(260, 760, .32, .24, "triangle");
        this.tone(650, 1080, .35, .15, "sine", .08);
        break;
      case "equip":
        this.noise(.42, .18, 1450);
        this.tone(380, 570, .17, .17, "triangle", .04);
        this.tone(570, 900, .34, .22, "sine", .18);
        break;
      case "gate":
        this.noise(1.22, .43, 630);
        this.tone(135, 66, 1.1, .28, "sawtooth");
        this.tone(560, 840, .37, .20, "triangle", .67);
        break;
      case "complete":
        this.tone(440, 660, .36, .18, "sine");
        this.tone(554, 831, .42, .16, "sine", .19);
        this.tone(659, 988, .7, .20, "sine", .4);
        break;
    }
  }

  dispose() {
    const current = this.ctx;
    this.ctx = null;
    this.bus = null;
    if (current && current.state !== "closed") void current.close().catch(() => undefined);
  }
}

const ROOM_MIN_X = -10.3;
const ROOM_MAX_X = 10.3;
const ROOM_MIN_Z = -12.2;
// Lowered so the camera always has space inside the back wall (z = 13.8).
const ROOM_MAX_Z = 9.6;

function isNear(a: THREE.Vector3, x: number, z: number, radius: number) {
  return Math.hypot(a.x - x, a.z - z) < radius;
}

function EquipmentShape({ id, color }: { id: GearId; color: string }) {
  const base = useMemo(() => new THREE.Color(color), [color]);
  const metal = "#beced9";
  return (
    <group>
      {id === "suit" && (
        <group>
          <mesh position={[0, 0.1, 0]} castShadow><boxGeometry args={[0.78, 0.82, 0.34]} /><meshStandardMaterial color={metal} metalness={0.68} roughness={0.3} /></mesh>
          <mesh position={[0, 0.24, -0.187]}><boxGeometry args={[0.46, 0.35, 0.045]} /><meshStandardMaterial color="#6c9fc2" metalness={0.72} /></mesh>
          {[-1, 1].map((v) => <mesh key={v} position={[v * .53, .02, 0]} rotation={[0, 0, v * .2]} castShadow><capsuleGeometry args={[.16, .49, 5, 10]} /><meshStandardMaterial color="#dbe8f1" metalness={.35} roughness={.34} /></mesh>)}
          <mesh position={[0, -.53, 0]}><boxGeometry args={[.66, .25, .38]} /><meshStandardMaterial color="#597e9d" metalness={.6} /></mesh>
        </group>
      )}
      {id === "helmet" && (
        <group>
          <mesh position={[0, .12, 0]} castShadow><sphereGeometry args={[.45, 32, 24]} /><meshPhysicalMaterial color="#b9d7eb" metalness={.45} roughness={.19} clearcoat={1} /></mesh>
          <mesh position={[0, .12, -.29]} scale={[.91, .71, .25]}><sphereGeometry args={[.42, 32, 20]} /><meshPhysicalMaterial color="#294b68" metalness={.3} roughness={.1} transmission={.12} transparent opacity={.85} /></mesh>
          <mesh position={[0, -.25, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[.37, .075, 10, 32]} /><meshStandardMaterial color="#eaf3fa" metalness={.7} roughness={.2} /></mesh>
        </group>
      )}
      {id === "oxygen" && (
        <group>
          {[-.25, .25].map((x) => <mesh key={x} position={[x, .02, 0]} castShadow><cylinderGeometry args={[.21, .21, .99, 18]} /><meshStandardMaterial color="#a3e4e3" metalness={.69} roughness={.23} /></mesh>)}
          <mesh position={[0, -.25, -.22]}><boxGeometry args={[.65, .24, .12]} /><meshStandardMaterial color="#233e5c" metalness={.5} /></mesh>
          <mesh position={[0, .55, 0]}><boxGeometry args={[.36, .13, .23]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={.25} /></mesh>
        </group>
      )}
      {id === "water" && (
        <group>
          <mesh position={[0, 0, 0]} castShadow><boxGeometry args={[.76, .79, .41]} /><meshPhysicalMaterial color="#2b87c6" metalness={.35} roughness={.24} clearcoat={1} /></mesh>
          <mesh position={[0, .2, -.214]}><boxGeometry args={[.53, .23, .035]} /><meshStandardMaterial color="#b1eaff" metalness={.5} emissive="#1c83be" emissiveIntensity={.24} /></mesh>
          <mesh position={[0, .5, 0]}><boxGeometry args={[.28, .21, .2]} /><meshStandardMaterial color="#cfe8ee" metalness={.6} /></mesh>
        </group>
      )}
      {id === "food" && (
        <group>
          <mesh position={[0, -.05, 0]} castShadow><boxGeometry args={[.9, .5, .6]} /><meshStandardMaterial color="#d9e3ea" metalness={.5} roughness={.3} /></mesh>
          <mesh position={[0, .22, 0]}><boxGeometry args={[.94, .08, .64]} /><meshStandardMaterial color="#9fcf55" metalness={.4} roughness={.35} /></mesh>
          {[-.28, 0, .28].map((x) => <mesh key={x} position={[x, .3, -.1]}><boxGeometry args={[.2, .12, .26]} /><meshStandardMaterial color={x === 0 ? "#f3b55a" : "#e8795b"} roughness={.5} /></mesh>)}
        </group>
      )}
      {id === "medical" && (
        <group>
          <mesh position={[0, 0, 0]} castShadow><boxGeometry args={[.86, .62, .38]} /><meshStandardMaterial color="#f2f6f8" metalness={.35} roughness={.35} /></mesh>
          <mesh position={[0, .02, -.2]}><boxGeometry args={[.4, .12, .03]} /><meshBasicMaterial color="#e5484d" /></mesh>
          <mesh position={[0, .02, -.2]}><boxGeometry args={[.12, .4, .031]} /><meshBasicMaterial color="#e5484d" /></mesh>
          <mesh position={[0, .38, 0]}><boxGeometry args={[.36, .09, .1]} /><meshStandardMaterial color="#9aa9b4" metalness={.7} /></mesh>
        </group>
      )}
      {id === "comms" && (
        <group>
          <mesh position={[0, 0, 0]} castShadow><boxGeometry args={[.77, .67, .26]} /><meshStandardMaterial color="#263c58" metalness={.75} roughness={.2} /></mesh>
          <mesh position={[0, .08, -.15]}><planeGeometry args={[.52, .39]} /><meshBasicMaterial color="#58c9ff" /></mesh>
          <mesh position={[.25, .55, .05]}><cylinderGeometry args={[.035, .05, .48, 8]} /><meshStandardMaterial color="#d4eafa" metalness={.7} /></mesh>
          <mesh position={[.25, .81, .05]}><sphereGeometry args={[.07, 10, 10]} /><meshBasicMaterial color="#ffc17a" /></mesh>
        </group>
      )}
      {id === "tools" && (
        <group>
          <mesh position={[0, 0, 0]} castShadow><boxGeometry args={[.82, .79, .43]} /><meshStandardMaterial color="#c3d5de" metalness={.7} roughness={.27} /></mesh>
          <mesh position={[0, 0, -.23]}><boxGeometry args={[.55, .47, .045]} /><meshStandardMaterial color="#516c86" metalness={.66} /></mesh>
          <mesh position={[0, .46, 0]}><boxGeometry args={[.44, .11, .25]} /><meshStandardMaterial color="#f2a86f" metalness={.55} emissive="#b95627" emissiveIntensity={.15} /></mesh>
        </group>
      )}
      <mesh position={[0, -.73, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[.45, .6, 32]} /><meshBasicMaterial color={base} transparent opacity={.7} side={THREE.DoubleSide} /></mesh>
    </group>
  );
}

function EquipmentStation({ item, nearby }: { item: Gear; nearby: boolean }) {
  const spin = useRef<THREE.Group>(null);
  useFrame((_, delta) => { if (spin.current) spin.current.rotation.y += delta * .35; });
  return (
    <group position={item.position}>
      <mesh position={[0, .14, 0]} receiveShadow castShadow><cylinderGeometry args={[.86, 1.02, .28, 6]} /><meshStandardMaterial color="#182d44" metalness={.67} roughness={.31} /></mesh>
      <mesh position={[0, .30, 0]}><cylinderGeometry args={[.84, .84, .04, 48]} /><meshStandardMaterial color={item.color} metalness={.5} emissive={item.color} emissiveIntensity={nearby ? 1.3 : .58} /></mesh>
      <group position={[0, 1.13, 0]} ref={spin}>
        <Float speed={2} floatIntensity={.16} rotationIntensity={.05}><EquipmentShape id={item.id} color={item.color} /></Float>
      </group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, .035, 0]}><ringGeometry args={[1.1, 1.17, 48]} /><meshBasicMaterial color={item.color} transparent opacity={nearby ? 1 : .33} side={THREE.DoubleSide} /></mesh>
      <pointLight position={[0, 1, 0]} color={item.color} intensity={nearby ? 2 : .45} distance={4} decay={2} />
      <Html position={[0, 2.43, 0]} center distanceFactor={12} style={{ pointerEvents: "none" }}>
        <div className={`l1-world-label ${nearby ? "is-near" : ""}`}>
          <span className="l1-world-dot" />{item.name}
        </div>
      </Html>
    </group>
  );
}

function BodyEquipment({ collected }: { collected: Set<GearId> }) {
  return (
    <group>
      {collected.has("suit") && (
        <group>
          <mesh position={[0, 1.06, -.17]} castShadow><boxGeometry args={[.57, .56, .20]} /><meshStandardMaterial color="#e6edf3" metalness={.54} roughness={.32} transparent opacity={.91} /></mesh>
          <mesh position={[0, 1.1, -.282]}><boxGeometry args={[.33, .23, .025]} /><meshStandardMaterial color="#517da1" emissive="#1c6c9e" emissiveIntensity={.14} /></mesh>
          {[-1, 1].map((s) => <mesh key={s} position={[s * .25, .42, 0]} castShadow><boxGeometry args={[.18, .33, .3]} /><meshStandardMaterial color="#d8e8f0" metalness={.38} roughness={.28} /></mesh>)}
        </group>
      )}
      {collected.has("helmet") && (
        <group position={[0, 1.56, 0]}>
          <mesh><sphereGeometry args={[.295, 24, 18]} /><meshPhysicalMaterial color="#c5eafd" metalness={.08} roughness={.09} transparent opacity={.23} depthWrite={false} /></mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -.225, 0]}><torusGeometry args={[.235, .045, 9, 28]} /><meshStandardMaterial color="#edf7ff" metalness={.65} roughness={.25} /></mesh>
          <mesh position={[0, .04, -.255]}><sphereGeometry args={[.04, 12, 10]} /><meshBasicMaterial color="#8ce9ff" /></mesh>
        </group>
      )}
      {collected.has("oxygen") && (
        <group position={[0, .9, .30]}>
          {[-.30,.30].map((x) => <mesh key={x} position={[x,0,0]} castShadow><cylinderGeometry args={[.10,.10,.48,12]} /><meshStandardMaterial color="#7ce0d6" metalness={.65} roughness={.22} /></mesh>)}
        </group>
      )}
      {collected.has("water") && (
        <mesh position={[.32, .69, .02]}><boxGeometry args={[.18, .28, .20]} /><meshStandardMaterial color="#66befa" metalness={.55} roughness={.27} /></mesh>
      )}
      {collected.has("comms") && (
        <mesh position={[-.4, .96, -.13]} rotation={[0, 0, -.45]}><boxGeometry args={[.16, .13, .17]} /><meshStandardMaterial color="#63d7ff" metalness={.55} emissive="#2682a8" emissiveIntensity={.45} /></mesh>
      )}
      {collected.has("tools") && (
        <group position={[0, .98, .35]}>
          <mesh castShadow><boxGeometry args={[.47,.60,.22]} /><meshStandardMaterial color="#cfdee6" metalness={.55} roughness={.28} /></mesh>
          <mesh position={[0,.15,.12]}><boxGeometry args={[.33,.17,.025]} /><meshBasicMaterial color="#f9b375" /></mesh>
        </group>
      )}
    </group>
  );
}

// Shows a clear message (instead of a blank scene) if Mysha's files cannot load.
class CharacterBoundary extends Component<
  { children: ReactNode; onError: (text: string) => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error("[Mysha] The character could not be loaded. Check these two files exist:", MODEL, SKIN, error);
    this.props.onError(`MYSHA FAILED TO LOAD. Check: ${MODEL} and ${SKIN}`);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <Html center>
        <div className="l1-world-label">MYSHA MODEL NOT LOADED · OPEN BROWSER CONSOLE (F12)</div>
      </Html>
    );
  }
}

function Mysha({ position, heading, moving, keys, collected, onReport }: {
  position: MutableRefObject<THREE.Vector3>;
  heading: MutableRefObject<number>;
  moving: MutableRefObject<boolean>;
  keys: MutableRefObject<Set<string>>;
  collected: Set<GearId>;
  onReport: (text: string) => void;
}) {
  const fbx = useFBX(MODEL);
  const skin = useTexture(SKIN);
  const outer = useRef<THREE.Group>(null);
  const walkAction = useRef<THREE.AnimationAction | null>(null);

  const prepared = useMemo(() => {
    const character = cloneSkeleton(fbx);

    const map = skin.clone();
    map.colorSpace = THREE.SRGBColorSpace;
    map.flipY = TEXTURE_FLIP_Y;
    map.needsUpdate = true;

    const materials: THREE.Material[] = [];
    let meshCount = 0;

    const makeVisible = (source: THREE.Material) => {
      const m = source.clone() as THREE.MeshStandardMaterial;
      if (!m.map) {
        m.map = map;
        if (m.color) m.color.set("#ffffff");
      }
      // Some exported models arrive see-through or one-sided. Force a solid look.
      m.transparent = false;
      m.opacity = 1;
      m.alphaTest = 0;
      m.depthWrite = true;
      m.depthTest = true;
      m.visible = true;
      m.side = THREE.DoubleSide;
      m.needsUpdate = true;
      materials.push(m);
      return m;
    };

    character.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      meshCount += 1;
      object.visible = true;
      object.castShadow = true;
      object.receiveShadow = true;
      // Skinned meshes can be hidden by wrong culling bounds. Never cull Mysha.
      object.frustumCulled = false;
      object.material = Array.isArray(object.material)
        ? object.material.map(makeVisible)
        : makeVisible(object.material);
    });

    // Measure the real size using the skeleton, then fit Mysha to TARGET_HEIGHT.
    character.updateMatrixWorld(true);
    character.traverse((object) => {
      if (object instanceof THREE.SkinnedMesh) {
        object.skeleton.update();
        object.computeBoundingBox();
        object.computeBoundingSphere();
      }
    });
    const rawSize = new THREE.Box3().setFromObject(character).getSize(new THREE.Vector3());
    const sizeOk = Number.isFinite(rawSize.y) && rawSize.y > 0.0001;
    const scale = sizeOk ? TARGET_HEIGHT / rawSize.y : 1;
    if (!sizeOk) console.warn("[Mysha] Could not measure model height. Using scale 1.", rawSize);

    character.scale.setScalar(scale);
    character.updateMatrixWorld(true);
    const fitted = new THREE.Box3().setFromObject(character);
    const center = fitted.getCenter(new THREE.Vector3());
    character.position.x -= center.x;
    character.position.z -= center.z;
    character.position.y -= fitted.min.y;

    // Bone names (needed later to attach helmet and backpack to the right bones).
    const boneNames: string[] = [];
    character.traverse((object) => {
      if (object instanceof THREE.Bone) boneNames.push(object.name);
    });
    console.info("[Mysha] bones:", boneNames);
    const keyBones = boneNames.filter((n) => /head|neck|spine|chest/i.test(n)).slice(0, 6).join(", ");

    const clip =
      fbx.animations.find((c) => /walk/i.test(c.name)) ?? fbx.animations[0] ?? null;

    const info = clip
      ? `Mysha OK · meshes ${meshCount} · raw height ${rawSize.y.toFixed(2)} → scale ${scale.toFixed(4)} · clip "${clip.name}" ${clip.duration.toFixed(2)}s · bones (${boneNames.length}): ${keyBones || "none found"}`
      : `Mysha loaded but the FBX has NO animation clip · meshes ${meshCount} · scale ${scale.toFixed(4)} · bones (${boneNames.length}): ${keyBones || "none found"}`;

    return { character, map, materials, clip, info };
  }, [fbx, skin]);

  const { character, clip, info } = prepared;
  const mixer = useMemo(() => new THREE.AnimationMixer(character), [character]);

  useEffect(() => { onReport(info); }, [info, onReport]);

  useEffect(() => {
    if (outer.current) outer.current.rotation.y = heading.current;
  }, [heading]);

  useEffect(() => {
    if (!clip) return;
    const action = mixer.clipAction(clip);
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.play();
    mixer.update(0); // show the first walking pose instead of a T-pose
    walkAction.current = action;
    return () => {
      action.stop();
      mixer.stopAllAction();
      mixer.uncacheRoot(character);
      walkAction.current = null;
    };
  }, [character, clip, mixer]);

  useEffect(() => () => {
    prepared.materials.forEach((m) => m.dispose());
    prepared.map.dispose();
  }, [prepared]);

  useFrame((_, dt) => {
    const group = outer.current;
    if (group) {
      group.position.copy(position.current);
      // Turn the short way round.
      const diff =
        THREE.MathUtils.euclideanModulo(heading.current - group.rotation.y + Math.PI, Math.PI * 2) - Math.PI;
      group.rotation.y += diff * (1 - Math.exp(-12 * dt));
    }
    const action = walkAction.current;
    if (action) {
      const running = keys.current.has("ShiftLeft") || keys.current.has("ShiftRight");
      action.timeScale = running ? 1.6 : 1;
      action.paused = !moving.current;
      if (moving.current) mixer.update(Math.min(.05, dt));
    }
  });

  return (
    <group ref={outer}>
      <primitive object={character} />
      {SHOW_PLACEHOLDER_GEAR && <BodyEquipment collected={collected} />}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, .027, 0]}><circleGeometry args={[.46, 32]} /><meshBasicMaterial color="#030711" transparent opacity={.34} depthWrite={false} /></mesh>
    </group>
  );
}

function CargoStack({ position, color = "#45546b" }: { position: [number, number, number]; color?: string }) {
  return (
    <group position={position}>
      <mesh position={[0, .42, 0]} receiveShadow castShadow><boxGeometry args={[1.55, .82, 1.15]} /><meshStandardMaterial color={color} metalness={.65} roughness={.36} /></mesh>
      <mesh position={[.13, .97, -.1]} receiveShadow castShadow><boxGeometry args={[1.16, .32, .95]} /><meshStandardMaterial color="#253f55" metalness={.73} roughness={.31} /></mesh>
      {[-.61, .61].map(x => <mesh key={x} position={[x,.42,-.583]}><boxGeometry args={[.075,.76,.035]} /><meshStandardMaterial color="#7e9db8" metalness={.75} /></mesh>)}
      <mesh position={[0,.52,-.597]}><boxGeometry args={[.45,.07,.04]} /><meshBasicMaterial color="#ffad68" /></mesh>
    </group>
  );
}

function Hangar({ unlocked, phase }: { unlocked: boolean; phase: Phase }) {
  const open = unlocked || phase !== "room";
  const ceiling = Array.from({ length: 7 }, (_, index) => -11 + index * 3.8);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2,0,0]} receiveShadow><planeGeometry args={[25, 29]} /><meshStandardMaterial color="#152335" roughness={.38} metalness={.48} /></mesh>
      <gridHelper position={[0,.014,0]} args={[25,25,"#375c78","#223a52"]} />
      {[-11.8, 11.8].map(x => (
        <group key={x}>
          <mesh position={[x,3.75,0]} receiveShadow castShadow><boxGeometry args={[.7,7.5,29]} /><meshStandardMaterial color="#293b50" metalness={.68} roughness={.35} /></mesh>
          <mesh position={[x > 0 ? x-.37 : x+.37,3.7,0]}><boxGeometry args={[.09,.12,27.9]} /><meshBasicMaterial color="#5fc9e8" /></mesh>
          {[-10,-4,2,8].map(z => <mesh key={z} position={[x > 0 ? x-.38 : x+.38,3.3,z]}><boxGeometry args={[.11,6.5,.25]} /><meshStandardMaterial color="#7693ad" metalness={.8} roughness={.3} /></mesh>)}
        </group>
      ))}
      <mesh position={[0,3.75,13.8]} receiveShadow><boxGeometry args={[25,7.5,.65]} /><meshStandardMaterial color="#28394d" metalness={.68} roughness={.4} /></mesh>
      <mesh position={[-8,3.75,-14]}><boxGeometry args={[9,7.5,.65]} /><meshStandardMaterial color="#27394f" metalness={.72} roughness={.33} /></mesh>
      <mesh position={[8,3.75,-14]}><boxGeometry args={[9,7.5,.65]} /><meshStandardMaterial color="#27394f" metalness={.72} roughness={.33} /></mesh>
      <mesh position={[0,7,-14]}><boxGeometry args={[7,1.1,.75]} /><meshStandardMaterial color="#344962" metalness={.7} roughness={.3} /></mesh>
      {[-1,1].map(s => (
        <mesh key={s} position={[s * (open ? 4.6 : 1.7),3.25,-13.95]} castShadow>
          <boxGeometry args={[3.3,6.4,.35]} /><meshStandardMaterial color="#233b54" metalness={.85} roughness={.3} />
        </mesh>
      ))}
      <mesh position={[0,.03,-11.9]} rotation={[-Math.PI/2,0,0]}><ringGeometry args={[2.3,2.46,54,1,0,Math.PI]} /><meshBasicMaterial color={open ? "#80f8cb" : "#e89a54"} side={THREE.DoubleSide} /></mesh>
      <Html position={[0,5.65,-13.5]} center distanceFactor={19} style={{pointerEvents:"none"}}><div className="l1-door-label">{open ? "GATE UNLOCKED · APPROACH" : "LAUNCH PAD · LOCKED"}</div></Html>
      {ceiling.map(z => (
        <group key={z}>
          <mesh position={[0,7.12,z]}><boxGeometry args={[23,.19,.45]} /><meshStandardMaterial color="#425972" metalness={.8} roughness={.3} /></mesh>
          {[-7,0,7].map(x => <mesh key={x} position={[x,6.99,z]}><boxGeometry args={[2.9,.07,.58]} /><meshBasicMaterial color="#d0f4ff" /></mesh>)}
          <pointLight position={[0,6.2,z]} intensity={2.4} distance={10} color="#afdcff" decay={2} />
        </group>
      ))}
      {[[-10,0,-11.4],[10,0,9.5],[-10,0,10.3],[10,0,-11.2]].map((p,i) => <CargoStack key={i} position={p as [number,number,number]} />)}
      <mesh position={[0,.018,0]} rotation={[-Math.PI/2,0,0]}><planeGeometry args={[3,22]} /><meshBasicMaterial color="#38677c" transparent opacity={.16} depthWrite={false} /></mesh>
      {[-9,-5,-1,3,7].map(z => <mesh key={z} position={[0,.021,z]} rotation={[-Math.PI/2,0,0]}><planeGeometry args={[1,.12]} /><meshBasicMaterial color="#9ee9ff" transparent opacity={.38} /></mesh>)}
    </group>
  );
}

function Rocket() {
  return (
    <group>
      <mesh position={[0,5.2,0]} castShadow><cylinderGeometry args={[1.08,1.22,8.4,32]} /><meshStandardMaterial color="#e8eef1" metalness={.55} roughness={.31} /></mesh>
      <mesh position={[0,10.35,0]} castShadow><coneGeometry args={[1.08,2.2,32]} /><meshStandardMaterial color="#f5f7fa" metalness={.52} roughness={.28} /></mesh>
      <mesh position={[0,6.1,-1.15]}><boxGeometry args={[1.04,.67,.09]} /><meshStandardMaterial color="#ee794b" metalness={.42} roughness={.32} /></mesh>
      <mesh position={[0,8.5,-1.08]}><boxGeometry args={[.42,1.3,.05]} /><meshStandardMaterial color="#244c70" metalness={.5} /></mesh>
      {[-1,1].map(s => <group key={s}>
        <mesh position={[s * 1.28,2.4,0]}><cylinderGeometry args={[.52,.61,4.5,16]} /><meshStandardMaterial color="#dbe5ea" metalness={.48} roughness={.28} /></mesh>
        <mesh position={[s * 1.28,4.9,0]}><coneGeometry args={[.52,1.05,16]} /><meshStandardMaterial color="#ecf3f9" metalness={.48} /></mesh>
        <mesh position={[s * 1.28,.04,0]}><cylinderGeometry args={[.5,.53,.18,16]} /><meshStandardMaterial color="#344357" metalness={.8} /></mesh>
      </group>)}
      <mesh position={[0,.9,0]}><cylinderGeometry args={[.86,.86,.78,20]} /><meshStandardMaterial color="#3d4757" metalness={.82} roughness={.32} /></mesh>
      {/* The visible lower-cabin hatch is where Mysha walks before the video begins. */}
      <mesh position={[0,1.74,1.2]}><boxGeometry args={[1.05,1.65,.06]} /><meshStandardMaterial color="#081b2d" metalness={.58} roughness={.25} /></mesh>
      <mesh position={[0,1.74,1.251]}><boxGeometry args={[.85,1.45,.017]} /><meshStandardMaterial color="#102e46" emissive="#123b61" emissiveIntensity={.4} metalness={.52} /></mesh>
      <mesh position={[0,2.52,1.27]}><boxGeometry args={[1.12,.07,.06]} /><meshBasicMaterial color="#93ecff" /></mesh>
      <mesh position={[0,1.74,1.285]}><boxGeometry args={[.05,1.36,.02]} /><meshBasicMaterial color="#6dbad9" /></mesh>
      <Html position={[0,2.85,1.28]} center distanceFactor={14} style={{pointerEvents:"none"}}><div className="l1-rocket-label">CREW BOARDING HATCH</div></Html>
    </group>
  );
}

function LaunchPad() {
  return (
    <group>
      <mesh rotation={[-Math.PI/2,0,0]} position={[0,-.02,-27]} receiveShadow><planeGeometry args={[36,31]} /><meshStandardMaterial color="#26313e" roughness={.72} metalness={.34} /></mesh>
      <mesh position={[0,.21,-30]} receiveShadow><cylinderGeometry args={[4.7,5.1,.42,48]} /><meshStandardMaterial color="#4e6171" roughness={.66} metalness={.32} /></mesh>
      <group position={[0, .45, -30]}><Rocket /></group>
      {/* Lit approach path makes the automatic walk-to-rocket sequence readable. */}
      <mesh position={[0,.015,-26.7]} rotation={[-Math.PI/2,0,0]}><planeGeometry args={[2.35,5]} /><meshBasicMaterial color="#4bcfff" transparent opacity={.12} depthWrite={false} /></mesh>
      {[-25.15,-26,-26.85,-27.7].map((z) => <mesh key={z} position={[0,.023,z]} rotation={[-Math.PI/2,0,0]}><planeGeometry args={[1.35,.07]} /><meshBasicMaterial color="#9deaff" transparent opacity={.65}/></mesh>)}
      {[[-8,-25],[8,-25],[-8,-35],[8,-35]].map(([x,z]) => (
        <group key={`${x}-${z}`}>
          <mesh position={[x,2.7,z]}><cylinderGeometry args={[.18,.25,5.4,8]} /><meshStandardMaterial color="#637d90" metalness={.76} /></mesh>
          <mesh position={[x,5.43,z]}><sphereGeometry args={[.25,12,10]} /><meshBasicMaterial color="#bceaff" /></mesh>
          <pointLight position={[x,5.5,z]} color="#b8eaff" intensity={2} distance={12} />
        </group>
      ))}
      <mesh position={[5.3,5.8,-31]}><boxGeometry args={[.4,11.6,.4]} /><meshStandardMaterial color="#647a90" metalness={.7} /></mesh>
      {Array.from({length:5},(_,i) => <mesh key={i} position={[4.7,i*2.1+1,-31]}><boxGeometry args={[2,.12,.13]} /><meshStandardMaterial color="#6c90a6" metalness={.65} /></mesh>)}
      <Html position={[0,13,-30]} center distanceFactor={34} style={{pointerEvents:"none"}}><div className="l1-rocket-label">EARTH ORBITAL LAUNCH VEHICLE</div></Html>
    </group>
  );
}

function World({ phase, collected, paused, player, heading, moving, keys, onNear, onCharacterReport, onBoardingArrived }: {
  phase: Phase; collected: Set<GearId>; paused: boolean;
  player: MutableRefObject<THREE.Vector3>;
  heading: MutableRefObject<number>;
  moving: MutableRefObject<boolean>;
  keys: MutableRefObject<Set<string>>;
  onNear: (near: Near) => void;
  onCharacterReport: (text: string) => void;
  onBoardingArrived: () => void;
}) {
  const nearRef = useRef<Near>(null);
  const boardingStage = useRef(0);
  const boardingDone = useRef(false);
  const completed = collected.size === GEAR.length;

  useEffect(() => {
    if (phase === "boarding") {
      boardingStage.current = 0;
      boardingDone.current = false;
    }
  }, [phase]);

  useFrame(({camera},dt) => {
    if (phase!=="room" && phase!=="pad" && phase!=="boarding") return;
    const delta=Math.min(dt,.055);
    const isBoarding=phase==="boarding";

    if (isBoarding) {
      // Move the ACTUAL animated Mysha model to the hatch in two short stages.
      // This is not a camera-only fake, teleport or replacement character.
      const destination=boardingStage.current===0
        ? new THREE.Vector3(0,0,-26.25)
        : new THREE.Vector3(0,0,-28.66);
      const direction=destination.sub(player.current);
      const distance=direction.length();
      if (distance<.09) {
        if (boardingStage.current===0) {
          boardingStage.current=1;
        } else if (!boardingDone.current) {
          boardingDone.current=true;
          moving.current=false;
          onBoardingArrived();
        }
      } else {
        const step=Math.min(distance,2.25*delta);
        heading.current=Math.atan2(direction.x,direction.z)+FACING_OFFSET;
        player.current.addScaledVector(direction.multiplyScalar(1/distance),step);
        moving.current=true;
      }
      if (nearRef.current!==null) {
        nearRef.current=null;
        onNear(null);
      }
    } else {
      const input=new THREE.Vector3(
        Number(keys.current.has("KeyD")||keys.current.has("ArrowRight"))-Number(keys.current.has("KeyA")||keys.current.has("ArrowLeft")),
        0,
        Number(keys.current.has("KeyS")||keys.current.has("ArrowDown"))-Number(keys.current.has("KeyW")||keys.current.has("ArrowUp"))
      );
      const shouldMove=!paused && input.lengthSq()>0;
      moving.current=shouldMove;
      if(shouldMove){
        input.normalize();
        const speed=(keys.current.has("ShiftLeft")||keys.current.has("ShiftRight")?5.9:3.65)*delta;
        const next=player.current.clone().addScaledVector(input,speed);
        if(phase==="room"){
          next.x=THREE.MathUtils.clamp(next.x,ROOM_MIN_X,ROOM_MAX_X);
          next.z=THREE.MathUtils.clamp(next.z,ROOM_MIN_Z,ROOM_MAX_Z);
        }else{
          next.x=THREE.MathUtils.clamp(next.x,-12,12);
          next.z=THREE.MathUtils.clamp(next.z,-29,-15.3);
        }
        const obstacle = phase === "room" &&
          GEAR.some(g => !collected.has(g.id) && Math.hypot(next.x - g.position[0], next.z - g.position[2]) < 1.08);
        if (!obstacle) player.current.copy(next);
        heading.current=Math.atan2(input.x,input.z)+FACING_OFFSET;
      }
      let near: Near=null;
      if(phase==="room"){
        const item=GEAR.find((g)=>!collected.has(g.id)&&isNear(player.current,g.position[0],g.position[2],1.85));
        if(item) near=item.id;
        else if(isNear(player.current,0,-12.1,3.2)) near="gate";
      }else if(isNear(player.current,0,-27,3.8)) near="rocket";
      if(near!==nearRef.current){nearRef.current=near;onNear(near);}
    }

    const desired=isBoarding
      ? new THREE.Vector3(player.current.x+3.2,2.85,player.current.z+5.2)
      : new THREE.Vector3(player.current.x+CAM_SIDE,CAM_HEIGHT,player.current.z+CAM_BACK);
    if(phase==="room"){
      desired.x=THREE.MathUtils.clamp(desired.x,-10.6,10.6);
      desired.z=Math.min(desired.z,12.7);
      desired.y=Math.min(desired.y,6.2);
    }else if (!isBoarding){
      desired.x=THREE.MathUtils.clamp(desired.x,-11,11);
      if(desired.z<-12.5&&desired.z>-15) desired.x=THREE.MathUtils.clamp(desired.x,-2.4,2.4);
    }
    // Slower dolly on the boarding shot helps the camera show Mysha walking.
    camera.position.lerp(desired,1-Math.exp(-dt*(isBoarding?2.6:5)));
    camera.lookAt(player.current.x,isBoarding?1.5:1.2,player.current.z-(isBoarding?1.3:1.4));
  });

  return <>
    <color attach="background" args={["#071522"]} />
    <fog attach="fog" args={["#071522",27,90]} />
    <ambientLight intensity={.82} />
    <hemisphereLight args={["#b4dfff","#2b3341",1.15]} />
    <directionalLight position={[7,14,9]} intensity={2.8} color="#e2f3ff" castShadow shadow-mapSize={[1024,1024]} shadow-camera-left={-25} shadow-camera-right={25} shadow-camera-top={25} shadow-camera-bottom={-25} />
    <directionalLight position={[-10,9,-10]} intensity={1.7} color="#68c9ff" />
    <Hangar unlocked={completed} phase={phase} />
    {GEAR.filter((g)=>!collected.has(g.id)).map(g=><EquipmentStation key={g.id} item={g} nearby={nearRef.current===g.id} />)}
    <LaunchPad />
    <CharacterBoundary onError={onCharacterReport}>
      <Suspense fallback={<Html center><div className="l1-world-label">LOADING MYSHA...</div></Html>}>
        <Mysha position={player} heading={heading} moving={moving} keys={keys} collected={collected} onReport={onCharacterReport} />
      </Suspense>
    </CharacterBoundary>
  </>;
}

const uiCss = `
.l1-root{position:fixed;inset:0;overflow:hidden;background:#071522;color:#e8f7ff;font-family:Inter,"Segoe UI",Arial,sans-serif}
.l1-root *{box-sizing:border-box}
.l1-canvas{position:absolute;inset:0}
.l1-debug{position:absolute;left:10px;bottom:4px;z-index:12;max-width:70vw;font:10px/1.3 ui-monospace,Consolas,monospace;color:#8be6ff;opacity:.75;pointer-events:none}
.l1-glass{background:linear-gradient(135deg,#071b30e8,#081728cc);border:1px solid #81d9f44c;box-shadow:0 12px 40px #02071679;backdrop-filter:blur(12px)}
.l1-top{position:absolute;left:22px;right:22px;top:18px;display:flex;gap:14px;justify-content:space-between;align-items:flex-start;pointer-events:none}
.l1-brand{padding:15px 19px;border-radius:17px;max-width:450px}
.l1-overline{font-size:10px;color:#79dcfb;letter-spacing:.22em;font-weight:900}
.l1-title{margin:5px 0 3px;font-size:clamp(16px,1.8vw,25px);font-weight:900;letter-spacing:-.025em}
.l1-sub{color:#acc9db;font-size:12px;line-height:1.4}
.l1-counter{padding:16px 21px;border-radius:17px;text-align:right;min-width:175px}
.l1-counter strong{font-size:28px;color:#c7f4ff;display:block;line-height:1.2}
.l1-counter span{font-size:10px;letter-spacing:.13em;color:#8dcde6}
.l1-progress{height:4px;margin-top:11px;background:#315069;border-radius:20px;overflow:hidden}
.l1-progress i{height:100%;display:block;background:linear-gradient(90deg,#66d9ff,#8df6ca);transition:width .45s ease}
.l1-objectives{position:absolute;right:22px;top:125px;width:250px;max-height:calc(100dvh - 250px);overflow:auto;border-radius:17px;padding:12px}
.l1-objectives h3{font-size:11px;letter-spacing:.17em;color:#91e6ff;margin:6px 7px 11px}
.l1-objective{display:flex;align-items:center;gap:9px;padding:8px 8px;border-top:1px solid #8cbee41d;font-size:12px;color:#c5d8e6}
.l1-check{width:22px;height:22px;display:grid;place-items:center;flex:none;border:1px solid #5887a2;border-radius:8px;color:#a1cad9;font-weight:900;font-size:12px;transition:background .35s,border-color .35s}
.l1-check.done{color:#07382b;background:#8bf0ca;border-color:#8bf0ca}
.l1-objective .l1-name.done{color:#97edd1}
.l1-status{margin-left:auto;font-size:10px;font-weight:900;letter-spacing:.1em;color:#ffb27a;transition:color .35s}
.l1-status.go{color:#8bf0ca}
.l1-bottom{position:absolute;bottom:24px;left:24px;right:24px;display:flex;align-items:flex-end;justify-content:space-between;gap:18px;pointer-events:none}
.l1-tip{border-radius:17px;padding:15px 18px;max-width:440px;pointer-events:auto}
.l1-tip.restricted{border-color:#f5a35fcc;box-shadow:0 12px 40px #02071679,0 0 24px #f5a35f40}
.l1-tip b{display:block;font-size:13px;margin-bottom:7px}
.l1-tip p{font-size:12px;color:#aac9d9;margin:0;line-height:1.5}
.l1-action{pointer-events:auto;display:flex;gap:9px;align-items:center;padding:13px 19px;border:1px solid #ffe2ab;border-radius:100px;cursor:pointer;background:linear-gradient(90deg,#f6a04e,#eb623e);color:#fff;font-size:12px;letter-spacing:.06em;font-weight:900;box-shadow:0 0 30px #ff8b5080;animation:l1-action-in .4s ease both}
.l1-action:hover{filter:brightness(1.12)}
.l1-action kbd{font:inherit;padding:5px 9px;border:1px solid #fff9;border-radius:7px}
.l1-world-label,.l1-door-label,.l1-rocket-label{white-space:nowrap;padding:8px 11px;border:1px solid #83daf18a;border-radius:999px;background:#071d35dd;color:#ddf8ff;box-shadow:0 0 12px #65d9fb3c;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;transition:transform .25s,border-color .25s}
.l1-world-label.is-near{transform:scale(1.14);border-color:#ffc87b;color:#fff}
.l1-world-dot{display:inline-block;width:7px;height:7px;margin-right:7px;border-radius:50%;background:#85e8ff;box-shadow:0 0 8px #85e8ff;animation:l1-blink 1.6s infinite}
.l1-door-label{border-color:#f5c1818c}.l1-rocket-label{border-color:#f9bd7b88;color:#ffe3bd}
.l1-overlay{position:absolute;inset:0;z-index:20;display:grid;place-items:center;padding:20px;background:#020917b8;backdrop-filter:blur(11px);animation:l1-fade .28s both}
.l1-card{width:min(760px,100%);max-height:calc(100dvh - 40px);overflow:auto;border:1px solid #96e6f47a;border-radius:24px;background:linear-gradient(140deg,#112f48f5,#07182bf8);padding:clamp(22px,4vw,44px);box-shadow:0 22px 90px #000b;animation:l1-card .45s cubic-bezier(.2,.8,.2,1) both}
.l1-badge{display:inline-flex;gap:8px;align-items:center;padding:8px 13px;background:#174a5b;border:1px solid #8cead979;border-radius:100px;font-size:10px;letter-spacing:.18em;font-weight:900;color:#baffed}
.l1-card h2{font-size:clamp(28px,4.6vw,50px);letter-spacing:-.045em;line-height:1.04;margin:18px 0 14px}
.l1-card h2.l1-title-reveal{animation:l1-title-in 1.1s cubic-bezier(.2,.8,.2,1) both}
.l1-card p{font-size:clamp(14px,1.55vw,17px);color:#d3e6f1;line-height:1.65;min-height:60px;margin:0 0 6px}
.l1-reveal-row{display:grid;grid-template-columns:1fr 1fr;gap:11px;margin:16px 0 18px}
.l1-reveal{background:#112f4b9c;border:1px solid #7bc5e33e;border-radius:14px;padding:13px 14px}
.l1-reveal strong{display:block;color:#86dcfc;font-size:10px;letter-spacing:.13em;margin-bottom:6px}
.l1-reveal span{font-size:13px;color:#d7e9f3;line-height:1.48}
.l1-reveal.fact{border-color:#8bf0ca66;background:#0f3b4a9c}
.l1-reveal.fact strong{color:#8bf0ca}
.l1-source{font-size:11px;color:#9fc0d2;line-height:1.5;margin:0 0 18px;padding-left:10px;border-left:2px solid #5db6d6}
.l1-go{display:inline-block;margin:0 0 18px;padding:7px 14px;border-radius:999px;background:#8bf0ca;color:#07382b;font-size:12px;font-weight:900;letter-spacing:.16em}
.l1-continue{display:block;border:1px solid #faddae;border-radius:999px;background:linear-gradient(95deg,#ff9d51,#fb6546);color:#fff;font-size:13px;font-weight:900;letter-spacing:.09em;padding:15px 26px;cursor:pointer;box-shadow:0 0 25px #ee785977;font-family:inherit}
.l1-continue:hover{filter:brightness(1.12)}
.l1-continue.ghost{background:transparent;border-color:#8cdcf47a;box-shadow:none;color:#d9f6ff}
.l1-continue:disabled{opacity:.55;cursor:not-allowed;filter:none}
.l1-continue:focus-visible{outline:2px solid #def8ff;outline-offset:3px}
.l1-btn-row{display:flex;flex-wrap:wrap;gap:10px}
.l1-float-icon{font-size:36px;display:inline-grid;place-items:center;width:75px;height:75px;margin:8px 0 3px;border:1px solid #89e5f3a3;border-radius:21px;color:#b7faff;background:#123d58;box-shadow:0 0 30px #54bcd866;animation:l1-float 3s ease-in-out infinite}
.l1-audiobar{position:absolute;z-index:12;top:21px;left:50%;transform:translateX(-50%);display:flex;gap:8px}
.l1-audio{min-height:43px;padding:10px 15px;border:1px solid #7bcee78c;border-radius:999px;background:#091e35e6;backdrop-filter:blur(10px);color:#e4f9ff;cursor:pointer;font-size:11px;font-weight:800;letter-spacing:.09em;box-shadow:0 5px 22px #02091577;white-space:nowrap}
.l1-audio:hover{border-color:#d2f6ff;background:#164369}
.l1-audio:focus-visible{outline:2px solid #def8ff;outline-offset:3px}
.l1-audio span{color:#9ceaff;margin-right:5px}
.l1-complete{position:absolute;inset:0;display:grid;place-items:center;background:#030b1f8a;backdrop-filter:blur(7px);z-index:30;padding:20px}
.l1-level2{position:absolute;inset:0;z-index:35;display:grid;place-items:center;padding:20px;background:radial-gradient(ellipse at 80% 27%,#a751393b,transparent 40%),radial-gradient(ellipse at 18% 65%,#1d537c45,transparent 55%),#020916f2;animation:l1-fade .65s both}
.l1-level2 .l1-card{width:min(720px,100%);text-align:center}
.l1-level2 .l1-card p{max-width:570px;margin:14px auto 20px}
.l1-level2-number{font:900 clamp(75px,14vw,155px)/.8 Inter,"Segoe UI",sans-serif;letter-spacing:-.1em;color:#c5edfc;text-shadow:0 0 65px #5cbeef77;margin:24px auto 7px}
.l1-level2-phrase{font-size:clamp(20px,3vw,31px);color:#ffd0a9;font-weight:900;letter-spacing:.16em;margin-bottom:11px}
.l1-level2 .l1-btn-row{justify-content:center}
.l1-dev-video{position:absolute;right:14px;bottom:112px;z-index:18;cursor:pointer;padding:10px 13px;border:1px dashed #ffcd8677;background:#132b46ee;border-radius:12px;color:#ffe5c2;font:800 10px Inter,"Segoe UI",sans-serif;letter-spacing:.08em}
.l1-boarding-ui{position:absolute;inset:0;z-index:25;pointer-events:none;display:flex;align-items:flex-end;justify-content:center;padding:0 15px calc(6vh + 30px);background:linear-gradient(180deg,#02091738,transparent 37%,#020917be 100%)}
.l1-boarding-panel{text-align:center;animation:l1-boarding-in .65s ease both}
.l1-boarding-kicker{display:block;color:#89e3ff;font-size:11px;font-weight:800;letter-spacing:.27em;margin-bottom:11px;text-shadow:0 2px 13px #000}
.l1-boarding-title{display:block;color:#f1faff;font-size:clamp(18px,3.5vw,32px);letter-spacing:.09em;font-weight:900;text-shadow:0 4px 20px #000}
.l1-boarding-hint{display:block;margin-top:12px;color:#b2d8e8;font-size:12px;letter-spacing:.04em}
.l1-boarding-dots{display:flex;justify-content:center;gap:9px;margin-top:16px}
.l1-boarding-dots i{width:7px;height:7px;border-radius:50%;background:#8beaff;animation:l1-boarding-dot 1s ease-in-out infinite alternate}
.l1-boarding-dots i:nth-child(2){animation-delay:.2s}.l1-boarding-dots i:nth-child(3){animation-delay:.4s}
.l1-boarding-fade{position:absolute;inset:0;z-index:26;pointer-events:none;background:#010611;animation:l1-board-out .62s ease-in forwards}
@keyframes l1-boarding-in{from{opacity:0;transform:translateY(22px)}to{opacity:1;transform:translateY(0)}}
@keyframes l1-boarding-dot{to{opacity:.25;transform:translateY(-4px)}}
@keyframes l1-board-out{from{opacity:0}to{opacity:1}}

.l1-dev-video:hover{border-color:#fff;background:#264a6c}
.l1-mobile-controls{display:none}
@keyframes l1-fade{from{opacity:0}to{opacity:1}}
@keyframes l1-card{from{opacity:0;transform:translateY(23px) scale(.97)}to{opacity:1;transform:none}}
@keyframes l1-title-in{from{opacity:0;letter-spacing:.18em}to{opacity:1;letter-spacing:-.045em}}
@keyframes l1-float{50%{transform:translateY(-8px)}}
@keyframes l1-blink{50%{opacity:.3}}
@keyframes l1-action-in{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@media(max-width:760px){
 .l1-audiobar{top:76px;left:10px;transform:none;gap:6px}
 .l1-audio{padding:8px 11px;min-height:36px;font-size:9px}
 .l1-top{left:10px;right:10px;top:10px;gap:8px}.l1-brand{padding:10px 12px}.l1-overline{font-size:8px}.l1-title{font-size:15px}.l1-sub{font-size:10px}
 .l1-counter{min-width:96px;padding:11px}.l1-counter strong{font-size:19px}.l1-counter span{font-size:8px}
 .l1-objectives{right:10px;top:98px;width:165px;max-height:32dvh;padding:7px}.l1-objectives h3{font-size:9px}.l1-objective{font-size:10px;padding:5px 4px;gap:6px}.l1-check{width:18px;height:18px}.l1-status{font-size:8px}
 .l1-bottom{left:10px;right:10px;bottom:calc(115px + env(safe-area-inset-bottom,0px));align-items:flex-end}.l1-tip{padding:9px 10px;max-width:175px}.l1-tip b{font-size:11px}.l1-tip p{font-size:10px}.l1-action{padding:10px 12px;font-size:10px}
 .l1-reveal-row{grid-template-columns:1fr}.l1-card{padding:23px}.l1-card p{min-height:0}
 .l1-mobile-controls{position:absolute;display:flex;left:12px;right:12px;bottom:calc(10px + env(safe-area-inset-bottom,0px));justify-content:space-between;align-items:flex-end;z-index:5;pointer-events:none}
 .l1-dpad{display:grid;grid-template-columns:repeat(3,49px);grid-template-rows:repeat(2,47px);gap:3px;pointer-events:auto}
 .l1-touch{border:1px solid #9ddafba6;background:#0d2f4abb;color:#e3f9ff;box-shadow:0 6px 22px #02081680;backdrop-filter:blur(8px);border-radius:12px;font-size:19px;touch-action:none;user-select:none}
 .l1-touch:active{background:#1e6386}.l1-touch.big{width:72px;height:72px;border-radius:50%;background:#e77a4abf;border-color:#ffba85;font-size:13px;font-weight:800;pointer-events:auto}
}
@media(prefers-reduced-motion:reduce){.l1-root *{animation:none!important;transition:none!important}}
`;

function TouchKey({ code, label, className="", buttons, onStart }: {code:string;label:string;className?:string;buttons:MutableRefObject<Set<string>>;onStart?:()=>void}) {
  function down(event:ReactPointerEvent<HTMLButtonElement>){event.preventDefault();onStart?.();event.currentTarget.setPointerCapture(event.pointerId);buttons.current.add(code);}
  function up(event:ReactPointerEvent<HTMLButtonElement>){event.preventDefault();buttons.current.delete(code);}
  return <button type="button" className={`l1-touch ${className}`} onPointerDown={down} onPointerUp={up} onPointerCancel={up} aria-label={label}>{label}</button>;
}

export function GameShell({ onNextLevel }: { onNextLevel?: () => void } = {}) {
  const [collected,setCollected]=useState<Set<GearId>>(()=>new Set());
  const [phase,setPhase]=useState<Phase>("room");
  const [nearby,setNearby]=useState<Near>(null);
  const [inspecting,setInspecting]=useState<Gear|null>(null);
  const [typed,setTyped]=useState("");
  const [soundOn,setSoundOn]=useState(true);
  const [musicOn,setMusicOn]=useState(true);
  const [boardingArrived,setBoardingArrived]=useState(false);
  const [charReport,setCharReport]=useState("Loading Mysha...");
  const audioRef=useRef<MissionSound|null>(null);
  if(!audioRef.current) audioRef.current=new MissionSound();
  const musicRef=useRef<MissionMusic|null>(null);
  if(!musicRef.current) musicRef.current=new MissionMusic();
  const [toast,setToast]=useState("Find the eight mission essentials scattered around the preparation hangar.");
  const keys=useRef(new Set<string>());
  const player=useRef(new THREE.Vector3(0,0,SPAWN_Z));
  const heading=useRef(Math.PI+FACING_OFFSET);
  const moving=useRef(false);
  // Prevents the cinematic from starting twice (rapid E presses, replay clicks).
  const cinematicLock=useRef(false);
  const phaseRef=useRef<Phase>(phase);
  phaseRef.current=phase;
  const musicOnRef=useRef(musicOn);
  musicOnRef.current=musicOn;
  const finished=collected.size===GEAR.length;
  const total=String(GEAR.length).padStart(2,"0");

  const onNear=useCallback((value: Near)=>{
    setNearby(value);
    if (value) audioRef.current?.play("near");
  },[]);
  const onCinematicFinished=useCallback((result: CinematicResult)=>{
    cinematicLock.current=false;
    updateStoryProgress({ level1DepartureSeen: result!=="unavailable", level1Complete: true });
    // Give the game music back, honouring the player's MUSIC ON/OFF choice.
    musicRef.current?.setEnabled(musicOnRef.current);
    if(musicOnRef.current) musicRef.current?.start();
    audioRef.current?.play("complete");
    setPhase("complete");
  },[]);

  // A short "Level 1 Complete" beat, then automatically enter the Level 2 handoff.
  // When the real Level 2 route is connected by the parent, onNextLevel can open it.
  useEffect(() => {
    if (phase !== "complete") return;
    const id = window.setTimeout(() => {
      if (onNextLevel) onNextLevel();
      else setPhase("level2");
    }, 1900);
    return () => window.clearTimeout(id);
  }, [phase, onNextLevel]);

  useEffect(()=>{
    const interval=window.setInterval(()=>{
      if((phase==="room"||phase==="pad"||phase==="boarding")&&!inspecting&&moving.current){
        audioRef.current?.play("step");
      }
    },360);
    return ()=>window.clearInterval(interval);
  },[phase,inspecting]);

  useEffect(()=>()=>audioRef.current?.dispose(),[]);

  // Background music: start now, and wake it again on the first click or key press.
  // (Not while the cinematic is playing, so the game music stays quiet under the video.)
  useEffect(()=>{
    const music=musicRef.current;
    music?.start();
    const wake=()=>{ if(phaseRef.current==="room" || phaseRef.current==="pad" || phaseRef.current==="boarding") music?.start(); };
    window.addEventListener("pointerdown",wake);
    window.addEventListener("keydown",wake);
    return ()=>{
      window.removeEventListener("pointerdown",wake);
      window.removeEventListener("keydown",wake);
      music?.stop();
    };
  },[]);

  // Level 2 has its own soundscape. Never play the Level 1 soundtrack over it.
  useEffect(() => {
    if (phase === "level2") musicRef.current?.stop();
  }, [phase]);

  // Music gets a little bigger at the important moments.
  useEffect(()=>{
    const level=phase==="complete"||phase==="level2"?1.15:finished?1.15:1;
    musicRef.current?.setMood(level);
  },[phase,finished]);

  // Confirmation chime once the 8th item's panel is closed (readiness verified).
  useEffect(()=>{
    if(!finished||inspecting||phase!=="room") return;
    const timer=window.setTimeout(()=>audioRef.current?.play("complete"),380);
    return ()=>window.clearTimeout(timer);
  },[finished,inspecting,phase]);

  function toggleSound(){
    const next=!soundOn;
    setSoundOn(next);
    audioRef.current?.setEnabled(next);
    if(next)audioRef.current?.play("ui");
  }

  function toggleMusic(){
    const next=!musicOn;
    setMusicOn(next);
    musicRef.current?.setEnabled(next);
    musicRef.current?.start();
  }

  function dismissEquipment(){
    audioRef.current?.unlock();
    audioRef.current?.play("equip");
    setInspecting(null);
  }

  const onBoardingArrived = useCallback(() => {
    moving.current=false;
    setBoardingArrived(true);
  }, []);

  useEffect(() => {
    if (phase!=="boarding" || !boardingArrived) return;
    const id=window.setTimeout(() => {
      updateStoryProgress({ engineerNoteReceived: true });
        musicRef.current?.setEnabled(false);
      musicRef.current?.stop();
      setPhase("cinematic");
      setBoardingArrived(false);
    },620);
    return () => window.clearTimeout(id);
  },[phase,boardingArrived]);

  function startDepartureCinematic() {
    if (cinematicLock.current) return;
    cinematicLock.current = true;
    moving.current = false;
    keys.current.clear();
    updateStoryProgress({ engineerNoteReceived: true });
    musicRef.current?.setEnabled(false);
    musicRef.current?.stop();
    setNearby(null);
    setPhase("cinematic");
  }

  const interact=useCallback(()=>{
    audioRef.current?.unlock();
    if(inspecting || phase!=="room" && phase!=="pad") return;
    if(phase==="room"){
      const gear=GEAR.find(g=>g.id===nearby);
      if(gear&&!collected.has(gear.id)){
        audioRef.current?.play("pickup");
        setCollected(prev=>new Set([...prev,gear.id]));
        setInspecting(gear);
        setNearby(null);
        moving.current=false;
        keys.current.clear();
        return;
      }
      if(nearby==="gate"&&finished){
        audioRef.current?.play("gate");
        player.current.set(0,0,-16.4);
        setPhase("pad");
        setNearby(null);
        setToast("Gate unlocked. Objective: PROCEED TO SPACECRAFT. Follow the illuminated path.");
      }
    }else if(phase==="pad"&&nearby==="rocket"){
      if(!finished){
        setToast("SPACECRAFT ACCESS RESTRICTED. COMPLETE ALL EIGHT READINESS CHECKS.");
        return;
      }
      if(cinematicLock.current) return;
      cinematicLock.current=true;
      moving.current=false;
      keys.current.clear();
      setBoardingArrived(false);
      setNearby(null);
      setToast("Autonomous boarding in progress. Mysha is approaching the crew hatch.");
      audioRef.current?.play("ui");
      setPhase("boarding");
    }
  },[collected,finished,inspecting,nearby,phase]);

  useEffect(()=>{
    const down=(e:KeyboardEvent)=>{
      audioRef.current?.unlock();
      // While the video plays, the cinematic player owns the keyboard.
      if(phase==="cinematic" || phase==="boarding") return;
      if(["Space","ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.code))e.preventDefault();
      if(e.code==="KeyE" && !e.repeat) interact();
      if(inspecting && (e.code==="Enter" || e.code==="Space"))dismissEquipment();
      if(!inspecting) keys.current.add(e.code);
    };
    const up=(e:KeyboardEvent)=>keys.current.delete(e.code);
    const blur=()=>keys.current.clear();
    window.addEventListener("keydown",down);window.addEventListener("keyup",up);window.addEventListener("blur",blur);
    return ()=>{window.removeEventListener("keydown",down);window.removeEventListener("keyup",up);window.removeEventListener("blur",blur);};
  },[interact,inspecting,phase]);

  useEffect(()=>{
    if(!inspecting){setTyped("");return;}
    setTyped("");
    let count=0;
    const timer=window.setInterval(()=>{
      count=Math.min(inspecting.what.length,count+2);
      setTyped(inspecting.what.slice(0,count));
      if(count>=inspecting.what.length)window.clearInterval(timer);
    },20);
    return ()=>window.clearInterval(timer);
  },[inspecting]);

  const nearGear=GEAR.find(g=>g.id===nearby);
  const actionLabel=nearGear
    ? `INSPECT ${nearGear.short}`
    : nearby==="gate"&&finished&&phase==="room" ? "OPEN SPACECRAFT GATE"
    : nearby==="rocket"&&phase==="pad" ? "BOARD SPACECRAFT"
    : null;

  const restricted=phase==="room"&&nearby==="gate"&&!finished;
  const tipTitle=restricted ? "SPACECRAFT ACCESS RESTRICTED"
    : finished&&phase==="room" ? "MISSION READINESS VERIFIED"
    : phase==="pad" ? "PROCEED TO SPACECRAFT"
    : "MISSION GUIDANCE";
  const tipText=restricted ? `COMPLETE ALL EIGHT READINESS CHECKS · READINESS ${collected.size} / ${GEAR.length}`
    : finished&&phase==="room" ? "All equipment checks: GO. Objective: PROCEED TO SPACECRAFT. Walk to the hangar gate and press E."
    : toast;
  const hudVisible=phase==="room"||phase==="pad";

  function restart(){
    audioRef.current?.unlock();
    audioRef.current?.play("ui");
    cinematicLock.current=false;
    setBoardingArrived(false);
    setCollected(new Set());setPhase("room");setNearby(null);setInspecting(null);setToast("Find the eight mission essentials scattered around the preparation hangar.");
    player.current.set(0,0,SPAWN_Z);heading.current=Math.PI+FACING_OFFSET;moving.current=false;keys.current.clear();
  }

  return <div className="l1-root">
    <style>{uiCss}</style>
    {(phase==="room" || phase==="pad") && <div className="l1-audiobar">
      <button type="button" className="l1-audio" aria-label={musicOn ? "Turn music off" : "Turn music on"} aria-pressed={musicOn} onClick={toggleMusic}>
        <span aria-hidden="true">♪</span> MUSIC {musicOn ? "ON" : "OFF"}
      </button>
      <button type="button" className="l1-audio" aria-label={soundOn ? "Mute game sound" : "Enable game sound"} aria-pressed={soundOn} onClick={toggleSound}>
        <span aria-hidden="true">{soundOn ? "◖))" : "◖×"}</span> SOUND {soundOn ? "ON" : "OFF"}
      </button>
    </div>}
    {(phase==="room" || phase==="pad" || phase==="boarding") && (
      <div className="l1-canvas">
        <Canvas shadows frameloop="always" dpr={[1,1.65]} camera={{position:[2.4,2.9,12.7],fov:55,near:.1,far:250}} gl={{antialias:true,alpha:false,powerPreference:"high-performance"}}>
          <Suspense fallback={<Html center><div className="l1-world-label">LOADING MISSION ASSETS...</div></Html>}>
            <World phase={phase} collected={collected} paused={Boolean(inspecting)} player={player} heading={heading} moving={moving} keys={keys} onNear={onNear} onCharacterReport={setCharReport} onBoardingArrived={onBoardingArrived} />
          </Suspense>
        </Canvas>
      </div>
    )}

    {import.meta.env.DEV && <div className="l1-debug">{charReport}</div>}

    {hudVisible && <>
      <header className="l1-top">
        <div className="l1-brand l1-glass"><div className="l1-overline">MYSHA / EARTH MISSION CONTROL</div><div className="l1-title">LEVEL 01 · MISSION READINESS</div><div className="l1-sub">{phase==="room" ? "Equipment Preparation Hangar" : "Launch Vehicle Access Pad"}</div></div>
        <div className="l1-counter l1-glass"><strong>{String(collected.size).padStart(2,"0")} / {total}</strong><span>EQUIPMENT VERIFIED</span><div className="l1-progress"><i style={{width:`${collected.size/GEAR.length*100}%`}} /></div></div>
      </header>
      <aside className="l1-objectives l1-glass"><h3>FINAL MISSION CHECKLIST</h3>{GEAR.map(g=>{const done=collected.has(g.id);return <div className="l1-objective" key={g.id}><span className={`l1-check ${done?"done":""}`}>{done?"✓":"·"}</span><span className={`l1-name ${done?"done":""}`}>{g.name}</span><span className={`l1-status ${done?"go":""}`}>{done?"GO ✓":"NO-GO"}</span></div>;})}</aside>
      <footer className="l1-bottom">
        <div className={`l1-tip l1-glass ${restricted?"restricted":""}`} role="status"><b>{tipTitle}</b><p>{tipText}</p></div>
        {actionLabel && <button type="button" className="l1-action" onClick={interact}><kbd>E</kbd> {actionLabel} →</button>}
      </footer>
      <div className="l1-mobile-controls">
        <div className="l1-dpad">
          <span /><TouchKey code="KeyW" label="▲" buttons={keys} onStart={()=>audioRef.current?.unlock()}/><span />
          <TouchKey code="KeyA" label="◀" buttons={keys} onStart={()=>audioRef.current?.unlock()}/><TouchKey code="KeyS" label="▼" buttons={keys} onStart={()=>audioRef.current?.unlock()}/><TouchKey code="KeyD" label="▶" buttons={keys} onStart={()=>audioRef.current?.unlock()}/>
        </div>
        <button type="button" className="l1-touch big" onClick={interact}>E<br/>USE</button>
      </div>
    </>}

    {inspecting && <div className="l1-overlay" role="dialog" aria-modal="true" aria-label={`${inspecting.name} verified`}>
      <div className="l1-card">
        <span className="l1-badge">✓ EQUIPMENT VERIFIED · MOVEMENT PAUSED</span>
        <div className="l1-float-icon" aria-hidden="true">{ICONS[inspecting.id]}</div>
        <div className="l1-overline">{inspecting.label}</div>
        <h2>{inspecting.name}</h2>
        <div className="l1-overline" style={{marginBottom:6}}>WHAT IS IT?</div>
        <p aria-live="polite">{typed}<span style={{color:"#80e8ff"}}>▌</span></p>
        <div className="l1-reveal-row">
          <div className="l1-reveal"><strong>WHY DOES IT MATTER?</strong><span>{inspecting.why}</span></div>
          <div className="l1-reveal"><strong>WHEN IS IT USED?</strong><span>{inspecting.when}</span></div>
          <div className="l1-reveal fact" style={{gridColumn:"1 / -1"}}><strong>MISSION SCIENCE FACT</strong><span>{inspecting.fact}</span></div>
        </div>
        <p className="l1-source"><b>SOURCE / CONTEXT:</b> {inspecting.source}</p>
        <div className="l1-go">STATUS: GO</div>
        <button type="button" className="l1-continue" onClick={dismissEquipment} autoFocus>CONTINUE MISSION →</button>
      </div>
    </div>}

    {import.meta.env.DEV && (phase==="room" || phase==="pad") && (
      <div style={{ position: "absolute", zIndex: 35, left: 12, top: "44%", display: "flex", flexDirection: "column", gap: 9 }}>
        <button type="button" className="l1-dev-video" style={{position:"static"}} onClick={startDepartureCinematic}>
          ▶ TEST DEPARTURE VIDEO (DEV ONLY)
        </button>
        <button type="button" className="l1-dev-video" style={{position:"static"}} onClick={() => {
          moving.current = false;
          keys.current.clear();
          musicRef.current?.stop();
          setPhase("level2");
        }}>
          ▶ TEST LEVEL 2 (DEV ONLY)
        </button>
      </div>
    )}

    {phase==="boarding" && (
      <div className="l1-boarding-ui" role="status" aria-label="Mysha is boarding the spacecraft">
        <div className="l1-boarding-panel">
          <span className="l1-boarding-kicker">MISSION READINESS VERIFIED · 08 / 08 GO</span>
          <span className="l1-boarding-title">MYSHA IS BOARDING THE SPACECRAFT</span>
          <span className="l1-boarding-hint">Autonomous walk to the crew hatch · Departure cinematic follows</span>
          <span className="l1-boarding-dots" aria-hidden="true"><i/><i/><i/></span>
        </div>
      </div>
    )}
    {phase==="boarding" && boardingArrived && <div className="l1-boarding-fade" aria-hidden="true" />}

    {phase==="cinematic" && (
      <Level1DepartureCinematic playlists={DEPARTURE_PLAYLISTS} initialSoundOn={soundOn} onFinished={onCinematicFinished} />
    )}

    {phase==="complete" && <div className="l1-complete" role="status">
      <div className="l1-card" style={{textAlign:"center"}}>
        <span className="l1-badge">✓ ALL EIGHT READINESS CHECKS: GO</span>
        <h2 className="l1-title-reveal">LEVEL 1 COMPLETE</h2>
        <p>Mysha's journey to Mars has begun.</p>
        <div className="l1-overline">OPENING LEVEL 2…</div>
      </div>
    </div>}

    {phase==="level2" && <Level2Journey onReplayLevel1={restart} />}

  </div>;
}