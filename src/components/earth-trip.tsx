import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject } from "react";
import { Axis3d, Globe2, Map, Moon, Satellite, SlidersHorizontal, X } from "lucide-react";
import { DEFAULT_FLAGS, type EarthApi, type Flags, type Telemetry } from "@/earth/types";
import { BALANCE } from "@/earth/defense-balance";

const EMPTY: Telemetry = {
  altKm: null,
  lat: null,
  lon: null,
  body: "earth",
  subsolarLat: 0,
  subsolarLon: 0,
  moonDistKm: 0,
  fps: 0,
  tle: "cache",
  surfaceAlpha: 0,
  surfaceLock: false,
  follow: false,
  view: "globe",
  selection: null,
};

const GROUP_LABEL = {
  station: "Stazione",
  nav: "Navigazione",
  science: "Scienza",
  starlink: "Starlink",
} as const;

const REGIME_LABEL = {
  leo: "LEO",
  meo: "MEO",
  geo: "GEO / HEO",
} as const;

export function EarthTrip() {
  const stageRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<EarthApi | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tel, setTel] = useState<Telemetry>(EMPTY);
  const [flags, setFlags] = useState<Flags>(DEFAULT_FLAGS);
  const [hours, setHours] = useState(0);
  const [panel, setPanel] = useState(false);
  const [section, setSection] = useState<"visual" | "sats" | "moon" | null>("visual");
  const [mounted, setMounted] = useState(false);
  const [utc, setUtc] = useState("--:--:--");
  const [local, setLocal] = useState("--:--:--");
  const [defenseActive, setDefenseActive] = useState(false);
  const [tutorial, setTutorial] = useState(false);
  const overRef = useRef<HTMLDivElement>(null);
  const [gameOver, setGameOver] = useState<{
    score: number;
    wave: number;
    highscore: number;
    lastScore?: number | null;
    lastWave?: number | null;
  } | null>(null);
  const [defenseState, setDefenseState] = useState<HudState>({
    wave: 1,
    earthHP: 100,
    exp: 0,
    score: 0,
    lunarEnergy: 0,
    highscore: 0,
    phase: "play",
    flash: 0,
    veil: 0,
    zoom: 0.3,
    shield: 0,
    freezeLeft: 0,
    shop: false,
    guide: false,
  });

  useEffect(() => {
    if (!defenseActive) return;
    const id = setInterval(() => {
      const s = apiRef.current?.getDefenseState?.();
      if (!s) return;
      setDefenseState(s);
      if (s.phase === "idle") {
        if (s.finale) setGameOver(s.finale);
        setDefenseActive(false);
      }
    }, 80);
    return () => clearInterval(id);
  }, [defenseActive]);


  useEffect(() => {
    setMounted(true);
    setTutorial(!tutorialHidden());
  }, []);

  useFocusTrap(overRef, Boolean(gameOver), () => setGameOver(null));

  useEffect(() => {
    if (!mounted) return;
    const tick = () => {
      const date = new Date(Date.now() + hours * 3_600_000);
      setUtc(
        new Intl.DateTimeFormat("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          timeZone: "UTC",
          hourCycle: "h23",
        }).format(date),
      );
      setLocal(
        new Intl.DateTimeFormat("it-IT", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hourCycle: "h23",
        }).format(date),
      );
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [mounted, hours]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    let dead = false;
    let dispose = () => {};
    void import("@/earth/engine").then(({ mountEarth }) => {
      if (dead || !stageRef.current) return;
      const api = mountEarth(stageRef.current, {
        onTelemetry: setTel,
        onReady: () => setReady(true),
        onError: (message) => setError(message),
      });
      apiRef.current = api;
      dispose = () => api.dispose();
    });
    return () => {
      dead = true;
      dispose();
      apiRef.current = null;
    };
  }, []);

  useEffect(() => {
    apiRef.current?.setFlags(flags);
  }, [flags]);

  useEffect(() => {
    apiRef.current?.setTimeOffsetHours(hours);
  }, [hours]);

  function toggle<K extends keyof Flags>(key: K) {
    setFlags((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const sim = hours !== 0;
  const sel = tel.selection;

  return (
    <main className={["et-root", defenseActive ? "is-defense" : "", defenseState.shop ? "is-shop" : ""].filter(Boolean).join(" ")}>
      <div ref={stageRef} className="et-stage" />
      {!ready && !error ? <div className="et-boot">Sincronizzazione effemeridi</div> : null}
      {error ? (
        <p className="et-error" role="alert">
          {error}
        </p>
      ) : null}

      <header className="et-top">
        <div className="et-brand">
          <span className="et-mark" aria-hidden="true" />
          <div>
            <h1>EarthTrip</h1>
            <p className={sim ? "et-status is-sim" : "et-status"}>
              <i />
              {sim ? `Sim ${hours > 0 ? "+" : ""}${hours} h` : "Live"}
              <span className="et-status-tech">
                {" · "}
                {tel.tle === "live" ? "TLE live" : "TLE di bordo"}
                {tel.fps > 0 ? ` · ${tel.fps} fps` : ""}
              </span>
            </p>
          </div>
        </div>
        <div className="et-clock">
          <strong>{utc} UTC</strong>
          <small>{local} locale</small>
        </div>
      </header>

      <button
        type="button"
        className={defenseActive ? "et-def-toggle is-on" : "et-def-toggle"}
        aria-label={defenseActive ? "Esci da Difendi la Terra" : "Difendi la Terra"}
        onClick={() => {
          if (defenseActive) {
            apiRef.current?.exitDefense();
            setDefenseActive(false);
            setGameOver(null);
          } else {
            setGameOver(null);
            apiRef.current?.enterDefense();
            setDefenseActive(true);
          }
        }}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.6"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="currentColor" strokeWidth="1.6"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/></svg>
        <span>{defenseActive ? "Esci" : "Difendi la Terra"}</span>
      </button>
      {defenseActive && defenseState.phase !== "boom" && defenseState.phase !== "exit" ? (
        <>
          <ZoomRail value={defenseState.zoom ?? 0.11} onChange={(t) => apiRef.current?.setDefenseZoom(t)} />
          <DefenseHud
            state={defenseState}
            api={apiRef}
            onQuit={() => {
              apiRef.current?.exitDefense();
              setDefenseActive(false);
              setGameOver(null);
            }}
          />
        </>
      ) : null}
      {defenseActive && (defenseState.freezeLeft ?? 0) > 0 ? <div className="et-def-freeze" /> : null}
      {defenseActive && defenseState.flash > 0.02 ? <div className="et-def-flash" style={{ opacity: defenseState.flash }} /> : null}
      {defenseActive && defenseState.veil > 0.02 ? <div className="et-def-veil" style={{ opacity: defenseState.veil }} /> : null}
      {gameOver ? (
        <div className="et-over" role="dialog" aria-modal="true" aria-label="Game over">
          <div className="et-over-card" ref={overRef}>
            <p>Game over</p>
            <h2>Terra perduta</h2>
            <ul>
              <li>Punteggio <strong>{gameOver.score}</strong></li>
              <li>Ondata <strong>{gameOver.wave}</strong></li>
              <li>Record <strong>{gameOver.highscore}</strong></li>
              {gameOver.lastScore != null ? (
                <li>
                  Ultima prima <strong>{gameOver.lastScore}</strong>
                  {gameOver.lastWave != null ? ` · onda ${gameOver.lastWave}` : ""}
                </li>
              ) : null}
            </ul>
            <div className="et-over-actions">
              <button
                type="button"
                onClick={() => {
                  setGameOver(null);
                  apiRef.current?.enterDefense();
                  setDefenseActive(true);
                }}
              >
                Riprova
              </button>
              <button type="button" onClick={() => setGameOver(null)}>
                Chiudi
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {tutorial && ready && !defenseActive && !gameOver ? <Tutorial onClose={() => setTutorial(false)} /> : null}
      {tel.surfaceLock ? (
        <div className="et-surface-bar">
          <p>Superficie · Esri, Maxar, Earthstar Geographics</p>
          <button type="button" className="et-text-btn" onClick={() => apiRef.current?.exitSurface()}>
            Orbita
          </button>
        </div>
      ) : null}

      <p className="et-meta">
        <span>
          {tel.body === "moon" ? "Luna" : "Terra"}
          {" · "}
          {tel.altKm == null ? "—" : formatKm(tel.altKm)}
        </span>
        <span>
          {tel.lat == null || tel.lon == null ? "—" : `${fmtLat(tel.lat)}  ${fmtLon(tel.lon)}`}
          {" · sole "}
          {fmtLat(tel.subsolarLat)} {fmtLon(tel.subsolarLon)}
        </span>
      </p>

      {sel && !tel.surfaceLock ? (
        <article className="et-card">
          <header>
            <div>
              <h2>{sel.name}</h2>
              <p>
                {sel.kind === "sat"
                  ? [
                      sel.mission === "crew" ? "Equipaggio" : sel.mission === "science" ? "Scienza" : GROUP_LABEL[sel.group],
                      sel.agency,
                      REGIME_LABEL[sel.regime],
                      `NORAD ${sel.norad}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  : "Selenografia"}
              </p>
            </div>
            <button
              type="button"
              className="et-icon-btn"
              aria-label="Chiudi scheda"
              onClick={() => apiRef.current?.clearSelection()}
            >
              <X />
            </button>
          </header>
          {sel.kind === "sat" ? (
            <div className="et-stats">
              <div>
                <b>{sel.altKm.toFixed(0)} km</b>
                <p>Quota</p>
              </div>
              <div>
                <b>{Math.round(sel.speed * 3600).toLocaleString("it-IT")}</b>
                <p>km/h</p>
              </div>
              <div>
                <b>{sel.incDeg.toFixed(1)}°</b>
                <p>Inclinazione</p>
              </div>
              <div>
                <b>{sel.periodMin.toFixed(1)}</b>
                <p>min / orbita</p>
              </div>
              <div>
                <b>{fmtLat(sel.lat)}</b>
                <p>Latitudine</p>
              </div>
              <div>
                <b>{fmtLon(sel.lon)}</b>
                <p>Longitudine</p>
              </div>
            </div>
          ) : (
            <p className="et-blurb">
              {sel.blurb} {fmtLat(sel.lat)} {fmtLon(sel.lon)}.
            </p>
          )}
          <div className="et-card-actions">
            <button type="button" className="et-text-btn is-on" onClick={() => apiRef.current?.focusSelection()}>
              Inquadra
            </button>
          </div>
        </article>
      ) : null}

      <nav className="et-dock" aria-label="Navigazione missione" inert={defenseActive || undefined}>
        <button type="button" className={tel.view === "iss" ? "et-btn is-on" : "et-btn"} aria-pressed={tel.view === "iss"} onClick={() => apiRef.current?.goIss()}>
          <Satellite />
          ISS
        </button>
        <button type="button" className={tel.view === "moon" ? "et-btn is-on" : "et-btn"} aria-pressed={tel.view === "moon"} onClick={() => apiRef.current?.goMoon()}>
          <Moon />
          Luna
        </button>
        <button type="button" className={tel.view === "globe" ? "et-btn is-on" : "et-btn"} aria-pressed={tel.view === "globe"} onClick={() => apiRef.current?.goGlobal()}>
          <Globe2 />
          Globale
        </button>
        <button
          type="button"
          className={tel.view === "surface" ? "et-btn is-on" : "et-btn"}
          aria-pressed={tel.view === "surface"}
          onClick={() => apiRef.current?.goSurface()}
        >
          <Map />
          Superficie
        </button>
        <button type="button" className={flags.astro ? "et-btn is-on" : "et-btn"} aria-pressed={flags.astro} onClick={() => toggle("astro")}>
          <Axis3d />
          Astro
        </button>
        <button
          type="button"
          className={panel ? "et-btn is-on" : "et-btn"}
          aria-expanded={panel}
          onClick={() => setPanel((v) => !v)}
        >
          <SlidersHorizontal />
          Pannello
        </button>

      </nav>

      <aside className={panel ? "et-sheet is-open" : "et-sheet"} aria-label="Controlli" inert={!panel || defenseActive || undefined}>
        <div className="et-grip" />
        <header>
          <h2>Controlli</h2>
          <button type="button" className="et-icon-btn" aria-label="Chiudi pannello" onClick={() => setPanel(false)}>
            <X />
          </button>
        </header>
        <nav className="et-tabs" role="tablist" aria-label="Sezioni">
          {(
            [
              ["visual", "Terra"],
              ["sats", "Satelliti"],
              ["moon", "Luna"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={section === id}
              className={section === id ? "et-tab is-on" : "et-tab"}
              onClick={() => setSection(id)}
            >
              {label}
            </button>
          ))}
        </nav>
        <Accordion title="Vista Terra" open={section === "visual"} onToggle={() => setSection((s) => (s === "visual" ? null : "visual"))}>
          <div className="et-grid2">
            <Switch label="Confini" on={flags.borders} onClick={() => toggle("borders")} />
            <Switch label="Capitali" on={flags.capitals} onClick={() => toggle("capitals")} />
            <Switch label="Atmosfera" on={flags.atmosphere} onClick={() => toggle("atmosphere")} />
            <Switch label="Nubi" on={flags.clouds} onClick={() => toggle("clouds")} />
            <Switch label="Luci notturne" on={flags.nightLights} onClick={() => toggle("nightLights")} />
            <Switch label="Visione astronomica" on={flags.astro} onClick={() => toggle("astro")} />
          </div>
          <label className="et-slider">
            <p>Offset temporale {hours > 0 ? `+${hours}` : hours} h</p>
            <input
              type="range"
              min={-72}
              max={72}
              step={1}
              value={hours}
              aria-label="Offset temporale in ore"
              suppressHydrationWarning
              onChange={(e) => setHours(Number(e.target.value))}
            />
          </label>
          <div className="et-card-actions">
            <button type="button" className="et-text-btn" onClick={() => setHours(0)}>
              Adesso
            </button>
          </div>
        </Accordion>
        <Accordion title="Satelliti" open={section === "sats"} onToggle={() => setSection((s) => (s === "sats" ? null : "sats"))}>
          <Switch label="Satelliti" on={flags.satellites} onClick={() => toggle("satellites")} />
          <div className={flags.satellites ? undefined : "et-dim"}>
            <Band
              label="LEO"
              hint="Sotto 2.000 km"
              on={flags.leo}
              traces={flags.leoOrbits}
              onToggle={() => toggle("leo")}
              onTraces={() => toggle("leoOrbits")}
            />
            <Band
              label="MEO"
              hint="2.000 – 35.786 km"
              on={flags.meo}
              traces={flags.meoOrbits}
              onToggle={() => toggle("meo")}
              onTraces={() => toggle("meoOrbits")}
            />
            <Band
              label="GEO / HEO"
              hint="Oltre 35.786 km"
              on={flags.geo}
              traces={flags.geoOrbits}
              onToggle={() => toggle("geo")}
              onTraces={() => toggle("geoOrbits")}
            />
            <Switch label="Tutte le tracce della fascia" on={flags.allOrbits} onClick={() => toggle("allOrbits")} />
          </div>
          <div className="et-legend">
            <span>
              <i className="crew" /> Equipaggio
            </span>
            <span>
              <i className="science" /> Scienza
            </span>
            <span>
              <i className="nav" /> MEO
            </span>
            <span>
              <i className="geo" /> GEO
            </span>
          </div>
        </Accordion>
        <Accordion title="Dettagli Luna" open={section === "moon"} onToggle={() => setSection((s) => (s === "moon" ? null : "moon"))}>
          <Switch label="Mari principali" on={flags.moonLabels} onClick={() => toggle("moonLabels")} />
          <Switch label="Crateri e Apollo" on={flags.moonSites} onClick={() => toggle("moonSites")} />
          <Switch label="Distanza lunare reale" on={flags.trueMoon} onClick={() => toggle("trueMoon")} />
          <p className="et-note">
            Da lontano un filo chiaro segna il disco della Luna. Astro aggiunge asse, equatore e rotazione.
            {tel.moonDistKm > 0 ? ` Luna ${Math.round(tel.moonDistKm).toLocaleString("it-IT")} km.` : ""}
          </p>
        </Accordion>
      </aside>
    </main>
  );
}

function Accordion({
  open,
  children,
}: {
  title?: string;
  open: boolean;
  onToggle?: () => void;
  children: ReactNode;
}) {
  return open ? (
    <section className="et-acc-body" role="tabpanel">
      {children}
    </section>
  ) : null;
}

function Band({
  label,
  hint,
  on,
  traces,
  onToggle,
  onTraces,
}: {
  label: string;
  hint: string;
  on: boolean;
  traces: boolean;
  onToggle: () => void;
  onTraces: () => void;
}) {
  return (
    <div className="et-band">
      <div>
        <strong>{label}</strong>
        <p>{hint}</p>
      </div>
      <div className="et-band-actions">
        <button type="button" className={on ? "et-chip is-on" : "et-chip"} aria-pressed={on} onClick={onToggle}>
          Punti
        </button>
        <button type="button" className={traces ? "et-chip is-on" : "et-chip"} aria-pressed={traces} onClick={onTraces}>
          Tracce
        </button>
      </div>
    </div>
  );
}

function Switch({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} className={on ? "et-switch is-on" : "et-switch"} onClick={onClick}>
      <span>{label}</span>
      <span />
    </button>
  );
}

function formatKm(km: number) {
  const abs = Math.abs(km);
  if (abs >= 10000) return `${Math.round(km).toLocaleString("it-IT")} km`;
  if (abs >= 100) return `${km.toFixed(0)} km`;
  return `${km.toFixed(1)} km`;
}

function fmtLat(lat: number) {
  return `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? "N" : "S"}`;
}

function fmtLon(lon: number) {
  let x = lon;
  if (x > 180) x -= 360;
  if (x < -180) x += 360;
  return `${Math.abs(x).toFixed(1)}°${x >= 0 ? "E" : "W"}`;
}

function IconSingle() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 19 V7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M8.5 10.5 12 6l3.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}
function IconBurst() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 18V11M12 18V8M17 18V11" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M7 11 7 8M12 8V5M17 11V8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
function IconFan() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 19 12 12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M12 12 6.5 6M12 12 12 5.5M12 12 17.5 6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
function IconHoming() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 18c2.4-2.2 3.6-4.1 3.6-6.1A3.6 3.6 0 0 0 12 8.3 3.6 3.6 0 0 0 8.4 11.9c0 2 1.2 3.9 3.6 6.1Z" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M4.5 9.5a8 8 0 0 1 15 0" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M7 7.2a5.2 5.2 0 0 1 10 0" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
function IconTurret() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="13" width="10" height="5" rx="1" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M13 15.5h5.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M16 6v3M16 4.2h.01" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M16 3v1.2M14.2 6.2h3.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
function IconLunar() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="3.1" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.2 5.2l1.6 1.6M17.2 17.2l1.6 1.6M18.8 5.2l-1.6 1.6M6.8 17.2l-1.6 1.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function IconShield() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3.5 18.5 6v5.2c0 3.6-2.4 6.4-6.5 8.3-4.1-1.9-6.5-4.7-6.5-8.3V6L12 3.5Z" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
function IconFreeze() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3v18M5.2 6.8l13.6 10.4M18.8 6.8 5.2 17.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
function IconCluster() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="7" cy="8" r="1.3" fill="currentColor" />
      <circle cx="17" cy="8.5" r="1.3" fill="currentColor" />
      <circle cx="8" cy="16" r="1.3" fill="currentColor" />
      <circle cx="16" cy="15.5" r="1.3" fill="currentColor" />
    </svg>
  );
}

function IconRocket() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14 4.5c2.2 1.2 3.8 3.4 4.2 6.2l-3.4 3.4-4.2-4.2 3.4-5.4Z" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10.6 9.9 6 14.5l3.5 3.5 4.6-4.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M7.2 16.8 4.8 19.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
function IconBomb() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="13" r="5.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M15 9.2 18.2 6M18.2 6l1.6 2.2M18.2 6l-2.4-.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconMitra() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 8h9M4 12h13M4 16h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="2 2.2" />
      <circle cx="19" cy="12" r="1.6" fill="currentColor" />
    </svg>
  );
}
function IconRate() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="13" r="7" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 13V9M12 13l3 2M10 3.5h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
function IconCalibre() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 19V10l4-5 4 5v9Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M8 15h8" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
function IconPause() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8.5 6v12M15.5 6v12" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

const OFFER_ICON: Record<string, () => ReactNode> = {
  "gun-singolo": IconSingle,
  "gun-doppio": IconBurst,
  "gun-mitra": IconMitra,
  "gun-rosa": IconFan,
  "arm-cannon": IconTurret,
  "arm-missile": IconRocket,
  "arm-mortar": IconBomb,
  "up-rate": IconRate,
  "up-cal": IconCalibre,
  "wh-singolo": IconRocket,
  "wh-rada": IconFreeze,
  "wh-grappolo": IconCluster,
  "wh-ricerca": IconHoming,
  "wh-termobarica": IconBomb,
  "up-reload": IconRocket,
  "up-radius": IconCluster,
};

const OFFER_COPY: Record<string, string> = {
  "gun-singolo": "Colpo grosso e preciso: si ferma sul primo nemico che tocca.",
  "gun-doppio": "Due colpi paralleli sullo stesso mirino.",
  "gun-mitra": "Pioggia di colpi piccoli, un po' imprecisi.",
  "gun-rosa": "Ventaglio a corto raggio, come un colpo a pompa.",
  "arm-cannon": "Spara in avanti nel suo cono e non ruota.",
  "arm-missile": "Lunga gittata. Spara la testata scelta nella scheda Missili.",
  "arm-mortar": "Bomba ad area sui nemici vicini, lenta.",
  "up-rate": "Tutte le torrette sparano più spesso.",
  "up-cal": "Tutte le torrette fanno più danno.",
  "wh-singolo": "Razzo dritto, un solo bersaglio.",
  "wh-rada": "Poco danno, ma rallenta tutto nella zona.",
  "wh-grappolo": "Si apre in più bombe: colpisce più volte.",
  "wh-ricerca": "Insegue il bersaglio e scoppia.",
  "wh-termobarica": "Esplosione enorme, ricarica lentissima.",
  "up-reload": "Missili pronti prima.",
  "up-radius": "Esplosioni dei missili più larghe.",
};

type ShopAction = { id: string; label: string; cost: number | null; disabled: boolean };
type ShopCard = {
  key: string;
  name: string;
  icon: string;
  copy?: string;
  stat: string;
  level: number | null;
  max: number;
  selected: boolean;
  main: ShopAction | null;
  side: ShopAction | null;
};
type ShopSection = { key: string; title: string; note: string; cards: ShopCard[] };
type ShopTab = { key: string; title: string; ready: boolean; groups: ShopSection[] };
type HudState = {
  wave: number;
  earthHP: number;
  exp: number;
  score?: number;
  lunarEnergy: number;
  highscore: number;
  phase?: string;
  flash: number;
  veil: number;
  zoom?: number;
  finale?: { score: number; wave: number; highscore: number; lastScore?: number | null; lastWave?: number | null } | null;
  shield?: number;
  freezeLeft?: number;
  boss?: boolean;
  bossHp?: number;
  bossMax?: number;
  bossShielded?: boolean;
  bossName?: string | null;
  bossPhase?: number;
  bossWeak?: "open" | "charge" | "closed" | null;
  shop?: boolean;
  shopKind?: "wave" | "freeze" | null;
  guide?: boolean;
  resume?: { wave: number; exp: number } | null;
  bossHint?: { angle: number; warn?: boolean; tele?: boolean } | null;
  placing?: string | null;
  placeMsg?: string;
  guns?: { id: string; name: string; level: number; selected: boolean }[];
  tabs?: ShopTab[];
  bossTele?: { angle: number; left: number } | null;
  lastRun?: { score: number; wave: number } | null;
  paused?: boolean;
  turretMax?: number;
};

function ZoomRail({ value, onChange }: { value: number; onChange: (t: number) => void }) {
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef(false);
  function apply(clientY: number) {
    const el = track.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const t = Math.min(1, Math.max(0, (clientY - rect.top) / Math.max(1, rect.height)));
    onChange(1 - t);
  }
  return (
    <div
      className="et-zoom"
      onWheel={(e) => onChange(Math.min(1, Math.max(0, value + Math.sign(e.deltaY) * 0.08)))}
    >
      <span>Largo</span>
      <div
        className="et-zoom-track"
        ref={track}
        role="slider"
        aria-label="Zoom tattico"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value * 100)}
        onPointerDown={(e) => {
          drag.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          apply(e.clientY);
        }}
        onPointerMove={(e) => {
          if (drag.current) apply(e.clientY);
        }}
        onPointerUp={() => {
          drag.current = false;
        }}
        onPointerCancel={() => {
          drag.current = false;
        }}
      >
        <i style={{ top: `${(1 - value) * 100}%` }} />
      </div>
      <span>Vicino</span>
    </div>
  );
}

function ShopCardView({ card, exp, buy }: { card: ShopCard; exp: number; buy: (id: string) => void }) {
  const Icon = OFFER_ICON[card.icon] ?? IconSingle;
  const price = (a: ShopAction) => (a.cost == null ? a.label : `${a.label} · ${a.cost}`);
  const main = card.main;
  const side = card.side;
  const short = [main, side].find((a) => a && a.disabled && a.cost != null && a.cost > exp);
  return (
    <div className={card.selected ? "et-buy is-on" : "et-buy"}>
      <Icon />
      <span>
        <b>
          {card.name}
          {card.level != null && card.max > 0 ? <i className="et-lvl">Liv. {card.level}/{card.max}</i> : null}
        </b>
        <small>
          {card.copy || OFFER_COPY[card.key] || ""} {card.stat ? <span className="et-stat">{card.stat}.</span> : null}
        </small>
        {short && short.cost != null ? <small className="et-need">Servono {short.cost - exp} punti</small> : null}
      </span>
      <span className="et-buy-acts">
        {main ? (
          <button type="button" disabled={main.disabled} onClick={() => buy(main.id)}>
            {price(main)}
          </button>
        ) : null}
        {side ? (
          <button type="button" className="is-up" disabled={side.disabled} onClick={() => buy(side.id)}>
            {price(side)}
          </button>
        ) : null}
      </span>
    </div>
  );
}

const MAX_LEVEL = BALANCE.maxLevel;
const TURRET_MAX = BALANCE.turrets.max;
const LEVEL_PCT = Math.round((BALANCE.levelGrowth - 1) * 100);

/** Punto vicino al bordo dello schermo nella direzione del boss. */
function edgeSpot(angle: number) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const t = Math.min(Math.abs(c) > 1e-3 ? (w / 2 - 70) / Math.abs(c) : Infinity, Math.abs(s) > 1e-3 ? (h / 2 - 110) / Math.abs(s) : Infinity);
  return { x: w / 2 + c * t, y: h / 2 - s * t };
}

function DefenseHud({ state, api, onQuit }: { state: HudState; api: { current: EarthApi | null }; onQuit: () => void }) {
  const frozen = (state.freezeLeft ?? 0) > 0;
  const ready = state.lunarEnergy >= 100 && !frozen;
  const shop = Boolean(state.shop);
  const placing = state.placing ?? null;
  const exp = Math.floor(state.exp);
  const bossMax = state.bossMax ?? 0;
  const buy = (id: string) => api.current?.buyDefenseUpgrade(id);
  const guide = Boolean(state.guide);
  const waveLabel = state.boss ? `Boss ${state.wave}` : shop ? `Fine ${state.wave}` : `O${state.wave}`;
  const paused = Boolean(state.paused);
  const rec = Math.max(state.highscore, Math.floor(state.score ?? 0));
  const freezeShop = state.shopKind === "freeze";
  const ownedGuns = state.guns ?? [];
  const gunShort: Record<string, string> = {
    "gun-singolo": "1",
    "gun-doppio": "2",
    "gun-mitra": "Mit",
    "gun-rosa": "Rosa",
  };
  const hint = state.bossHint;
  const resume = state.resume;
  const tabs = state.tabs ?? [];
  const [tabKey, setTabKey] = useState("gun");
  const tab = tabs.find((t) => t.key === tabKey) ?? tabs[0];
  const guideRef = useRef<HTMLDivElement>(null);
  const shopRef = useRef<HTMLDivElement>(null);
  const pauseRef = useRef<HTMLDivElement>(null);
  const shopOpen = shop && !placing && !guide;
  useFocusTrap(guideRef, guide);
  useFocusTrap(shopRef, shopOpen, freezeShop ? () => buy("shop-close") : undefined);
  useFocusTrap(pauseRef, paused, () => buy("unpause"));
  /** Schede dello shop: frecce sinistra/destra, Home e Fine spostano la scheda attiva (tabindex mobile). */
  const onTabKey = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    const i = tabs.findIndex((t) => t.key === tab?.key);
    let next = -1;
    if (e.key === "ArrowRight") next = (i + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    if (next < 0) return;
    e.preventDefault();
    setTabKey(tabs[next].key);
    const el = document.getElementById(`et-shop-tab-${tabs[next].key}`);
    el?.focus();
  };
  return (
    <>
      <div className={frozen ? "et-def-hud is-frozen" : "et-def-hud"}>
        <div className="et-def-bar">
          {!shop && !guide && !placing ? (
            <button type="button" className="et-pause" aria-label="Pausa" onClick={() => buy("pause")}>
              <IconPause />
            </button>
          ) : null}
          <span className="et-def-w" aria-label={state.boss ? `Boss, ondata ${state.wave}` : shop ? `Fine ondata ${state.wave}` : `Ondata ${state.wave}`}>{waveLabel}</span>
          <span className="et-def-hp" aria-hidden="true"><i style={{ width: `${Math.max(0, Math.min(100, state.earthHP))}%` }} /></span>
          <span aria-label={`Integrità Terra ${Math.round(state.earthHP)} su 100`}>{Math.round(state.earthHP)} HP</span>
          <span className="et-def-pt" aria-label={`${exp} punti`}>{exp} pt</span>
          {state.shield ? (
            <span className="is-shield" aria-label={`Scudo, ${state.shield} colpi`}>
              <IconShield />
              {state.shield}
            </span>
          ) : null}
          {frozen ? <span className="is-freeze">Gelo {Math.ceil(state.freezeLeft ?? 0)} s</span> : null}
          {frozen && !shop && !guide ? (
            <button type="button" className="et-freeze-shop" onClick={() => buy("freeze-shop")}>
              Shop
            </button>
          ) : null}
          <span className="et-def-rec" aria-label={`Record ${rec}`}>Rec {rec}</span>
          {state.lastRun ? <span className="et-def-last" aria-label={`Ultima partita ${state.lastRun.score}`}>Ult {state.lastRun.score}</span> : null}
          <button
            type="button"
            className={ready ? "et-lunar is-ready" : "et-lunar"}
            aria-label="Impulso lunare"
            disabled={!ready}
            onClick={() => api.current?.triggerLunarPulse()}
          >
            <svg className="et-lunar-ring" viewBox="0 0 36 36" aria-hidden="true">
              <circle cx="18" cy="18" r="15.5" />
              <circle
                cx="18"
                cy="18"
                r="15.5"
                style={{ strokeDasharray: `${(Math.max(0, Math.min(100, state.lunarEnergy)) / 100) * 97.4} 97.4` }}
              />
            </svg>
            <IconLunar />
          </button>
        </div>
        {bossMax > 0 && state.bossName ? (
          <span className={`et-bossname${state.bossWeak === "open" ? " is-open" : state.bossWeak === "charge" ? " is-charge" : ""}`} aria-live="polite">
            {state.bossName}
            {state.bossName === "Asteroide Anomalo" ? (state.bossPhase === 2 ? " · nucleo instabile" : " · corazza") : ""}
            {state.bossWeak === "open" ? " · punto debole scoperto!" : state.bossWeak === "charge" ? " · in carica…" : ""}
          </span>
        ) : null}
        {bossMax > 0 ? (
          <span className={state.bossShielded ? "et-bossbar is-shielded" : "et-bossbar"} aria-label="Integrità del boss">
            <i style={{ width: `${Math.max(0, Math.min(100, ((state.bossHp ?? 0) / bossMax) * 100))}%` }} />
          </span>
        ) : null}
        {ownedGuns.length > 1 && !shop && !guide ? (
          <div className="et-gun-switch" role="group" aria-label="Colpo del cannone">
            {ownedGuns.map((g) => (
              <button key={g.id} type="button" className={g.selected ? "is-on" : ""} onClick={() => buy(g.id)}>
                {gunShort[g.id] ?? g.name}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {hint && !shop && !guide && !placing ? (
        <div
          className={hint.tele ? "et-boss-arrow is-tele" : hint.warn ? "et-boss-arrow is-warn" : "et-boss-arrow"}
          style={{
            left: `${edgeSpot(hint.angle).x}px`,
            top: `${edgeSpot(hint.angle).y}px`,
            transform: "translate(-50%, -50%)",
          }}
        >
          <i style={{ transform: `rotate(${-hint.angle}rad)` }} />
          {hint.tele ? "Teletrasporto" : hint.warn ? "Boss in arrivo" : "Boss"}
        </div>
      ) : null}
      {state.bossTele && !shop && !guide ? (
        <div className="et-glitch" aria-hidden="true">
          <p data-text="SEGNALE BOSS // RIPOSIZIONAMENTO">SEGNALE BOSS // RIPOSIZIONAMENTO</p>
          <small>{`0x${Math.floor(state.bossTele.left * 4095).toString(16).padStart(3, "0").toUpperCase()} · ${Math.round(state.bossTele.left * 100)}%`}</small>
        </div>
      ) : null}
      {placing ? (
        <div className="et-place-bar">
          <p>{state.placeMsg || "Trascina intorno alla Terra"}</p>
          <button type="button" className="is-go" disabled={state.placeMsg === "Troppo vicina"} onClick={() => buy("place-ok")}>
            Piazza
          </button>
          <button type="button" onClick={() => buy("place-no")}>
            Annulla
          </button>
        </div>
      ) : null}
      {guide ? (
        <div className="et-modal" role="dialog" aria-modal="true" aria-labelledby="et-guide-title">
          <div className="et-modal-card et-guide-card" ref={guideRef}>
            <header>
              <h2 id="et-guide-title">Difendi la Terra</h2>
            </header>
            <ol className="et-guide-list">
              <li><b>Mira.</b> Trascina sullo schermo: il cannone spara da solo. Le modalità Singolo, Doppio, Mitra e Rosa si sbloccano a parte e salgono fino al Liv. {MAX_LEVEL}.</li>
              <li><b>Spendi.</b> A fine ondata compri livelli, fino a {TURRET_MAX} torrette e testate per i missili. Ogni livello costa il {LEVEL_PCT}% in più del precedente.</li>
              <li><b>Il boss.</b> Una freccia lo annuncia; finché non è entrato nello schermo non si può colpire. La nave tesoro dorata lascia una moneta: toccala prima che l'anello si svuoti.</li>
              <li><b>Bonus.</b> Scudo, riparazione e Gelo cadono dai nemici: col Gelo i nemici si fermano ma torrette e scudo restano attivi. La super della Luna, a anello pieno, spazza nemici e colpi (non il boss).</li>
            </ol>
            {resume ? (
              <div className="et-resume">
                <button type="button" className="et-modal-go" onClick={() => buy("resume")}>
                  Riprendi ondata {resume.wave} · {resume.exp} punti
                </button>
                <button type="button" className="et-modal-alt" onClick={() => buy("guide-ok")}>
                  Nuova partita
                </button>
              </div>
            ) : (
              <button type="button" className="et-modal-go" onClick={() => buy("guide-ok")}>
                Combatti
              </button>
            )}
          </div>
        </div>
      ) : null}
      {paused ? (
        <div className="et-modal" role="dialog" aria-modal="true" aria-labelledby="et-pause-title">
          <div className="et-modal-card et-pause-card" ref={pauseRef}>
            <header>
              <h2 id="et-pause-title">Pausa</h2>
            </header>
            <p className="et-buy-note">Ondata {state.wave} · {exp} punti · Terra {Math.round(state.earthHP)} HP</p>
            <button type="button" className="et-modal-go" data-autofocus onClick={() => buy("unpause")}>
              Riprendi
            </button>
            <button type="button" className="et-modal-alt" onClick={onQuit}>
              Esci dalla partita
            </button>
          </div>
        </div>
      ) : null}
      {shopOpen ? (
        <div className="et-modal" role="dialog" aria-modal="true" aria-label={freezeShop ? "Shop del gelo" : "Shop fine ondata"}>
          <div className="et-modal-card" ref={shopRef}>
            <header>
              <div>
                <h2>{freezeShop ? "Shop del gelo" : `Fine ondata ${state.wave}`}</h2>
                <p className="et-wallet">Hai <b>{exp}</b> punti</p>
              </div>
            </header>
            <div className="et-shop-tabs" role="tablist" aria-label="Sezioni dello shop">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  id={`et-shop-tab-${t.key}`}
                  type="button"
                  role="tab"
                  aria-selected={t.key === tab?.key}
                  aria-controls="et-shop-panel"
                  tabIndex={t.key === tab?.key ? 0 : -1}
                  className={t.key === tab?.key ? "is-on" : ""}
                  onClick={() => setTabKey(t.key)}
                  onKeyDown={onTabKey}
                >
                  {t.title}
                  {t.ready ? (
                    <>
                      <i className="et-tab-dot" aria-hidden="true" />
                      <span className="et-sr">, acquistabile</span>
                    </>
                  ) : null}
                </button>
              ))}
            </div>
            <div className="et-modal-scroll" id="et-shop-panel" role="tabpanel" aria-labelledby={tab ? `et-shop-tab-${tab.key}` : undefined} tabIndex={0}>
              {(tab?.groups ?? []).map((sec) => (
                <section key={sec.key}>
                  <p className="et-buy-sec">{sec.title}</p>
                  {sec.note ? <p className="et-buy-note">{sec.note}</p> : null}
                  <div className="et-buy-list">
                    {sec.cards.map((card) => (
                      <ShopCardView key={card.key} card={card} exp={exp} buy={buy} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
            <button
              type="button"
              className="et-modal-go"
              onClick={() => buy(freezeShop ? "shop-close" : "shop-next")}
            >
              {freezeShop ? "Torna al gelo" : "Continua"}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Tiene il focus dentro una finestra modale finché è aperta: Tab e Maiusc+Tab girano tra i suoi controlli,
 * Esc chiama onEscape. Alla chiusura il focus torna dove era prima.
 */
function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean, onEscape?: () => void) {
  const escRef = useRef(onEscape);
  escRef.current = onEscape;
  useEffect(() => {
    if (!active) return;
    const root = ref.current;
    if (!root) return;
    const before = document.activeElement as HTMLElement | null;
    const items = () => Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement);
    const first = root.querySelector<HTMLElement>("[data-autofocus]") ?? items()[0];
    first?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && escRef.current) {
        e.preventDefault();
        escRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const list = items();
      if (!list.length) return;
      const i = list.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey && (i <= 0)) {
        e.preventDefault();
        list[list.length - 1].focus();
      } else if (!e.shiftKey && (i === -1 || i === list.length - 1)) {
        e.preventDefault();
        list[0].focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      if (before && document.contains(before)) before.focus({ preventScroll: true });
    };
  }, [active, ref]);
}

const TUTORIAL_KEY = "earthtrip-tutorial";

function tutorialHidden() {
  try {
    return localStorage.getItem(TUTORIAL_KEY) === "nascondi";
  } catch {
    return false;
  }
}

const TUTORIAL_STEPS = [
  {
    title: "Ruota il globo",
    body: "Trascina con un dito o col mouse per girare la Terra. Pizzica o usa la rotella per avvicinarti: sotto i 180 km si apre la mappa della superficie. Tocca un satellite per la sua scheda.",
  },
  {
    title: "Il dock in basso",
    body: "ISS e Luna ti portano lì in volo, Globale torna alla vista intera, Superficie scende sulla mappa, Astro mostra assi e orbite, Pannello apre livelli, satelliti e ora simulata.",
  },
  {
    title: "Difendi la Terra",
    body: "Il pulsante in alto a destra avvia il gioco: mira trascinando, compra torrette e missili a fine ondata e resisti ai boss. Puoi mettere in pausa quando vuoi.",
  },
] as const;

/** Tutorial di 3 passaggi mostrato al primo avvio; «Non mostrare più» lo salva in localStorage. */
function Tutorial({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [never, setNever] = useState(true);
  const card = useRef<HTMLDivElement>(null);
  const close = () => {
    try {
      if (never) localStorage.setItem(TUTORIAL_KEY, "nascondi");
      else localStorage.removeItem(TUTORIAL_KEY);
    } catch {
      /* memoria bloccata: il tutorial ricomparirà al prossimo avvio */
    }
    onClose();
  };
  useFocusTrap(card, true, close);
  const s = TUTORIAL_STEPS[step];
  const last = step === TUTORIAL_STEPS.length - 1;
  return (
    <div className="et-modal et-tutorial" role="dialog" aria-modal="true" aria-labelledby="et-tut-title">
      <div className="et-modal-card" ref={card} data-step={step + 1}>
        <header>
          <div>
            <p className="et-tut-step">Passo {step + 1} di {TUTORIAL_STEPS.length}</p>
            <h2 id="et-tut-title">{s.title}</h2>
          </div>
        </header>
        <p className="et-tut-body">{s.body}</p>
        <ol className="et-tut-dots" aria-hidden="true">
          {TUTORIAL_STEPS.map((x, i) => (
            <li key={x.title} className={i === step ? "is-on" : ""} />
          ))}
        </ol>
        <label className="et-tut-never">
          <input type="checkbox" checked={never} onChange={(e) => setNever(e.target.checked)} />
          Non mostrare più
        </label>
        <div className="et-tut-actions">
          {step > 0 ? (
            <button type="button" className="et-modal-alt" onClick={() => setStep((v) => v - 1)}>
              Indietro
            </button>
          ) : (
            <button type="button" className="et-modal-alt" onClick={close}>
              Salta
            </button>
          )}
          <button type="button" className="et-modal-go" data-autofocus onClick={() => (last ? close() : setStep((v) => v + 1))}>
            {last ? "Inizia" : "Avanti"}
          </button>
        </div>
      </div>
    </div>
  );
}
