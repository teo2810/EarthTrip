/**
 * Bilanciamento della modalità Difesa: tutti i numeri regolabili stanno qui.
 *
 * Formule
 * - Upgrade a livelli (cannone, torrette, missili): costo = base × 1.35^livello attuale.
 *   Il livello 0 vuol dire "non ancora comprato": il primo acquisto costa la base.
 * - Torrette: costo = base del tipo × 1.25^torrette già piazzate (di qualsiasi tipo).
 * - Testate dei missili: più potenza vuol dire ricarica più lunga.
 */
export const BALANCE = {
  /** Crescita del costo per ogni livello già comprato. */
  levelGrowth: 1.35,
  /** Livello massimo di ogni upgrade a livelli. */
  maxLevel: 10,

  /** Cannone personale: ogni modalità si sblocca a parte e sale da Liv. 1 a 10. */
  gun: {
    singolo: { base: 40, damage: 1.15, cooldown: 0.32, pellets: 1, damagePerLevel: 0.16, ratePerLevel: 0.03 },
    doppio: { base: 90, damage: 0.8, cooldown: 0.36, pellets: 2, damagePerLevel: 0.12, ratePerLevel: 0.04 },
    mitra: { base: 140, damage: 0.36, cooldown: 0.085, pellets: 1, damagePerLevel: 0.05, ratePerLevel: 0.06 },
    rosa: { base: 180, damage: 0.5, cooldown: 0.5, pellets: 7, damagePerLevel: 0.12, ratePerLevel: 0.03 },
  },

  /** Torrette automatiche. */
  turrets: {
    max: 8,
    growth: 1.25,
    cannon: { base: 60, damage: 0.7, cooldown: 0.55, coneDeg: 10 },
    missile: { base: 90, coneDeg: 2, sweepDeg: 10 },
    mortar: { base: 110, damage: 2.2, cooldown: 2.3, coneDeg: 20, radius: 1.45, reach: 5.2 },
  },

  /** Upgrade globali, valgono per tutte le torrette. */
  turretUpgrades: {
    rate: { base: 70, perLevel: 0.07 },
    calibre: { base: 80, perLevel: 0.14 },
  },

  /**
   * Testate dei lancia-missili. cooldown in secondi, prima degli upgrade.
   * La testata Singolo è gratuita, le altre si sbloccano una volta per partita.
   */
  missiles: {
    singolo: { cost: 0, cooldown: 1.2, damage: 2.2, radius: 0 },
    rada: { cost: 120, cooldown: 1.9, damage: 0.8, radius: 2.0, slowFor: 3.4 },
    grappolo: { cost: 180, cooldown: 2.7, damage: 1.4, radius: 0.75, bomblets: 5 },
    ricerca: { cost: 280, cooldown: 3.5, damage: 6.0, radius: 1.0 },
    termobarica: { cost: 450, cooldown: 8.0, damage: 12, radius: 3.4 },
  },

  /** Upgrade dei missili. */
  missileUpgrades: {
    reload: { base: 90, perLevel: 0.05 },
    radius: { base: 90, perLevel: 0.08 },
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
