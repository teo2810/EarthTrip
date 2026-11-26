/**
 * Bilanciamento della modalità Difesa: tutti i numeri regolabili stanno qui.
 *
 * Formule
 * - Upgrade a livelli (cannone, torrette, missili): costo = base × 1.22^livello attuale (v20, era 1.35).
 *   Il livello 0 vuol dire "non ancora comprato": il primo acquisto costa la base.
 * - Torrette: costo = base del tipo × 1.25^torrette già piazzate (di qualsiasi tipo).
 * - Testate dei missili: più potenza vuol dire ricarica più lunga.
 */
export const BALANCE = {
  /** Crescita del costo per ogni livello già comprato. */
  levelGrowth: 1.22,
  /** Livello massimo di ogni upgrade a livelli. */
  maxLevel: 12,

  /** Cannone personale: ogni modalità si sblocca a parte e sale da Liv. 1 a maxLevel. Numeri v20 da Math_Calc. */
  gun: {
    /** Proiettile grosso e lento a ricaricare. Dalla v22 non perfora: si ferma sul primo nemico (prima pierce 2). */
    singolo: { base: 55, damage: 1.45, cooldown: 0.42, pellets: 1, damagePerLevel: 0.14, ratePerLevel: 0.03, speed: 7.2, size: 0.058, color: 0x7dfff0, pierce: 1, range: 18, spreadDeg: 0 },
    /** Due colpi paralleli medi. */
    doppio: { base: 85, damage: 0.85, cooldown: 0.32, pellets: 2, damagePerLevel: 0.13, ratePerLevel: 0.04, speed: 6.6, size: 0.042, color: 0x9dffb0, pierce: 1, range: 18, spreadDeg: 0 },
    /** Pioggia di colpi piccoli e veloci, un po' imprecisi. */
    mitra: { base: 115, damage: 0.4, cooldown: 0.07, pellets: 1, damagePerLevel: 0.12, ratePerLevel: 0.06, speed: 8.2, size: 0.024, color: 0xe6fff8, pierce: 1, range: 18, spreadDeg: 3 },
    /** Ventaglio a corto raggio: devastante da vicino. */
    rosa: { base: 150, damage: 0.72, cooldown: 0.58, pellets: 7, damagePerLevel: 0.14, ratePerLevel: 0.03, speed: 5.6, size: 0.034, color: 0xfff1c2, pierce: 1, range: 7, spreadDeg: 32 },
  },
  /** A ogni livello il proiettile del cannone cresce di questa frazione. */
  gunSizePerLevel: 0.05,

  /** Torrette automatiche. */
  turrets: {
    max: 10,
    growth: 1.25,
    cannon: { base: 60, damage: 0.9, cooldown: 0.55, coneDeg: 14 },
    missile: { base: 100, coneDeg: 4, sweepDeg: 10 },
    mortar: { base: 110, damage: 3.0, cooldown: 2.0, coneDeg: 24, radius: 1.45, reach: 5.8 },
  },

  /** Upgrade globali, valgono per tutte le torrette. */
  turretUpgrades: {
    rate: { base: 70, perLevel: 0.09 },
    calibre: {
      base: 80,
      perLevel: 0.18,
      /** Aspetto dei colpi delle torrette per fascia di livello di Calibro. */
      tiers: [
        { from: 0, name: "Leggero", color: 0xffb15a, size: 0.04 },
        { from: 4, name: "Medio", color: 0xff7a2a, size: 0.056 },
        { from: 7, name: "Pesante", color: 0xff3355, size: 0.074 },
      ],
    },
  },

  /**
   * Testate dei lancia-missili. cooldown in secondi, prima degli upgrade.
   * La testata Singolo è gratuita, le altre si sbloccano una volta per partita.
   */
  missiles: {
    singolo: { cost: 0, cooldown: 1.35, damage: 2.1, radius: 0 },
    rada: { cost: 120, cooldown: 1.9, damage: 1.1, radius: 2.0, slowFor: 3.4 },
    grappolo: { cost: 220, cooldown: 3.0, damage: 0.95, radius: 0.85, bomblets: 5 },
    /** Il colpo diretto fa damage, l'esplosione (40%) non colpisce di nuovo lo stesso nemico. */
    ricerca: { cost: 320, cooldown: 3.8, damage: 4.6, radius: 0.85 },
    termobarica: { cost: 450, cooldown: 6.2, damage: 14, radius: 3.4 },
  },

  /**
   * Bonus che cadono dai nemici. chance = probabilità che un nemico lasci un bonus;
   * weights = come si divide tra i tipi. v20: gelo più frequente; durante il gelo torrette e scudo restano attivi.
   */
  drops: {
    chanceTrash: 0.07,
    chanceBoss: 0.45,
    weights: { shield: 0.38, freeze: 0.25, repair: 0.37 },
  },

  /** Nave tesoro: nemico grosso che attraversa lo schermo e spara alla Terra. */
  treasure: {
    /** Probabilità che compaia in un'ondata (dalla wave minWave). */
    chancePerWave: 0.4,
    minWave: 2,
    radius: 0.27,
    hp: 4.5,
    hpPerWave: 1.8,
    speed: 0.56,
    shotEvery: 2.3,
    /** Distanza minima e massima dalla Terra della sua rotta. */
    passMin: 1.8,
    passMax: 3.2,
    /** Il bonus vale il prezzo della prossima torretta Cannone base, arrotondato a 5. */
    pickupLife: 9,
    pickupTapRadius: 0.55,
  },

  /** Boss: teletrasporto dopo l'impatto sulla Terra, raggio, colpi e (v24) Satellite Madre e Asteroide Anomalo. */
  boss: {
    teleportTelegraph: 1.0,
    /** Scarto casuale della destinazione rispetto al lato opposto, in gradi. */
    teleportJitterDeg: 50,
    /** Raggio del boss: base + perWave × ondata, mai oltre max (la Terra ha raggio 1). */
    radiusBase: 0.34,
    radiusPerWave: 0.04,
    radiusMax: 0.75,
    /** Dall'ondata fireCapWave in poi i colpi del boss non crescono più (numero e cadenza). */
    fireCapWave: 10,
    shotsCap: 4,

    /* ── v24: sistema dei boss (valori provvisori, da tarare con Math_Calc) ── */
    /** Ondate dispari: Satellite Madre; pari: Asteroide Anomalo. */
    hpBase: 22,
    hpPerWave: 8,
    /** Danno nel punto debole scoperto. */
    critMult: 3,
    /** Danno fuori dal punto debole (scafo o nucleo coperto). */
    offMult: 0.35,
    /** Ciclo del punto debole: chiuso weakEvery s, suono di carica weakWarn s prima, scoperto weakOpen s. */
    weakEvery: 5.5,
    weakWarn: 0.7,
    weakOpen: 1.8,
    /** Raggio del punto debole rispetto al raggio del boss. */
    weakFrac: 0.6,
    /** Secondi tra due attacchi comuni (si alternano laser e pioggia). */
    attackEvery: 6.5,
    madre: {
      /** Velocità lungo l'ellisse (unità/s). */
      orbitSpeed: 0.42,
      /** Ampiezza di ogni scudo, angolo dei due laterali rispetto al frontale, oscillazione e velocità del gruppo. */
      shieldArcDeg: 56,
      lateralDeg: 110,
      shieldSwingDeg: 60,
      shieldSpin: 0.9,
      /** Colpi dell'attacco pesante a fine carica. */
      heavyShots: 5,
    },
    anomalo: {
      /** Fase 1: colpi che servono a frantumare la corazza (un critico ne vale critMult). */
      armorHitsBase: 12,
      armorHitsPerWave: 1,
      /** Fase 2: vita del nucleo rispetto a hpBase + hpPerWave × ondata, e raggio rispetto al meteorite. */
      coreHpFrac: 0.7,
      coreScale: 0.55,
      /** Quote del nucleo: appena fuori dall'orbita lunare (+coreNear) fino a coreFar; cambia quota ogni coreHopEvery s. */
      coreNear: 0.45,
      coreFar: 6.0,
      coreHopEvery: 3.2,
      /** Velocità angolare (rad/s) e molla del rimbalzo radiale (rigidità, smorzamento). */
      coreSpin: 0.55,
      coreStiff: 9,
      coreDamp: 2.2,
    },
    laser: {
      /** Preavviso (raggio sottile), arco spazzato, velocità, mezza larghezza utile sul cannone. */
      warn: 0.8,
      arcDeg: 80,
      sweepDegPerS: 22,
      halfWidthDeg: 7,
      /** Danno alla Terra ogni tick secondi con il cannone dentro il raggio. */
      dmg: 3,
      tick: 0.35,
      /** Il raggio parte a leadDeg dal cannone e gli passa sopra. */
      leadDeg: 35,
    },
    rain: {
      /** Asteroidi piccoli: base + perWave × ondata, al massimo max, in span s. */
      countBase: 5,
      countPerWave: 0.5,
      countMax: 11,
      span: 1.6,
      radius: 0.1,
      hpFrac: 0.5,
      speedMult: 1.25,
    },
  },

  /** Upgrade dei missili. */
  missileUpgrades: {
    reload: { base: 65, perLevel: 0.09 },
    radius: { base: 70, perLevel: 0.1 },
  },
} as const;

export type GunId = keyof typeof BALANCE.gun;
export type WarheadId = keyof typeof BALANCE.missiles;
export type TurretKind = "cannon" | "missile" | "mortar";

/** Costo del prossimo livello, null se al massimo. */
export function levelCost(base: number, level: number): number | null {
  if (level >= BALANCE.maxLevel) return null;
  return Math.round(base * BALANCE.levelGrowth ** level);
}

/** Costo della prossima torretta di quel tipo. */
export function turretPrice(kind: TurretKind, owned: number): number {
  return Math.round(BALANCE.turrets[kind].base * BALANCE.turrets.growth ** owned);
}

/** Moltiplicatore del danno per livello (Liv. 1 = 1). */
export function damageMult(perLevel: number, level: number) {
  return 1 + perLevel * Math.max(0, level - 1);
}

/** Moltiplicatore della ricarica: più livelli, ricarica più corta. */
export function cooldownMult(perLevel: number, level: number) {
  return 1 / (1 + perLevel * Math.max(0, level - 1));
}
