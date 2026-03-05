export interface HeroStats {
  STR: number;
  DEX: number;
  AGI: number;
  INT: number;
  WIS: number;
  VIT: number;
  END: number;
  LCK: number;
}

export interface Weapon {
  name: string;
  type: 'Physical' | 'Magical';
  baseAtk: number;
  statReq: number;
  AaR: number; // Accuracy at Requirement
  curveMod: number;
  scalars: Array<{
    stat: keyof HeroStats;
    sv: number; // Scalar Value
    smb: number; // Scalar Max Bonus
  }>;
}

export interface Armor {
  name: string;
  type: 'Light' | 'Medium' | 'Heavy';
  pdefScalar: number;
  pdefMaxBonus: number;
  mdefScalar: number;
  mdefMaxBonus: number;
}

export const STAT_COEFFICIENTS = {
  STR: { A: 0.115, B: -0.020675, C: -0.281925, D: 2.245, E: 24.995, dim: 0.10 },
  DEX: { A: 0.115, B: -0.019425, C: -0.428175, D: 2.370, E: 21.870, dim: 0.10 },
  AGI: { A: 0.115, B: -0.020050, C: -0.312550, D: 2.3075, E: 21.9325, dim: 0.10 },
  VIT: { A: 0.115, B: -0.051925, C: -0.425675, D: 1.995, E: 19.245, dim: 0.10 },
  END: { A: 0.115, B: -0.036300, C: -0.431300, D: 2.120, E: 20.120, dim: 0.10 },
  INT: { A: 0.115, B: -0.003800, C: -0.298800, D: 2.495, E: 24.745, dim: 0.10 },
  WIS: { A: 0.115, B: -0.003800, C: -0.298800, D: 2.495, E: 24.745, dim: 0.10 },
  LCK: { A: 0.115, B: -0.0147375, C: -0.4627375, D: 2.120, E: 19.1325, dim: 0.10 },
  Speed: { A: 50.0, B: 165.850, C: 1523.350, D: 2.3075, E: 21.9325, dim: 120.0 },
  Crit: { A: 0.115, B: -0.0147375, C: -0.4627375, D: 2.120, E: 19.1325, dim: 0.10 },
};

export const DOUBLE_STAT_COEFFICIENTS = {
  EVA: {
    stat1: { A: 0.092, B: -0.01604, C: -0.25004, D: 2.3075, E: 21.9325 },
    stat2: { F: 0.023, G: -0.0029475, H: -0.0925475, I: 2.12, J: 19.1325 },
    dim: 0.10
  },
  Block: {
    stat1: { A: 0.092, B: -0.01554, C: -0.34254, D: 2.37, E: 21.87 },
    stat2: { F: 0.023, G: -0.0029475, H: -0.0925475, I: 2.12, J: 19.1325 },
    dim: 0.10
  },
  Recovery: {
    stat1: { A: 0.072, B: -0.02904, C: -0.23304, D: 1.995, E: 19.245 },
    stat2: { F: 0.018, G: -0.001385, H: -0.064110, I: 2.12, J: 19.1325 },
    dim: 0.075
  },
  SER: {
    stat1: { A: 0.126, B: -0.04392, C: -0.51192, D: 2.12, E: 20.12 },
    stat2: { F: 0.014, G: -0.002255, H: -0.0604925, I: 2.12, J: 19.1325 },
    dim: 0.12
  },
  SpellBlock: {
    stat1: { A: 0.092, B: -0.00304, C: -0.23904, D: 2.495, E: 24.745 },
    stat2: { F: 0.023, G: -0.0029475, H: -0.0925475, I: 2.12, J: 19.1325 },
    dim: 0.10
  }
};

export function singleStatScore(statVal: number, avgLevel: number, coeff: any) {
  let result = (coeff.A * statVal + coeff.B * avgLevel + coeff.C) / (coeff.D * avgLevel + coeff.E);
  if (result > coeff.dim) {
    result = coeff.dim + (result - coeff.dim) / 3;
  }
  return result;
}

export function doubleStatScore(stat1Val: number, stat2Val: number, avgLevel: number, coeff: any) {
  const part1 = (coeff.stat1.A * stat1Val + coeff.stat1.B * avgLevel + coeff.stat1.C) / (coeff.stat1.D * avgLevel + coeff.stat1.E);
  const part2 = (coeff.stat2.F * stat2Val + coeff.stat2.G * avgLevel + coeff.stat2.H) / (coeff.stat2.I * avgLevel + coeff.stat2.J);
  let result = part1 + part2;
  if (result > coeff.dim) {
    result = coeff.dim + (result - coeff.dim) / 3;
  }
  return result;
}

export function computeFocus(wis: number, dex: number) {
  return 0.6 * wis + 0.4 * dex;
}

export function computeAccuracy(heroStat: number, weaponReq: number, AaR: number, curveMod: number) {
  const chanceMod = heroStat - weaponReq;
  if (chanceMod <= 0) {
    return AaR * (curveMod / (Math.pow(chanceMod, 2) + curveMod));
  } else {
    return AaR * (1.35 - 0.35 * (curveMod / (Math.pow(chanceMod + 2, 2) + curveMod)));
  }
}

export function computeAttack(baseAtk: number, scalars: Array<{ heroStatVal: number, sv: number, smb: number }>) {
  let totalBonus = 0;
  for (const s of scalars) {
    totalBonus += Math.min(s.heroStatVal * s.sv, s.smb);
  }
  return baseAtk + totalBonus;
}

export function computeHeroCombatProfile(stats: HeroStats, avgPartyLevel: number) {
  const focus = computeFocus(stats.WIS, stats.DEX);
  
  return {
    STR: singleStatScore(stats.STR, avgPartyLevel, STAT_COEFFICIENTS.STR),
    DEX: singleStatScore(stats.DEX, avgPartyLevel, STAT_COEFFICIENTS.DEX),
    AGI: singleStatScore(stats.AGI, avgPartyLevel, STAT_COEFFICIENTS.AGI),
    VIT: singleStatScore(stats.VIT, avgPartyLevel, STAT_COEFFICIENTS.VIT),
    END: singleStatScore(stats.END, avgPartyLevel, STAT_COEFFICIENTS.END),
    INT: singleStatScore(stats.INT, avgPartyLevel, STAT_COEFFICIENTS.INT),
    WIS: singleStatScore(stats.WIS, avgPartyLevel, STAT_COEFFICIENTS.WIS),
    LCK: singleStatScore(stats.LCK, avgPartyLevel, STAT_COEFFICIENTS.LCK),
    Speed: singleStatScore(stats.AGI, avgPartyLevel, STAT_COEFFICIENTS.Speed),
    Crit: singleStatScore(stats.LCK, avgPartyLevel, STAT_COEFFICIENTS.Crit),
    EVA: doubleStatScore(stats.AGI, stats.LCK, avgPartyLevel, DOUBLE_STAT_COEFFICIENTS.EVA),
    Block: doubleStatScore(stats.DEX, stats.LCK, avgPartyLevel, DOUBLE_STAT_COEFFICIENTS.Block),
    Recovery: doubleStatScore(stats.VIT, stats.LCK, avgPartyLevel, DOUBLE_STAT_COEFFICIENTS.Recovery),
    SER: doubleStatScore(stats.END, stats.LCK, avgPartyLevel, DOUBLE_STAT_COEFFICIENTS.SER),
    SpellBlock: doubleStatScore(stats.INT, stats.LCK, avgPartyLevel, DOUBLE_STAT_COEFFICIENTS.SpellBlock),
    Focus: focus
  };
}

export const STARTER_WEAPONS: Weapon[] = [
  {
    name: "Squire's Sword",
    type: 'Physical',
    baseAtk: 10,
    statReq: 10,
    AaR: 0.85,
    curveMod: 150,
    scalars: [
      { stat: 'STR', sv: 0.5, smb: 20 },
      { stat: 'DEX', sv: 0.2, smb: 10 }
    ]
  },
  {
    name: "Recruit's Bow",
    type: 'Physical',
    baseAtk: 12,
    statReq: 12,
    AaR: 0.8,
    curveMod: 200,
    scalars: [
      { stat: 'DEX', sv: 0.6, smb: 25 },
      { stat: 'STR', sv: 0.1, smb: 5 }
    ]
  },
  {
    name: "Apprentice Wand",
    type: 'Magical',
    baseAtk: 8,
    statReq: 10,
    AaR: 0.9,
    curveMod: 120,
    scalars: [
      { stat: 'INT', sv: 0.5, smb: 20 },
      { stat: 'WIS', sv: 0.3, smb: 15 }
    ]
  },
  {
    name: "Initiate's Staff",
    type: 'Magical',
    baseAtk: 10,
    statReq: 12,
    AaR: 0.85,
    curveMod: 180,
    scalars: [
      { stat: 'INT', sv: 0.4, smb: 18 },
      { stat: 'WIS', sv: 0.4, smb: 18 }
    ]
  },
  {
    name: "Rusty Axe",
    type: 'Physical',
    baseAtk: 15,
    statReq: 14,
    AaR: 0.7,
    curveMod: 250,
    scalars: [
      { stat: 'STR', sv: 0.8, smb: 30 }
    ]
  },
  {
    name: "Dull Daggers",
    type: 'Physical',
    baseAtk: 8,
    statReq: 10,
    AaR: 0.9,
    curveMod: 100,
    scalars: [
      { stat: 'AGI', sv: 0.4, smb: 15 },
      { stat: 'DEX', sv: 0.4, smb: 15 }
    ]
  },
  {
    name: "Practice Spear",
    type: 'Physical',
    baseAtk: 12,
    statReq: 12,
    AaR: 0.82,
    curveMod: 160,
    scalars: [
      { stat: 'STR', sv: 0.4, smb: 15 },
      { stat: 'AGI', sv: 0.3, smb: 12 }
    ]
  },
  {
    name: "Wooden Mace",
    type: 'Physical',
    baseAtk: 13,
    statReq: 11,
    AaR: 0.8,
    curveMod: 140,
    scalars: [
      { stat: 'STR', sv: 0.6, smb: 25 },
      { stat: 'VIT', sv: 0.2, smb: 10 }
    ]
  },
  {
    name: "Old Grimoire",
    type: 'Magical',
    baseAtk: 9,
    statReq: 12,
    AaR: 0.88,
    curveMod: 130,
    scalars: [
      { stat: 'INT', sv: 0.7, smb: 28 }
    ]
  },
  {
    name: "Simple Orb",
    type: 'Magical',
    baseAtk: 11,
    statReq: 13,
    AaR: 0.84,
    curveMod: 170,
    scalars: [
      { stat: 'WIS', sv: 0.5, smb: 20 },
      { stat: 'INT', sv: 0.2, smb: 10 }
    ]
  }
];

export const STARTER_ARMORS: Armor[] = [
  {
    name: "Tattered Tunic",
    type: 'Light',
    pdefScalar: 0.2,
    pdefMaxBonus: 10,
    mdefScalar: 0.2,
    mdefMaxBonus: 10
  },
  {
    name: "Rusty Chainmail",
    type: 'Medium',
    pdefScalar: 0.5,
    pdefMaxBonus: 25,
    mdefScalar: 0.1,
    mdefMaxBonus: 5
  }
];
