import { useEffect, useRef, useState, type ReactNode } from "react";
import { Axis3d, Globe2, Map, Moon, Satellite, SlidersHorizontal, X } from "lucide-react";
import { DEFAULT_FLAGS, type EarthApi, type Flags, type Telemetry } from "@/earth/types";

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
  const [gameOver, setGameOver] = useState<{
    score: number;
    wave: number;
    highscore: number;
    lastScore?: number | null;
    lastWave?: number | null;
  } | null>(null);
  const [defenseState, setDefenseState] = useState({
    wave: 1,
    earthHP: 100,
    exp: 0,
    score: 0,
    lunarEnergy: 0,
    highscore: 0,
    cannonCount: 1,
    weaponType: "base" as "base" | "mg" | "multi" | "homing",
    levels: { base: 1, mg: 0, multi: 0, homing: 0 },
    slots: [] as { id: string; level: number; cost: number; owned: boolean; selected: boolean; action: "buy" | "upgrade" | "select" | "max"; affordable: boolean }[],
    phase: "play",
    flash: 0,
    veil: 0,
    over: false,
    zoom: 0.11,
    shield: 0,
    freezeLeft: 0,
    boss: false,
    bossHp: 0,
    bossMax: 0,
    shop: false,
    shopKind: null as "wave" | "freeze" | null,
    guide: false,
    bossHint: null as { angle: number } | null,
    mainGun: "singolo" as "singolo" | "raffica" | "mitra" | "rosa",
    autoMode: "singolo" as "singolo" | "doppio" | "bombe",
    missile: "none" as "cluster" | "limited" | "slow" | "homing" | "none",
    placing: null as "cannon" | "missile" | null,
    placeMsg: "",
    cannonTurrets: 0,
    missileTurrets: 0,
    costs: { raffica: 70, mitra: 120, rosa: 160, doppio: 90, bombe: 140, cannon: 40, missile: 55, cluster: 80, limited: 130, slow: 170, homing: 260 },
    guns: [] as { id: string; name: string; owned: boolean; selected: boolean; cost: number }[],
    ammo: [] as { id: string; name: string; owned: boolean; selected: boolean; cost: number }[],
    missiles: [] as { id: string; name: string; owned: boolean; selected: boolean; cost: number; open: boolean }[],
    bestCleared: 0,
    missileCd: 0,
    missileCdMax: 2.2,
    lastRun: null as { score: number; wave: number; at: number } | null,
    bestRun: null as { score: number; wave: number; at: number } | null,
    unlocked: { cluster: true, limited: false, slow: false, homing: false },
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
  }, []);

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
              {" · "}
              {tel.tle === "live" ? "TLE live" : "TLE di bordo"}
              {tel.fps > 0 ? ` · ${tel.fps} fps` : ""}
            </p>
          </div>
        </div>
        <div className="et-clock">
          <strong>{utc} UTC</strong>
          <small>{local} locale</small>
        </div>
      </header>

      <button type="button" className={defenseActive ? "et-def-toggle is-on" : "et-def-toggle"} onClick={() => {
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
        {defenseActive ? "Esci" : "Difendi la Terra"}
      </button>
      {defenseActive && defenseState.phase !== "boom" && defenseState.phase !== "exit" ? (
        <>
          <ZoomRail value={defenseState.zoom ?? 0.11} onChange={(t) => apiRef.current?.setDefenseZoom(t)} />
          <DefenseHud state={defenseState} api={apiRef} />
        </>
      ) : null}
      {defenseActive && (defenseState.freezeLeft ?? 0) > 0 ? <div className="et-def-freeze" /> : null}
      {defenseActive && defenseState.flash > 0.02 ? <div className="et-def-flash" style={{ opacity: defenseState.flash }} /> : null}
      {defenseActive && defenseState.veil > 0.02 ? <div className="et-def-veil" style={{ opacity: defenseState.veil }} /> : null}
      {gameOver ? (
        <div className="et-over" role="dialog" aria-label="Game over">
          <div className="et-over-card">
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

      {sel ? (
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

      <nav className="et-dock" aria-label="Navigazione missione">
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

      <aside className={panel ? "et-sheet is-open" : "et-sheet"} aria-label="Controlli">
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

type DefenseSlot = {
  id: string;
  level: number;
  cost: number;
  owned: boolean;
  selected: boolean;
  action?: "buy" | "upgrade" | "select" | "max";
  affordable?: boolean;
  name?: string;
};

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

const OFFER_ICON: Record<string, () => ReactNode> = {
  "gun-singolo": IconSingle,
  "gun-raffica": IconBurst,
  "gun-mitra": IconBurst,
  "gun-rosa": IconFan,
  "ammo-singolo": IconSingle,
  "ammo-doppio": IconBurst,
  "ammo-bombe": IconBomb,
  "missile-basic": IconRocket,
  cluster: IconCluster,
  limited: IconHoming,
  slow: IconFreeze,
  homing: IconHoming,
  "arm-cannon": IconTurret,
  "arm-missile": IconRocket,
};

const OFFER_COPY: Record<string, string> = {
  "gun-singolo": "Un colpo dritto e preciso. È l'unica arma con cui parti.",
  "gun-raffica": "Tre colpi di fila, sullo stesso mirino.",
  "gun-mitra": "Fuoco continuo. Ogni colpo fa meno danno.",
  "gun-rosa": "Ventaglio di pallini, come un colpo a pompa.",
  "ammo-singolo": "Ogni cannone spara un colpo, solo dentro il cono.",
  "ammo-doppio": "Due colpi affiancati, sempre dentro il cono.",
  "ammo-bombe": "Bomba che scoppia a distanza e pulisce un'area.",
  "missile-basic": "Razzo dritto, senza inseguire il bersaglio.",
  cluster: "Esplode a mezza strada e colpisce intorno.",
  limited: "Gira poco e dura poco. Danno alto.",
  slow: "Rallenta i nemici nella zona dell'esplosione.",
  homing: "Il più forte: segue il bersaglio. Si sblocca per ultimo.",
  "arm-cannon": "Torretta fissa. Spara solo in avanti, ±10°, e non ruota.",
  "arm-missile": "Torretta fissa. Il tiro resta ±2°, ma il cono oscilla su ±10°.",
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
    <div className="et-zoom">
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

function DefenseHud({
  state,
  api,
}: {
  state: {
    wave: number;
    earthHP: number;
    exp: number;
    score?: number;
    lunarEnergy: number;
    highscore: number;
    shield?: number;
    freezeLeft?: number;
    boss?: boolean;
    bossHp?: number;
    bossMax?: number;
    shop?: boolean;
    shopKind?: "wave" | "freeze" | null;
    guide?: boolean;
    bossHint?: { angle: number } | null;
    placing?: "cannon" | "missile" | null;
    placeMsg?: string;
    cannonTurrets?: number;
    missileTurrets?: number;
    costs?: {
      raffica: number;
      mitra: number;
      rosa: number;
      doppio: number;
      bombe: number;
      cannon: number;
      missile: number;
      cluster: number;
      limited: number;
      slow: number;
      homing: number;
    };
    guns?: { id: string; name: string; owned: boolean; selected: boolean; cost: number }[];
    ammo?: { id: string; name: string; owned: boolean; selected: boolean; cost: number }[];
    missiles?: { id: string; name: string; owned: boolean; selected: boolean; cost: number; open: boolean }[];
    lastRun?: { score: number; wave: number } | null;
  };
  api: { current: EarthApi | null };
}) {
  const frozen = (state.freezeLeft ?? 0) > 0;
  const ready = state.lunarEnergy >= 100 && !frozen;
  const shop = Boolean(state.shop);
  const placing = state.placing ?? null;
  const exp = Math.floor(state.exp);
  const costs = state.costs;
  const bossMax = state.bossMax ?? 0;
  const buy = (id: string) => api.current?.buyDefenseUpgrade(id);
  const guide = Boolean(state.guide);
  const waveLabel = state.boss ? `B${state.wave}` : shop ? `F${state.wave}` : String(state.wave);
  const rec = Math.max(state.highscore, Math.floor(state.score ?? 0));
  const full = (state.cannonTurrets ?? 0) + (state.missileTurrets ?? 0) >= 6;
  const freezeShop = state.shopKind === "freeze";
  function offer(item: { id: string; name: string; owned: boolean; selected: boolean; cost: number; open?: boolean }) {
    const locked = item.open === false && !item.owned;
    const poor = !item.owned && exp < item.cost;
    const Icon = OFFER_ICON[item.id] ?? IconSingle;
    const left = exp - item.cost;
    const price = item.owned ? (item.selected ? "In uso" : "Usa") : poor ? `${item.cost}` : `−${item.cost}`;
    const detail = locked
      ? "Si sblocca per ultimo, dopo gli altri missili."
      : item.owned
        ? OFFER_COPY[item.id]
        : `${OFFER_COPY[item.id]} Costa ${item.cost}, te ne restano ${Math.max(0, left)}.`;
    return (
      <button
        key={item.id}
        type="button"
        className={item.selected ? "et-buy is-on" : "et-buy"}
        disabled={locked || poor}
        onClick={() => buy(item.id)}
      >
        <Icon />
        <span>
          <b>{item.name}</b>
          <small>{detail}</small>
        </span>
        <em>{price}</em>
      </button>
    );
  }
  const ownedGuns = (state.guns ?? []).filter((g) => g.owned);
  const gunShort: Record<string, string> = {
    "gun-singolo": "1",
    "gun-raffica": "Raf",
    "gun-mitra": "Mit",
    "gun-rosa": "Rosa",
  };
  const hint = state.bossHint;
  return (
    <>
      <div className={frozen ? "et-def-hud is-frozen" : "et-def-hud"}>
        <div className="et-def-bar">
          <span className="et-def-w" title={state.boss ? "Boss" : shop ? "Fine ondata" : "Ondata"}>{waveLabel}</span>
          <span className="et-def-hp" title="Integrità Terra"><i style={{ width: `${Math.max(0, Math.min(100, state.earthHP))}%` }} /></span>
          <span>{Math.round(state.earthHP)}</span>
          <span className="et-def-pt" title="Punti">{exp}</span>
          {state.shield ? <span className="is-shield">S{state.shield}</span> : null}
          {frozen ? <span className="is-freeze">Gelo</span> : null}
          {frozen && !shop && !guide ? (
            <button type="button" className="et-freeze-shop" onClick={() => buy("freeze-shop")}>
              Shop
            </button>
          ) : null}
          <span className="et-def-rec" title="Record">★{rec}</span>
          {state.lastRun ? <span className="et-def-last" title="Ultima partita">u{state.lastRun.score}</span> : null}
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
        {bossMax > 0 ? (
          <span className="et-bossbar" aria-label="Integrità del boss">
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
          className="et-boss-arrow"
          style={{
            left: `calc(50% + ${Math.cos(hint.angle) * 34}vmin)`,
            top: `calc(50% - ${Math.sin(hint.angle) * 34}vmin)`,
            transform: `translate(-50%, -50%) rotate(${-hint.angle}rad)`,
          }}
        >
          <i />
          Boss
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
        <div className="et-modal" role="dialog" aria-label="Mini guida">
          <div className="et-modal-card">
            <header>
              <h2>Difendi la Terra</h2>
            </header>
            <ol className="et-guide-list">
              <li>Trascina per mirare. Parti solo con il cannone e il colpo singolo. Gli upgrade comprati si cambiano in basso, quando vuoi.</li>
              <li>I punti si spendono a fine ondata. In scheda vedi quanti ne hai, quanto costa e quanti te ne restano.</li>
              <li>I cannoni fissi sparano a ±10° e non ruotano. I missili restano a ±2°, ma il cono oscilla su ±10°.</li>
              <li>Il boss sta lontano e scappa. Si lancia sulla Terra solo nell'ultimo quarto di vita. Se impatta, torna con la vita che gli restava, non piena.</li>
              <li>I bonus non sono colpi: anello grande, scudo, fiocco di neve o croce verde. Il gelo ferma tutto e, se vuoi, apre lo shop.</li>
              <li>La super della Luna si carica distruggendo nemici. Quando l'anello è pieno, tocca la Luna oppure il pulsante in basso: un'onda pulisce lo schermo.</li>
            </ol>
            <button type="button" className="et-modal-go" onClick={() => buy("guide-ok")}>
              Combatti
            </button>
          </div>
        </div>
      ) : null}
      {shop && !placing && !guide ? (
        <div className="et-modal" role="dialog" aria-label={freezeShop ? "Shop del gelo" : "Shop fine ondata"}>
          <div className="et-modal-card">
            <header>
              <div>
                <h2>{freezeShop ? "Shop del gelo" : `Fine ondata ${state.wave}`}</h2>
                <p className="et-wallet">Hai <b>{exp}</b> punti</p>
              </div>
            </header>
            <div className="et-modal-scroll">
              <section>
                <p className="et-buy-sec">Cannone personale</p>
                <div className="et-buy-list">{(state.guns ?? []).map(offer)}</div>
              </section>
              <section>
                <p className="et-buy-sec">Torrette</p>
                <div className="et-buy-list">
                  <button
                    type="button"
                    className="et-buy"
                    disabled={!costs || exp < costs.cannon || full}
                    onClick={() => buy("arm-cannon")}
                  >
                    <IconTurret />
                    <span>
                      <b>Cannone</b>
                      <small>{OFFER_COPY["arm-cannon"]} {exp >= (costs?.cannon ?? 40) ? `Costa ${costs?.cannon ?? 40}, restano ${exp - (costs?.cannon ?? 40)}.` : `Costa ${costs?.cannon ?? 40}.`}</small>
                    </span>
                    <em>{costs?.cannon ?? 40}</em>
                  </button>
                  <button
                    type="button"
                    className="et-buy"
                    disabled={!costs || exp < costs.missile || full}
                    onClick={() => buy("arm-missile")}
                  >
                    <IconRocket />
                    <span>
                      <b>Lancia missili</b>
                      <small>{OFFER_COPY["arm-missile"]} {exp >= (costs?.missile ?? 55) ? `Costa ${costs?.missile ?? 55}, restano ${exp - (costs?.missile ?? 55)}.` : `Costa ${costs?.missile ?? 55}.`}</small>
                    </span>
                    <em>{costs?.missile ?? 55}</em>
                  </button>
                </div>
              </section>
              {(state.cannonTurrets ?? 0) > 0 ? (
                <section>
                  <p className="et-buy-sec">Colpi dei cannoni</p>
                  <div className="et-buy-list">{(state.ammo ?? []).map(offer)}</div>
                </section>
              ) : null}
              {(state.missileTurrets ?? 0) > 0 ? (
                <section>
                  <p className="et-buy-sec">Missili</p>
                  <div className="et-buy-list">{(state.missiles ?? []).map(offer)}</div>
                </section>
              ) : null}
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
