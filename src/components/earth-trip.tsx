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
    <main className="et-root">
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
