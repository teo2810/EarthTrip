/**
 * Curiosità sui satelliti per la scheda. Tabella statica e compatta: i satelliti noti si riconoscono dal numero
 * NORAD o dal nome; tutti gli altri ricadono su un testo generico per categoria e orbita.
 * Regola: solo dati sicuri. Se un campo non è certo (anno, operatore) si omette.
 */
import type { Regime, SatGroup } from "@/earth/types";

export type SatInfo = {
  /** A cosa serve. */
  purpose: string;
  /** Missione o curiosità, una frase. */
  mission?: string;
  operator?: string;
  /** Anno di lancio (o della serie), solo se sicuro. */
  year?: string;
  /** Vero per i testi generici di ripiego. */
  generic?: boolean;
};

type Entry = { norad?: number; name?: RegExp; info: SatInfo | ((name: string) => SatInfo) };

const num = (name: string) => Number(/(\d+)/.exec(name.replace(/\(.*?\)/g, ""))?.[1] ?? NaN);
const byNumber = (base: Omit<SatInfo, "year">, years: Record<number, string>) => (name: string): SatInfo => ({ ...base, year: years[num(name)] });

const TABLE: Entry[] = [
  {
    norad: 25544,
    name: /ZARYA|^ISS\b/,
    info: {
      purpose: "Laboratorio di ricerca abitato in orbita bassa, con equipaggio permanente dal novembre 2000.",
      mission: "Il primo modulo, Zarya, è stato lanciato il 20 novembre 1998. Compie circa 15,5 giri al giorno.",
      operator: "NASA, Roscosmos, ESA, JAXA, CSA",
      year: "1998",
    },
  },
  {
    norad: 48274,
    name: /TIANHE|^CSS\b/,
    info: {
      purpose: "Stazione spaziale cinese Tiangong: laboratorio in orbita bassa con equipaggio.",
      mission: "Tianhe è il modulo centrale, lanciato il 29 aprile 2021.",
      operator: "CMSA (Agenzia cinese per i voli umani)",
      year: "2021",
    },
  },
  { name: /POISK/, info: { purpose: "Modulo russo della ISS, usato come camera di equilibrio e porto di attracco.", operator: "Roscosmos", year: "2009" } },
  { name: /SHENZHOU/, info: { purpose: "Navicella cinese con equipaggio, porta gli astronauti alla stazione Tiangong.", mission: "Il primo volo con equipaggio, Shenzhou 5, è del 2003.", operator: "CMSA" } },
  { name: /TIANZHOU/, info: { purpose: "Cargo cinese automatico che rifornisce la stazione Tiangong.", operator: "CMSA" } },
  { name: /PROGRESS/, info: { purpose: "Cargo russo automatico che porta carburante, acqua e rifornimenti alla ISS.", operator: "Roscosmos" } },
  {
    norad: 20580,
    name: /^HST$|HUBBLE/,
    info: {
      purpose: "Telescopio spaziale per luce visibile, ultravioletta e infrarosso vicino, fuori dal velo dell'atmosfera.",
      mission: "Lanciato dallo Space Shuttle Discovery il 24 aprile 1990, è stato riparato e potenziato più volte in orbita.",
      operator: "NASA, ESA",
      year: "1990",
    },
  },
  {
    name: /STARLINK/,
    info: {
      purpose: "Fa parte della costellazione di SpaceX per l'accesso a internet a banda larga da orbita bassa.",
      mission: "I primi 60 satelliti di serie sono stati lanciati il 24 maggio 2019; oggi sono migliaia.",
      operator: "SpaceX",
      year: "2019 (costellazione)",
    },
  },
  { name: /GPS BIIRM/, info: { purpose: "Satellite del GPS statunitense: trasmette segnali per calcolare posizione e ora (GNSS).", mission: "Serie IIR-M, con il secondo segnale civile.", operator: "Forza spaziale USA (US Space Force)", year: "2005–2009 (serie)" } },
  { name: /GPS BIIR/, info: { purpose: "Satellite del GPS statunitense: trasmette segnali per calcolare posizione e ora (GNSS).", operator: "Forza spaziale USA (US Space Force)", year: "1997–2004 (serie)" } },
  { name: /GPS BIIF/, info: { purpose: "Satellite del GPS statunitense: trasmette segnali per calcolare posizione e ora (GNSS).", mission: "Serie IIF, con il terzo segnale civile.", operator: "Forza spaziale USA (US Space Force)", year: "2010–2016 (serie)" } },
  { name: /GPS BIII/, info: { purpose: "Satellite del GPS statunitense: trasmette segnali per calcolare posizione e ora (GNSS).", mission: "Serie III, la più recente, più precisa e più resistente ai disturbi.", operator: "Forza spaziale USA (US Space Force)", year: "dal 2018 (serie)" } },
  { name: /NAVSTAR|^GPS\b/, info: { purpose: "Satellite del GPS statunitense: trasmette segnali per calcolare posizione e ora (GNSS).", mission: "Il primo satellite del sistema è stato lanciato nel 1978.", operator: "Forza spaziale USA (US Space Force)" } },
  { name: /GALILEO|GSAT0[12]\d\d/, info: { purpose: "Satellite del sistema europeo di navigazione Galileo (GNSS), in orbita media.", mission: "I primi satelliti operativi sono stati lanciati nel 2011.", operator: "Unione europea (EUSPA), con ESA" } },
  { name: /GLONASS/, info: { purpose: "Satellite del sistema russo di navigazione GLONASS (GNSS), in orbita media.", mission: "Il primo satellite del sistema è stato lanciato nel 1982.", operator: "Roscosmos" } },
  { name: /SENTINEL/, info: { purpose: "Osservazione della Terra per il programma europeo Copernicus: clima, mari, suoli, atmosfera.", mission: "La famiglia Sentinel è iniziata con Sentinel-1A nel 2014.", operator: "ESA, Unione europea" } },
  {
    name: /^TERRA$/,
    info: { purpose: "Osserva terre, oceani, nubi e atmosfera per studiare il clima.", mission: "Primo satellite del programma EOS della NASA, in orbita eliosincrona.", operator: "NASA", year: "1999" },
  },
  { name: /^AQUA$/, info: { purpose: "Studia il ciclo dell'acqua: oceani, nubi, ghiacci e vapore.", operator: "NASA", year: "2002" } },
  { name: /^AURA$/, info: { purpose: "Misura la composizione dell'atmosfera: ozono, qualità dell'aria e clima.", operator: "NASA", year: "2004" } },
  { name: /LANDSAT/, info: byNumber({ purpose: "Fotografa la superficie terrestre dal 1972 con la serie Landsat, la più lunga archiviazione di immagini della Terra.", operator: "NASA, USGS" }, { 8: "2013", 9: "2021" }) },
  { name: /SUOMI NPP/, info: { purpose: "Satellite meteorologico e climatico in orbita polare.", operator: "NOAA, NASA", year: "2011" } },
  { name: /NOAA[ -]?(20|21)\b|JPSS/, info: byNumber({ purpose: "Satellite meteorologico polare del sistema JPSS: previsioni del tempo e monitoraggio del clima.", operator: "NOAA, NASA" }, { 20: "2017", 21: "2022" }) },
  { name: /NOAA/, info: { purpose: "Satellite meteorologico polare: passa sopra i poli e alimenta le previsioni del tempo.", operator: "NOAA" } },
  { name: /GOES/, info: byNumber({ purpose: "Satellite meteorologico geostazionario: tiene d'occhio sempre lo stesso emisfero, con tempeste e fulmini.", operator: "NOAA, con NASA" }, { 16: "2016", 17: "2018", 18: "2022", 19: "2024" }) },
  { name: /METEOSAT/, info: byNumber({ purpose: "Satellite meteorologico geostazionario europeo: osserva Europa, Africa e Oceano Indiano.", operator: "EUMETSAT" }, { 8: "2002", 9: "2005", 10: "2012", 11: "2015", 12: "2022" }) },
  { name: /HIMAWARI/, info: byNumber({ purpose: "Satellite meteorologico geostazionario sopra Asia orientale e Pacifico.", operator: "JMA (Agenzia meteorologica giapponese)" }, { 8: "2014", 9: "2016" }) },
  { name: /^TESS$/, info: { purpose: "Cerca esopianeti osservando il lieve calo di luce delle stelle quando un pianeta transita.", operator: "NASA", year: "2018" } },
  { name: /FERMI/, info: { purpose: "Telescopio per i raggi gamma: studia buchi neri, pulsar ed esplosioni cosmiche.", operator: "NASA", year: "2008" } },
  { name: /^SWIFT\b/, info: { purpose: "Individua e segue i lampi di raggi gamma, le esplosioni più energetiche dell'universo.", operator: "NASA", year: "2004" } },
  { name: /CHANDRA/, info: { purpose: "Telescopio per i raggi X su un'orbita molto ellittica, lontana dalla Terra.", operator: "NASA", year: "1999" } },
  { name: /XMM/, info: { purpose: "Osservatorio europeo per i raggi X: buchi neri, ammassi di galassie, resti di supernove.", operator: "ESA", year: "1999" } },
  { name: /IXPE/, info: { purpose: "Misura la polarizzazione dei raggi X di buchi neri e stelle di neutroni.", operator: "NASA, ASI (Agenzia spaziale italiana)", year: "2021" } },
  { name: /HINODE|SOLAR-B/, info: { purpose: "Osserva il Sole e il suo campo magnetico.", operator: "JAXA, con NASA ed ESA", year: "2006" } },
  { name: /INTEGRAL/, info: { purpose: "Osservatorio europeo per raggi gamma e X.", operator: "ESA", year: "2002" } },
];

/** Testo generico di ripiego, per categoria e orbita. */
function fallback(group: SatGroup, regime: Regime): SatInfo {
  const purpose =
    group === "nav"
      ? "Satellite di navigazione (GNSS): trasmette segnali con cui un ricevitore calcola posizione e ora."
      : group === "station"
        ? "Veicolo o modulo legato alle stazioni spaziali in orbita bassa."
        : group === "starlink"
          ? "Satellite di una costellazione per internet da orbita bassa."
          : regime === "geo"
            ? "Satellite scientifico o meteorologico in orbita alta."
            : "Satellite scientifico o di osservazione della Terra.";
  const mission =
    regime === "leo"
      ? "In orbita bassa (LEO): un giro completo in meno di due ore."
      : regime === "meo"
        ? "In orbita media (MEO): un giro in diverse ore, comune per la navigazione."
        : "In orbita alta (GEO/HEO): se è geostazionario resta fermo sopra lo stesso punto dell'equatore.";
  return { purpose, mission, generic: true };
}

/** Informazioni su un satellite: dalla tabella se è noto, altrimenti un testo generico. */
export function satInfo(name: string, norad: number, group: SatGroup, regime: Regime): SatInfo {
  const n = name.toUpperCase().trim();
  for (const e of TABLE) {
    if ((e.norad != null && e.norad === norad) || e.name?.test(n)) return typeof e.info === "function" ? e.info(n) : e.info;
  }
  return fallback(group, regime);
}

/** Sigle di orbita e navigazione, una riga ciascuna. */
export const ACRONYMS: Record<string, string> = {
  LEO: "Orbita terrestre bassa (Low Earth Orbit): sotto i 2.000 km di quota.",
  MEO: "Orbita terrestre media (Medium Earth Orbit): tra 2.000 e 35.786 km, tipica dei satelliti di navigazione.",
  GEO: "Orbita geostazionaria (Geostationary Orbit): a 35.786 km sull'equatore, il satellite resta sopra lo stesso punto.",
  HEO: "Orbita molto ellittica (Highly Elliptical Orbit): perigeo basso e apogeo altissimo.",
  SSO: "Orbita eliosincrona (Sun-Synchronous Orbit): passa sempre alla stessa ora solare locale, ideale per osservare la Terra.",
  GNSS: "Sistema globale di navigazione satellitare (Global Navigation Satellite System): GPS, Galileo, GLONASS, BeiDou.",
};

/** Orbita eliosincrona probabile: quota e inclinazione tipiche (circa 97–99° tra 500 e 1.000 km). */
export function isSunSync(regime: Regime, altKm: number, incDeg: number) {
  return regime === "leo" && altKm >= 500 && altKm <= 1000 && incDeg >= 96.5 && incDeg <= 99.5;
}
