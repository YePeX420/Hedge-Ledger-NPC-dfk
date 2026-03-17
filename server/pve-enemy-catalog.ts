export interface EnemyAbility {
  name: string;
  type: 'physical_damage' | 'magical_damage' | 'heal' | 'buff' | 'debuff' | 'cc';
  baseDamage: number;
  manaCost: number;
  cooldown: number;
  targetType: 'single_enemy' | 'aoe_enemy' | 'self';
  ccType?: string;
  weight: number;
}

export interface EnemyEntry {
  id: string;
  name: string;
  tier: number;
  hp: number;
  mp: number;
  atk: number;
  def: number;
  matk: number;
  mdef: number;
  spd: number;
  eva: number;
  crit: number;
  resistances: {
    stun: number;
    poison: number;
    exhaust: number;
    daze: number;
  };
  abilities: EnemyAbility[];
  description: string;
}

export const ENEMY_CATALOG: Record<string, EnemyEntry> = {
  'MAD_BOAR': {
    id: 'MAD_BOAR',
    name: 'Mad Boar',
    tier: 1,
    hp: 350,
    mp: 50,
    atk: 45,
    def: 20,
    matk: 10,
    mdef: 15,
    spd: 30,
    eva: 0.05,
    crit: 0.08,
    resistances: {
      stun: 0.3,
      poison: 0.1,
      exhaust: 0.2,
      daze: 0.15,
    },
    abilities: [
      {
        name: 'Gore',
        type: 'physical_damage',
        baseDamage: 55,
        manaCost: 0,
        cooldown: 0,
        targetType: 'single_enemy',
        weight: 0.6,
      },
      {
        name: 'Charge',
        type: 'physical_damage',
        baseDamage: 80,
        manaCost: 15,
        cooldown: 3,
        targetType: 'single_enemy',
        weight: 0.25,
      },
      {
        name: 'Enrage',
        type: 'buff',
        baseDamage: 0,
        manaCost: 10,
        cooldown: 5,
        targetType: 'self',
        weight: 0.15,
      },
    ],
    description: 'A common forest creature. Relies on physical attacks with occasional charge bursts.',
  },

  'MOTHERCLUCKER': {
    id: 'MOTHERCLUCKER',
    name: 'Motherclucker',
    tier: 1,
    hp: 250,
    mp: 30,
    atk: 35,
    def: 12,
    matk: 5,
    mdef: 10,
    spd: 45,
    eva: 0.12,
    crit: 0.1,
    resistances: {
      stun: 0.15,
      poison: 0.05,
      exhaust: 0.1,
      daze: 0.1,
    },
    abilities: [
      {
        name: 'Peck',
        type: 'physical_damage',
        baseDamage: 40,
        manaCost: 0,
        cooldown: 0,
        targetType: 'single_enemy',
        weight: 0.7,
      },
      {
        name: 'Flurry',
        type: 'physical_damage',
        baseDamage: 25,
        manaCost: 10,
        cooldown: 2,
        targetType: 'aoe_enemy',
        weight: 0.3,
      },
    ],
    description: 'A fast but fragile bird. High evasion makes it hard to hit but it goes down quickly when struck.',
  },

  'FOREST_WOLF': {
    id: 'FOREST_WOLF',
    name: 'Forest Wolf',
    tier: 2,
    hp: 500,
    mp: 80,
    atk: 60,
    def: 30,
    matk: 15,
    mdef: 20,
    spd: 50,
    eva: 0.08,
    crit: 0.12,
    resistances: {
      stun: 0.35,
      poison: 0.15,
      exhaust: 0.25,
      daze: 0.2,
    },
    abilities: [
      {
        name: 'Bite',
        type: 'physical_damage',
        baseDamage: 65,
        manaCost: 0,
        cooldown: 0,
        targetType: 'single_enemy',
        weight: 0.5,
      },
      {
        name: 'Howl',
        type: 'debuff',
        baseDamage: 0,
        manaCost: 20,
        cooldown: 4,
        targetType: 'aoe_enemy',
        ccType: 'daze',
        weight: 0.2,
      },
      {
        name: 'Lunge',
        type: 'physical_damage',
        baseDamage: 90,
        manaCost: 25,
        cooldown: 3,
        targetType: 'single_enemy',
        weight: 0.3,
      },
    ],
    description: 'A dangerous predator with pack tactics. Uses howl to debuff the party before lunging.',
  },
};

export function getEnemy(enemyId: string): EnemyEntry | null {
  const normalized = enemyId.toUpperCase().replace(/\s+/g, '_');
  return ENEMY_CATALOG[normalized] || null;
}

export function getEnemyOrFallback(enemyId: string, fallback?: Partial<EnemyEntry>): EnemyEntry {
  const existing = getEnemy(enemyId);
  if (existing) return existing;

  return {
    id: enemyId.toUpperCase().replace(/\s+/g, '_'),
    name: fallback?.name || enemyId,
    tier: fallback?.tier ?? 1,
    hp: fallback?.hp ?? 500,
    mp: fallback?.mp ?? 50,
    atk: fallback?.atk ?? 50,
    def: fallback?.def ?? 25,
    matk: fallback?.matk ?? 20,
    mdef: fallback?.mdef ?? 20,
    spd: fallback?.spd ?? 35,
    eva: fallback?.eva ?? 0.05,
    crit: fallback?.crit ?? 0.05,
    resistances: fallback?.resistances ?? {
      stun: 0.1,
      poison: 0.1,
      exhaust: 0.1,
      daze: 0.1,
    },
    abilities: fallback?.abilities ?? [
      {
        name: 'Basic Attack',
        type: 'physical_damage',
        baseDamage: 40,
        manaCost: 0,
        cooldown: 0,
        targetType: 'single_enemy',
        weight: 1,
      },
    ],
    description: fallback?.description || 'Fallback enemy profile inferred from runtime telemetry.',
  };
}

export function getEnemyDamagePerTurn(enemy: EnemyEntry): number {
  let expectedDmg = 0;
  for (const ability of enemy.abilities) {
    if (ability.type === 'physical_damage' || ability.type === 'magical_damage') {
      expectedDmg += ability.baseDamage * ability.weight;
    }
  }
  return expectedDmg;
}

export function getAllEnemyIds(): string[] {
  return Object.keys(ENEMY_CATALOG);
}
