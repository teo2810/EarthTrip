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
  const [gameOver, setGameOver] = useState<{ score: number; wave: number; highscore: number } | null>(null);
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
    slots: [] as { id: string; level: number; cost: number; owned: boolean; selected: boolean }[],
    phase: "play",
    flash: 0,
    veil: 0,
    over: false,
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
    <main className={defenseActive ? "et-root is-defense" : "et-root"}>
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
      {defenseActive && defenseState.phase !== "boom" && defenseState.phase !== "exit" ? <DefenseHud state={defenseState} api={apiRef} /> : null}
      {defenseActive && defenseState.flash > 0.02 ? <div className="et-def-flash" style={{ opacity: defenseState.flash }} /> : null}
      {defenseActive && defenseState.veil > 0.02 ? <div className="et-def-veil" style={{ opacity: defenseState.veil }} /> : null}
      {gameOver ? (
        <div className="et-over" role="dialog" aria-label="Game over">
          <div className="et-over-card">
            <p>Game over</p>
            <h2>Terra perduta</h2>
            <ul>
              <li>Punteggio <strong>{gameOver.score}</strong></li>
              <li>Onda <strong>{gameOver.wave}</strong></li>
              <li>Record <strong>{gameOver.highscore}</strong></li>
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

type DefenseSlot = { id: string; level: number; cost: number; owned: boolean; selected: boolean };

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

const SLOT_ICON: Record<string, () => ReactNode> = {
  base: IconSingle,
  mg: IconBurst,
  multi: IconFan,
  homing: IconHoming,
  cannon: IconTurret,
};

function DefenseHud({
  state,
  api,
}: {
  state: {
    wave: number;
    earthHP: number;
    exp: number;
    lunarEnergy: number;
    highscore: number;
    slots: DefenseSlot[];
    over?: boolean;
  };
  api: { current: EarthApi | null };
}) {
  const ready = state.lunarEnergy >= 100;
  const slots = state.slots.length
    ? state.slots
    : [
        { id: "base", level: 1, cost: 0, owned: true, selected: true },
        { id: "mg", level: 0, cost: 90, owned: false, selected: false },
        { id: "multi", level: 0, cost: 140, owned: false, selected: false },
        { id: "homing", level: 0, cost: 200, owned: false, selected: false },
        { id: "cannon", level: 1, cost: 70, owned: true, selected: false },
      ];
  return (
    <div className="et-def-hud">
      <div className="et-def-stats">
        <span>{`Onda ${state.wave}`}</span>
        <span className="et-def-hp"><i style={{ width: `${Math.max(0, Math.min(100, state.earthHP))}%` }} /></span>
        <span>HP {Math.round(state.earthHP)}</span>
        <span>EXP {Math.floor(state.exp)}</span>
        <span>Rec {state.highscore}</span>
      </div>
      <div className="et-def-row">
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
        <div className="et-def-slots">
          {slots.map((slot) => {
            const Icon = SLOT_ICON[slot.id] ?? IconSingle;
            const label = !slot.owned ? `${slot.cost}` : slot.cost > 0 && slot.selected ? `Lv${slot.level} · ${slot.cost}` : `Lv${slot.level}`;
            return (
              <button
                key={slot.id}
                type="button"
                className={slot.selected ? "et-def-slot is-on" : slot.owned ? "et-def-slot" : "et-def-slot is-locked"}
                onClick={() => api.current?.buyDefenseUpgrade(slot.id === "cannon" ? "cannon" : `weapon-${slot.id}`)}
              >
                <Icon />
                <small>{label}</small>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
