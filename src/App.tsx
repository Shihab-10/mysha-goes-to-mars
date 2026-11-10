import { useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { GameShell } from "./app/GameShell";

type Screen = "intro" | "landing" | "story" | "level" | "game";
type Dialog = "learn" | "explore" | null;
type Target = "story" | "level" | "game";
type Veil = { kind: Target; phase: "in" | "out" } | null;

const ART = `${import.meta.env.BASE_URL}mysha-landing-clean.png`;
const VIDEO = `${import.meta.env.BASE_URL}videos/mysha-prologue.mp4`;
const DURATION = 8500;
const WARP_MS = 650;
const WARP_OUT_MS = 600;

const chapters = [
  {
    label: "01 / THE RED DOT",
    title: "One red light. One impossible dream.",
    narration:
      "Each night, Mysha sat by her window and watched a tiny red point in the sky. She wondered, 'What if someone could go there?'",
    fact: "Mars looks red because iron-rich dust covers much of its surface.",
  },
  {
    label: "02 / THE FIRST SEARCH",
    title: "Curiosity becomes a question.",
    narration:
      "She picked up her phone and started searching: How far away is Mars? How do spacecraft get there? How would people survive?",
    fact: "The distance from Earth to Mars varies as both planets orbit the Sun.",
  },
  {
    label: "03 / THE YEARS OF LEARNING",
    title: "Every discovery brings her closer.",
    narration:
      "Books, simulations, science lessons and years of training transformed a childhood dream into the knowledge needed for a mission.",
    fact: "Space missions depend on air, water, energy, communication and teamwork.",
  },
  {
    label: "04 / MISSION PREPARATION",
    title: "Today, that explorer is Mysha.",
    narration:
      "At the mission facility, Mysha begins a new chapter. First, she must verify oxygen, water and communications equipment. Your journey begins now.",
    fact: "Real missions use checklists to verify critical systems before operation.",
  },
];

const objectives = [
  { icon: "O₂", name: "Oxygen supply" },
  { icon: "H₂O", name: "Water system" },
  { icon: "COM", name: "Comms link" },
];

const delay = (seconds: number): CSSProperties =>
  ({ "--d": `${seconds}s` }) as CSSProperties;

/* Transition overlay styles. Kept separate so they can also be mounted
   on top of GameShell without applying the landing page's global resets. */
const warpCss = `
.mg-warp{position:fixed;inset:0;z-index:100;overflow:hidden;background:#020816;pointer-events:all}
.mg-warp-in{animation:mg-warp-in ${WARP_MS}ms cubic-bezier(.4,0,.8,.4) both}
.mg-warp-out{animation:mg-warp-out ${WARP_OUT_MS}ms ease-out both;pointer-events:none}
.mg-warp-streaks{
 position:absolute;left:50%;top:50%;width:260vmax;height:260vmax;
 margin:-130vmax 0 0 -130vmax;opacity:0;
 background:repeating-conic-gradient(from 0deg at 50% 50%,#ffd6a500 0deg 3deg,#ffd6a566 3.4deg 3.8deg,#ffd6a500 4.2deg 7.5deg);
 -webkit-mask-image:radial-gradient(circle,transparent 4%,#000 18%,transparent 62%);
 mask-image:radial-gradient(circle,transparent 4%,#000 18%,transparent 62%);
}
.mg-warp-game .mg-warp-streaks,.mg-warp-level .mg-warp-streaks{
 background:repeating-conic-gradient(from 0deg at 50% 50%,#9fe8ff00 0deg 3deg,#9fe8ff66 3.4deg 3.8deg,#9fe8ff00 4.2deg 7.5deg);
}
.mg-warp-flash{
 position:absolute;inset:0;opacity:.9;
 background:radial-gradient(circle at 50% 50%,#fff 0%,#ffe2bd 16%,#ff9a52aa 38%,transparent 70%);
}
.mg-warp-game .mg-warp-flash,.mg-warp-level .mg-warp-flash{
 background:radial-gradient(circle at 50% 50%,#fff 0%,#d4f6ff 16%,#4fc3eeaa 38%,transparent 70%);
}
.mg-warp-in .mg-warp-streaks{animation:mg-streak ${WARP_MS}ms ease-in both}
.mg-warp-in .mg-warp-flash{animation:mg-flash ${WARP_MS}ms ease-in both}
@keyframes mg-warp-in{from{opacity:0}35%{opacity:1}to{opacity:1}}
@keyframes mg-warp-out{from{opacity:1}to{opacity:0}}
@keyframes mg-streak{
 0%{opacity:0;transform:scale(.25)}
 45%{opacity:.9}
 100%{opacity:0;transform:scale(1)}
}
@keyframes mg-flash{
 0%,40%{opacity:0;transform:scale(.4)}
 100%{opacity:.9;transform:scale(1)}
}
@media(prefers-reduced-motion:reduce){
 .mg-warp,.mg-warp *{animation:none!important}
 .mg-warp{display:none}
}
`;

const css = `
*{box-sizing:border-box}
html,body,#root{width:100%!important;height:100%!important;margin:0!important;padding:0!important;max-width:none!important}
body{background:#020816;color:#fff;font-family:Inter,"Segoe UI",Arial,sans-serif;-webkit-tap-highlight-color:transparent}
button{font:inherit}
.mg-app{position:fixed;inset:0;isolation:isolate;overflow:hidden;background:#020816;color:#fff}
.mg-landing{position:absolute;inset:0;overflow:hidden;background:#020816;animation:mg-fadein .9s ease-out both}

/* ---------- Art stage: cover-scaled, image coordinate system ----------
   The stage keeps the ORIGINAL 1672:941 ratio and is at least as large as the
   viewport (cover). Every overlay inside it uses percentages of the stage,
   i.e. percentages of the original image, so they scale and crop together. */
.mg-artstage{
 position:absolute;
 left:50%;
 top:50%;
 width:max(100vw,calc(100vh * 1672 / 941));
 height:max(100vh,calc(100vw * 941 / 1672));
 width:max(100vw,calc(100dvh * 1672 / 941));
 height:max(100dvh,calc(100vw * 941 / 1672));
 transform:translate(-50%,-50%);
 animation:mg-reveal 1.2s ease-out both;
}

.mg-artstage>img{
 display:block;
 width:100%;
 height:100%;
 object-fit:fill;
 user-select:none;
 -webkit-user-drag:none;
}

/* decorative layers (never move the artwork itself) */
.mg-par{
 transform:translate3d(calc(var(--mg-px,0) * -7px),calc(var(--mg-py,0) * -5px),0);
 transition:transform .5s ease-out;
 will-change:transform;
}

.mg-sparkles{
 position:absolute;
 inset:0;
 pointer-events:none;
 opacity:.35;
 background-image:
 radial-gradient(1.5px 1.5px at 21% 17%,#fff 98%,transparent),
 radial-gradient(1px 1px at 78% 23%,#baf8ff 98%,transparent),
 radial-gradient(2px 2px at 68% 49%,#fff 98%,transparent),
 radial-gradient(1px 1px at 51% 75%,#c4e8ff 98%,transparent);
 background-size:370px 270px;
 animation:mg-sky 21s linear infinite;
 -webkit-mask-image:linear-gradient(180deg,#000 0%,#000 45%,transparent 94%);
 mask-image:linear-gradient(180deg,#000 0%,#000 45%,transparent 94%);
}

.mg-dust{
 position:absolute;
 inset:0;
 pointer-events:none;
 opacity:.45;
 background-image:
 radial-gradient(2px 2px at 14% 80%,#ffc48a 98%,transparent),
 radial-gradient(1.5px 1.5px at 62% 60%,#ffe2c4 98%,transparent),
 radial-gradient(2px 2px at 83% 90%,#ff9f68 98%,transparent),
 radial-gradient(1.5px 1.5px at 38% 35%,#a8ecff 98%,transparent);
 background-size:520px 420px;
 animation:mg-dust 34s linear infinite;
 -webkit-mask-image:linear-gradient(180deg,transparent 0%,#000 30%,#000 80%,transparent 100%);
 mask-image:linear-gradient(180deg,transparent 0%,#000 30%,#000 80%,transparent 100%);
}

.mg-sheen{
 position:absolute;
 inset:0;
 pointer-events:none;
 background:linear-gradient(108deg,transparent 24%,#b4edff0a 42%,#ffd19c16 50%,transparent 59%);
 transform:translateX(-110%);
 animation:mg-sweep 12s ease-in-out infinite;
}

.mg-marslight{
 position:absolute;
 right:1%;
 top:9%;
 width:20%;
 height:35%;
 pointer-events:none;
 border-radius:50%;
 box-shadow:0 0 85px 10px #ff855821;
 animation:mg-pulse 7s ease-in-out infinite;
}

.mg-myshalight{
 position:absolute;
 left:3%;
 top:18%;
 width:30%;
 height:70%;
 pointer-events:none;
 border-radius:50%;
 background:radial-gradient(ellipse at 50% 45%,#9fe6ff22,transparent 68%);
 mix-blend-mode:screen;
 opacity:0;
 animation:mg-glowin 2.2s .5s ease-out forwards,mg-breathe 8s 2.7s ease-in-out infinite;
}

.mg-engine{
 position:absolute;
 left:93%;
 top:56%;
 width:2%;
 height:5%;
 pointer-events:none;
 border-radius:50%;
 background:#ffd9a114;
 filter:blur(11px);
 animation:mg-flame .65s ease-in-out infinite alternate;
}

/* ---------- Hover effects for image-based buttons ----------
   Keep the click targets unchanged. All light stays INSIDE the target:
   no outer border, no box-shadow and no scaling on hover. */
.mg-hit{
 position:absolute;
 z-index:3;
 border:0;
 border-radius:999px;
 padding:0;
 margin:0;
 background:transparent;
 color:transparent;
 cursor:pointer;
 outline:none;
 overflow:hidden;
 isolation:isolate;
 -webkit-tap-highlight-color:transparent;
 -webkit-appearance:none;
 appearance:none;
}

.mg-hit::before,.mg-hit::after{
 content:"";
 position:absolute;
 border-radius:inherit;
 pointer-events:none;
}

.mg-hit::before{
 inset:13% 7%;
 opacity:0;
 background:radial-gradient(ellipse at center,#ffffff13 0%,#ffffff06 48%,transparent 78%);
 transition:opacity .28s ease;
}

.mg-hit::after{
 inset:17% 11%;
 opacity:0;
 background:linear-gradient(105deg,transparent 27%,#ffffff2b 48%,transparent 69%);
 background-size:250% 100%;
 background-position:150% 0;
 transition:opacity .22s ease;
}

.mg-hit-nav::before{background:radial-gradient(ellipse,#8fe8ff19,transparent 76%)}
.mg-hit-play::before{background:radial-gradient(ellipse,#fff5ce22,transparent 80%)}
.mg-hit-skip::before{background:radial-gradient(ellipse,#a8ecff17,transparent 78%)}

@media(hover:hover){
 .mg-hit-nav:hover::before,.mg-hit-play:hover::before,.mg-hit-skip:hover::before{opacity:1}
 .mg-hit:hover::after{opacity:1;animation:mg-btnsweep .85s ease-out both}
}

/* Keyboard users still get a clear focus indication, INSIDE the button. */
.mg-hit:focus-visible{outline:2px solid #e6f9ff;outline-offset:-4px}
.mg-hit:focus-visible::before{opacity:1}
.mg-hit:active::before{opacity:1;filter:brightness(1.2)}

/* Positions are percentages of the ORIGINAL 1672x941 image.
   Open the page with ?hitdebug=1 to see them and fine-tune. */
.mg-hit-learn{left:68.4%;top:2.1%;width:9.5%;height:5.6%}
.mg-hit-navplay{left:79.3%;top:2.1%;width:8.7%;height:5.6%}
.mg-hit-explore{left:88.8%;top:2.1%;width:10%;height:5.6%}
.mg-hit-play{left:36.8%;top:66.9%;width:34.3%;height:10.5%}
.mg-hit-skip{left:45.5%;top:79.1%;width:17.1%;height:6.1%}

.mg-debug .mg-hit{outline:1px dashed #ff3b6b;background:#ff3b6b22;color:#fff}

/* ---------- Ultrawide HTML nav (baked nav is cropped away) ---------- */
.mg-wide-nav{
 display:none;
 position:absolute;
 top:0;
 left:0;
 right:0;
 z-index:6;
 justify-content:space-between;
 align-items:center;
 gap:12px;
 padding:13px clamp(18px,3vw,60px);
 background:linear-gradient(180deg,#040e24f2,#040e2490 75%,transparent);
}

.mg-wide-brand{
 font-size:clamp(11px,1.2vw,18px);
 letter-spacing:.13em;
 font-weight:800;
 color:#9ddcf4;
}

.mg-navgroup{display:flex;gap:8px}

.mg-navgroup button,.mg-outline{
 position:relative;
 background:#071b32d9;
 border:1px solid #85bcd58c;
 color:#edfaff;
 border-radius:999px;
 padding:11px 18px;
 cursor:pointer;
 transition:background .2s,box-shadow .25s,border-color .25s,transform .15s;
}

.mg-navgroup button:hover,.mg-outline:hover{
 background:#12395a;
 border-color:#b9ecff;
 box-shadow:0 0 18px #5fdcff55;
}

.mg-navgroup button:active,.mg-outline:active{transform:scale(.97)}

.mg-navgroup button:focus-visible,.mg-outline:focus-visible,.mg-primary:focus-visible{
 outline:2px solid #e6f9ff;
 outline-offset:3px;
}

.mg-arrow{display:inline-block;transition:transform .25s ease}
.mg-outline:hover .mg-arrow,.mg-primary:hover .mg-arrow{transform:translateX(4px)}

.mg-mobile{display:none}

/* ---------- Intro ---------- */
.mg-intro{
 position:absolute;
 inset:0;
 display:flex;
 flex-direction:column;
 align-items:center;
 justify-content:center;
 text-align:center;
 gap:15px;
 padding:24px;
 background:radial-gradient(circle at 50% 44%,#1b4771,#07172d 50%,#020816 84%);
}

.mg-intro-ring{
 position:relative;
 display:grid;
 place-items:center;
 width:150px;
 height:150px;
 border:2px solid #91e9fb;
 border-radius:50%;
 font-size:75px;
 font-weight:900;
 color:#d6faff;
 text-shadow:0 0 30px #74cbe9;
 box-shadow:0 0 85px #38b3eb64;
 animation:mg-pulse 3s ease-in-out infinite;
}

.mg-intro-ring:after{
 content:"";
 position:absolute;
 inset:-20px;
 border-radius:50%;
 border:1px dashed #9ee9fd90;
 animation:mg-spin 15s linear infinite;
}

.mg-intro h1{font-size:clamp(27px,5vw,62px);letter-spacing:.12em;margin:24px 0 0}
.mg-intro p{font-size:clamp(10px,1.4vw,15px);letter-spacing:.22em;color:#aacbdc;margin:0}

.mg-topright{position:absolute;right:clamp(15px,3vw,45px);top:23px;z-index:8}

/* ---------- Text story (fallback) ---------- */
.mg-story{
 position:absolute;
 inset:0;
 display:grid;
 place-items:center;
 padding:75px 20px 60px;
 background:radial-gradient(ellipse at 75% 28%,#52303d,#071b34 55%,#020916);
 animation:mg-fadein .7s ease-out both;
}

.mg-story-bg{
 position:absolute;
 inset:0;
 filter:blur(16px) brightness(.3);
 transform:scale(1.07);
 background-size:cover;
 background-position:center;
 opacity:.7;
}

.mg-story-card{
 position:relative;
 z-index:2;
 width:min(790px,100%);
 border:1px solid #8de9ff69;
 border-radius:24px;
 padding:clamp(24px,5vw,64px);
 background:#081b34d9;
 box-shadow:0 30px 100px #0009;
 backdrop-filter:blur(14px);
 animation:mg-rise .65s ease both;
}

.mg-chapter{font-size:12px;font-weight:800;letter-spacing:.2em;color:#94e9ff}
.mg-story-card h2{font-size:clamp(32px,5vw,64px);line-height:1.08;letter-spacing:-.04em;margin:18px 0}
.mg-story-card p{font-size:clamp(15px,1.4vw,19px);line-height:1.8;color:#d1e6f3}

.mg-fact{
 border-left:3px solid #91e7ff;
 background:#17456269;
 padding:12px 16px;
 color:#b5f0fc;
 font-size:13px;
 line-height:1.6;
}

.mg-primary{
 position:relative;
 overflow:hidden;
 border:1px solid #ffd6a5;
 border-radius:999px;
 background:linear-gradient(90deg,#ff9942,#ff5940);
 color:#fff;
 font-weight:800;
 letter-spacing:.09em;
 padding:16px 26px;
 cursor:pointer;
 box-shadow:0 0 31px #ff854b75;
 transition:transform .15s,filter .2s,box-shadow .25s;
}

.mg-primary::after{
 content:"";
 position:absolute;
 inset:0;
 border-radius:inherit;
 pointer-events:none;
 background:linear-gradient(105deg,transparent 35%,#ffffff55 50%,transparent 65%);
 background-size:250% 100%;
 background-position:150% 0;
}

.mg-primary:hover{filter:brightness(1.08);box-shadow:0 0 42px #ff9a5fa0}
.mg-primary:hover::after{animation:mg-btnsweep 1.1s ease-out both}
.mg-primary:active{transform:scale(.97)}

.mg-story-actions{display:flex;justify-content:flex-end;margin-top:26px}

.mg-progress{position:absolute;z-index:3;bottom:27px;left:8%;right:8%;display:flex;gap:8px}
.mg-progress span{flex:1;height:4px;background:#ffffff3f;border-radius:5px;overflow:hidden}
.mg-progress .done{background:#9feafb}
.mg-progress .current:after{
 content:"";
 display:block;
 height:100%;
 background:#ff9865;
 animation:mg-progress 8.5s linear both;
 transform-origin:left;
}

/* ---------- Dialogs ---------- */
.mg-overlay{
 position:fixed;
 inset:0;
 z-index:50;
 display:grid;
 place-items:center;
 padding:20px;
 background:#020914bb;
 backdrop-filter:blur(9px);
 animation:mg-fadein .25s ease-out both;
}

.mg-dialog{
 width:min(500px,100%);
 max-height:85vh;
 max-height:85dvh;
 overflow-y:auto;
 padding:clamp(22px,4vw,35px);
 border:1px solid #83d4ee8c;
 border-radius:23px;
 color:#e6f5ff;
 background:linear-gradient(135deg,#113452,#07182c);
 box-shadow:0 20px 80px #000b;
 animation:mg-rise .35s ease both;
}

.mg-dialog h2{color:#9deaff;margin:0 0 16px}
.mg-dialog li{line-height:1.6;margin:10px 0}
.mg-dialog small{display:block;line-height:1.5;color:#a6bfd0;margin:20px 0}

.mg-missing{
 position:absolute;
 inset:0;
 display:grid;
 place-items:center;
 background:#081c32;
 color:#ffcbab;
 text-align:center;
 padding:20px;
 z-index:10;
}

/* ================= IN-GAME CUTSCENE (looks like part of the game) =================
   No timer, no progress bar, no media controls, no right-click menu.
   Only game-style HUD: mission tag, skip prompt and an audio toggle. */
.mg-cinema{
 position:absolute;
 inset:0;
 isolation:isolate;
 overflow:hidden;
 background:#020713;
 animation:mg-fadein .6s ease both;
 -webkit-touch-callout:none;
 user-select:none;
}

.mg-cinema-backdrop{
 position:absolute;
 inset:-6%;
 z-index:0;
 background-size:cover;
 background-position:center;
 filter:blur(26px) brightness(.32) saturate(1.2);
}

.mg-cinema-stars{
 position:absolute;
 inset:0;
 z-index:0;
 pointer-events:none;
 opacity:.25;
 background-image:radial-gradient(1px 1px at 20% 30%,white 98%,transparent),radial-gradient(1px 1px at 80% 65%,#b2ebff 98%,transparent);
 background-size:360px 270px;
}

.mg-cinema-video{
 position:absolute;
 inset:0;
 z-index:1;
 width:100%;
 height:100%;
 display:block;
 object-fit:contain;
 object-position:center;
 pointer-events:none;
 animation:mg-cam 18s ease-in-out infinite alternate;
 will-change:transform;
}
.mg-cinema-video::-webkit-media-controls,
.mg-cinema-video::-webkit-media-controls-enclosure,
.mg-cinema-video::-webkit-media-controls-panel,
.mg-cinema-video::-webkit-media-controls-start-playback-button{display:none!important;-webkit-appearance:none}

.mg-cinema-scan{
 position:absolute;
 inset:0;
 z-index:2;
 pointer-events:none;
 opacity:.55;
 background:repeating-linear-gradient(0deg,#00000000 0 2px,#0000001a 2px 3px);
}

.mg-cinema-vignette{
 position:absolute;
 inset:0;
 z-index:2;
 pointer-events:none;
 background:
  radial-gradient(ellipse at 50% 50%,transparent 58%,#020713aa 100%),
  linear-gradient(180deg,#020918ac,transparent 18%,transparent 72%,#020918d0);
}

.mg-hud-frame{
 position:absolute;
 z-index:4;
 pointer-events:none;
 left:clamp(12px,2.2vw,32px);
 right:clamp(12px,2.2vw,32px);
 top:calc(88px + env(safe-area-inset-top,0px));
 bottom:calc(98px + env(safe-area-inset-bottom,0px));
}

.mg-hud-frame i{
 position:absolute;
 width:clamp(18px,2.6vw,34px);
 height:clamp(18px,2.6vw,34px);
 border:0 solid #8fe8ffaa;
 animation:mg-hudin .9s .4s ease both;
}
.mg-hud-frame i:nth-child(1){left:0;top:0;border-width:2px 0 0 2px}
.mg-hud-frame i:nth-child(2){right:0;top:0;border-width:2px 2px 0 0}
.mg-hud-frame i:nth-child(3){left:0;bottom:0;border-width:0 0 2px 2px}
.mg-hud-frame i:nth-child(4){right:0;bottom:0;border-width:0 2px 2px 0}

.mg-cinema-top{
 position:absolute;
 top:0;left:0;right:0;
 z-index:5;
 display:flex;
 justify-content:space-between;
 align-items:flex-start;
 gap:14px;
 padding:calc(18px + env(safe-area-inset-top,0px)) clamp(16px,3.2vw,48px) 22px;
 background:linear-gradient(180deg,#020713d9,transparent);
 animation:mg-hudtop .8s .2s cubic-bezier(.2,.8,.2,1) both;
}

.mg-cinema-id{display:flex;flex-direction:column;gap:8px;min-width:0}

.mg-cinema-brand{
 color:#c9f2ff;
 font-weight:900;
 letter-spacing:.17em;
 font-size:clamp(11px,1.2vw,17px);
 text-shadow:0 2px 20px #020713;
}

.mg-cinema-chip{
 display:inline-flex;
 align-items:center;
 gap:8px;
 width:fit-content;
 padding:5px 11px;
 border:1px solid #8fe8ff55;
 border-radius:999px;
 background:#06203870;
 color:#9deaff;
 font-size:10px;
 font-weight:800;
 letter-spacing:.18em;
 backdrop-filter:blur(8px);
}

.mg-cinema-chip i{
 width:7px;
 height:7px;
 border-radius:50%;
 background:#ff7a4a;
 box-shadow:0 0 10px #ff7a4a;
 animation:mg-blink 1.4s ease-in-out infinite;
}

.mg-cinema-tools{display:flex;gap:8px;justify-content:flex-end}

.mg-cinema-button{
 appearance:none;
 display:inline-flex;
 align-items:center;
 justify-content:center;
 gap:8px;
 border:1px solid #9deaff96;
 border-radius:999px;
 background:#061c32e8;
 color:#f5fcff;
 cursor:pointer;
 padding:12px 19px;
 min-height:44px;
 letter-spacing:.06em;
 font-weight:700;
 font-size:12px;
 backdrop-filter:blur(10px);
 transition:background .2s,border-color .2s,box-shadow .25s,transform .15s;
}
.mg-cinema-button:hover{background:#195174eb;border-color:#e1faff;box-shadow:0 0 18px #5fdcff55}
.mg-cinema-button:active{transform:scale(.96)}
.mg-cinema-button:focus-visible{outline:2px solid #fff;outline-offset:3px}

.mg-cinema-bottom{
 position:absolute;
 left:0;right:0;bottom:0;
 z-index:5;
 display:flex;
 justify-content:space-between;
 align-items:flex-end;
 gap:18px;
 padding:44px clamp(16px,3.2vw,48px) calc(24px + env(safe-area-inset-bottom,0px));
 background:linear-gradient(0deg,#020713e6,transparent);
 animation:mg-hudbot .8s .3s cubic-bezier(.2,.8,.2,1) both;
}

.mg-cinema-copy{display:flex;flex-direction:column;gap:5px;min-width:0}
.mg-cinema-eyebrow{color:#95eaff;font-size:11px;font-weight:800;letter-spacing:.2em}
.mg-cinema-title{font-size:clamp(17px,2.8vw,35px);font-weight:800;line-height:1.12;text-shadow:0 2px 20px #000}

.mg-cinema-hint{
 flex:none;
 display:inline-flex;
 align-items:center;
 gap:10px;
 font-size:11px;
 font-weight:800;
 letter-spacing:.18em;
 color:#a9dff0;
}
.mg-cinema-hint kbd{
 font-family:inherit;
 padding:4px 9px;
 border:1px solid #8fe8ff77;
 border-radius:7px;
 background:#06203880;
 color:#d6faff;
}

.mg-cinema-load{
 position:absolute;
 left:50%;top:50%;
 z-index:4;
 width:54px;height:54px;
 margin:-27px 0 0 -27px;
 border-radius:50%;
 border:3px solid #8fe8ff33;
 border-top-color:#8fe8ff;
 pointer-events:none;
 animation:mg-spin .9s linear infinite;
}

.mg-cinema-alert{
 position:absolute;
 inset:0;
 z-index:8;
 display:grid;
 place-items:center;
 padding:25px;
 background:#020918c9;
 backdrop-filter:blur(10px);
}

.mg-cinema-alert-card{
 width:min(460px,100%);
 border:1px solid #88d9ef91;
 border-radius:22px;
 padding:clamp(22px,4vw,36px);
 background:#081d35ef;
 text-align:center;
 box-shadow:0 20px 65px #0009;
 animation:mg-rise .4s ease both;
}
.mg-cinema-alert-card h2{font-size:clamp(21px,4vw,32px);margin:0 0 12px}
.mg-cinema-alert-card p{color:#c9deec;line-height:1.6}
.mg-cinema-alert-card .mg-cinema-button{margin:7px}

/* ================= LEVEL 1 BRIEFING ================= */
.mg-lv{
 position:absolute;
 inset:0;
 isolation:isolate;
 overflow:hidden;
 background:
  radial-gradient(ellipse at 18% 80%,#1d6fa03d,transparent 55%),
  radial-gradient(ellipse at 50% 38%,#16466e 0%,#07172d 55%,#020816 100%);
 animation:mg-fadein .6s ease both;
}

.mg-lv::after{
 content:"";
 position:absolute;
 inset:0;
 z-index:1;
 pointer-events:none;
 background:radial-gradient(ellipse at 50% 50%,transparent 55%,#020816cc 100%);
}

.mg-lv-bg{
 position:absolute;
 inset:-4%;
 background-size:cover;
 background-position:center;
 filter:blur(18px) brightness(.28) saturate(1.2);
 opacity:.85;
 animation:mg-lvzoom 24s ease-in-out infinite alternate;
}

.mg-lv-marsglow{
 position:absolute;
 right:-12vmax;
 top:-10vmax;
 width:46vmax;
 height:46vmax;
 border-radius:50%;
 pointer-events:none;
 background:radial-gradient(circle,#ff7a4a40 0%,#ff7a4a12 45%,transparent 70%);
 animation:mg-breathe 7s ease-in-out infinite;
}

.mg-lv-grid{
 position:absolute;
 left:-20%;
 right:-20%;
 bottom:-2%;
 height:42%;
 pointer-events:none;
 background-image:
  linear-gradient(#6fd6f31f 1px,transparent 1px),
  linear-gradient(90deg,#6fd6f31f 1px,transparent 1px);
 background-size:56px 56px;
 transform:perspective(520px) rotateX(62deg);
 transform-origin:50% 100%;
 -webkit-mask-image:linear-gradient(0deg,#000,transparent 85%);
 mask-image:linear-gradient(0deg,#000,transparent 85%);
 animation:mg-gridmove 6s linear infinite;
}

.mg-lv-scan{
 position:absolute;
 left:0;right:0;
 top:-25%;
 height:22%;
 pointer-events:none;
 background:linear-gradient(180deg,transparent,#8fe8ff10 50%,transparent);
 animation:mg-scanline 7s linear infinite;
}

.mg-lv-scroll{
 position:absolute;
 inset:0;
 z-index:2;
 display:flex;
 overflow-x:hidden;
 overflow-y:auto;
 padding:calc(24px + env(safe-area-inset-top,0px)) 20px calc(24px + env(safe-area-inset-bottom,0px));
 -webkit-overflow-scrolling:touch;
}

.mg-lv-inner{
 margin:auto;
 width:min(880px,100%);
 display:flex;
 flex-direction:column;
 align-items:center;
 text-align:center;
 gap:clamp(12px,2.2vh,22px);
}

.mg-lv-inner>*{
 animation:mg-lvin .8s cubic-bezier(.2,.8,.2,1) both;
 animation-delay:var(--d,0s);
}

.mg-lv-eyebrow{
 display:inline-flex;
 align-items:center;
 gap:12px;
 color:#95eaff;
 font-size:12px;
 font-weight:800;
 letter-spacing:.26em;
}
.mg-lv-eyebrow::before,.mg-lv-eyebrow::after{
 content:"";
 width:clamp(18px,6vw,56px);
 height:1px;
 background:linear-gradient(90deg,transparent,#95eaff);
}
.mg-lv-eyebrow::after{transform:scaleX(-1)}

.mg-lv-badge{
 position:relative;
 display:grid;
 place-items:center;
 width:clamp(110px,19vh,170px);
 aspect-ratio:1;
 border-radius:50%;
 border:2px solid #8fe6ff;
 background:radial-gradient(circle at 50% 38%,#1d5a86 0%,#0a2540 62%,#06162b 100%);
 box-shadow:0 0 0 6px #6cd2f61a,inset 0 0 30px #5fd0f533;
}
.mg-lv-badge::before{
 content:"";
 position:absolute;
 inset:-10px;
 border-radius:50%;
 box-shadow:0 0 50px #38b3eb55;
 animation:mg-pulse 3.2s ease-in-out infinite;
}

.mg-lv-ring,.mg-lv-ring2{display:block;position:absolute;border-radius:50%;pointer-events:none}
.mg-lv-ring{inset:-16px;border:1px dashed #9ee9fd99;animation:mg-spin 18s linear infinite}
.mg-lv-ring2{
 inset:-30px;
 border:1px solid #ff9a5a44;
 border-top-color:#ffb27a;
 animation:mg-spin 9s linear infinite reverse;
}

.mg-lv-badge-in{display:flex;flex-direction:column;align-items:center;line-height:1}
.mg-lv-badge-in small{font-size:11px;font-weight:800;letter-spacing:.34em;color:#8fdcf5;margin-bottom:4px}
.mg-lv-badge-in strong{
 font-size:clamp(44px,8vh,76px);
 font-weight:900;
 background:linear-gradient(180deg,#fff,#9fdcf2 70%,#5fb4d6);
 -webkit-background-clip:text;
 background-clip:text;
 color:transparent;
 -webkit-text-fill-color:transparent;
}

.mg-lv-title{
 margin:0;
 font-size:clamp(30px,6.2vw,72px);
 line-height:1.02;
 font-weight:900;
 letter-spacing:-.03em;
 text-shadow:0 6px 40px #000a;
}
.mg-lv-title span{
 display:inline-block;
 background:linear-gradient(90deg,#ffb36b,#ff6a3d);
 -webkit-background-clip:text;
 background-clip:text;
 color:transparent;
 -webkit-text-fill-color:transparent;
 filter:drop-shadow(0 0 22px #ff7a4a66);
}

.mg-lv-sub{
 margin:0;
 max-width:580px;
 font-size:clamp(14px,1.5vw,17px);
 line-height:1.6;
 color:#c1d9e8;
}

.mg-lv-objs{
 display:grid;
 grid-template-columns:repeat(3,1fr);
 gap:12px;
 width:100%;
 margin:0;
 padding:0;
 list-style:none;
}

.mg-lv-objs li{
 display:flex;
 align-items:center;
 gap:12px;
 padding:12px 14px;
 text-align:left;
 border:1px solid #5fb7d455;
 border-radius:16px;
 background:linear-gradient(135deg,#0d2c48cc,#08182ccc);
 backdrop-filter:blur(8px);
 animation:mg-lvin .7s cubic-bezier(.2,.8,.2,1) both;
 animation-delay:var(--d,0s);
}

.mg-lv-objs b{
 display:grid;
 place-items:center;
 flex:none;
 min-width:46px;
 height:46px;
 border-radius:12px;
 border:1px solid #7fd8f188;
 background:#12486e;
 color:#bff1ff;
 font-size:13px;
 font-weight:900;
 letter-spacing:.04em;
}

.mg-lv-objs div{display:flex;flex-direction:column;gap:4px;min-width:0}
.mg-lv-objs strong{font-size:14px;color:#e6f5ff;line-height:1.25}
.mg-lv-objs em{
 display:inline-flex;
 align-items:center;
 gap:7px;
 font-style:normal;
 font-size:10px;
 font-weight:800;
 letter-spacing:.16em;
 color:#ffc58a;
}
.mg-lv-objs em::before{
 content:"";
 width:6px;
 height:6px;
 border-radius:50%;
 background:#ffb066;
 box-shadow:0 0 8px #ffb066;
 animation:mg-blink 1.6s ease-in-out infinite;
}

.mg-lv-actions{
 display:flex;
 flex-wrap:wrap;
 align-items:center;
 justify-content:center;
 gap:12px;
 width:100%;
}

.mg-lv-start{
 font-size:clamp(15px,1.8vw,19px);
 padding:18px 38px;
 min-height:58px;
 min-width:min(380px,100%);
 animation:mg-lvglow 2.6s ease-in-out infinite;
}
.mg-lv-start::after{animation:mg-lvsweep 3.8s ease-in-out 1.2s infinite}
.mg-lv-start:hover{animation-play-state:paused}

.mg-lv-actions .mg-outline{min-height:52px;padding:14px 24px;letter-spacing:.06em;font-size:13px}

.mg-lv-hint{font-size:11px;letter-spacing:.2em;color:#7fa6bd}

/* ---------- Keyframes ---------- */
@keyframes mg-fadein{from{opacity:0}to{opacity:1}}
@keyframes mg-reveal{
 from{opacity:.4;transform:translate(-50%,-50%) scale(1.035)}
 to{opacity:1;transform:translate(-50%,-50%) scale(1)}
}
@keyframes mg-sky{50%{opacity:.7}to{background-position:90px 45px;opacity:.35}}
@keyframes mg-dust{to{background-position:60px -420px}}
@keyframes mg-sweep{0%,25%{transform:translateX(-110%)}58%,100%{transform:translateX(110%)}}
@keyframes mg-pulse{50%{box-shadow:0 0 95px 15px #ff995a3d}}
@keyframes mg-glowin{to{opacity:1}}
@keyframes mg-breathe{0%,100%{opacity:1}50%{opacity:.55}}
@keyframes mg-flame{to{opacity:.35;transform:scale(1.18)}}
@keyframes mg-spin{to{transform:rotate(360deg)}}
@keyframes mg-rise{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}
@keyframes mg-progress{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes mg-btnsweep{from{background-position:150% 0}to{background-position:-50% 0}}
@keyframes mg-portrait{
 from{opacity:.5;transform:scale(1.05)}
 to{opacity:1;transform:scale(1)}
}
@keyframes mg-cam{from{transform:scale(1)}to{transform:scale(1.025)}}
@keyframes mg-hudin{from{opacity:0;transform:scale(1.3)}to{opacity:1;transform:none}}
@keyframes mg-hudtop{from{opacity:0;transform:translateY(-16px)}to{opacity:1;transform:none}}
@keyframes mg-hudbot{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
@keyframes mg-blink{50%{opacity:.25}}
@keyframes mg-lvzoom{to{transform:scale(1.08)}}
@keyframes mg-lvin{
 from{opacity:0;transform:translateY(22px) scale(.98);filter:blur(6px)}
 to{opacity:1;transform:none;filter:blur(0)}
}
@keyframes mg-lvglow{50%{box-shadow:0 0 58px 6px #ff9a5fb0}}
@keyframes mg-lvsweep{0%,55%{background-position:150% 0}100%{background-position:-50% 0}}
@keyframes mg-gridmove{to{background-position:0 56px,0 0}}
@keyframes mg-scanline{to{transform:translateY(570%)}}

/* ---------- Ultrawide: baked nav is cropped, show HTML nav ---------- */
@media(min-aspect-ratio:215/100) and (min-width:821px){
 .mg-wide-nav{display:flex}
 .mg-hit-learn,.mg-hit-navplay,.mg-hit-explore{display:none}
}

/* ---------- Mobile / portrait: dedicated layout ---------- */
@media(max-width:820px),(max-aspect-ratio:4/5){
 .mg-artstage,.mg-wide-nav{display:none}

 .mg-landing{overflow-y:auto;overflow-x:hidden;background:#061326}

 .mg-mobile{
  display:flex;
  position:relative;
  flex-direction:column;
  min-height:100vh;
  min-height:100dvh;
  width:100%;
  color:#fff;
 }

 .mg-mobile-head{
  position:absolute;
  top:0;
  left:0;
  right:0;
  z-index:5;
  display:flex;
  justify-content:space-between;
  align-items:center;
  gap:12px;
  padding:calc(14px + env(safe-area-inset-top,0px)) 18px 14px;
  background:linear-gradient(#031125e6,#03112599 70%,transparent);
 }

 .mg-mobile-head strong{color:#b5edff;font-size:13px;letter-spacing:.14em}

 .mg-mobile-head .mg-outline{
  font-size:12px;
  letter-spacing:.08em;
  min-height:44px;
  padding:10px 16px;
 }

 /* Hero: shows ONLY the left part of the poster (Mysha, head to toe).
    --mg-region is the fraction of the poster's width that is kept (0.45 =
    left 45%). The baked-in nav, Learn/Play text and buttons are all to the
    right of that, so they are cut away. If a sliver of baked text shows,
    lower it (e.g. .42); if Mysha's arm is cut, raise it (e.g. .48). */
 .mg-mobile-hero{
  --mg-region:.45;
  position:relative;
  display:flex;
  justify-content:center;
  align-items:flex-end;
  padding-top:calc(58px + env(safe-area-inset-top,0px));
  overflow:hidden;
  background:
   radial-gradient(ellipse at 78% 35%,#ff7a4a2e,transparent 62%),
   radial-gradient(ellipse at 18% 40%,#2a6fa933,transparent 60%),
   #06162d;
 }

 .mg-mobile-portrait{
  position:relative;
  flex:none;
  width:min(100%,520px,calc(62vh * 1672 * var(--mg-region) / 941));
  aspect-ratio:calc(1672 * var(--mg-region) / 941);
  background-size:calc(100% / var(--mg-region)) 100%;
  background-position:left top;
  background-repeat:no-repeat;
  transform-origin:50% 100%;
  animation:mg-portrait 1.2s ease-out both;
  -webkit-mask-image:linear-gradient(90deg,transparent 0,#000 10%,#000 76%,transparent 100%);
  mask-image:linear-gradient(90deg,transparent 0,#000 10%,#000 76%,transparent 100%);
 }

 @supports (height:100dvh){
  .mg-mobile-portrait{
   width:min(100%,520px,calc(62dvh * 1672 * var(--mg-region) / 941));
  }
 }

 .mg-mobile-hero:after{
  content:"";
  position:absolute;
  inset:0;
  pointer-events:none;
  background:
   linear-gradient(0deg,#061326 2%,#06132600 42%),
   linear-gradient(180deg,#03112599,transparent 20%);
 }

 .mg-mobile-glow{
  position:absolute;
  inset:0;
  z-index:1;
  pointer-events:none;
  background:linear-gradient(100deg,transparent 25%,#8de8ff0c 50%,transparent 65%);
  animation:mg-sweep 11s ease-in-out infinite;
 }

 .mg-mobile-hero .mg-sparkles,.mg-mobile-hero .mg-dust{z-index:1}

 .mg-mobile-content{
  position:relative;
  z-index:2;
  flex:1;
  display:flex;
  flex-direction:column;
  align-items:center;
  gap:16px;
  text-align:center;
  padding:0 20px calc(38px + env(safe-area-inset-bottom,0px));
  margin-top:-34px;
  animation:mg-rise .8s .2s ease both;
 }

 .mg-mobile-content h1{
  margin:0;
  font-size:clamp(34px,9vw,58px);
  line-height:1.04;
  letter-spacing:-.04em;
  text-shadow:0 4px 25px #000a;
 }

 .mg-mobile-content h1 span{color:#ff9d6a}

 .mg-mobile-content p{max-width:510px;margin:0;font-size:15px;line-height:1.65;color:#c1d9e8}

 .mg-mobile-points{display:flex;flex-wrap:wrap;justify-content:center;gap:10px}

 .mg-mobile-points span{
  padding:8px 14px;
  border:1px solid #5fb7d455;
  border-radius:999px;
  background:#0a2a4466;
  font-size:12px;
  letter-spacing:.12em;
  color:#8ee6fa;
 }

 .mg-mobile-content .mg-primary,
 .mg-mobile-content .mg-outline{
  width:min(410px,100%);
  min-height:52px;
 }

 .mg-mobile-content .mg-primary{min-height:58px;font-size:16px}

 .mg-story-card{max-height:calc(100vh - 170px);max-height:calc(100dvh - 170px);overflow:auto}
}

/* ---------- Cutscene + Level 1: small screens ---------- */
@media(max-width:700px){
 .mg-sm-hide{display:none}
 .mg-cinema-top{padding-bottom:18px}
 .mg-cinema-brand{max-width:150px;font-size:11px;line-height:1.5}
 .mg-cinema-button{padding:10px 14px;font-size:11px}
 .mg-hud-frame{top:calc(92px + env(safe-area-inset-top,0px));bottom:calc(92px + env(safe-area-inset-bottom,0px))}
 .mg-cinema-title{font-size:17px}
 .mg-lv-objs{grid-template-columns:1fr}
 .mg-lv-start{width:100%}
 .mg-lv-actions .mg-outline{width:100%}
 .mg-lv-eyebrow{font-size:10px;letter-spacing:.2em}
}

/* Short landscape screens (phones turned sideways) */
@media(max-height:620px){
 .mg-lv-sub,.mg-lv-hint{display:none}
 .mg-lv-badge{width:84px}
 .mg-lv-ring{inset:-10px}
 .mg-lv-ring2{inset:-18px}
 .mg-lv-badge-in strong{font-size:34px}
 .mg-lv-badge-in small{font-size:9px}
 .mg-lv-title{font-size:clamp(24px,5vw,40px)}
 .mg-lv-inner{gap:10px}
 .mg-lv-objs li{padding:8px 10px}
 .mg-lv-objs b{min-width:38px;height:38px}
 .mg-lv-start{padding:12px 28px;min-height:48px}
 .mg-hud-frame{top:calc(70px + env(safe-area-inset-top,0px));bottom:calc(76px + env(safe-area-inset-bottom,0px))}
 .mg-cinema-eyebrow{display:none}
}
@media(max-height:620px) and (min-width:561px){
 .mg-lv-objs{grid-template-columns:repeat(3,1fr)}
}

@media(hover:none){
 .mg-lv-hint,.mg-cinema-hint{display:none}
}

@media(prefers-reduced-motion:reduce){
 .mg-app *,
 .mg-app *:before,
 .mg-app *:after{
  animation:none!important;
  transition:none!important;
 }
 .mg-par{transform:none!important}
 .mg-myshalight{opacity:1}
}
`;

export default function App() {
  const [screen, setScreen] = useState<Screen>("intro");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [chapterIndex, setChapterIndex] = useState(0);
  const [artFailed, setArtFailed] = useState(false);
  const [veil, setVeil] = useState<Veil>(null);
  const [videoMuted, setVideoMuted] = useState(false);
  const [videoNeedsTap, setVideoNeedsTap] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [videoBuffering, setVideoBuffering] = useState(true);
  const [textStory, setTextStory] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [debug] = useState(
    () => new URLSearchParams(window.location.search).has("hitdebug")
  );

  const busyRef = useRef(false);
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    const timers = timersRef;
    return () => {
      timers.current.forEach((id) => window.clearTimeout(id));
      timers.current = [];
      busyRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (screen !== "intro") return;

    const id = window.setTimeout(() => setScreen("landing"), 3000);

    return () => window.clearTimeout(id);
  }, [screen]);

  // The original text-story remains available if the cutscene cannot be loaded.
  // When it finishes it opens the Level 1 briefing.
  useEffect(() => {
    if (screen !== "story" || !textStory) return;

    const id = window.setTimeout(() => {
      if (chapterIndex === chapters.length - 1) {
        setScreen("level");
      } else {
        setChapterIndex((index) => index + 1);
      }
    }, DURATION);

    return () => window.clearTimeout(id);
  }, [screen, chapterIndex, textStory]);

  // Try narration first; fall back to muted autoplay if the browser blocks audio.
  useEffect(() => {
    if (screen !== "story" || textStory || videoError) return;
    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    video.muted = videoMuted;
    const result = video.play();
    if (result) {
      void result.catch(async () => {
        if (cancelled) return;
        try {
          video.muted = true;
          setVideoMuted(true);
          await video.play();
        } catch {
          if (!cancelled) setVideoNeedsTap(true);
        }
      });
    }
    return () => { cancelled = true; };
    // Playback starts once when the story screen is mounted.
    // Sound changes are applied directly in toggleVideoSound.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, textStory, videoError]);

  // Esc skips the cutscene, like in a game.
  useEffect(() => {
    if (screen !== "story" || textStory) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        launch("level");
      }
    };

    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("keydown", onKey);
    };
    // launch only touches refs and setters, safe to omit here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, textStory]);

  useEffect(() => {
    if (!dialog) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDialog(null);
      }
    };

    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [dialog]);

  function schedule(fn: () => void, ms: number) {
    const id = window.setTimeout(fn, ms);
    timersRef.current.push(id);
  }

  /* Short cinematic launch transition, then switch screens.
     busyRef prevents duplicate transitions from rapid clicks. */
  function launch(target: Target) {
    if (busyRef.current) return;
    busyRef.current = true;

    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    setVeil({ kind: target, phase: "in" });

    schedule(
      () => {
        setDialog(null);

        if (target === "story") {
          setChapterIndex(0);
          setVideoMuted(false);
          setVideoNeedsTap(false);
          setVideoBuffering(true);
          setVideoError(false);
          setTextStory(false);
          setScreen("story");
        } else if (target === "level") {
          setScreen("level");
        } else {
          setScreen("game");
        }

        setVeil({ kind: target, phase: "out" });

        schedule(
          () => {
            setVeil(null);
            busyRef.current = false;
          },
          reduced ? 0 : WARP_OUT_MS
        );
      },
      reduced ? 60 : WARP_MS
    );
  }

  function toggleVideoSound() {
    const nextMuted = !videoMuted;
    setVideoMuted(nextMuted);
    const video = videoRef.current;
    if (video) {
      video.muted = nextMuted;
      if (video.paused) {
        void video.play().then(() => setVideoNeedsTap(false)).catch(() => setVideoNeedsTap(true));
      }
    }
  }

  function retryVideo() {
    const video = videoRef.current;
    if (!video) return;
    video.muted = videoMuted;
    void video.play().then(() => setVideoNeedsTap(false)).catch(() => setVideoNeedsTap(true));
  }

  function onPointerMove(event: ReactPointerEvent<HTMLElement>) {
    if (event.pointerType === "touch") return;

    const el = event.currentTarget;
    const x = (event.clientX / window.innerWidth - 0.5) * 2;
    const y = (event.clientY / window.innerHeight - 0.5) * 2;

    el.style.setProperty("--mg-px", x.toFixed(3));
    el.style.setProperty("--mg-py", y.toFixed(3));
  }

  const warp = veil && (
    <div
      className={`mg-warp mg-warp-${veil.kind} mg-warp-${veil.phase}`}
      aria-hidden="true"
    >
      <div className="mg-warp-streaks" />
      <div className="mg-warp-flash" />
    </div>
  );

  if (screen === "game") {
    return (
      <>
        <style>{warpCss}</style>
        <GameShell />
        {warp}
      </>
    );
  }

  const chapter = chapters[chapterIndex];

  return (
    <main className="mg-app">
      <style>{css + warpCss}</style>

      {screen === "intro" && (
        <section className="mg-intro">
          <button
            type="button"
            className="mg-outline mg-topright"
            onClick={() => setScreen("landing")}
          >
            SKIP INTRO ↗
          </button>

          <div className="mg-intro-ring" aria-hidden="true">
            M
          </div>

          <h1>MYSHA GOES TO MARS</h1>
          <p>A STORY-RICH SPACE ADVENTURE</p>
        </section>
      )}

      {screen === "landing" && (
        <section
          className="mg-landing"
          aria-label="Mysha Goes to Mars landing"
          onPointerMove={onPointerMove}
        >
          <div className={debug ? "mg-artstage mg-debug" : "mg-artstage"}>
            <img
              src={ART}
              alt="Mysha astronaut and Mars cinematic game artwork"
              draggable={false}
              onError={() => setArtFailed(true)}
            />

            <div className="mg-sparkles mg-par" aria-hidden="true" />
            <div className="mg-dust mg-par" aria-hidden="true" />
            <div className="mg-sheen" aria-hidden="true" />
            <div className="mg-marslight" aria-hidden="true" />
            <div className="mg-myshalight mg-par" aria-hidden="true" />
            <div className="mg-engine" aria-hidden="true" />

            <button
              type="button"
              className="mg-hit mg-hit-nav mg-hit-learn"
              aria-label="Learn"
              onClick={() => setDialog("learn")}
            />

            <button
              type="button"
              className="mg-hit mg-hit-nav mg-hit-navplay"
              aria-label="Play Story Mode"
              onClick={() => launch("story")}
            />

            <button
              type="button"
              className="mg-hit mg-hit-nav mg-hit-explore"
              aria-label="Explore"
              onClick={() => setDialog("explore")}
            />

            <button
              type="button"
              className="mg-hit mg-hit-play"
              aria-label="Play Story Mode"
              onClick={() => launch("story")}
            />

            <button
              type="button"
              className="mg-hit mg-hit-skip"
              aria-label="Skip to Game"
              onClick={() => launch("game")}
            />
          </div>

          <div className="mg-wide-nav">
            <span className="mg-wide-brand">MYSHA GOES TO MARS</span>

            <div className="mg-navgroup">
              <button type="button" onClick={() => setDialog("learn")}>
                Learn
              </button>

              <button type="button" onClick={() => launch("story")}>
                Play
              </button>

              <button type="button" onClick={() => setDialog("explore")}>
                Explore
              </button>
            </div>
          </div>

          <div className="mg-mobile">
            <header className="mg-mobile-head">
              <strong>MYSHA / MARS</strong>

              <button
                type="button"
                className="mg-outline"
                onClick={() => setDialog("learn")}
              >
                LEARN
              </button>
            </header>

            <div className="mg-mobile-hero">
              <div
                className="mg-mobile-portrait"
                style={{ backgroundImage: `url("${ART}")` }}
                role="img"
                aria-label="Mysha, a blonde astronaut in a white spacesuit"
              />
              <div className="mg-sparkles" aria-hidden="true" />
              <div className="mg-dust" aria-hidden="true" />
              <div className="mg-mobile-glow" aria-hidden="true" />
            </div>

            <div className="mg-mobile-content">
              <h1>
                MYSHA GOES TO <span>MARS</span>
              </h1>

              <p>
                An interactive space adventure where a dream becomes a
                mission. Explore the science, then take control of Mysha.
              </p>

              <div className="mg-mobile-points">
                <span>✦ LEARN</span>
                <span>✦ PLAY</span>
                <span>✦ EXPLORE</span>
              </div>

              <button
                type="button"
                className="mg-primary"
                onClick={() => launch("story")}
              >
                ▶ PLAY STORY MODE <span className="mg-arrow">→</span>
              </button>

              <button
                type="button"
                className="mg-outline"
                onClick={() => launch("game")}
              >
                SKIP TO GAME <span className="mg-arrow">»</span>
              </button>

              <button
                type="button"
                className="mg-outline"
                onClick={() => setDialog("explore")}
              >
                MISSION OVERVIEW
              </button>
            </div>
          </div>

          {artFailed && (
            <div className="mg-missing">
              <span>
                Image not found: put
                <strong> mysha-landing-clean.png </strong>
                in the public folder, then refresh.
              </span>
            </div>
          )}
        </section>
      )}

      {screen === "story" && !textStory && (
        <section
          className="mg-cinema"
          aria-label="Mission 01 opening scene"
          onContextMenu={(event) => event.preventDefault()}
        >
          <div
            className="mg-cinema-backdrop"
            style={{ backgroundImage: `url("${ART}")` }}
            aria-hidden="true"
          />
          <div className="mg-cinema-stars" aria-hidden="true" />

          <video
            ref={videoRef}
            className="mg-cinema-video"
            src={VIDEO}
            autoPlay
            muted={videoMuted}
            playsInline
            preload="auto"
            controls={false}
            controlsList="nodownload noplaybackrate noremoteplayback"
            disablePictureInPicture
            disableRemotePlayback
            tabIndex={-1}
            aria-hidden="true"
            onCanPlay={() => setVideoBuffering(false)}
            onWaiting={() => setVideoBuffering(true)}
            onPlaying={() => setVideoBuffering(false)}
            onPlay={() => setVideoNeedsTap(false)}
            onEnded={() => launch("level")}
            onError={() => setVideoError(true)}
          />

          <div className="mg-cinema-scan" aria-hidden="true" />
          <div className="mg-cinema-vignette" aria-hidden="true" />

          <div className="mg-hud-frame" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </div>

          <header className="mg-cinema-top">
            <div className="mg-cinema-id">
              <span className="mg-cinema-brand">MYSHA GOES TO MARS</span>
              <span className="mg-cinema-chip">
                <i aria-hidden="true" />
                MISSION 01 · OPENING
              </span>
            </div>

            <div className="mg-cinema-tools">
              <button
                type="button"
                className="mg-cinema-button"
                onClick={toggleVideoSound}
                aria-label={videoMuted ? "Turn audio on" : "Turn audio off"}
                aria-pressed={!videoMuted}
              >
                <span aria-hidden="true">{videoMuted ? "⊘" : "♪"}</span>
                <span className="mg-sm-hide">
                  {videoMuted ? "AUDIO OFF" : "AUDIO ON"}
                </span>
              </button>

              <button
                type="button"
                className="mg-cinema-button"
                onClick={() => launch("level")}
              >
                SKIP ↗
              </button>
            </div>
          </header>

          <div className="mg-cinema-bottom">
            <div className="mg-cinema-copy">
              <span className="mg-cinema-eyebrow">INCOMING MISSION</span>
              <span className="mg-cinema-title">Every adventure begins with a dream.</span>
            </div>
            <span className="mg-cinema-hint" aria-hidden="true">
              <kbd>ESC</kbd> SKIP
            </span>
          </div>

          {videoBuffering && !videoError && !videoNeedsTap && (
            <div className="mg-cinema-load" role="status" aria-label="Loading scene" />
          )}

          {(videoError || videoNeedsTap) && (
            <div className="mg-cinema-alert">
              <div className="mg-cinema-alert-card">
                <h2>{videoError ? "Scene unavailable" : "Ready for your mission?"}</h2>
                <p>
                  {videoError
                    ? "The opening scene could not be loaded. You can read the story instead or continue to Level 1."
                    : "Your browser needs a tap to start the scene."}
                </p>
                {!videoError && (
                  <button type="button" className="mg-cinema-button" onClick={retryVideo}>
                    ▶ START SCENE
                  </button>
                )}
                <button
                  type="button"
                  className="mg-cinema-button"
                  onClick={() => { setVideoError(false); setTextStory(true); }}
                >
                  READ THE STORY
                </button>
                <button type="button" className="mg-cinema-button" onClick={() => launch("level")}>
                  GO TO LEVEL 1
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {screen === "story" && textStory && (
        <section className="mg-story" aria-label="Automatic story prologue">
          <div
            className="mg-story-bg"
            style={{ backgroundImage: `url("${ART}")` }}
            aria-hidden="true"
          />

          <button
            type="button"
            className="mg-outline mg-topright"
            onClick={() => launch("level")}
          >
            SKIP STORY ↗
          </button>

          <article className="mg-story-card" key={chapterIndex}>
            <div className="mg-chapter">
              {chapter.label} · {chapterIndex + 1} / {chapters.length}
            </div>

            <h2>{chapter.title}</h2>
            <p>{chapter.narration}</p>

            <div className="mg-fact">SCIENCE NOTE · {chapter.fact}</div>

            <div className="mg-story-actions">
              <button
                type="button"
                className="mg-primary"
                onClick={() =>
                  chapterIndex === chapters.length - 1
                    ? launch("level")
                    : setChapterIndex((index) => index + 1)
                }
              >
                {chapterIndex === chapters.length - 1
                  ? "GO TO LEVEL 1 →"
                  : "NEXT SCENE →"}
              </button>
            </div>
          </article>

          <div className="mg-progress" aria-label="Story progress">
            {chapters.map((item, index) => (
              <span
                key={item.label}
                className={
                  index < chapterIndex
                    ? "done"
                    : index === chapterIndex
                      ? "current"
                      : ""
                }
              />
            ))}
          </div>
        </section>
      )}

      {screen === "level" && (
        <section className="mg-lv" aria-label="Level 1 briefing">
          <div
            className="mg-lv-bg"
            style={{ backgroundImage: `url("${ART}")` }}
            aria-hidden="true"
          />
          <div className="mg-lv-marsglow" aria-hidden="true" />
          <div className="mg-sparkles" aria-hidden="true" />
          <div className="mg-dust" aria-hidden="true" />
          <div className="mg-lv-grid" aria-hidden="true" />
          <div className="mg-lv-scan" aria-hidden="true" />

          <div className="mg-lv-scroll">
            <div className="mg-lv-inner">
              <span className="mg-lv-eyebrow" style={delay(0.1)}>
                MISSION 01 · CLEARED FOR TRAINING
              </span>

              <div className="mg-lv-badge" style={delay(0.25)} aria-hidden="true">
                <span className="mg-lv-ring" />
                <span className="mg-lv-ring2" />
                <div className="mg-lv-badge-in">
                  <small>LEVEL</small>
                  <strong>01</strong>
                </div>
              </div>

              <h2 className="mg-lv-title" style={delay(0.45)}>
                LET’S START <span>LEVEL 1</span>
              </h2>

              <p className="mg-lv-sub" style={delay(0.6)}>
                Equipment verification. Help Mysha check the oxygen, water and
                communications systems before her mission begins.
              </p>

              <ul className="mg-lv-objs" style={delay(0.7)} aria-label="Level 1 objectives">
                {objectives.map((item, index) => (
                  <li key={item.name} style={delay(0.75 + index * 0.12)}>
                    <b aria-hidden="true">{item.icon}</b>
                    <div>
                      <strong>{item.name}</strong>
                      <em>STANDBY</em>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="mg-lv-actions" style={delay(1.15)}>
                <button
                  type="button"
                  className="mg-primary mg-lv-start"
                  onClick={() => launch("game")}
                  autoFocus
                >
                  ▶ START LEVEL 1 <span className="mg-arrow">→</span>
                </button>

                <button
                  type="button"
                  className="mg-outline"
                  onClick={() => launch("story")}
                >
                  ↺ REPLAY OPENING SCENE
                </button>
              </div>

              <span className="mg-lv-hint" style={delay(1.3)}>
                PRESS ENTER TO BEGIN
              </span>
            </div>
          </div>
        </section>
      )}

      {dialog && (
        <div className="mg-overlay" onClick={() => setDialog(null)}>
          <section
            className="mg-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={
              dialog === "learn"
                ? "Space science learning"
                : "Mission overview"
            }
            onClick={(event) => event.stopPropagation()}
          >
            <h2>
              {dialog === "learn"
                ? "LEARN THROUGH EXPLORATION"
                : "YOUR MISSION PATH"}
            </h2>

            {dialog === "learn" ? (
              <ul>
                <li>Mars, its atmosphere and environment.</li>
                <li>Water, oxygen, power and communication systems.</li>
                <li>Interactive equipment checks and decision-making.</li>
              </ul>
            ) : (
              <ul>
                <li>
                  <strong>Playable now:</strong> Equipment verification
                  training.
                </li>
                <li>
                  <strong>In development:</strong> Launch, space journey and
                  Mars survival.
                </li>
                <li>Future chapters will include more cinematic 3D scenes.</li>
              </ul>
            )}

            <small>
              Independent learning game inspired by space exploration; not
              affiliated with or endorsed by NASA.
            </small>

            <button
              type="button"
              className="mg-outline"
              onClick={() => setDialog(null)}
              autoFocus
            >
              CLOSE
            </button>
          </section>
        </div>
      )}

      {warp}
    </main>
  );
}
