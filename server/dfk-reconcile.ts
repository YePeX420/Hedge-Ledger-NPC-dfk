import { ENEMY_CATALOG, type EnemyEntry } from './pve-enemy-catalog';

export interface ObservedStats {
  hp?: number;
  mp?: number;
  atk?: number;
  pDef?: number;
  mDef?: number;
  speed?: number;
  pAcc?: number;
  eva?: number;
  pRed?: number;
  mRed?: number;
  csc?: number;
  cdm?: number;
  [key: string]: number | undefined;
}

export interface StatDiff {
  field: string;
  observed: number;
  expected: number;
  delta: number;
  suspectedCause: string;
}

export interface ReconciliationResult {
  observed: ObservedStats;
  expected: ObservedStats;
  diffs: StatDiff[];
  notes: string[];
}

const RECONCILE_FIELDS = ['hp', 'mp', 'atk', 'pDef', 'mDef', 'speed', 'pAcc', 'eva', 'pRed', 'mRed', 'csc', 'cdm'];

function computeExpectedEnemyStats(enemy: EnemyEntry): ObservedStats {
  return {
    hp: enemy.hp,
    mp: enemy.mp,
    atk: enemy.atk,
    pDef: enemy.def,
    mDef: enemy.mdef,
    speed: enemy.spd,
    pAcc: 0,
    eva: Math.round(enemy.eva * 100),
    pRed: 0,
    mRed: 0,
    csc: Math.round(enemy.crit * 100),
    cdm: 150,
  };
}

interface HeroBaseStats {
  str: number;
  dex: number;
  agi: number;
  int: number;
  wis: number;
  vit: number;
  end: number;
  lck: number;
  level: number;
}

function computeExpectedHeroStats(base: HeroBaseStats): ObservedStats {
  const { str, dex, agi, int: intelligence, wis, vit, end, lck, level } = base;

  const hp = 150 + vit * 5 + end * 2 + level * 10;
  const mp = 80 + intelligence * 4 + wis * 2 + level * 5;
  const atk = str * 2 + dex;
  const pDef = end * 2 + vit;
  const mDef = wis * 2 + intelligence;
  const speed = agi * 2 + dex;
  const pAcc = dex + lck * 0.5;
  const eva = agi + lck * 0.3;
  const pRed = end;
  const mRed = wis;
  const csc = Math.min(100, lck * 0.5 + dex * 0.2);
  const cdm = 150 + lck * 0.5;

  return {
    hp: Math.round(hp),
    mp: Math.round(mp),
    atk: Math.round(atk),
    pDef: Math.round(pDef),
    mDef: Math.round(mDef),
    speed: Math.round(speed),
    pAcc: Math.round(pAcc),
    eva: Math.round(eva),
    pRed: Math.round(pRed),
    mRed: Math.round(mRed),
    csc: Math.round(csc),
    cdm: Math.round(cdm),
  };
}

function guessCause(field: string, delta: number, hasEquipment: boolean): string {
  const absDelta = Math.abs(delta);

  if (absDelta === 0) return 'match';

  if (hasEquipment && absDelta > 0) {
    return 'likely equipment modifier not accounted for';
  }

  if (field === 'hp' || field === 'mp') {
    if (delta > 0) return 'possible buff or equipment bonus';
    return 'possible damage taken or debuff applied';
  }

  if (field === 'atk' || field === 'pDef' || field === 'mDef' || field === 'speed') {
    if (delta > 0) return 'possible buff or passive not modeled';
    return 'possible debuff or missing modifier';
  }

  if (field === 'csc' || field === 'cdm') {
    return 'possible passive skill or equipment bonus';
  }

  if (field === 'eva' || field === 'pAcc') {
    return 'possible passive or buff effect';
  }

  return 'unknown cause — formula may need revision';
}

export function reconcileStats(
  observed: ObservedStats,
  options: {
    enemyId?: string;
    heroBaseStats?: HeroBaseStats;
    hasEquipment?: boolean;
  }
): ReconciliationResult {
  const notes: string[] = [];
  let expected: ObservedStats = {};

  if (options.enemyId) {
    const normalized = options.enemyId.toUpperCase().replace(/\s+/g, '_');
    const enemy = ENEMY_CATALOG[normalized];
    if (!enemy) {
      notes.push(`Enemy '${options.enemyId}' not found in catalog — using observed as expected`);
      expected = { ...observed };
    } else {
      expected = computeExpectedEnemyStats(enemy);
      notes.push(`Compared against enemy catalog entry: ${enemy.name} (Tier ${enemy.tier})`);
    }
  } else if (options.heroBaseStats) {
    expected = computeExpectedHeroStats(options.heroBaseStats);
    notes.push(`Computed expected hero stats from base attributes (level ${options.heroBaseStats.level})`);
    if (options.hasEquipment) {
      notes.push('Hero has equipment — deltas may be explained by gear bonuses');
    }
  } else {
    notes.push('No enemy ID or hero base stats provided — cannot compute expected values');
    return { observed, expected: {}, diffs: [], notes };
  }

  const diffs: StatDiff[] = [];

  for (const field of RECONCILE_FIELDS) {
    const obs = observed[field];
    const exp = expected[field];

    if (obs === undefined || exp === undefined) continue;

    const delta = obs - exp;

    if (Math.abs(delta) > 0.5) {
      diffs.push({
        field,
        observed: obs,
        expected: exp,
        delta: Math.round(delta * 100) / 100,
        suspectedCause: guessCause(field, delta, options.hasEquipment ?? false),
      });
    }
  }

  if (diffs.length === 0) {
    notes.push('All stats match expected values within tolerance');
  } else {
    notes.push(`${diffs.length} stat(s) differ from expected values`);
  }

  return { observed, expected, diffs, notes };
}
