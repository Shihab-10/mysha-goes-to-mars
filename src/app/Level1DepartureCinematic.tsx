import { useCallback, useEffect, useRef, useState } from "react";

export type CinematicResult = "ended" | "skipped" | "unavailable";

type Props = {
  /** Try a merged movie first. If it is absent, try a playlist of three clips. */
  playlists: readonly (readonly string[])[];
  initialSoundOn: boolean;
  onFinished: (result: CinematicResult) => void;
};

type PlayerStatus = "finding" | "loading" | "playing" | "tap" | "error";
const TRANSITION_MS = 450;
const LOADING_TIMEOUT_MS = 20000;

const cinematicCss = `
.l1movie{position:fixed;inset:0;z-index:1000;isolation:isolate;background:#01040b;color:#f1faff;font-family:Inter,"Segoe UI",Arial,sans-serif;overflow:hidden;animation:l1movie-enter .55s both}
.l1movie *{box-sizing:border-box}
.l1movie.is-exiting{opacity:0;transition:opacity .45s ease}
.l1movie-video{position:absolute;inset:0;display:block;width:100%;height:100%;background:#000;object-fit:contain;object-position:center}
.l1movie-shade{position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,#0208159e,transparent 21%,transparent 71%,#020815ce)}
.l1movie-top{position:absolute;z-index:4;top:0;left:0;right:0;padding:calc(18px + env(safe-area-inset-top,0px)) clamp(15px,3vw,45px);display:flex;justify-content:space-between;align-items:flex-start;gap:14px}
.l1movie-brand{pointer-events:none;text-shadow:0 3px 20px #000;max-width:260px}
.l1movie-brand strong{display:block;font-size:clamp(12px,1.45vw,18px);letter-spacing:.16em;font-weight:900}
.l1movie-brand span{display:block;margin-top:7px;font-size:10px;letter-spacing:.19em;color:#a3d9ee}
.l1movie-buttons{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end}
.l1movie-button{appearance:none;border:1px solid #a7e9ff81;border-radius:999px;padding:12px 18px;min-height:44px;background:#071c30e9;color:#f2fdff;backdrop-filter:blur(11px);font:800 11px Inter,"Segoe UI",Arial,sans-serif;letter-spacing:.095em;cursor:pointer;white-space:nowrap;transition:background .2s,border-color .2s}
.l1movie-button:hover{background:#175072;border-color:#e0f7ff}
.l1movie-button:focus-visible{outline:2px solid #fff;outline-offset:3px}
.l1movie-button.is-primary{background:linear-gradient(90deg,#ff9a52,#ee614a);border-color:#ffd4a5}
.l1movie-bottom{position:absolute;z-index:3;bottom:0;left:0;right:0;padding:36px clamp(15px,3vw,45px) calc(24px + env(safe-area-inset-bottom,0px));pointer-events:none}
.l1movie-bottom strong{font-size:clamp(15px,2.5vw,30px);letter-spacing:-.015em;text-shadow:0 3px 16px #000}
.l1movie-bottom small{display:block;margin:6px 0 12px;color:#b0dce8;font-size:10px;letter-spacing:.17em;font-weight:800}
.l1movie-progress{height:3px;width:100%;background:#96c5d04a;border-radius:999px;overflow:hidden}
.l1movie-progress i{display:block;height:100%;background:linear-gradient(90deg,#8aeaff,#ffae6d);transition:width .16s linear}
.l1movie-center{position:absolute;inset:0;z-index:6;display:grid;place-items:center;padding:22px;background:#02091870;backdrop-filter:blur(5px)}
.l1movie-card{width:min(520px,100%);padding:clamp(23px,4vw,38px);text-align:center;border:1px solid #8cdeff8a;border-radius:25px;background:linear-gradient(145deg,#0c3048f5,#061429f8);box-shadow:0 28px 90px #000b;animation:l1movie-up .4s both}
.l1movie-eyebrow{font-size:10px;letter-spacing:.24em;font-weight:900;color:#93e4ff}
.l1movie-card h2{font-size:clamp(23px,4vw,36px);margin:15px 0 12px;line-height:1.14}
.l1movie-card p{font-size:14px;line-height:1.65;color:#c8e0ed;margin:0 0 19px}
.l1movie-card code{display:block;word-break:break-all;font-size:11px;color:#9edcf5;margin:8px 0 16px;padding:9px;background:#071d30;border-radius:8px}
.l1movie-actions{display:flex;gap:9px;flex-wrap:wrap;justify-content:center}
.l1movie-spinner{margin:0 auto 18px;width:32px;height:32px;border:3px solid #97e8ff37;border-top-color:#92ebff;border-radius:50%;animation:l1movie-spin .8s linear infinite}
@keyframes l1movie-enter{from{opacity:0}to{opacity:1}}
@keyframes l1movie-up{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:none}}
@keyframes l1movie-spin{to{transform:rotate(360deg)}}
@media(max-width:620px){.l1movie-top{flex-direction:column;gap:10px}.l1movie-brand span{font-size:9px}.l1movie-buttons{align-self:flex-end}.l1movie-button{font-size:10px;padding:10px 13px}.l1movie-bottom{padding-bottom:calc(16px + env(safe-area-inset-bottom,0px))}}
@media(prefers-reduced-motion:reduce){.l1movie,.l1movie *{animation:none!important;transition:none!important}}
`;

/**
 * A HEAD request catches common Vite / static-hosting misconfigurations:
 * an absent video often returns index.html (HTTP 200, content-type text/html).
 * If HEAD is blocked by a hosting provider, allow playback to make the final decision.
 */
async function mediaAppearsAvailable(url: string, signal: AbortSignal): Promise<boolean> {
  try {
    const response = await fetch(url, { method: "HEAD", cache: "no-store", signal });
    if (response.status === 405 || response.status === 501) return true;
    if (!response.ok) return false;
    const type = response.headers.get("content-type")?.toLowerCase() ?? "";
    return !type.includes("text/html") && !type.includes("application/json");
  } catch (error) {
    if (signal.aborted) return false;
    console.warn("[Level 1 cinematic] Cannot preflight video URL. Trying playback:", url, error);
    return true;
  }
}

export function Level1DepartureCinematic({ playlists, initialSoundOn, onFinished }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const completedRef = useRef(false);
  const tryingRef = useRef(false);
  const soundRef = useRef(initialSoundOn);
  const finishRef = useRef(onFinished);
  const fadeTimerRef = useRef<number | null>(null);

  const [playlist, setPlaylist] = useState<readonly string[]>([]);
  const [clipIndex, setClipIndex] = useState(0);
  const [status, setStatus] = useState<PlayerStatus>("finding");
  const [soundOn, setSoundOn] = useState(initialSoundOn);
  const [soundHint, setSoundHint] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [confirmSkip, setConfirmSkip] = useState(false);
  const [progress, setProgress] = useState(0);
  const [errorInfo, setErrorInfo] = useState("");
  const [probeAttempt, setProbeAttempt] = useState(0);

  const source = playlist[clipIndex] ?? "";
  useEffect(() => { finishRef.current = onFinished; }, [onFinished]);

  useEffect(() => {
    return () => {
      if (fadeTimerRef.current !== null) window.clearTimeout(fadeTimerRef.current);
      videoRef.current?.pause();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    // A stalled hosting HEAD request must not leave the movie on an endless spinner.
    const probeTimeout = window.setTimeout(() => controller.abort(), 9000);
    let alive = true;
    setPlaylist([]);
    setClipIndex(0);
    setProgress(0);
    setErrorInfo("");
    setStatus("finding");

    async function resolve() {
      for (const candidate of playlists) {
        if (candidate.length === 0) continue;
        const available = await Promise.all(candidate.map((url) => mediaAppearsAvailable(url, controller.signal)));
        if (!alive) return;
        if (available.every(Boolean)) {
          console.info("[Level 1 cinematic] Selected video:", candidate);
          window.clearTimeout(probeTimeout);
          setPlaylist([...candidate]);
          setStatus("loading");
          return;
        }
      }
      if (alive) {
        window.clearTimeout(probeTimeout);
        setErrorInfo("No matching MP4 video was found in public/videos/level1/. Check the exact filenames and refresh.");
        setStatus("error");
      }
    }
    void resolve();
    return () => { alive = false; window.clearTimeout(probeTimeout); controller.abort(); };
    // The playlists supplied by GameShell is a stable constant.
  }, [playlists, probeAttempt]);

  const finish = useCallback((result: CinematicResult) => {
    if (completedRef.current) return;
    completedRef.current = true;
    videoRef.current?.pause();
    setExiting(true);
    fadeTimerRef.current = window.setTimeout(() => finishRef.current(result), TRANSITION_MS);
  }, []);

  const tryPlay = useCallback(async () => {
    const element = videoRef.current;
    if (!element || !source || completedRef.current || tryingRef.current || confirmSkip) return;
    tryingRef.current = true;
    try {
      element.muted = !soundRef.current;
      await element.play();
      setStatus("playing");
      setBuffering(false);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      try {
        element.muted = true;
        await element.play();
        setSoundHint(true);
        setStatus("playing");
        setBuffering(false);
      } catch (fallbackError) {
        if (fallbackError instanceof DOMException && fallbackError.name === "AbortError") return;
        console.warn("[Level 1 cinematic] Playback requires user gesture:", fallbackError);
        setStatus("tap");
        setBuffering(false);
      }
    } finally {
      tryingRef.current = false;
    }
  }, [source, confirmSkip]);

  useEffect(() => {
    if (!source || status === "error") return;
    const timer = window.setTimeout(() => {
      if (videoRef.current?.readyState === 0) {
        setErrorInfo("Video loading timed out. Check the URL, file format and network connection.");
        setStatus("error");
      }
    }, LOADING_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [source, clipIndex, status === "error"]);

  function onClipEnded() {
    if (completedRef.current) return;
    if (clipIndex < playlist.length - 1) {
      setStatus("loading");
      setBuffering(false);
      setProgress(0);
      setClipIndex((i) => i + 1);
    } else {
      finish("ended");
    }
  }

  function onVideoError() {
    if (completedRef.current) return;
    const video = videoRef.current;
    const message = video?.error?.message ?? "Browser could not decode or load the video.";
    console.error("[Level 1 cinematic] Video playback error:", {
      url: video?.currentSrc || source, code: video?.error?.code, message,
    });
    setErrorInfo(`Could not play the video. ${message}`);
    setStatus("error");
    setBuffering(false);
  }

  function retry() {
    completedRef.current = false;
    tryingRef.current = false;
    setSoundHint(false);
    setConfirmSkip(false);
    setBuffering(false);
    setProbeAttempt((number) => number + 1);
  }

  function toggleSound() {
    const next = !soundOn || soundHint;
    soundRef.current = next;
    setSoundOn(next);
    setSoundHint(false);
    const element = videoRef.current;
    if (element) {
      element.muted = !next;
      if (element.paused) void tryPlay();
    }
  }

  useEffect(() => {
    if (!confirmSkip) {
      if (status === "playing" && videoRef.current?.paused) void tryPlay();
    } else {
      videoRef.current?.pause();
    }
  }, [confirmSkip, status, tryPlay]);

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.code !== "Escape") return;
      event.preventDefault();
      if (!completedRef.current) setConfirmSkip((current) => !current);
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  return (
    <div className={`l1movie ${exiting ? "is-exiting" : ""}`} role="dialog" aria-modal="true" aria-label="Level 1 departure cinematic">
      <style>{cinematicCss}</style>
      {source && (
        <video
          key={source}
          ref={videoRef}
          className="l1movie-video"
          src={source}
          playsInline
          preload="auto"
          disablePictureInPicture
          controlsList="nodownload noremoteplayback"
          onLoadedData={() => { void tryPlay(); }}
          onCanPlay={() => { void tryPlay(); }}
          onPlaying={() => { setStatus("playing"); setBuffering(false); }}
          onWaiting={() => setBuffering(true)}
          onStalled={() => setBuffering(true)}
          onTimeUpdate={(event) => {
            const { currentTime, duration } = event.currentTarget;
            setProgress(Number.isFinite(duration) && duration > 0 ? currentTime / duration : 0);
          }}
          onEnded={onClipEnded}
          onError={onVideoError}
        />
      )}
      <div className="l1movie-shade" />
      <div className="l1movie-top">
        <div className="l1movie-brand"><strong>MYSHA GOES TO MARS</strong><span>LEVEL 1 / THE FINAL DEPARTURE</span></div>
        <div className="l1movie-buttons">
          <button type="button" className="l1movie-button" onClick={toggleSound}>
            {soundHint ? "🔇 ENABLE SOUND" : soundOn ? "🔊 SOUND ON" : "🔇 SOUND OFF"}
          </button>
          <button type="button" className="l1movie-button" onClick={() => setConfirmSkip(true)}>SKIP →</button>
        </div>
      </div>
      {status === "playing" && (
        <div className="l1movie-bottom">
          <strong>THE JOURNEY BEGINS</strong>
          <small>{playlist.length > 1 ? `CINEMATIC ${clipIndex + 1} / ${playlist.length}` : "DEPARTURE CINEMATIC"}</small>
          <div className="l1movie-progress"><i style={{ width: `${Math.max(0, Math.min(100, progress * 100))}%` }} /></div>
        </div>
      )}
      {(status === "finding" || status === "loading" || buffering) && status !== "error" && !confirmSkip && (
        <div className="l1movie-center" role="status" aria-live="polite" style={{ pointerEvents: "none", background: "transparent", backdropFilter: "none" }}>
          <div className="l1movie-card" style={{ padding: "18px 25px", width: "auto", background: "#081b30d9" }}>
            <div className="l1movie-spinner" />
            <div className="l1movie-eyebrow">PREPARING CINEMATIC…</div>
          </div>
        </div>
      )}
      {status === "tap" && !confirmSkip && (
        <div className="l1movie-center">
          <div className="l1movie-card">
            <span className="l1movie-eyebrow">YOUR JOURNEY AWAITS</span>
            <h2>Ready for Departure</h2>
            <p>Your browser requires one more click to start the cinematic.</p>
            <button type="button" className="l1movie-button is-primary" onClick={() => { void tryPlay(); }}>▶ PLAY CINEMATIC</button>
          </div>
        </div>
      )}
      {status === "error" && !confirmSkip && (
        <div className="l1movie-center">
          <div className="l1movie-card" role="alert">
            <span className="l1movie-eyebrow">MEDIA CHECK</span>
            <h2>Video Not Found or Unavailable</h2>
            <p>{errorInfo || "This browser could not load the departure video."}</p>
            {import.meta.env.DEV && <code>{source || playlists.flat().join(" | ")}</code>}
            <div className="l1movie-actions">
              <button type="button" className="l1movie-button is-primary" onClick={retry}>↻ RETRY VIDEO</button>
              <button type="button" className="l1movie-button" onClick={() => finish("unavailable")}>CONTINUE TO LEVEL 2 →</button>
            </div>
          </div>
        </div>
      )}
      {confirmSkip && !exiting && (
        <div className="l1movie-center">
          <div className="l1movie-card" role="alertdialog" aria-label="Skip departure cinematic?">
            <span className="l1movie-eyebrow">CONFIRM YOUR CHOICE</span>
            <h2>Skip Departure Movie?</h2>
            <p>Level 1 will be marked complete, and the game will advance to the Level 2 entry screen.</p>
            <div className="l1movie-actions">
              <button type="button" className="l1movie-button is-primary" onClick={() => setConfirmSkip(false)}>KEEP WATCHING</button>
              <button type="button" className="l1movie-button" onClick={() => finish("skipped")}>SKIP CINEMATIC →</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
