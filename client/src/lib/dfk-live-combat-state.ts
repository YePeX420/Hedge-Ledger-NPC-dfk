export interface LiveBuffDebuff {
  name: string;
  statKey: string;
  delta: number;
  isPercent: boolean;
  source: 'skill' | 'passive' | 'conditional';
  turnApplied: number;
  durationTurns?: number;
}

export interface LiveHeroState {
  heroId: string | null;
  heroClass: string | null;
  slot: number;
  side: 'a' | 'b';
  currentHp: number | null;
  currentMp: number | null;
  maxHp: number | null;
  maxMp: number | null;
  hpPct: number | null;
  mpPct: number | null;
  activeBuffs: LiveBuffDebuff[];
  activeDebuffs: LiveBuffDebuff[];
}

export interface LiveCombatState {
  sideA: LiveHeroState[];
  sideB: LiveHeroState[];
  turnCount: number;
  isActive: boolean;
  boutId?: number;
}

export interface HeroHpEntry {
  slot: number;
  heroId: string | null;
  heroClass: string | null;
  currentHp: number | null;
  currentMp: number | null;
  maxHp: number | null;
  maxMp: number | null;
  hpPct: number | null;
}

export interface HeroHpSnapshot {
  sideA: HeroHpEntry[];
  sideB: HeroHpEntry[];
}

interface TurnInfo {
  side?: number;
  slot?: number;
}

interface AttackConfig {
  attackId?: string;
}

interface TrackerConfig {
  trackerId?: string;
}

interface Tracker {
  trackerConfig?: TrackerConfig;
}

interface OutcomeUnit {
  side?: number;
  slot?: number;
  trackers?: Tracker[];
}

interface AttackOutcome {
  outcomeUnits?: OutcomeUnit[];
}

interface DeckSlotState {
  health?: number;
  mana?: number;
  baseCombatant?: { hp?: number };
}

export interface BattleTurn {
  currentTurnCount?: number;
  turn?: TurnInfo;
  attackConfig?: AttackConfig;
  attackOutcome?: AttackOutcome;
  beforeDeckStates?: Record<string, Record<string, DeckSlotState>>;
  afterDeckStates?: Record<string, Record<string, DeckSlotState>>;
  [key: string]: unknown;
}

interface EffectDef {
  statKey: string;
  delta: number;
  isPercent: boolean;
  duration: number;
}

// Duration values are DFK game-mechanic constants. Turn stream trackers appear
// only when an effect is first applied; there is no explicit "effect expired"
// event in the stream data. Therefore we estimate expiration as
// turnApplied + duration >= currentTurnCount. Re-application of the same
// effect on a later turn resets the timer (latest application wins).

const BUFF_SKILL_EFFECTS: Record<string, EffectDef[]> = {
  'iron skin': [
    { statKey: 'P.RED', delta: 15, isPercent: true, duration: 3 },
  ],
  'hardened shield': [
    { statKey: 'P.DEF', delta: 25, isPercent: true, duration: 3 },
    { statKey: 'M.DEF', delta: 25, isPercent: true, duration: 3 },
  ],
  'speed': [
    { statKey: 'SPEED', delta: 20, isPercent: true, duration: 3 },
  ],
  'critical aim': [
    { statKey: 'CSC', delta: 10, isPercent: true, duration: 3 },
  ],
};

const DEBUFF_TRACKER_EFFECTS: Record<string, EffectDef[]> = {
  'blind': [
    { statKey: 'ACC', delta: -25, isPercent: true, duration: 2 },
  ],
  'exhaust': [
    { statKey: 'SPEED', delta: -30, isPercent: true, duration: 2 },
  ],
  'slow': [
    { statKey: 'SPEED', delta: -20, isPercent: true, duration: 2 },
  ],
  'daze': [
    { statKey: 'EVA', delta: -5, isPercent: true, duration: 2 },
  ],
  'stun': [
    { statKey: 'SPEED', delta: -100, isPercent: true, duration: 1 },
  ],
  'silence': [
    { statKey: 'SKILLS', delta: -100, isPercent: true, duration: 2 },
  ],
};

// Passive traits (Foresight, Headstrong, Clear Vision, Chatterbox) are already
// incorporated into static base values computed in HeroDetailModal (via
// passiveEva, passiveSer, etc.). They are NOT added as live buffs to avoid
// double-counting. Only active skill buffs and debuffs from turn events are
// tracked as live overlay effects.

function normalizeTrackerId(raw: string): string {
  return raw
    .replace(/-passive-tracker$/, '')
    .replace(/-tracker$/, '')
    .replace(/-/g, ' ')
    .toLowerCase()
    .trim();
}

function normalizeSkillId(raw: string): string {
  return raw
    .replace(/-/g, ' ')
    .replace(/_/g, ' ')
    .toLowerCase()
    .trim();
}

function extractHpMpFromDeckStates(
  deckStates: Record<string, Record<string, DeckSlotState>> | undefined,
  sideNum: string,
  slotNum: string,
): { health: number | null; mana: number | null; maxHp: number | null } {
  if (!deckStates) return { health: null, mana: null, maxHp: null };
  const sideData = deckStates[sideNum];
  if (!sideData) return { health: null, mana: null, maxHp: null };
  const slotData = sideData[slotNum];
  if (!slotData) return { health: null, mana: null, maxHp: null };
  return {
    health: slotData.health ?? null,
    mana: slotData.mana ?? null,
    maxHp: slotData.baseCombatant?.hp ?? null,
  };
}

function buildInitialHeroStates(
  entries: HeroHpEntry[],
  side: 'a' | 'b',
): LiveHeroState[] {
  return entries.map(entry => ({
    heroId: entry.heroId ?? null,
    heroClass: entry.heroClass ?? null,
    slot: entry.slot ?? 0,
    side,
    currentHp: entry.currentHp,
    currentMp: entry.currentMp,
    maxHp: entry.maxHp,
    maxMp: entry.maxMp,
    hpPct: entry.hpPct,
    mpPct: (entry.maxMp && entry.currentMp != null)
      ? Math.round(entry.currentMp / entry.maxMp * 100)
      : null,
    activeBuffs: [],
    activeDebuffs: [],
  }));
}

interface EffectEntry {
  name: string;
  statKey: string;
  delta: number;
  isPercent: boolean;
  source: 'skill' | 'passive' | 'conditional';
  turnApplied: number;
  durationTurns?: number;
  heroKey: string;
  isBuff: boolean;
}

export function parseLiveCombatState(
  turns: BattleTurn[],
  heroHpSnapshot: HeroHpSnapshot | null,
  boutId?: number,
): LiveCombatState | null {
  if (!turns || turns.length === 0) return null;

  const sortedTurns = [...turns].sort(
    (a, b) => (a.currentTurnCount ?? 0) - (b.currentTurnCount ?? 0)
  );
  const turnCount = sortedTurns[sortedTurns.length - 1]?.currentTurnCount ?? turns.length;

  const sideAHeroes = heroHpSnapshot
    ? buildInitialHeroStates(heroHpSnapshot.sideA ?? [], 'a')
    : [];
  const sideBHeroes = heroHpSnapshot
    ? buildInitialHeroStates(heroHpSnapshot.sideB ?? [], 'b')
    : [];

  const heroKey = (fbSide: number, slot: number) => `${fbSide}-${slot}`;

  const latestTurn = sortedTurns[sortedTurns.length - 1];
  if (latestTurn) {
    const allHeroes = [...sideAHeroes, ...sideBHeroes];
    for (const hero of allHeroes) {
      const fbSide = hero.side === 'a' ? 1 : 2;
      const sideStr = String(fbSide);
      const slotStr = String(hero.slot);

      const beforeData = extractHpMpFromDeckStates(latestTurn.beforeDeckStates, sideStr, slotStr);
      const afterData = extractHpMpFromDeckStates(latestTurn.afterDeckStates, sideStr, slotStr);

      const deckHealth = beforeData.health ?? afterData.health;
      const deckMana = beforeData.mana ?? afterData.mana;
      const deckMaxHp = beforeData.maxHp ?? afterData.maxHp;

      if (deckHealth != null) {
        hero.currentHp = deckHealth;
        const maxHp = deckMaxHp ?? hero.maxHp;
        if (maxHp && maxHp > 0) {
          hero.hpPct = Math.round(deckHealth / maxHp * 100);
          hero.maxHp = maxHp;
        }
      }
      if (deckMana != null) {
        hero.currentMp = deckMana;
        if (hero.maxMp && hero.maxMp > 0) {
          hero.mpPct = Math.round(deckMana / hero.maxMp * 100);
        }
      }
    }
  }

  const appliedEffects: EffectEntry[] = [];
  const observedLastStandHeroes = new Set<string>();

  for (const t of sortedTurns) {
    const tc = t.currentTurnCount ?? 0;
    const actorSide = t.turn?.side ?? 1;
    const actorSlot = t.turn?.slot ?? 0;
    const skillId = normalizeSkillId(t.attackConfig?.attackId ?? '');

    const buffDefs = BUFF_SKILL_EFFECTS[skillId];
    if (buffDefs) {
      const units = t.attackOutcome?.outcomeUnits ?? [];
      const targetKeys: string[] = units.length > 0
        ? units.map(u => heroKey(u.side ?? actorSide, u.slot ?? actorSlot))
        : [heroKey(actorSide, actorSlot)];

      for (const tKey of targetKeys) {
        for (const eff of buffDefs) {
          appliedEffects.push({
            name: skillId,
            statKey: eff.statKey,
            delta: eff.delta,
            isPercent: eff.isPercent,
            source: 'skill',
            turnApplied: tc,
            durationTurns: eff.duration,
            heroKey: tKey,
            isBuff: true,
          });
        }
      }
    }

    const units = t.attackOutcome?.outcomeUnits ?? [];
    for (const unit of units) {
      const trackers = unit.trackers ?? [];
      for (const tracker of trackers) {
        const trackerId = normalizeTrackerId(tracker.trackerConfig?.trackerId ?? '');
        if (!trackerId) continue;
        const tKey = heroKey(unit.side ?? actorSide, unit.slot ?? actorSlot);

        const debuffDefs = DEBUFF_TRACKER_EFFECTS[trackerId];
        if (debuffDefs) {
          for (const eff of debuffDefs) {
            appliedEffects.push({
              name: trackerId,
              statKey: eff.statKey,
              delta: eff.delta,
              isPercent: eff.isPercent,
              source: 'skill',
              turnApplied: tc,
              durationTurns: eff.duration,
              heroKey: tKey,
              isBuff: false,
            });
          }
        }

        if (trackerId === 'last stand') {
          observedLastStandHeroes.add(tKey);
        }
      }
    }
  }

  const activeEffectsByHero = new Map<string, { buffs: LiveBuffDebuff[]; debuffs: LiveBuffDebuff[] }>();

  for (const eff of appliedEffects) {
    const expiresAt = eff.turnApplied + (eff.durationTurns ?? 999);
    if (expiresAt <= turnCount) continue;

    if (!activeEffectsByHero.has(eff.heroKey)) {
      activeEffectsByHero.set(eff.heroKey, { buffs: [], debuffs: [] });
    }
    const heroEffects = activeEffectsByHero.get(eff.heroKey)!;
    const list = eff.isBuff ? heroEffects.buffs : heroEffects.debuffs;

    const existing = list.find(e => e.name === eff.name && e.statKey === eff.statKey);
    if (!existing || eff.turnApplied > existing.turnApplied) {
      if (existing) {
        const idx = list.indexOf(existing);
        list[idx] = {
          name: eff.name,
          statKey: eff.statKey,
          delta: eff.delta,
          isPercent: eff.isPercent,
          source: eff.source,
          turnApplied: eff.turnApplied,
          durationTurns: eff.durationTurns,
        };
      } else {
        list.push({
          name: eff.name,
          statKey: eff.statKey,
          delta: eff.delta,
          isPercent: eff.isPercent,
          source: eff.source,
          turnApplied: eff.turnApplied,
          durationTurns: eff.durationTurns,
        });
      }
    }
  }

  const allHeroes = [...sideAHeroes, ...sideBHeroes];
  for (const hero of allHeroes) {
    const fbSide = hero.side === 'a' ? 1 : 2;
    const hKey = heroKey(fbSide, hero.slot);

    const heroEffects = activeEffectsByHero.get(hKey);
    if (heroEffects) {
      hero.activeBuffs.push(...heroEffects.buffs);
      hero.activeDebuffs.push(...heroEffects.debuffs);
    }

    if (observedLastStandHeroes.has(hKey) && hero.hpPct != null && hero.hpPct < 30 && hero.hpPct > 0) {
      hero.activeBuffs.push({
        name: 'Last Stand',
        statKey: 'P.DEF',
        delta: 300,
        isPercent: true,
        source: 'conditional',
        turnApplied: turnCount,
      });
      hero.activeBuffs.push({
        name: 'Last Stand',
        statKey: 'M.DEF',
        delta: 300,
        isPercent: true,
        source: 'conditional',
        turnApplied: turnCount,
      });
    }
  }

  return {
    sideA: sideAHeroes,
    sideB: sideBHeroes,
    turnCount,
    isActive: true,
    boutId,
  };
}

export function getLiveStatOverlay(
  heroId: string | null,
  normalizedId: string | null,
  liveCombatState: LiveCombatState | null,
): LiveHeroState | null {
  if (!liveCombatState) return null;
  if (!heroId && !normalizedId) return null;

  const allHeroes = [...liveCombatState.sideA, ...liveCombatState.sideB];
  const ids = [heroId, normalizedId].filter(Boolean).map(String);
  return allHeroes.find(h => {
    const hId = String(h.heroId);
    return ids.some(id => hId === id);
  }) ?? null;
}

export interface StatAdjustment {
  totalDelta: number;
  isPercent: boolean;
  sources: { name: string; delta: number; type: 'buff' | 'debuff' }[];
}

export function getStatAdjustments(liveState: LiveHeroState, statKey: string): StatAdjustment | null {
  const sources: { name: string; delta: number; type: 'buff' | 'debuff' }[] = [];

  for (const buff of liveState.activeBuffs) {
    if (buff.statKey === statKey) {
      sources.push({ name: buff.name, delta: buff.delta, type: 'buff' });
    }
  }

  for (const debuff of liveState.activeDebuffs) {
    if (debuff.statKey === statKey) {
      sources.push({ name: debuff.name, delta: debuff.delta, type: 'debuff' });
    }
  }

  if (sources.length === 0) return null;

  const totalDelta = sources.reduce((sum, s) => sum + s.delta, 0);
  const matchingEffect = liveState.activeBuffs.find(b => b.statKey === statKey)
    ?? liveState.activeDebuffs.find(d => d.statKey === statKey);
  const isPercent = matchingEffect?.isPercent ?? false;

  return { totalDelta, isPercent, sources };
}
