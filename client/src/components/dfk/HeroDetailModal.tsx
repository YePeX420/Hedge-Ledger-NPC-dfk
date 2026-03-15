import { useState } from 'react';
import { Sword, Shield, Zap, Star, ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  ABILITY_RARITY_COLORS, ABILITY_RARITY_BORDER,
  getActiveSkill, getPassiveSkill, getPassiveEffects,
} from '@/data/dfk-abilities';
import { computeHeroCombatProfile } from '@/lib/dfk-combat-formulas';
import {
  computeEquipmentBonuses,
  decodeWeaponSpeedModifier,
  computePetBonuses,
  getPetBonusName,
  getPetStatLabel,
  ARMOR_RESIST_NAMES,
  getAccessoryDisplayBonuses,
} from '@/data/dfk-equipment-bonuses';
import type { LiveHeroState } from '@/lib/dfk-live-combat-state';
import { getStatAdjustments } from '@/lib/dfk-live-combat-state';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HeroEquipItem {
  id: string;
  displayId: number;
  normalizedId: number | string;
  rarity: number;
  durability: number;
  maxDurability: number;
}

export interface HeroWeapon extends HeroEquipItem {
  weaponType: number;
  baseDamage: number;
  basePotency: number;
  bonus1: number; bonus2: number; bonus3: number; bonus4: number;
  bonusScalar1: number; bonusScalar2: number; bonusScalar3: number; bonusScalar4: number;
  pAccuracyAtRequirement?: number;
  accuracyRequirement?: number;
  pScalarStat1?: number; pScalarValue1?: number; pScalarMax1?: number;
  pScalarStat2?: number; pScalarValue2?: number; pScalarMax2?: number;
  pScalarStat3?: number; pScalarValue3?: number; pScalarMax3?: number;
  mAccuracyAtRequirement?: number;
  focusRequirement?: number;
  mScalarStat1?: number; mScalarValue1?: number; mScalarMax1?: number;
  mScalarStat2?: number; mScalarValue2?: number; mScalarMax2?: number;
  mScalarStat3?: number; mScalarValue3?: number; mScalarMax3?: number;
  speedModifier?: number;
  itemName?: string;
}

export interface HeroArmor extends HeroEquipItem {
  armorType: number;
  rawPhysDefense: number; physDefScalar: number;
  rawMagicDefense: number; magicDefScalar: number;
  evasion: number;
  pDefScalarMax?: number;
  mDefScalarMax?: number;
  bonus1: number; bonus2: number; bonus3: number; bonus4: number; bonus5: number;
  bonusScalar1: number; bonusScalar2: number; bonusScalar3: number; bonusScalar4: number; bonusScalar5: number;
  itemName?: string;
}

export interface HeroAccessory extends HeroEquipItem {
  equipmentType: number;
  bonus1: number; bonus2: number; bonus3: number; bonus4: number; bonus5: number;
  bonusScalar1: number; bonusScalar2: number; bonusScalar3: number; bonusScalar4: number; bonusScalar5: number;
  itemName?: string;
}

export interface HeroPet {
  id: string;
  normalizedId: string;
  name: string;
  rarity: number;
  element: number;
  eggType: number;
  season: number;
  shiny: boolean;
  combatBonus: number;
  combatBonusScalar: number;
}

export interface HeroDetail {
  id: string;
  normalizedId: string;
  mainClassStr: string;
  subClassStr: string;
  level: number;
  rarity: number;
  element: number;
  strength: number; agility: number; dexterity: number; intelligence: number;
  wisdom: number; vitality: number; endurance: number; luck: number;
  hp: number; mp: number;
  active1: number; active2: number;
  passive1: number; passive2: number;
  pjStatus: string | null;
  pjLevel: number | null;
  pet: HeroPet | null;
  weapon1: HeroWeapon | null;
  weapon2: HeroWeapon | null;
  offhand1: HeroAccessory | null;
  offhand2: HeroAccessory | null;
  armor: HeroArmor | null;
  accessory: HeroAccessory | null;
}

export interface MatchContext {
  opponentLeadershipCount: number;
  opponentMenacingCount: number;
  ownLeadershipCount?: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const RARITY_NAMES: Record<number, string> = { 0: 'Common', 1: 'Uncommon', 2: 'Rare', 3: 'Legendary', 4: 'Mythic' };

export const RARITY_COLORS: Record<number, string> = {
  0: 'text-muted-foreground',
  1: 'text-green-400',
  2: 'text-blue-400',
  3: 'text-purple-400',
  4: 'text-amber-400',
};

export const WEAPON_TYPE_NAMES: Record<number, string> = {
  0: 'Staff', 1: 'Sword', 2: 'Axe', 3: 'Bow', 4: 'Dagger',
  5: 'Crossbow', 6: 'Spear', 7: 'Wand', 8: 'Club', 9: 'Fist',
  10: '2H Sword', 11: '2H Axe', 12: '2H Staff', 13: '1H Wand',
  14: 'Throwing', 15: 'Shield', 16: 'Tome',
};

export const ARMOR_TYPE_NAMES: Record<number, string> = {
  0: 'Light', 1: 'Medium', 2: 'Heavy',
};

const STATUS_RESISTANCES = [
  'Banish', 'Berserk', 'Bleed', 'Blind', 'Poison', 'Pull', 'Push', 'Silence',
  'Sleep', 'Slow', 'Stun', 'Taunt', 'Fear', 'Intimidate', 'Mana Burn', 'Negate',
  'Burn', 'Confuse', 'Daze', 'Disarm', 'Ethereal', 'Exhaust', 'Chill',
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function DurabilityBar({ current, max }: { current: number; max: number }) {
  if (!max) return null;
  const pct = Math.round((current / max) * 100);
  const color = pct > 60 ? 'bg-green-500' : pct > 30 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1.5 w-14 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-muted-foreground">{current}/{max}</span>
    </div>
  );
}

function EquipSlot({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 py-1.5">
      <div className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground">{icon}</div>
      <div className="flex-1 min-w-0">
        <span className="text-xs text-muted-foreground mr-1.5">{label}</span>
        {children}
      </div>
    </div>
  );
}

function WeaponSlotDisplay({ weapon, label }: { weapon: HeroWeapon; label: string }) {
  const typeName = WEAPON_TYPE_NAMES[weapon.weaponType] ?? `Type ${weapon.weaponType}`;
  const displayName = weapon.itemName ?? `${typeName} #${weapon.displayId}`;
  const rarityColor = RARITY_COLORS[weapon.rarity] ?? 'text-muted-foreground';
  return (
    <EquipSlot label={label} icon={<Sword className="w-4 h-4" />}>
      <span className={`text-xs font-medium ${rarityColor}`}>{displayName}</span>
      {weapon.baseDamage > 0 && (
        <span className="text-xs text-muted-foreground ml-2">{weapon.baseDamage} dmg</span>
      )}
      <div className="mt-0.5">
        <DurabilityBar current={weapon.durability} max={weapon.maxDurability} />
      </div>
    </EquipSlot>
  );
}

function ArmorSlotDisplay({ armor }: { armor: HeroArmor }) {
  const typeName = ARMOR_TYPE_NAMES[armor.armorType] ?? `Type ${armor.armorType}`;
  const displayName = armor.itemName ?? `${typeName} Armor #${armor.displayId}`;
  const rarityColor = RARITY_COLORS[armor.rarity] ?? 'text-muted-foreground';
  return (
    <EquipSlot label="Armor" icon={<Shield className="w-4 h-4" />}>
      <span className={`text-xs font-medium ${rarityColor}`}>{displayName}</span>
      {armor.rawPhysDefense > 0 && (
        <span className="text-xs text-muted-foreground ml-2">{armor.rawPhysDefense} pDef</span>
      )}
      {armor.rawMagicDefense > 0 && (
        <span className="text-xs text-muted-foreground ml-1">{armor.rawMagicDefense} mDef</span>
      )}
      <div className="mt-0.5">
        <DurabilityBar current={armor.durability} max={armor.maxDurability} />
      </div>
    </EquipSlot>
  );
}

function AccessorySlotDisplay({ item, label }: { item: HeroAccessory; label: string }) {
  const displayName = item.itemName ?? `Accessory #${item.displayId}`;
  const rarityColor = RARITY_COLORS[item.rarity] ?? 'text-muted-foreground';
  const bonuses = getAccessoryDisplayBonuses(
    item.equipmentType,
    item.bonus1, item.bonusScalar1,
    item.bonus2, item.bonusScalar2,
    item.bonus3, item.bonusScalar3,
    item.bonus4, item.bonusScalar4,
    item.bonus5, item.bonusScalar5,
  );
  return (
    <EquipSlot label={label} icon={<Zap className="w-4 h-4" />}>
      <span className={`text-xs font-medium ${rarityColor}`}>{displayName}</span>
      {bonuses.map((b, i) => (
        <span key={i} className="text-xs text-muted-foreground ml-2">{b.label} {b.pct}</span>
      ))}
      <div className="mt-0.5">
        <DurabilityBar current={item.durability} max={item.maxDurability} />
      </div>
    </EquipSlot>
  );
}

// ─── Main HeroDetailModal ─────────────────────────────────────────────────────

function LiveStatValue({ label, baseVal, baseNum, liveState, statKey }: {
  label: string;
  baseVal: string;
  baseNum?: number;
  liveState: LiveHeroState | null;
  statKey: string;
}) {
  if (!liveState) {
    return (
      <div className="flex justify-between">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono">{baseVal}</span>
      </div>
    );
  }
  const adj = getStatAdjustments(liveState, statKey);
  if (!adj) {
    return (
      <div className="flex justify-between">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono">{baseVal}</span>
      </div>
    );
  }

  const hasNonZeroDelta = adj.totalDelta !== 0;
  const showEffective = hasNonZeroDelta && baseNum != null;

  const MULTIPLICATIVE_STATS = new Set(['P.DEF', 'M.DEF', 'SPEED', 'ATK']);

  let effectiveDisplay: string | null = null;
  if (showEffective) {
    const isMultiplicative = adj.isPercent && MULTIPLICATIVE_STATS.has(statKey);
    const effective = isMultiplicative
      ? baseNum * (1 + adj.totalDelta / 100)
      : baseNum + adj.totalDelta;
    if (baseVal.includes('%')) {
      effectiveDisplay = Math.max(0, effective).toFixed(2) + '%';
    } else {
      effectiveDisplay = Math.max(0, Math.round(effective)).toString();
    }
  }

  return (
    <div className="flex justify-between items-start gap-1">
      <span className="text-muted-foreground">{label}</span>
      <div className="text-right flex flex-wrap items-baseline justify-end gap-x-1">
        {hasNonZeroDelta ? (
          <span className="font-mono text-muted-foreground/60 line-through text-[10px]">{baseVal}</span>
        ) : (
          <span className="font-mono">{baseVal}</span>
        )}
        {adj.sources.map((s, i) => (
          <span
            key={i}
            className={`text-[10px] font-medium ${s.type === 'buff' ? 'text-green-400' : 'text-red-400'}`}
            title={s.name}
          >
            {s.delta !== 0 ? (s.delta > 0 ? '+' : '') + s.delta + (adj.isPercent ? '%' : '') + ' ' : ''}{s.name}
          </span>
        ))}
        {effectiveDisplay && (
          <span className={`font-mono font-medium ${adj.totalDelta > 0 ? 'text-green-400' : 'text-red-400'}`}>
            = {effectiveDisplay}
          </span>
        )}
      </div>
    </div>
  );
}

export function HeroDetailModal({
  hero,
  onClose,
  matchContext,
  liveState,
}: {
  hero: HeroDetail;
  onClose: () => void;
  matchContext?: MatchContext;
  liveState?: LiveHeroState | null;
}) {
  const stats = {
    STR: hero.strength, DEX: hero.dexterity, AGI: hero.agility,
    INT: hero.intelligence, WIS: hero.wisdom, VIT: hero.vitality,
    END: hero.endurance, LCK: hero.luck,
  };
  const profile = computeHeroCombatProfile(stats, hero.level);

  const rawPDef = hero.armor?.rawPhysDefense ?? 0;
  const rawMDef = hero.armor?.rawMagicDefense ?? 0;
  const pDefScalarMax = hero.armor?.pDefScalarMax ?? rawPDef * 2;
  const mDefScalarMax = hero.armor?.mDefScalarMax ?? rawMDef * 2;
  const pDef = rawPDef + Math.min(((hero.armor?.physDefScalar ?? 0) / 100) * stats.END, pDefScalarMax);
  const mDef = rawMDef + Math.min(((hero.armor?.magicDefScalar ?? 0) / 100) * stats.WIS, mDefScalarMax);
  const pRed = pDef > 0 ? pDef / 5 : 0;
  const mRed = mDef > 0 ? mDef / 5 : 0;

  const equipBonuses = computeEquipmentBonuses({
    weapon1:   hero.weapon1   ?? null,
    weapon2:   hero.weapon2   ?? null,
    armor:     hero.armor     ?? null,
    accessory: hero.accessory ?? null,
    offhand1:  hero.offhand1  ?? null,
    offhand2:  hero.offhand2  ?? null,
  });

  const petBonuses = computePetBonuses(hero.pet);

  const passiveEff1 = getPassiveEffects(hero.passive1);
  const passiveEff2 = getPassiveEffects(hero.passive2);
  const passiveEva  = (passiveEff1?.evaBonus  ?? 0) + (passiveEff2?.evaBonus  ?? 0);
  const passiveBlk  = (passiveEff1?.blkBonus  ?? 0) + (passiveEff2?.blkBonus  ?? 0);
  const passiveSblk = (passiveEff1?.sblkBonus ?? 0) + (passiveEff2?.sblkBonus ?? 0);
  const passiveSer  = (passiveEff1?.serBonus  ?? 0) + (passiveEff2?.serBonus  ?? 0);

  const armorEva = (hero.armor?.evasion ?? 0) / 10_000;
  const totalEva = profile.EVA + armorEva + equipBonuses.evasion + (petBonuses.evasion ?? 0) + passiveEva;

  const weaponSpeedMod = decodeWeaponSpeedModifier(hero.weapon1?.speedModifier ?? 0)
                       + decodeWeaponSpeedModifier(hero.weapon2?.speedModifier ?? 0);
  const equipSpeedMod = equipBonuses.speed - equipBonuses.speedDown;
  const petSpeedMod = Math.round((petBonuses.speed ?? 0) * profile.Speed);
  const totalSpeed = Math.round(profile.Speed) + weaponSpeedMod + equipSpeedMod + petSpeedMod;

  const totalBlk  = profile.Block      + equipBonuses.blkChance      + (petBonuses.blkChance      ?? 0) + passiveBlk;
  const totalSblk = profile.SpellBlock + equipBonuses.sblkChance     + (petBonuses.sblkChance     ?? 0) + passiveSblk;
  const totalRec  = profile.Recovery   + equipBonuses.recoveryChance + (petBonuses.recoveryChance ?? 0);

  const totalCSC = profile.Crit + equipBonuses.critStrikeChance + (petBonuses.critStrikeChance ?? 0);
  const totalCHC = equipBonuses.critHealChance + (petBonuses.critHealChance ?? 0);
  const totalCDM = 1.5 + equipBonuses.critDamage;
  const hasMcpReduction = (hero.passive1 === 17 || hero.passive2 === 17);

  const baseSER = profile.SER + passiveSer + (petBonuses.statusEffectResistance ?? 0);
  const resistCodeByName: Record<string, number> = Object.fromEntries(
    Object.entries(ARMOR_RESIST_NAMES).map(([code, name]) => [name, Number(code)])
  );
  const getStatusTotal = (statusName: string): number => {
    const code = resistCodeByName[statusName];
    const armorBonus = code != null ? (equipBonuses.specificResists[code] ?? 0) : 0;
    const p1Bonus = (passiveEff1?.resistCode != null && passiveEff1.resistCode === code) ? (passiveEff1.specificResistValue ?? 0) : 0;
    const p2Bonus = (passiveEff2?.resistCode != null && passiveEff2.resistCode === code) ? (passiveEff2.specificResistValue ?? 0) : 0;
    return baseSER + armorBonus + p1Bonus + p2Bonus;
  };
  const anyElevated = STATUS_RESISTANCES.some(s => getStatusTotal(s) > baseSER + 0.0001);
  const [serOpen, setSerOpen] = useState(anyElevated);

  const heroStatByCode: Record<number, number> = {
    0: stats.STR, 1: stats.AGI, 2: stats.DEX, 3: stats.INT,
    4: stats.WIS, 5: stats.VIT, 6: stats.END, 7: stats.LCK,
  };
  function computeWeaponAttack(w: HeroWeapon): number {
    let atk = w.baseDamage ?? 0;
    const scalars: [number | undefined, number | undefined, number | undefined][] = [
      [w.pScalarStat1, w.pScalarValue1, w.pScalarMax1],
      [w.pScalarStat2, w.pScalarValue2, w.pScalarMax2],
      [w.pScalarStat3, w.pScalarValue3, w.pScalarMax3],
    ];
    for (const [stat, val, max] of scalars) {
      if (!val || stat == null) continue;
      const statVal = heroStatByCode[stat] ?? 0;
      atk += Math.min((val / 10) * statVal, max ?? Infinity);
    }
    return Math.round(atk);
  }
  function computeWeaponSpell(w: HeroWeapon): number {
    let spell = w.basePotency ?? 0;
    const scalars: [number | undefined, number | undefined, number | undefined][] = [
      [w.mScalarStat1, w.mScalarValue1, w.mScalarMax1],
      [w.mScalarStat2, w.mScalarValue2, w.mScalarMax2],
      [w.mScalarStat3, w.mScalarValue3, w.mScalarMax3],
    ];
    for (const [stat, val, max] of scalars) {
      if (!val || stat == null) continue;
      const statVal = heroStatByCode[stat] ?? 0;
      spell += Math.min((val / 10) * statVal, max ?? Infinity);
    }
    return Math.round(spell);
  }
  const weapon1Attack = hero.weapon1 ? computeWeaponAttack(hero.weapon1) : null;
  const weapon1Spell  = hero.weapon1 ? computeWeaponSpell(hero.weapon1)  : null;
  const weapon1PAcc   = hero.weapon1?.pAccuracyAtRequirement != null ? (hero.weapon1.pAccuracyAtRequirement / 10).toFixed(1) : null;
  const weapon1MAcc   = hero.weapon1?.mAccuracyAtRequirement != null ? (hero.weapon1.mAccuracyAtRequirement / 10).toFixed(1) : null;
  const weapon2Attack = hero.weapon2 ? computeWeaponAttack(hero.weapon2) : null;
  const weapon2Spell  = hero.weapon2 ? computeWeaponSpell(hero.weapon2)  : null;
  const weapon2PAcc   = hero.weapon2?.pAccuracyAtRequirement != null ? (hero.weapon2.pAccuracyAtRequirement / 10).toFixed(1) : null;
  const weapon2MAcc   = hero.weapon2?.mAccuracyAtRequirement != null ? (hero.weapon2.mAccuracyAtRequirement / 10).toFixed(1) : null;

  const fmt = (v: number, digits = 2) => v.toFixed(digits);

  const active1 = getActiveSkill(hero.active1);
  const active2 = getActiveSkill(hero.active2);
  const passive1 = getPassiveSkill(hero.passive1);
  const passive2 = getPassiveSkill(hero.passive2);

  // Match context DPS effect
  const oppLeadership = matchContext?.opponentLeadershipCount ?? 0;
  const oppMenacing   = matchContext?.opponentMenacingCount   ?? 0;
  const ownLeadership = matchContext?.ownLeadershipCount      ?? 0;
  const hasMatchCtx   = oppLeadership > 0 || oppMenacing > 0 || ownLeadership > 0;
  const leadMult    = ownLeadership > 0 ? (1 + Math.min(ownLeadership * 0.05, 0.15)) : 1;
  const menaceMult  = oppMenacing   > 0 ? (1 - Math.min(oppMenacing   * 0.05, 0.15)) : 1;
  const effectiveMult = leadMult * menaceMult;

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="modal-hero-detail">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <span>#{hero.normalizedId || hero.id}</span>
            <span className={RARITY_COLORS[hero.rarity]}>{RARITY_NAMES[hero.rarity]}</span>
            <span>{hero.mainClassStr}</span>
            {hero.subClassStr && hero.subClassStr !== hero.mainClassStr && (
              <span className="text-muted-foreground">/ {hero.subClassStr}</span>
            )}
            <span className="text-muted-foreground font-normal">Lv {hero.level}</span>
          </DialogTitle>
        </DialogHeader>

        {/* Match context banner */}
        {hasMatchCtx && (
          <div className="rounded-md bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-xs space-y-0.5">
            <p className="font-semibold text-amber-400 uppercase tracking-wide mb-1">Match Context</p>
            {ownLeadership > 0 && (
              <p className="text-foreground">
                Own team had <span className="font-semibold text-green-400">{ownLeadership}× Leadership</span>
                {' '}— DPS ×{leadMult.toFixed(2)}
              </p>
            )}
            {oppMenacing > 0 && (
              <p className="text-foreground">
                Opponent had <span className="font-semibold text-red-400">{oppMenacing}× Menacing</span>
                {' '}— DPS ×{menaceMult.toFixed(2)}
              </p>
            )}
            {(ownLeadership > 0 || oppMenacing > 0) && (
              <p className="text-muted-foreground">
                Net effective DPS multiplier:{' '}
                <span className={`font-mono font-semibold ${effectiveMult >= 1 ? 'text-green-400' : 'text-red-400'}`}>
                  ×{effectiveMult.toFixed(4)}
                </span>
              </p>
            )}
          </div>
        )}

        {/* Live combat overlay banner */}
        {liveState && (liveState.activeBuffs.length > 0 || liveState.activeDebuffs.length > 0) && (
          <div className="rounded-md bg-blue-500/10 border border-blue-500/30 px-3 py-2 text-xs space-y-1" data-testid="live-combat-overlay">
            <p className="font-semibold text-blue-400 uppercase tracking-wide flex items-center gap-1.5">
              <Zap className="w-3 h-3" /> Live Combat Effects
            </p>
            {liveState.activeBuffs.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {liveState.activeBuffs.map((b, i) => (
                  <Badge key={`buff-${i}`} variant="outline" className="text-[9px] px-1.5 py-0 border-green-500/40 text-green-400">
                    {b.name}: {b.statKey} {b.delta > 0 ? '+' : ''}{b.delta}{b.isPercent ? '%' : ''}
                    {b.source === 'conditional' && <span className="ml-0.5 text-amber-400">(conditional)</span>}
                  </Badge>
                ))}
              </div>
            )}
            {liveState.activeDebuffs.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {liveState.activeDebuffs.map((d, i) => (
                  <Badge key={`debuff-${i}`} variant="outline" className="text-[9px] px-1.5 py-0 border-red-500/40 text-red-400">
                    {d.name}: {d.statKey} {d.delta > 0 ? '+' : ''}{d.delta}{d.isPercent ? '%' : ''}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}

        {/* HP/MP bars */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="flex justify-between mb-1">
              <span className="text-muted-foreground text-xs">HP</span>
              {liveState && liveState.currentHp != null ? (
                <span className="text-xs font-mono">
                  <span className={liveState.hpPct != null && liveState.hpPct < 30 ? 'text-red-400' : liveState.hpPct != null && liveState.hpPct < 60 ? 'text-amber-400' : 'text-green-400'}>
                    {liveState.currentHp}
                  </span>
                  <span className="text-muted-foreground">/{liveState.maxHp ?? hero.hp}</span>
                  {liveState.hpPct != null && (
                    <span className="text-muted-foreground/60 ml-1">({liveState.hpPct}%)</span>
                  )}
                </span>
              ) : (
                <span className="text-xs font-mono">{hero.hp}</span>
              )}
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  liveState?.hpPct != null && liveState.hpPct < 30 ? 'bg-red-500' :
                  liveState?.hpPct != null && liveState.hpPct < 60 ? 'bg-amber-500' : 'bg-green-500'
                }`}
                style={{ width: `${liveState?.hpPct ?? 100}%` }}
              />
            </div>
          </div>
          <div>
            <div className="flex justify-between mb-1">
              <span className="text-muted-foreground text-xs">MP</span>
              {liveState && liveState.currentMp != null ? (
                <span className="text-xs font-mono">
                  <span className="text-blue-400">{liveState.currentMp}</span>
                  <span className="text-muted-foreground">/{liveState.maxMp ?? hero.mp}</span>
                  {liveState.mpPct != null && (
                    <span className="text-muted-foreground/60 ml-1">({liveState.mpPct}%)</span>
                  )}
                </span>
              ) : (
                <span className="text-xs font-mono">{hero.mp}</span>
              )}
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all"
                style={{ width: `${liveState?.mpPct ?? 100}%` }}
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
          {/* Vitals */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Vitals
              {liveState && (liveState.activeBuffs.length > 0 || liveState.activeDebuffs.length > 0) && (
                <span className="ml-1 text-blue-400 text-[9px] font-normal normal-case">(live)</span>
              )}
            </p>
            <div className="space-y-1 text-xs">
              <LiveStatValue label="P.DEF" baseVal={fmt(pDef)} baseNum={pDef} liveState={liveState ?? null} statKey="P.DEF" />
              <LiveStatValue label="M.DEF" baseVal={fmt(mDef)} baseNum={mDef} liveState={liveState ?? null} statKey="M.DEF" />
              <LiveStatValue label="P.RED" baseVal={pRed.toFixed(2) + '%'} baseNum={pRed} liveState={liveState ?? null} statKey="P.RED" />
              <LiveStatValue label="M.RED" baseVal={mRed.toFixed(2) + '%'} baseNum={mRed} liveState={liveState ?? null} statKey="M.RED" />
              <LiveStatValue label="BLK" baseVal={(totalBlk * 100).toFixed(2) + '%'} baseNum={totalBlk * 100} liveState={liveState ?? null} statKey="BLK" />
              <LiveStatValue label="SBLK" baseVal={(totalSblk * 100).toFixed(2) + '%'} baseNum={totalSblk * 100} liveState={liveState ?? null} statKey="SBLK" />
              <LiveStatValue label="REC" baseVal={(totalRec * 100).toFixed(2) + '%'} baseNum={totalRec * 100} liveState={liveState ?? null} statKey="REC" />
              <LiveStatValue label="SER" baseVal={(baseSER * 100).toFixed(2) + '%'} baseNum={baseSER * 100} liveState={liveState ?? null} statKey="SER" />
              <LiveStatValue label="SPEED" baseVal={totalSpeed.toString()} baseNum={totalSpeed} liveState={liveState ?? null} statKey="SPEED" />
              <LiveStatValue label="EVA" baseVal={(totalEva * 100).toFixed(2) + '%'} baseNum={totalEva * 100} liveState={liveState ?? null} statKey="EVA" />
              {liveState && getStatAdjustments(liveState, 'ACC') && (
                <LiveStatValue label="ACC" baseVal="100%" baseNum={100} liveState={liveState} statKey="ACC" />
              )}
              <LiveStatValue label="CSC" baseVal={(totalCSC * 100).toFixed(2) + '%'} baseNum={totalCSC * 100} liveState={liveState ?? null} statKey="CSC" />
            </div>
          </div>

          {/* Base Stats */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Base Stats</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              {[
                ['STR', hero.strength], ['DEX', hero.dexterity],
                ['AGI', hero.agility], ['VIT', hero.vitality],
                ['END', hero.endurance], ['INT', hero.intelligence],
                ['WIS', hero.wisdom], ['LCK', hero.luck],
              ].map(([label, val]) => (
                <div key={label as string} className="flex justify-between">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-mono font-medium">{val}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Dynamic Stat Scores */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Dynamic Scores</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              {[
                ['STR', profile.STR], ['DEX', profile.DEX],
                ['AGI', profile.AGI], ['VIT', profile.VIT],
                ['END', profile.END], ['INT', profile.INT],
                ['WIS', profile.WIS], ['LCK', profile.LCK],
              ].map(([label, val]) => (
                <div key={label as string} className="flex justify-between">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-mono">{((val as number) * 100).toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Abilities */}
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Abilities</p>
          <div className="flex flex-wrap gap-1.5">
            {[active1, active2].map((skill, i) => skill && (
              <Badge key={`a-${i}`} variant="outline"
                className={`text-xs ${ABILITY_RARITY_COLORS[skill.rarity]} ${ABILITY_RARITY_BORDER[skill.rarity]}`}>
                {skill.label}
              </Badge>
            ))}
            {[passive1, passive2].map((skill, i) => {
              if (!skill) return null;
              const eff = getPassiveEffects(skill.traitId);
              const staticHint = eff?.evaBonus   ? `EVA +${(eff.evaBonus * 100).toFixed(1)}%`
                               : eff?.blkBonus   ? `BLK/SBLK +${(eff.blkBonus * 100).toFixed(1)}%`
                               : eff?.serBonus   ? `SER +${(eff.serBonus * 100).toFixed(1)}%`
                               : null;
              return (
                <Badge key={`p-${i}`} variant="outline"
                  title={eff?.conditionalNote ?? skill.label}
                  className={`text-xs ${ABILITY_RARITY_COLORS[skill.rarity]} ${ABILITY_RARITY_BORDER[skill.rarity]} opacity-80 flex flex-col items-start gap-0 h-auto py-0.5`}>
                  <span>{skill.label}</span>
                  {staticHint && <span className="text-[10px] opacity-70 font-normal">{staticHint}</span>}
                </Badge>
              );
            })}
          </div>
        </div>

        {/* Modifiers */}
        {(() => {
          const sign = (n: number) => (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
          const totalRet = equipBonuses.retaliateAny + equipBonuses.retaliatePhysical + equipBonuses.retaliateMagical;
          const totalAtkPct   = equipBonuses.attackPct        + (petBonuses.attackPct        ?? 0);
          const totalSpellPct = equipBonuses.spellPct         + (petBonuses.spellPct         ?? 0);
          const totalPDef     = equipBonuses.physDefPct       + (petBonuses.physDefPct       ?? 0);
          const totalMDef     = equipBonuses.magicDefPct      + (petBonuses.magicDefPct      ?? 0);
          const totalPAcc     = equipBonuses.physAccuracy     + (petBonuses.physAccuracy     ?? 0);
          const totalMAcc     = equipBonuses.magicAccuracy    + (petBonuses.magicAccuracy    ?? 0);
          const modRows: [string, string][] = [
            ...(equipBonuses.physicalDamage  !== 0 ? [['PDM',    sign(equipBonuses.physicalDamage  * 100)] as [string,string]] : []),
            ...(equipBonuses.magicDamage     !== 0 ? [['MDM',    sign(equipBonuses.magicDamage     * 100)] as [string,string]] : []),
            ...(totalAtkPct   !== 0 ? [['ATK%',   sign(totalAtkPct   * 100)] as [string,string]] : []),
            ...(totalSpellPct !== 0 ? [['SPELL%', sign(totalSpellPct * 100)] as [string,string]] : []),
            ...[['MCP', hasMcpReduction ? '90.0%' : '100.0%'] as [string,string]],
            ...[['PRC', '+' + (equipBonuses.pierce * 100).toFixed(2) + '%'] as [string,string]],
            ...(totalRet !== 0 ? [['RET', sign(totalRet * 100)] as [string,string]] : []),
            ...(equipBonuses.riposte !== 0 ? [['RIP', sign(equipBonuses.riposte * 100)] as [string,string]] : []),
            ...(totalPDef !== 0 ? [['P.DEF%', sign(totalPDef * 100)] as [string,string]] : []),
            ...(totalMDef !== 0 ? [['M.DEF%', sign(totalMDef * 100)] as [string,string]] : []),
            ...((equipBonuses.physDamageReduction + (petBonuses.physDamageReduction ?? 0)) !== 0 ? [['P.RED+', sign((equipBonuses.physDamageReduction + (petBonuses.physDamageReduction ?? 0)) * 100)] as [string,string]] : []),
            ...((equipBonuses.magicDamageReduction + (petBonuses.magicDamageReduction ?? 0)) !== 0 ? [['M.RED+', sign((equipBonuses.magicDamageReduction + (petBonuses.magicDamageReduction ?? 0)) * 100)] as [string,string]] : []),
            ...(equipBonuses.physDefFlat !== 0 ? [['P.DEF+', equipBonuses.physDefFlat.toFixed(0)] as [string,string]] : []),
            ...(equipBonuses.magicDefFlat !== 0 ? [['M.DEF+', equipBonuses.magicDefFlat.toFixed(0)] as [string,string]] : []),
            ...(equipBonuses.blkChance + (petBonuses.blkChance ?? 0) + passiveBlk !== 0 ? [['BLK+', sign((equipBonuses.blkChance + (petBonuses.blkChance ?? 0) + passiveBlk) * 100)] as [string,string]] : []),
            ...(equipBonuses.sblkChance + (petBonuses.sblkChance ?? 0) + passiveSblk !== 0 ? [['SBLK+', sign((equipBonuses.sblkChance + (petBonuses.sblkChance ?? 0) + passiveSblk) * 100)] as [string,string]] : []),
            ...(totalPAcc !== 0 ? [['P.ACC+', sign(totalPAcc * 100)] as [string,string]] : []),
            ...(totalMAcc !== 0 ? [['M.ACC+', sign(totalMAcc * 100)] as [string,string]] : []),
            ...((petBonuses.lifesteal ?? 0) !== 0 ? [['LIFESTEAL', sign((petBonuses.lifesteal ?? 0) * 100)] as [string,string]] : []),
            ...((petBonuses.statusEffectResistance ?? 0) + passiveSer !== 0 ? [['SER+', sign(((petBonuses.statusEffectResistance ?? 0) + passiveSer) * 100)] as [string,string]] : []),
          ] as [string, string][];
          return (
            <div className="mt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Modifiers</p>
              <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-xs">
                {modRows.map(([label, val]) => (
                  <div key={label} className="flex justify-between gap-1">
                    <span className="text-muted-foreground">{label}</span>
                    <span className={`font-mono ${val.startsWith('+') ? 'text-green-500' : val.startsWith('-') ? 'text-red-400' : ''}`}>{val}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Primary Arms */}
        {hero.weapon1 && (
          <div className="mt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Primary Arms</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
              {[
                ['Attack',  weapon1Attack?.toString() ?? '—'],
                ['Spell',   weapon1Spell?.toString()  ?? '—'],
                ['P.ACC',   weapon1PAcc  != null ? weapon1PAcc + '%'  : '—'],
                ['M.ACC',   weapon1MAcc  != null ? weapon1MAcc + '%'  : '—'],
                ['CSC',     (totalCSC * 100).toFixed(2) + '%'],
                ['CDM',     totalCDM.toFixed(2) + 'x'],
                ['CHC',     (totalCHC * 100).toFixed(2) + '%'],
              ].map(([label, val]) => (
                <div key={label} className="flex justify-between">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-mono">{val}</span>
                </div>
              ))}
            </div>
            {hero.weapon1.itemName && (
              <p className="text-xs text-muted-foreground mt-1">{hero.weapon1.itemName}</p>
            )}
          </div>
        )}

        {/* Secondary Arms */}
        {hero.weapon2 && (
          <div className="mt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Secondary Arms</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
              {[
                ['Attack',  weapon2Attack?.toString() ?? '—'],
                ['Spell',   weapon2Spell?.toString()  ?? '—'],
                ['P.ACC',   weapon2PAcc  != null ? weapon2PAcc + '%'  : '—'],
                ['M.ACC',   weapon2MAcc  != null ? weapon2MAcc + '%'  : '—'],
              ].map(([label, val]) => (
                <div key={label} className="flex justify-between">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-mono">{val}</span>
                </div>
              ))}
            </div>
            {hero.weapon2.itemName && (
              <p className="text-xs text-muted-foreground mt-1">{hero.weapon2.itemName}</p>
            )}
          </div>
        )}

        {/* Equipment */}
        {(hero.weapon1 || hero.armor || hero.accessory) && (
          <div className="mt-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Equipment</p>
            <div className="space-y-0.5">
              {hero.weapon1 && <WeaponSlotDisplay weapon={hero.weapon1} label="Weapon" />}
              {hero.weapon2 && <WeaponSlotDisplay weapon={hero.weapon2} label="Off-weapon" />}
              {hero.offhand1 && <AccessorySlotDisplay item={hero.offhand1} label="Offhand" />}
              {hero.armor && <ArmorSlotDisplay armor={hero.armor} />}
              {hero.accessory && <AccessorySlotDisplay item={hero.accessory} label="Accessory" />}
            </div>
          </div>
        )}

        {/* Pet */}
        {hero.pet && (
          <div className="mt-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Pet</p>
            <div className="flex items-center gap-2 text-xs">
              <Star className="w-3.5 h-3.5 text-amber-400" />
              <span className={`font-medium ${RARITY_COLORS[hero.pet.rarity] ?? ''}`}>{hero.pet.name}</span>
              <span className="text-muted-foreground">{RARITY_NAMES[hero.pet.rarity] ?? ''}</span>
              {hero.pet.combatBonus > 0 && (
                <span className="text-muted-foreground">
                  — {getPetBonusName(hero.pet.combatBonus)}
                  {hero.pet.combatBonusScalar > 0 && ` +${(hero.pet.combatBonusScalar / 100).toFixed(1)}%`}
                  {getPetStatLabel(hero.pet.combatBonus) && (
                    <span className="ml-1 text-blue-400">({getPetStatLabel(hero.pet.combatBonus)})</span>
                  )}
                </span>
              )}
              {hero.pet.shiny && (
                <Badge variant="outline" className="text-xs px-1.5 py-0 text-amber-400 border-amber-500/40">Shiny</Badge>
              )}
            </div>
          </div>
        )}

        {/* Status Resistances */}
        <div className="mt-3">
          <button
            onClick={() => setSerOpen(o => !o)}
            className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 hover:text-foreground transition-colors"
            data-testid="button-ser-toggle"
          >
            <ChevronDown className={`h-3 w-3 transition-transform ${serOpen ? '' : '-rotate-90'}`} />
            Status Resistances
            {anyElevated && <span className="ml-1 text-green-500">(boosted)</span>}
          </button>
          {serOpen && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-xs">
              {STATUS_RESISTANCES.map(status => {
                const total = getStatusTotal(status);
                const elevated = total > baseSER + 0.0001;
                return (
                  <div key={status} className="flex justify-between">
                    <span className={elevated ? 'text-green-500 font-medium' : 'text-muted-foreground'}>{status}</span>
                    <span className={`font-mono ${elevated ? 'text-green-500 font-medium' : ''}`}>{(total * 100).toFixed(1)}%</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
