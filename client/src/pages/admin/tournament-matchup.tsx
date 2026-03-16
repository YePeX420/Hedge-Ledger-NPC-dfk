import { useState, useEffect, useRef } from 'react';
import { useLocation, useParams } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft, Zap, Users, Shield, Trophy, ChevronDown, Star, RefreshCw, Activity, AlertTriangle,
  ScrollText, FlaskConical, Search, Database, ExternalLink, Radio, CheckCircle2, XCircle, Save,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { HeroDetailModal, RARITY_NAMES, WEAPON_TYPE_NAMES, ARMOR_TYPE_NAMES } from '@/components/dfk/HeroDetailModal';
import type { HeroDetail } from '@/components/dfk/HeroDetailModal';
import { getActiveSkillName, getPassiveSkillName } from '@/data/dfk-abilities';
import { parseLiveCombatState, getLiveStatOverlay } from '@/lib/dfk-live-combat-state';
import type { LiveCombatState, BattleTurn } from '@/lib/dfk-live-combat-state';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlayerEntry {
  address: string;
  partyIndex: number;
  heroIds: number[];
  heroes: HeroDetail[];
  playerName: string | null;
}

interface TournamentDetail {
  id: string;
  name: string;
  stateLabel: string;
  tournamentStartTime: number;
  roundLengthMinutes: number;
  format: string | null;
  rounds: number;
}

interface BracketDetailResponse {
  ok: boolean;
  tournament: TournamentDetail;
  players: PlayerEntry[];
}

interface AiMatchupResult {
  winPctA: number;
  winPctB: number;
  nameA: string;
  nameB: string;
  narrative?: string | null;
  predictedAt?: string | null;
  factors: {
    init: number; dps: number; surv: number;
    passiveDps: number; comp: number; experience: number;
  };
}

interface SavedPrediction {
  id: number;
  tournament_id: number;
  slot_a: number;
  slot_b: number;
  win_pct_a: number;
  win_pct_b: number;
  predicted_winner_slot: number;
  factors: Record<string, number>;
  narrative: string | null;
  player_a_name: string | null;
  player_b_name: string | null;
  actual_winner_slot: number | null;
  was_correct: boolean | null;
  predicted_at: string;
  resolved_at: string | null;
}

interface BoutHero {
  side: string;
  main_class: string;
  level: number;
  rarity: number;
  strength: number;
  dexterity: number;
  agility: number;
  intelligence: number;
  wisdom: number;
  vitality: number;
  endurance: number;
  luck: number;
  hp: number;
  mp: number;
  passive1: string | null;
  passive2: string | null;
  active1: string | null;
  active2: string | null;
  is_winner_side: boolean;
}

interface BattleLogTurn {
  _id: string;
  turn?: number;
  actor?: string;
  actorClass?: string;
  action?: string;
  skillName?: string;
  damage?: number;
  healing?: number;
  target?: string;
  targetClass?: string;
  result?: string;
  [key: string]: unknown;
}

interface BattleLogItemUse {
  heroId?: number | null;
  itemType?: number | null;
  itemName?: string | null;
  turn?: number | null;
}

interface HeroHpEntry {
  slot: number;
  heroId: string | null;
  heroClass: string | null;
  currentHp: number | null;
  currentMp: number | null;
  maxHp: number | null;
  maxMp: number | null;
  hpPct: number | null;
}

interface PlayerInventoryEntry {
  name: string;
  address: string;
  weight: number;
  qty: number;
}

interface PlayerInventorySide {
  usedBudget: number;
  totalBudget: number | null;
  usedItems: unknown[];
  items: PlayerInventoryEntry[];
}

interface BattleLogResult {
  ok: boolean;
  battleId: string | null;
  turns: BattleLogTurn[] | null;
  rawDocCount: number;
  candidatesTried?: string[];
  indexedFirebaseId?: string | null;
  isIndexed?: boolean;
  itemsUsed?: { a: BattleLogItemUse[]; b: BattleLogItemUse[] } | null;
  heroHpSnapshot?: { sideA: HeroHpEntry[]; sideB: HeroHpEntry[] } | null;
  playerInventory?: { sideA: PlayerInventorySide | null; sideB: PlayerInventorySide | null } | null;
}

interface HistoryResponse {
  ok: boolean;
  bouts: HistoryBout[];
  battleBudget?: number | null;
  battleInventory?: number | null;
  allowedItems?: string[];
}

interface HistoryBout {
  id: number;
  roundNumber: number;
  matchIndex: number;
  playerA: string;
  playerAName: string | null;
  playerB: string;
  playerBName: string | null;
  winnerAddress: string | null;
  isComplete: boolean;
  capturedAt: number | null;
  heroesA: BoutHero[];
  heroesB: BoutHero[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const RARITY_COLORS: Record<number, string> = {
  0: 'text-muted-foreground', 1: 'text-green-400',
  2: 'text-blue-400', 3: 'text-purple-400', 4: 'text-amber-400',
};

function shortAddr(addr: string | null | undefined): string {
  if (!addr) return '—';
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

// ─── Matchup Hero Card (portrait-style) ──────────────────────────────────────

const RARITY_BG: Record<number, string> = {
  0: 'bg-muted/40 border-border/50',
  1: 'bg-green-500/5 border-green-500/20',
  2: 'bg-blue-500/5 border-blue-500/20',
  3: 'bg-purple-500/5 border-purple-500/20',
  4: 'bg-amber-500/5 border-amber-500/20',
};

const TRAIT_PASSIVES: Record<number, { label: string; color: string }> = {
  16: { label: 'Leadership', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  17: { label: 'Efficient', color: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30' },
  18: { label: 'Menacing', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
  19: { label: 'Toxic', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
};

function MatchupHeroCard({ hero, onSelect }: { hero: HeroDetail; onSelect: (hero: HeroDetail) => void }) {
  const rarityColor = RARITY_COLORS[hero.rarity] ?? 'text-muted-foreground';
  const rarityBg = RARITY_BG[hero.rarity] ?? RARITY_BG[0];
  const rarityName = RARITY_NAMES[hero.rarity] ?? 'Common';

  const statTotal = hero.strength + hero.dexterity + hero.agility + hero.intelligence
    + hero.wisdom + hero.vitality + hero.endurance + hero.luck;

  const active1Name = getActiveSkillName(hero.active1);
  const active2Name = getActiveSkillName(hero.active2);
  const passive1Name = getPassiveSkillName(hero.passive1);
  const passive2Name = getPassiveSkillName(hero.passive2);

  const weaponName = hero.weapon1
    ? (hero.weapon1.itemName ?? `${WEAPON_TYPE_NAMES[hero.weapon1.weaponType] ?? 'Weapon'} #${hero.weapon1.displayId}`)
    : null;
  const weapon2Name = hero.weapon2
    ? (hero.weapon2.itemName ?? `${WEAPON_TYPE_NAMES[hero.weapon2.weaponType] ?? 'Weapon'} #${hero.weapon2.displayId}`)
    : null;
  const armorName = hero.armor
    ? (hero.armor.itemName ?? `${ARMOR_TYPE_NAMES[hero.armor.armorType] ?? ''} Armor #${hero.armor.displayId}`)
    : null;
  const offhandName = hero.offhand1
    ? (hero.offhand1.itemName ?? `Offhand #${hero.offhand1.displayId}`)
    : null;
  const offhand2Name = hero.offhand2
    ? (hero.offhand2.itemName ?? `Offhand #${hero.offhand2.displayId}`)
    : null;
  const headName = hero.accessory
    ? (hero.accessory.itemName ?? `Accessory #${hero.accessory.displayId}`)
    : null;

  return (
    <button
      onClick={() => onSelect(hero)}
      className={`flex flex-col border rounded-md p-3 w-[180px] shrink-0 text-left transition-colors hover-elevate cursor-pointer ${rarityBg}`}
      data-testid={`matchup-hero-card-${hero.id}`}
    >
      <div className="flex items-center gap-1.5 flex-wrap mb-1">
        <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${rarityColor} border-current`}>
          {rarityName}
        </Badge>
        <span className="text-[10px] text-muted-foreground">Lv{hero.level}</span>
      </div>
      <p className="text-sm font-semibold truncate">{hero.mainClassStr}</p>
      {hero.subClassStr && hero.subClassStr !== hero.mainClassStr && (
        <p className="text-[10px] text-muted-foreground truncate">{hero.subClassStr}</p>
      )}

      <div className="flex gap-3 text-[10px] mt-2 text-muted-foreground">
        <span>HP <span className="text-foreground font-medium">{hero.hp}</span></span>
        <span>MP <span className="text-foreground font-medium">{hero.mp}</span></span>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px] mt-2">
        {([
          ['STR', hero.strength], ['DEX', hero.dexterity],
          ['AGI', hero.agility], ['INT', hero.intelligence],
          ['WIS', hero.wisdom], ['VIT', hero.vitality],
          ['END', hero.endurance], ['LCK', hero.luck],
        ] as [string, number][]).map(([label, val]) => (
          <div key={label} className="flex justify-between">
            <span className="text-muted-foreground">{label}</span>
            <span className="font-mono font-medium tabular-nums">{val}</span>
          </div>
        ))}
      </div>
      <div className="mt-1 pt-1 border-t border-border/30 flex justify-between text-[10px]">
        <span className="text-muted-foreground">Total</span>
        <span className="font-mono font-semibold tabular-nums">{statTotal}</span>
      </div>

      {(active1Name || active2Name) && (
        <div className="mt-2">
          <span className="text-[9px] text-muted-foreground uppercase tracking-wide">Active</span>
          <div className="flex flex-wrap gap-1 mt-0.5">
            {active1Name && (
              <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-blue-500/30 text-blue-400">{active1Name}</Badge>
            )}
            {active2Name && (
              <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-blue-500/30 text-blue-400">{active2Name}</Badge>
            )}
          </div>
        </div>
      )}

      {(passive1Name || passive2Name) && (
        <div className="mt-1">
          <span className="text-[9px] text-muted-foreground uppercase tracking-wide">Passive</span>
          <div className="flex flex-wrap gap-1 mt-0.5">
            {passive1Name && (
              <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${
                hero.passive1 && TRAIT_PASSIVES[hero.passive1]
                  ? TRAIT_PASSIVES[hero.passive1].color
                  : 'border-muted-foreground/30 text-muted-foreground'
              }`}>{passive1Name}</Badge>
            )}
            {passive2Name && (
              <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${
                hero.passive2 && TRAIT_PASSIVES[hero.passive2]
                  ? TRAIT_PASSIVES[hero.passive2].color
                  : 'border-muted-foreground/30 text-muted-foreground'
              }`}>{passive2Name}</Badge>
            )}
          </div>
        </div>
      )}

      {hero.pet && (
        <p className="text-[10px] text-muted-foreground mt-2 truncate">
          Pet: <span className="text-foreground">{hero.pet.name}</span>
        </p>
      )}

      {(weaponName || weapon2Name || armorName || offhandName || offhand2Name || headName) && (
        <div className="mt-2 space-y-0.5 text-[10px] text-muted-foreground">
          {weaponName && <p className="truncate">Wpn: <span className="text-foreground">{weaponName}</span></p>}
          {weapon2Name && <p className="truncate">Wpn2: <span className="text-foreground">{weapon2Name}</span></p>}
          {armorName && <p className="truncate">Armor: <span className="text-foreground">{armorName}</span></p>}
          {offhandName && <p className="truncate">Off: <span className="text-foreground">{offhandName}</span></p>}
          {offhand2Name && <p className="truncate">Off2: <span className="text-foreground">{offhand2Name}</span></p>}
          {headName && <p className="truncate">Acc: <span className="text-foreground">{headName}</span></p>}
        </div>
      )}
    </button>
  );
}

function MatchupHeroCardSkeleton() {
  return (
    <div className="flex flex-col border border-border/50 rounded-md p-3 w-[180px] shrink-0 animate-pulse" data-testid="matchup-hero-skeleton">
      <div className="flex gap-1.5 mb-1">
        <div className="h-4 w-16 bg-muted rounded" />
        <div className="h-4 w-8 bg-muted rounded" />
      </div>
      <div className="h-5 w-24 bg-muted rounded mb-2" />
      <div className="h-3 w-20 bg-muted rounded mb-2" />
      <div className="grid grid-cols-2 gap-1">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-3 bg-muted rounded" />
        ))}
      </div>
      <div className="h-3 w-16 bg-muted rounded mt-2" />
    </div>
  );
}

// ─── Matchup Lineup ──────────────────────────────────────────────────────────

function MatchupLineup({
  playerA, playerB, nameA, nameB, isLoading, onSelectHero,
}: {
  playerA: PlayerEntry | null;
  playerB: PlayerEntry | null;
  nameA: string;
  nameB: string;
  isLoading: boolean;
  onSelectHero: (hero: HeroDetail) => void;
}) {
  const heroesA = playerA?.heroes ?? [];
  const heroesB = playerB?.heroes ?? [];
  const skeletonCount = 3;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Users className="w-4 h-4" />
          Team Lineup
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-start gap-4 flex-wrap justify-center">
          <div className="flex flex-col items-center gap-2 min-w-0">
            <p className="text-sm font-semibold truncate max-w-[200px]" data-testid="lineup-name-a">{nameA}</p>
            {playerA?.address && (
              <p className="text-[10px] text-muted-foreground font-mono">{shortAddr(playerA.address)}</p>
            )}
            <div className="flex gap-2 flex-wrap justify-center">
              {isLoading ? (
                Array.from({ length: skeletonCount }).map((_, i) => <MatchupHeroCardSkeleton key={i} />)
              ) : heroesA.length > 0 ? (
                heroesA.map(h => (
                  <MatchupHeroCard key={h.id} hero={h} onSelect={onSelectHero} />
                ))
              ) : (
                <p className="text-sm text-muted-foreground py-4" data-testid="text-no-heroes-a">
                  {playerA ? 'No hero data loaded yet.' : 'Player not registered yet.'}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center self-center py-4">
            <Badge variant="outline" className="text-lg font-bold px-4 py-1 border-border" data-testid="badge-vs">
              VS
            </Badge>
          </div>

          <div className="flex flex-col items-center gap-2 min-w-0">
            <p className="text-sm font-semibold truncate max-w-[200px]" data-testid="lineup-name-b">{nameB}</p>
            {playerB?.address && (
              <p className="text-[10px] text-muted-foreground font-mono">{shortAddr(playerB.address)}</p>
            )}
            <div className="flex gap-2 flex-wrap justify-center">
              {isLoading ? (
                Array.from({ length: skeletonCount }).map((_, i) => <MatchupHeroCardSkeleton key={i} />)
              ) : heroesB.length > 0 ? (
                heroesB.map(h => (
                  <MatchupHeroCard key={h.id} hero={h} onSelect={onSelectHero} />
                ))
              ) : (
                <p className="text-sm text-muted-foreground py-4" data-testid="text-no-heroes-b">
                  {playerB ? 'No hero data loaded yet.' : 'Player not registered yet.'}
                </p>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Initiative Prediction ────────────────────────────────────────────────────

function InitiativeSection({ nameA, nameB, heroesA, heroesB }: {
  nameA: string; nameB: string;
  heroesA: HeroDetail[]; heroesB: HeroDetail[];
}) {
  const sorted = (heroes: HeroDetail[]) =>
    [...heroes].sort((a, b) => b.agility - a.agility);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Activity className="w-4 h-4 text-blue-400" />
          Predicted Initiative Order
          <span className="text-[10px] font-normal text-muted-foreground ml-auto">Based on AGI (highest acts first)</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          {[
            { name: nameA, heroes: sorted(heroesA) },
            { name: nameB, heroes: sorted(heroesB) },
          ].map(({ name, heroes }) => (
            <div key={name}>
              <p className="text-xs font-semibold mb-2 truncate">{name}</p>
              <div className="space-y-1">
                {heroes.map((h, idx) => (
                  <div key={h.id} className="flex items-center gap-2 text-xs">
                    <span className="text-[10px] text-muted-foreground w-4 shrink-0">#{idx + 1}</span>
                    <span className="font-medium">{h.mainClassStr}</span>
                    <span className="text-muted-foreground text-[10px]">Lv{h.level}</span>
                    <span className="ml-auto text-blue-400 font-mono tabular-nums shrink-0">AGI {h.agility}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground mt-3 italic">
          Actual DFK combat turn sequences require direct combat log access, which is not available via public API. This is a stat-based approximation.
        </p>
      </CardContent>
    </Card>
  );
}

// ─── AI Prediction Section ────────────────────────────────────────────────────

function AiPredictionSection({ tournamentId, slotA, slotB, hasBothPlayers, onNarrativeGenerated, winnerSlot }: {
  tournamentId: string; slotA: number; slotB: number; hasBothPlayers: boolean;
  onNarrativeGenerated?: (narrative: string) => void;
  winnerSlot?: number | null;
}) {
  const [result, setResult] = useState<(AiMatchupResult & { loading?: boolean; error?: string }) | null>(null);
  const [saved, setSaved] = useState<SavedPrediction | null>(null);
  const [savedLoading, setSavedLoading] = useState(true);
  const hasAutoRun = useRef(false);

  // Load any existing saved prediction on mount
  useEffect(() => {
    setSavedLoading(true);
    fetch(`/api/admin/tournament/bracket/${tournamentId}/matchup-prediction?slotA=${slotA}&slotB=${slotB}`)
      .then(r => r.json())
      .then(data => {
        if (data.ok && data.prediction) setSaved(data.prediction);
      })
      .catch(() => {})
      .finally(() => setSavedLoading(false));
  }, [tournamentId, slotA, slotB]);

  const run = async (isAuto = false) => {
    if (isAuto && hasAutoRun.current) return;
    if (isAuto) hasAutoRun.current = true;
    setResult({ loading: true } as any);
    try {
      const res = await fetch(`/api/admin/tournament/bracket/${tournamentId}/ai-matchup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slotA, slotB }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Analysis failed');
      setResult({ ...data, loading: false });
      // Refresh saved state from DB after auto-save
      const sv = await fetch(`/api/admin/tournament/bracket/${tournamentId}/matchup-prediction?slotA=${slotA}&slotB=${slotB}`);
      const svData = await sv.json();
      if (svData.ok && svData.prediction) setSaved(svData.prediction);
      if (data.narrative && onNarrativeGenerated) onNarrativeGenerated(data.narrative);
    } catch (err: any) {
      setResult({ loading: false, error: err.message } as any);
    }
  };

  // Auto-run when both players are loaded (only once per mount)
  useEffect(() => {
    if (hasBothPlayers && !hasAutoRun.current && !savedLoading) {
      run(true);
    }
  }, [hasBothPlayers, savedLoading]);

  // Resolve prediction when match result is available
  useEffect(() => {
    if (winnerSlot == null || !saved || saved.actual_winner_slot != null) return;
    fetch(`/api/admin/tournament/bracket/${tournamentId}/matchup-prediction`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slotA, slotB, actualWinnerSlot: winnerSlot }),
    })
      .then(r => r.json())
      .then(data => { if (data.ok) setSaved(data.prediction); })
      .catch(() => {});
  }, [winnerSlot, saved]);

  const display = result && !result.loading && !result.error ? result
    : saved ? {
        winPctA: Number(saved.win_pct_a), winPctB: Number(saved.win_pct_b),
        nameA: saved.player_a_name ?? `Slot #${slotA}`,
        nameB: saved.player_b_name ?? `Slot #${slotB}`,
        narrative: saved.narrative,
        factors: saved.factors as any,
        predictedAt: saved.predicted_at,
      } : null;

  const FACTORS = [
    { label: 'Initiative',    key: 'init',       weight: 25 },
    { label: 'Effective DPS', key: 'dps',        weight: 30 },
    { label: 'Survivability', key: 'surv',       weight: 20 },
    { label: 'Passive DPS',   key: 'synergy',    weight: 10 },
    { label: 'Team Comp',     key: 'comp',       weight: 10 },
    { label: 'Experience',    key: 'experience', weight:  5 },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-sm flex items-center gap-2">
            <Zap className="w-4 h-4 text-yellow-400" />
            AI Win Prediction
            {result?.loading && (
              <span className="text-[10px] font-normal text-muted-foreground flex items-center gap-1">
                <RefreshCw className="w-2.5 h-2.5 animate-spin" /> Analyzing…
              </span>
            )}
            {saved && !result?.loading && (
              <span className="text-[10px] font-normal text-muted-foreground/60 flex items-center gap-1">
                <Save className="w-2.5 h-2.5" /> Saved
              </span>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            {saved?.was_correct === true && (
              <Badge className="text-[10px] bg-green-500/20 text-green-400 border-green-500/30 gap-1">
                <CheckCircle2 className="w-2.5 h-2.5" /> Correct
              </Badge>
            )}
            {saved?.was_correct === false && (
              <Badge className="text-[10px] bg-amber-500/20 text-amber-400 border-amber-500/30 gap-1">
                <XCircle className="w-2.5 h-2.5" /> Upset
              </Badge>
            )}
            <Button
              size="sm" variant="outline"
              onClick={() => run(false)}
              disabled={result?.loading || !hasBothPlayers}
              data-testid="btn-run-prediction"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${result?.loading ? 'animate-spin' : ''}`} />
              {result?.loading ? 'Analyzing…' : display ? 'Re-run' : 'Run Now'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!hasBothPlayers && !display && !result?.loading && (
          <p className="text-sm text-muted-foreground">Waiting for both players to have hero data loaded…</p>
        )}
        {result?.error && <p className="text-sm text-destructive">{result.error}</p>}
        {display && (
          <>
            <div className="space-y-1.5">
              <div className="flex justify-between text-sm font-semibold">
                <span className={display.winPctA >= 50 ? 'text-green-400' : 'text-muted-foreground'}>
                  {display.nameA} — {display.winPctA}%
                </span>
                <span className={display.winPctB >= 50 ? 'text-green-400' : 'text-muted-foreground'}>
                  {display.winPctB}% — {display.nameB}
                </span>
              </div>
              <div className="h-4 rounded-full overflow-hidden flex bg-muted">
                <div className="h-full bg-green-500 transition-all duration-700" style={{ width: `${display.winPctA}%` }} />
                <div className="h-full bg-red-500/70 transition-all duration-700" style={{ width: `${display.winPctB}%` }} />
              </div>
              {display.predictedAt && (
                <p className="text-[10px] text-muted-foreground/50 text-right">
                  Predicted {new Date(display.predictedAt).toLocaleString()}
                  {saved?.actual_winner_slot != null && (
                    <span className="ml-2">
                      · Actual winner: Slot #{saved.actual_winner_slot}
                      {saved.was_correct
                        ? <span className="text-green-400 ml-1">✓ Correct</span>
                        : <span className="text-amber-400 ml-1">✗ Upset</span>}
                    </span>
                  )}
                </p>
              )}
            </div>
            {display.factors && (
              <div className="rounded-md bg-muted/20 p-3 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Factor Breakdown</p>
                {FACTORS.map(({ label, key, weight }) => {
                  const aVal = Number(display.factors?.[key] ?? 50);
                  const bVal = Math.round((100 - aVal) * 10) / 10;
                  return (
                    <div key={key} className="grid grid-cols-[1fr_auto_auto] items-center gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-xs text-muted-foreground truncate">{label}</span>
                        <span className="text-[10px] text-muted-foreground/60 shrink-0">{weight}%</span>
                      </div>
                      <span className={`text-xs font-mono tabular-nums ${aVal >= 50 ? 'text-green-400' : 'text-muted-foreground'}`}>{aVal.toFixed(1)}%</span>
                      <span className={`text-xs font-mono tabular-nums ${bVal >= 50 ? 'text-green-400' : 'text-muted-foreground'}`}>{bVal.toFixed(1)}%</span>
                    </div>
                  );
                })}
                <div className="pt-1 border-t border-border/40 flex justify-between text-[10px] text-muted-foreground/50">
                  <span>{display.nameA}</span><span>{display.nameB}</span>
                </div>
              </div>
            )}
            {display.narrative && (
              <div className="rounded-md border border-blue-500/20 bg-blue-500/5 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-400 mb-1.5 flex items-center gap-1.5">
                  <Star className="w-3 h-3" /> Strategic Assessment
                </p>
                <p className="text-sm text-muted-foreground leading-relaxed">{display.narrative}</p>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Client-side stat prediction ─────────────────────────────────────────────

function computeBoutPrediction(heroesA: BoutHero[], heroesB: BoutHero[]): { pctA: number; pctB: number } | null {
  if (!heroesA.length || !heroesB.length) return null;
  const avg = (heroes: BoutHero[], fn: (h: BoutHero) => number) =>
    heroes.reduce((s, h) => s + fn(h), 0) / heroes.length;
  const offPassives = (heroes: BoutHero[]) =>
    heroes.filter(h => h.passive1 != null || h.passive2 != null).length / heroes.length;
  const uniqueClasses = (heroes: BoutHero[]) => new Set(heroes.map(h => h.main_class)).size / heroes.length;

  const score = (side: BoutHero[], other: BoutHero[]) => {
    const agiA = avg(side, h => h.agility); const agiB = avg(other, h => h.agility);
    const strA = avg(side, h => h.strength); const strB = avg(other, h => h.strength);
    const survA = avg(side, h => (h.vitality + h.endurance) / 2);
    const survB = avg(other, h => (h.vitality + h.endurance) / 2);
    const passA = offPassives(side); const passB = offPassives(other);
    const compA = uniqueClasses(side); const compB = uniqueClasses(other);
    const factors = [
      { w: 0.25, a: agiA,   b: agiB   },
      { w: 0.30, a: strA,   b: strB   },
      { w: 0.20, a: survA,  b: survB  },
      { w: 0.10, a: passA,  b: passB  },
      { w: 0.15, a: compA,  b: compB  },
    ];
    return factors.reduce((s, f) => {
      const tot = f.a + f.b;
      return s + f.w * (tot > 0 ? f.a / tot : 0.5);
    }, 0);
  };
  const sA = score(heroesA, heroesB);
  const sB = score(heroesB, heroesA);
  const tot = sA + sB;
  const pctA = Math.round((sA / tot) * 100);
  return { pctA, pctB: 100 - pctA };
}

// ─── Per-player coaching state ─────────────────────────────────────────────────

interface CoachResult { analysis: string | null; hadBattleLog?: boolean; loading: boolean; error?: string; }
interface BattleLogState { data: BattleLogResult | null; loading: boolean; error?: string; open: boolean; }
interface LiveCoachState { analysis: string | null; playerName?: string; hadBattleLog?: boolean; turnsCount?: number; loading: boolean; error?: string; }

// ─── Battle Log Viewer ────────────────────────────────────────────────────────

function BattleLogViewer({
  tournamentId, boutId, isLive, battleBudget,
  onLogLoaded,
  onBattleLogData,
}: {
  tournamentId: string;
  boutId: number;
  isLive: boolean;
  battleBudget?: number | null;
  onLogLoaded?: (hasData: boolean) => void;
  onBattleLogData?: (data: BattleLogResult | null) => void;
}) {
  const [state, setState] = useState<BattleLogState>({ data: null, loading: false, open: false });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchLog = async (silent = false) => {
    if (!silent) setState(s => ({ ...s, loading: true }));
    try {
      const res = await fetch(`/api/admin/tournament/bracket/${tournamentId}/bout-battle-log?boutId=${boutId}`);
      const data: BattleLogResult = await res.json();
      setState(s => ({ ...s, data, loading: false, open: s.open || !silent }));
      onLogLoaded?.((data.turns?.length ?? 0) > 0);
      onBattleLogData?.(data);
    } catch (err: any) {
      setState(s => ({ ...s, loading: false, error: err.message }));
    }
  };

  // Auto-fetch silently on mount so data is ready when user expands
  useEffect(() => { fetchLog(true); }, [boutId, tournamentId]);

  const toggle = () => {
    if (state.data !== null || state.loading) {
      setState(s => ({ ...s, open: !s.open }));
    } else {
      setState(s => ({ ...s, open: true }));
      fetchLog(false);
    }
  };

  useEffect(() => {
    if (isLive && state.open) {
      intervalRef.current = setInterval(() => fetchLog(true), 5000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isLive, boutId, tournamentId]);

  const turns = [...(state.data?.turns ?? [])].reverse();
  const hasTurns = turns.length > 0;
  const battleId = state.data?.battleId;

  return (
    <div className="border-t border-border/40">
      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/20 transition-colors"
        onClick={toggle}
        data-testid={`btn-battle-log-${boutId}`}
      >
        <ScrollText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs text-muted-foreground flex-1">Battle Log</span>
        {isLive && (
          <span className="text-[9px] font-bold text-green-400 animate-pulse mr-1">● Live</span>
        )}
        {state.data !== null && (
          hasTurns
            ? <span className="text-[10px] text-green-400">{turns.length} turns · Firebase</span>
            : <span className="text-[10px] text-muted-foreground/60">Not available</span>
        )}
        {state.loading && <RefreshCw className="w-3 h-3 animate-spin text-muted-foreground" />}
        <ChevronDown className={`w-3 h-3 text-muted-foreground transition-transform ${state.open ? 'rotate-180' : ''}`} />
      </button>
      {state.open && (
        <div className="px-3 pb-3">
          {state.loading && !state.data && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <RefreshCw className="w-3 h-3 animate-spin" />Fetching battle log from Firebase…
            </div>
          )}
          {state.error && <p className="text-xs text-destructive py-1">{state.error}</p>}
          {state.data && !hasTurns && (
            <div className="text-xs text-muted-foreground py-1.5 space-y-1">
              <p>No turn data found for this bout in Firebase.{isLive && ' Refreshing every 5s…'}</p>
              {state.data.indexedFirebaseId ? (
                <p className="text-[10px] font-mono text-muted-foreground/50 break-all">
                  Tried: {state.data.indexedFirebaseId}
                </p>
              ) : (
                <p className="text-[10px] text-amber-500/70">
                  {state.data.isIndexed === false
                    ? 'Tournament not in Firebase index — battle data may not be available yet.'
                    : 'Firebase index not yet loaded — try the Firebase Probe panel below.'}
                </p>
              )}
              {state.data.candidatesTried && state.data.candidatesTried.length > 0 && !state.data.indexedFirebaseId && (
                <p className="text-[10px] text-muted-foreground/40">
                  Also tried {state.data.candidatesTried.length} fallback ID formats.
                </p>
              )}
            </div>
          )}
          {hasTurns && (
            <div className={`space-y-0.5 overflow-y-auto ${isLive ? '' : 'max-h-52'}`}>
              {/* Hero HP snapshot */}
              {state.data?.heroHpSnapshot && (
                <div className="mb-2 pb-1.5 border-b border-border/30">
                  <p className="text-[9px] uppercase tracking-wide text-muted-foreground/50 mb-0.5">Current HP</p>
                  {(['sideA', 'sideB'] as const).map(sideKey => {
                    const heroes = state.data!.heroHpSnapshot![sideKey] ?? [];
                    if (!heroes.length) return null;
                    const label = sideKey === 'sideA' ? 'A' : 'B';
                    return (
                      <div key={sideKey} className="flex flex-wrap gap-x-2 gap-y-0.5">
                        <span className="text-[9px] text-muted-foreground/50 w-3">
                          {label}:
                        </span>
                        {heroes.map((h, i) => {
                          const pct = h.hpPct;
                          const color = pct != null && pct < 30 ? 'text-red-400' : pct != null && pct < 60 ? 'text-amber-400' : 'text-green-400/80';
                          return (
                            <span key={i} className={`text-[10px] ${color}`}>
                              {h.heroClass ?? `Hero${i + 1}`} {h.currentHp}/{h.maxHp}
                              {pct != null && <span className="text-[9px] opacity-70"> ({pct}%)</span>}
                            </span>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}
              {/* Player inventory */}
              {state.data?.playerInventory && (state.data.playerInventory.sideA || state.data.playerInventory.sideB) && (
                <div className="mb-2 pb-1.5 border-b border-border/30">
                  <p className="text-[9px] uppercase tracking-wide text-muted-foreground/50 mb-0.5">Consumable Inventory</p>
                  {(['sideA', 'sideB'] as const).map(sideKey => {
                    const inv = state.data!.playerInventory![sideKey];
                    if (!inv || !inv.items.length) return null;
                    const label = sideKey === 'sideA' ? 'A' : 'B';
                    const usedPct = inv.totalBudget ? Math.round(inv.usedBudget / inv.totalBudget * 100) : 0;
                    return (
                      <div key={sideKey} className="flex flex-wrap gap-x-2 gap-y-0.5 items-start">
                        <span className="text-[9px] text-muted-foreground/50 mt-0.5 w-3">{label}:</span>
                        <div className="flex flex-wrap gap-1">
                          {inv.items.map((item, i) => (
                            <span key={i} className="text-[10px] text-blue-300/70">
                              {item.qty}×{item.name}
                            </span>
                          ))}
                          <span className="text-[9px] text-muted-foreground/40">
                            [{inv.usedBudget}/{inv.totalBudget ?? '?'}pts{usedPct > 0 ? ` (${usedPct}% used)` : ''}]
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {/* Items used summary row */}
              {state.data?.itemsUsed && (state.data.itemsUsed.a.length > 0 || state.data.itemsUsed.b.length > 0) && (
                <div className="flex gap-3 mb-1.5 text-[10px]">
                  {(['a', 'b'] as const).map(side => {
                    const used = state.data!.itemsUsed![side] ?? [];
                    if (!used.length) return null;
                    return (
                      <span key={side} className="text-blue-400/80">
                        Side {side.toUpperCase()}: {used.length}{battleBudget != null ? ` items used (${battleBudget} budget-pts total)` : ' items used'}
                      </span>
                    );
                  })}
                </div>
              )}
              {battleId && (
                <p className="text-[10px] text-muted-foreground/50 mb-1.5 font-mono break-all">
                  ID: {battleId}
                </p>
              )}
              <div className="grid text-[11px]" style={{ gridTemplateColumns: 'auto 1fr auto auto' }}>
                <div className="contents text-muted-foreground/50 font-medium uppercase tracking-wide text-[9px] pb-1">
                  <span className="pr-2">T#</span>
                  <span>Actor → Target</span>
                  <span className="px-2">Skill</span>
                  <span>Dmg/Heal</span>
                </div>
                {turns.map((t, i) => (
                  <div key={i} className={`contents ${i % 2 === 0 ? '' : 'bg-muted/5'}`}>
                    <span className="pr-2 text-muted-foreground/60 font-mono tabular-nums">{t.turn ?? i + 1}</span>
                    <span className="text-foreground/80 truncate">
                      {t.actorClass || t.actor || '?'}
                      {(t.targetClass || t.target) && (
                        <span className="text-muted-foreground"> → {t.targetClass || t.target}</span>
                      )}
                    </span>
                    <span className="px-2 text-muted-foreground/70 truncate max-w-[80px]">
                      {t.skillName || t.action || '—'}
                    </span>
                    <span className={t.damage ? 'text-red-400 tabular-nums' : t.healing ? 'text-green-400 tabular-nums' : 'text-muted-foreground/40'}>
                      {t.damage != null ? `-${t.damage}` : t.healing != null ? `+${t.healing}` : '—'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Fight History Section ─────────────────────────────────────────────────────

function BoutCard({ bout, tournamentId, nameA, nameB, addrA, addrB, isLiveTournament, battleBudget, strategicNarrative, onBattleLogData, onHeroSelect }: {
  bout: HistoryBout;
  tournamentId: string;
  nameA: string; nameB: string;
  addrA: string; addrB: string;
  isLiveTournament: boolean;
  battleBudget?: number | null;
  strategicNarrative?: string | null;
  onBattleLogData?: (data: BattleLogResult | null) => void;
  onHeroSelect?: (side: 'a' | 'b', slot: number, boutId: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [winnerCoach, setWinnerCoach] = useState<CoachResult | null>(null);
  const [loserCoach, setLoserCoach] = useState<CoachResult | null>(null);
  const [upsetAnalysis, setUpsetAnalysis] = useState<(CoachResult & { underdogName?: string; favoriteName?: string; underdogPct?: number; favoritePct?: number }) | null>(null);
  const [liveCoachA, setLiveCoachA] = useState<LiveCoachState | null>(null);
  const [liveCoachB, setLiveCoachB] = useState<LiveCoachState | null>(null);
  const [battleLogHasData, setBattleLogHasData] = useState(false);

  const winnerIsA = bout.winnerAddress &&
    bout.winnerAddress.toLowerCase() === addrA.toLowerCase();
  const winnerName = winnerIsA ? nameA : (bout.winnerAddress ? nameB : null);
  const loserName  = winnerIsA ? nameB : (bout.winnerAddress ? nameA : null);

  const hasBothHeroes = bout.heroesA.length > 0 && bout.heroesB.length > 0;
  const prediction = hasBothHeroes ? computeBoutPrediction(bout.heroesA, bout.heroesB) : null;
  const predWinnerIsA = prediction && prediction.pctA >= 50;
  const predictionCorrect = prediction && bout.isComplete && bout.winnerAddress &&
    ((predWinnerIsA && winnerIsA) || (!predWinnerIsA && !winnerIsA));

  const runCoach = async (target: 'winner' | 'loser') => {
    const setState = target === 'winner' ? setWinnerCoach : setLoserCoach;
    setState({ loading: true, analysis: null });
    try {
      const res = await fetch(`/api/admin/tournament/bracket/${tournamentId}/bout-analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boutId: bout.id, target }),
      });
      const data = await res.json();
      if (!data.ok && data.error) throw new Error(data.error);
      setState({ loading: false, analysis: data.analysis ?? 'No analysis available.', hadBattleLog: data.hadBattleLog });
    } catch (err: any) {
      setState({ loading: false, analysis: null, error: err.message });
    }
  };

  const runUpsetAnalysis = async () => {
    setUpsetAnalysis({ loading: true, analysis: null });
    try {
      const res = await fetch(`/api/admin/tournament/bracket/${tournamentId}/bout-analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boutId: bout.id, target: 'upset' }),
      });
      const data = await res.json();
      if (!data.ok && data.error) throw new Error(data.error);
      setUpsetAnalysis({
        loading: false,
        analysis: data.analysis ?? 'No analysis available.',
        hadBattleLog: data.hadBattleLog,
        underdogName: data.underdogName,
        favoriteName: data.favoriteName,
        underdogPct: data.underdogPct,
        favoritePct: data.favoritePct,
      });
    } catch (err: any) {
      setUpsetAnalysis({ loading: false, analysis: null, error: err.message });
    }
  };

  const runLiveCoach = async (perspective: 'a' | 'b') => {
    const setCoach = perspective === 'a' ? setLiveCoachA : setLiveCoachB;
    setCoach({ loading: true, analysis: null });
    try {
      const res = await fetch(`/api/admin/tournament/bracket/${tournamentId}/bout-live-coach`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boutId: bout.id, perspective, strategicContext: strategicNarrative ?? undefined }),
      });
      const data = await res.json();
      if (!data.ok && data.error) throw new Error(data.error);
      setCoach({ loading: false, analysis: data.analysis ?? 'No analysis available.', playerName: data.playerName, hadBattleLog: data.hadBattleLog, turnsCount: data.turnsCount });
    } catch (err: any) {
      setCoach({ loading: false, analysis: null, error: err.message });
    }
  };

  return (
    <div className="border border-border/50 rounded-md overflow-hidden">
      <button
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setOpen(v => !v)}
        data-testid={`bout-card-${bout.id}`}
      >
        <div className="flex flex-col gap-0.5 shrink-0">
          <span className="text-xs font-medium">Rd {bout.roundNumber}</span>
          <span className="text-[10px] text-muted-foreground">Match #{bout.matchIndex + 1}</span>
        </div>
        {bout.isComplete ? (
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <Trophy className="w-3 h-3 text-yellow-400 shrink-0" />
            <span className="text-sm font-medium text-green-400 truncate">{winnerName ?? shortAddr(bout.winnerAddress)}</span>
            {prediction && !predictionCorrect && (
              <Badge variant="outline" className="text-amber-400 border-amber-400/40 text-[9px] px-1 shrink-0">UPSET</Badge>
            )}
          </div>
        ) : (
          <span className="text-sm text-muted-foreground flex-1">In Progress</span>
        )}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] text-muted-foreground">{bout.heroesA.length}v{bout.heroesB.length}</span>
          {!bout.isComplete && (
            <span className="text-[9px] font-bold text-green-400 animate-pulse">● LIVE</span>
          )}
          <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>
      {open && (
        <div className="border-t border-border/40">
          {/* Hero comparison grid */}
          <div className="grid grid-cols-2 divide-x divide-border/40">
            {[
              { name: nameA, heroes: bout.heroesA, isWinner: !!winnerIsA, side: 'a' as const },
              { name: nameB, heroes: bout.heroesB, isWinner: !winnerIsA && !!bout.winnerAddress, side: 'b' as const },
            ].map(({ name, heroes, isWinner, side }) => (
              <div key={name} className="p-3">
                <p className={`text-xs font-semibold mb-2 truncate ${isWinner ? 'text-green-400' : 'text-muted-foreground'}`}>
                  {isWinner && <Trophy className="w-2.5 h-2.5 inline mr-1" />}{name}
                </p>
                {heroes.length > 0 ? (
                  <div className="space-y-1">
                    {heroes.map((h, i) => (
                      <button
                        key={i}
                        className="text-xs text-muted-foreground flex items-center gap-1.5 hover-elevate rounded px-1 py-0.5 -mx-1 w-full text-left"
                        onClick={(e) => { e.stopPropagation(); onHeroSelect?.(side, i, bout.id); }}
                        data-testid={`bout-hero-${bout.id}-${side}-${i}`}
                      >
                        <span className="font-medium text-foreground/80">{h.main_class}</span>
                        <span>Lv{h.level}</span>
                        <span className="text-[10px]">AGI {h.agility}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No heroes indexed</p>
                )}
              </div>
            ))}
          </div>

          {/* Battle log viewer — shown for completed bouts AND live in-progress bouts */}
          {(bout.isComplete || isLiveTournament) && (
            <BattleLogViewer
              tournamentId={tournamentId}
              boutId={bout.id}
              isLive={isLiveTournament && !bout.isComplete}
              battleBudget={battleBudget}
              onLogLoaded={setBattleLogHasData}
              onBattleLogData={onBattleLogData}
            />
          )}

          {/* Live AI tactical advisor — only for in-progress bouts */}
          {isLiveTournament && !bout.isComplete && (
            <div className="border-t border-border/40 p-3 space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <Zap className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">AI Tactical Advisor</span>
                <span className="text-[9px] font-bold text-green-400 animate-pulse ml-1">● Live</span>
                {battleLogHasData && (
                  <span className="text-[9px] text-muted-foreground/50 ml-auto">Battle log included</span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs"
                  onClick={() => runLiveCoach('a')}
                  disabled={liveCoachA?.loading}
                  data-testid={`btn-live-coach-a-${bout.id}`}
                >
                  {liveCoachA?.loading
                    ? <><RefreshCw className="w-3 h-3 mr-1.5 animate-spin" />Advising…</>
                    : <><Zap className="w-3 h-3 mr-1.5 text-yellow-400" />Advise {nameA}</>
                  }
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs"
                  onClick={() => runLiveCoach('b')}
                  disabled={liveCoachB?.loading}
                  data-testid={`btn-live-coach-b-${bout.id}`}
                >
                  {liveCoachB?.loading
                    ? <><RefreshCw className="w-3 h-3 mr-1.5 animate-spin" />Advising…</>
                    : <><Zap className="w-3 h-3 mr-1.5 text-yellow-400" />Advise {nameB}</>
                  }
                </Button>
              </div>
              {liveCoachA?.error && <p className="text-xs text-destructive">{liveCoachA.error}</p>}
              {liveCoachA?.analysis && (
                <div className="rounded-md border border-yellow-500/20 bg-yellow-500/5 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-yellow-400 mb-1.5 flex items-center gap-1.5">
                    <Zap className="w-3 h-3" /> Tactical advice for {liveCoachA.playerName ?? nameA}
                    {liveCoachA.hadBattleLog && liveCoachA.turnsCount && (
                      <span className="text-[9px] font-normal text-green-400/70 ml-1">· {liveCoachA.turnsCount} turns analysed</span>
                    )}
                  </p>
                  <p className="text-sm text-muted-foreground leading-relaxed">{liveCoachA.analysis}</p>
                </div>
              )}
              {liveCoachB?.error && <p className="text-xs text-destructive">{liveCoachB.error}</p>}
              {liveCoachB?.analysis && (
                <div className="rounded-md border border-yellow-500/20 bg-yellow-500/5 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-yellow-400 mb-1.5 flex items-center gap-1.5">
                    <Zap className="w-3 h-3" /> Tactical advice for {liveCoachB.playerName ?? nameB}
                    {liveCoachB.hadBattleLog && liveCoachB.turnsCount && (
                      <span className="text-[9px] font-normal text-green-400/70 ml-1">· {liveCoachB.turnsCount} turns analysed</span>
                    )}
                  </p>
                  <p className="text-sm text-muted-foreground leading-relaxed">{liveCoachB.analysis}</p>
                </div>
              )}
              <p className="text-[10px] text-muted-foreground/40 italic">
                Advice based on hero skill trees, stats, and passives. Battle log from Firebase included when available.
              </p>
            </div>
          )}

          {/* Pre-fight prediction vs actual result */}
          {prediction && bout.isComplete && (
            <div className="border-t border-border/40 px-3 py-2.5 space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Pre-fight Prediction vs Result</p>
              <div className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className={prediction.pctA >= 50 ? 'text-green-400' : 'text-muted-foreground'}>{nameA} {prediction.pctA}%</span>
                  <span className={prediction.pctB >= 50 ? 'text-green-400' : 'text-muted-foreground'}>{prediction.pctB}% {nameB}</span>
                </div>
                <div className="h-2.5 rounded-full overflow-hidden flex bg-muted">
                  <div className="h-full bg-green-500/60 transition-all" style={{ width: `${prediction.pctA}%` }} />
                  <div className="h-full bg-red-500/40 transition-all" style={{ width: `${prediction.pctB}%` }} />
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 text-xs">
                  {predictionCorrect ? (
                    <span className="text-green-400 font-medium">Prediction correct</span>
                  ) : (
                    <span className="text-amber-400 font-medium flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      Upset — {winnerName} won against the odds
                    </span>
                  )}
                  <span className="text-muted-foreground/50">·</span>
                  <span className="text-muted-foreground">Actual winner: {winnerName}</span>
                </div>
                {!predictionCorrect && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-[10px] h-6 px-2 text-amber-400 border-amber-400/40"
                    onClick={runUpsetAnalysis}
                    disabled={upsetAnalysis?.loading}
                    data-testid={`btn-upset-analysis-${bout.id}`}
                  >
                    {upsetAnalysis?.loading
                      ? <><RefreshCw className="w-2.5 h-2.5 mr-1 animate-spin" />Analyzing…</>
                      : <><AlertTriangle className="w-2.5 h-2.5 mr-1" />Analyze Upset</>}
                  </Button>
                )}
              </div>
              {upsetAnalysis?.error && (
                <p className="text-xs text-destructive">{upsetAnalysis.error}</p>
              )}
              {upsetAnalysis?.analysis && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 space-y-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-400 flex items-center gap-1.5">
                    <AlertTriangle className="w-3 h-3" />
                    Upset Analysis
                    {upsetAnalysis.hadBattleLog && (
                      <span className="text-[9px] font-normal text-green-400/70 ml-1">· battle log included</span>
                    )}
                  </p>
                  {upsetAnalysis.underdogName && upsetAnalysis.favoriteName && (
                    <p className="text-[10px] text-muted-foreground/70">
                      {upsetAnalysis.underdogName} ({upsetAnalysis.underdogPct}% predicted) defeated {upsetAnalysis.favoriteName} ({upsetAnalysis.favoritePct}% predicted)
                    </p>
                  )}
                  <p className="text-sm text-muted-foreground leading-relaxed">{upsetAnalysis.analysis}</p>
                </div>
              )}
            </div>
          )}

          {/* Per-player coaching */}
          {bout.isComplete && winnerName && loserName && (
            <div className="border-t border-border/40 p-3 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs"
                  onClick={() => runCoach('winner')}
                  disabled={winnerCoach?.loading}
                  data-testid={`btn-coach-winner-${bout.id}`}
                >
                  <Trophy className="w-3 h-3 mr-1.5 text-yellow-400" />
                  Coach {winnerName}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs"
                  onClick={() => runCoach('loser')}
                  disabled={loserCoach?.loading}
                  data-testid={`btn-coach-loser-${bout.id}`}
                >
                  <Shield className="w-3 h-3 mr-1.5 text-blue-400" />
                  Coach {loserName}
                </Button>
              </div>

              {winnerCoach?.loading && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <RefreshCw className="w-3 h-3 animate-spin" />Generating winner coaching…
                </div>
              )}
              {winnerCoach?.error && <p className="text-xs text-destructive">{winnerCoach.error}</p>}
              {winnerCoach?.analysis && (
                <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-400 mb-1.5 flex items-center gap-1.5">
                    <Trophy className="w-3 h-3" /> What worked for {winnerName}
                    {winnerCoach.hadBattleLog && <span className="text-[9px] font-normal text-green-400/70 ml-1">· battle log included</span>}
                  </p>
                  <p className="text-sm text-muted-foreground leading-relaxed">{winnerCoach.analysis}</p>
                </div>
              )}

              {loserCoach?.loading && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <RefreshCw className="w-3 h-3 animate-spin" />Generating improvement coaching…
                </div>
              )}
              {loserCoach?.error && <p className="text-xs text-destructive">{loserCoach.error}</p>}
              {loserCoach?.analysis && (
                <div className="rounded-md border border-blue-500/20 bg-blue-500/5 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-400 mb-1.5 flex items-center gap-1.5">
                    <Shield className="w-3 h-3" /> How {loserName} can improve
                    {loserCoach.hadBattleLog && <span className="text-[9px] font-normal text-green-400/70 ml-1">· battle log included</span>}
                  </p>
                  <p className="text-sm text-muted-foreground leading-relaxed">{loserCoach.analysis}</p>
                </div>
              )}
              <p className="text-[10px] text-muted-foreground/40 italic">
                Analysis based on hero stats and team composition. Turn-by-turn battle logs are fetched from DFK Firebase when available.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function TournamentMatchupPage() {
  const params = useParams<{ id: string; slotA: string; slotB: string }>();
  const [location, navigate] = useLocation();
  const basePath = location.startsWith('/user/') ? '/user/dfk-tournament' : '/admin/tournament';
  const [selectedHero, setSelectedHero] = useState<HeroDetail | null>(null);
  const [selectedHeroBoutId, setSelectedHeroBoutId] = useState<number | null>(null);
  const [strategicNarrative, setStrategicNarrative] = useState<string | null>(null);
  const [liveCombatStates, setLiveCombatStates] = useState<Record<number, LiveCombatState>>({});

  const tournamentId = params.id;
  const slotA = parseInt(params.slotA ?? '0');
  const slotB = parseInt(params.slotB ?? '0');

  const { data: bracketData, isLoading: bracketLoading, refetch, isFetching } = useQuery<BracketDetailResponse>({
    queryKey: ['/api/admin/tournament/bracket', tournamentId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/tournament/bracket/${tournamentId}`);
      if (!res.ok) throw new Error('Failed to load bracket');
      return res.json();
    },
    refetchInterval: (data) =>
      (data as BracketDetailResponse | undefined)?.tournament?.stateLabel === 'in_progress' ? 20000 : false,
  });

  const tournament = bracketData?.tournament;
  const isLive = tournament?.stateLabel === 'in_progress';
  const players = bracketData?.players ?? [];

  const playerA = players.find(p => p.partyIndex === slotA) ?? null;
  const playerB = players.find(p => p.partyIndex === slotB) ?? null;

  const nameA = playerA?.playerName || shortAddr(playerA?.address) || `Slot #${slotA}`;
  const nameB = playerB?.playerName || shortAddr(playerB?.address) || `Slot #${slotB}`;

  const { data: histData, isLoading: histLoading } = useQuery<HistoryResponse>({
    queryKey: ['/api/admin/tournament/bracket', tournamentId, 'matchup-history', slotA, slotB],
    queryFn: async () => {
      const res = await fetch(`/api/admin/tournament/bracket/${tournamentId}/matchup-history?slotA=${slotA}&slotB=${slotB}`);
      return res.json();
    },
    enabled: !!bracketData,
    refetchInterval: isLive ? 20000 : false,
  });

  const hasBothPlayers = !!(playerA?.heroes?.length && playerB?.heroes?.length);

  // Derive winner slot from completed bouts in fight history
  const winnerSlot = (() => {
    const bouts = histData?.bouts ?? [];
    const completed = bouts.find(b => b.isComplete && b.winnerAddress);
    if (!completed) return null;
    if (playerA?.address && completed.winnerAddress?.toLowerCase() === playerA.address.toLowerCase()) return slotA;
    if (playerB?.address && completed.winnerAddress?.toLowerCase() === playerB.address.toLowerCase()) return slotB;
    return null;
  })();

  if (bracketLoading) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="h-8 w-48 bg-muted animate-pulse rounded-md mb-6" />
        <div className="space-y-4">
          {[1, 2, 3].map(i => <div key={i} className="h-32 bg-muted animate-pulse rounded-md" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5 max-w-5xl mx-auto">
      {selectedHero && (
        <HeroDetailModal
          hero={selectedHero}
          onClose={() => { setSelectedHero(null); setSelectedHeroBoutId(null); }}
          liveState={selectedHeroBoutId != null && liveCombatStates[selectedHeroBoutId]
            ? getLiveStatOverlay(
                selectedHero.id ?? null,
                selectedHero.normalizedId ?? null,
                liveCombatStates[selectedHeroBoutId]
              )
            : undefined}
        />
      )}

      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(`${basePath}/bracket/${tournamentId}`)}
          data-testid="button-back"
        >
          <ArrowLeft className="w-4 h-4 mr-1.5" />
          Back to Bracket
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold truncate">
            {nameA} <span className="text-muted-foreground font-normal">vs</span> {nameB}
          </h1>
          {tournament && (
            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
              {tournament.name}
              {isLive && (
                <span className="text-green-400 font-semibold flex items-center gap-1">
                  <Radio className="w-3 h-3 animate-pulse" /> Live · refreshes every 20s
                </span>
              )}
            </p>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} data-testid="button-refresh">
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} />
          {isFetching ? 'Refreshing…' : 'Refresh'}
        </Button>
      </div>

      {/* Section 1: Team Lineup */}
      <MatchupLineup
        playerA={playerA}
        playerB={playerB}
        nameA={nameA}
        nameB={nameB}
        isLoading={bracketLoading}
        onSelectHero={(hero) => {
          setSelectedHero(hero);
          setSelectedHeroBoutId(null);
        }}
      />

      {/* Section 2: Initiative Order */}
      {hasBothPlayers && (
        <InitiativeSection
          nameA={nameA}
          nameB={nameB}
          heroesA={playerA!.heroes}
          heroesB={playerB!.heroes}
        />
      )}

      {/* Section 3: AI Prediction */}
      <AiPredictionSection
        tournamentId={tournamentId}
        slotA={slotA}
        slotB={slotB}
        hasBothPlayers={hasBothPlayers}
        onNarrativeGenerated={setStrategicNarrative}
        winnerSlot={winnerSlot}
      />

      {/* Section 4: Fight History */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <CardTitle className="text-sm flex items-center gap-2">
              <Shield className="w-4 h-4" />
              Fight History
              {isLive && (
                <Badge variant="outline" className="text-[9px] text-green-400 border-green-500/40 ml-1 gap-1">
                  <Radio className="w-2.5 h-2.5 animate-pulse" /> Live — refreshes every 20s
                </Badge>
              )}
            </CardTitle>
            {histData && (histData.battleBudget != null || (histData.allowedItems && histData.allowedItems.length > 0)) && (
              <div className="flex flex-col items-end gap-0.5">
                {histData.battleBudget != null && (
                  <p className="text-[11px] text-muted-foreground">
                    <span className="font-medium text-foreground/70">Battle Budget:</span>{' '}
                    {histData.battleBudget} budget-pts per player
                  </p>
                )}
                {histData.allowedItems && histData.allowedItems.length > 0 && (
                  <p className="text-[10px] text-muted-foreground/60">
                    Allowed: {histData.allowedItems.join(', ')}
                  </p>
                )}
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {histLoading ? (
            <div className="space-y-2">
              {[1, 2].map(i => <div key={i} className="h-12 bg-muted animate-pulse rounded-md" />)}
            </div>
          ) : !histData?.bouts?.length ? (
            <p className="text-sm text-muted-foreground py-2">
              No indexed bouts found for this matchup yet.
              {tournament?.stateLabel === 'in_progress' && ' Check back as rounds complete.'}
            </p>
          ) : (
            <div className="space-y-2">
              {histData.bouts.map(bout => (
                <BoutCard
                  key={bout.id}
                  bout={bout}
                  tournamentId={tournamentId}
                  nameA={nameA}
                  nameB={nameB}
                  addrA={playerA?.address ?? ''}
                  addrB={playerB?.address ?? ''}
                  isLiveTournament={tournament?.stateLabel === 'in_progress'}
                  battleBudget={histData.battleBudget ?? null}
                  strategicNarrative={strategicNarrative}
                  onBattleLogData={(data) => {
                    if (data?.turns?.length && data.heroHpSnapshot) {
                      const parsed = parseLiveCombatState(data.turns as BattleTurn[], data.heroHpSnapshot, bout.id);
                      if (parsed) {
                        setLiveCombatStates(prev => ({ ...prev, [bout.id]: parsed }));
                      }
                    }
                  }}
                  onHeroSelect={(side, slot, boutId) => {
                    const boutState = liveCombatStates[boutId];
                    const liveHeroes = boutState ? (side === 'a' ? boutState.sideA : boutState.sideB) : [];
                    const liveHero = liveHeroes[slot];
                    const heroId = liveHero?.heroId;
                    const allHeroes = [...(playerA?.heroes ?? []), ...(playerB?.heroes ?? [])];
                    const sideHeroes = side === 'a'
                      ? (playerA?.heroes ?? [])
                      : (playerB?.heroes ?? []);
                    const match = heroId
                      ? allHeroes.find(h => h.id === heroId || h.normalizedId === heroId)
                      : sideHeroes[slot] ?? null;
                    if (match) {
                      setSelectedHero(match);
                      setSelectedHeroBoutId(boutId);
                    }
                  }}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 5: Direct Battle Log */}
      <DirectBattleLogSection tournamentId={tournamentId} addrA={playerA?.address ?? ''} addrB={playerB?.address ?? ''} />

      {/* Section 6: Firebase Battle Log Probe (admin dev tool) */}
      <FirebaseProbePanel />
    </div>
  );
}

// ─── Direct Battle Log Section ────────────────────────────────────────────────

interface DirectLogState {
  boutNum: string;
  loading: boolean;
  autoScanning: boolean;
  autoScanDone: boolean;
  autoScanFound: boolean;
  expanded: boolean;
  error?: string;
  data: {
    battleId: string;
    turns: any[] | null;
    rawDocCount: number;
    pivotalFlags?: { turnCount: number; reasons: string[] }[];
    source?: string;
    playerInventory: {
      sideA: { items: { name: string; qty: number }[]; usedBudget: number; totalBudget: number | null } | null;
      sideB: { items: { name: string; qty: number }[]; usedBudget: number; totalBudget: number | null } | null;
    } | null;
  } | null;
}

function DirectBattleLogSection({ tournamentId, addrA, addrB }: { tournamentId: string; addrA: string; addrB: string }) {
  const [state, setState] = useState<DirectLogState>({
    boutNum: '', loading: false, autoScanning: false, autoScanDone: false, autoScanFound: false, expanded: false, data: null,
  });
  const scanRanRef = useRef(false);

  // Auto-scan when player addresses become available
  useEffect(() => {
    if (!addrA || !addrB || scanRanRef.current) return;
    scanRanRef.current = true;
    setState(s => ({ ...s, autoScanning: true, error: undefined }));
    fetch(`/api/admin/tournament/${tournamentId}/scan-bout-for-players?addrA=${encodeURIComponent(addrA)}&addrB=${encodeURIComponent(addrB)}`)
      .then(r => r.json())
      .then(json => {
        if (!json.ok) throw new Error(json.error);
        if (json.found) {
          setState(s => ({
            ...s, autoScanning: false, autoScanDone: true, autoScanFound: true,
            boutNum: String(json.boutNum),
            data: { battleId: json.battleId, turns: json.turns, rawDocCount: json.rawDocCount, playerInventory: json.playerInventory, pivotalFlags: json.pivotalFlags, source: json.source },
          }));
        } else {
          setState(s => ({ ...s, autoScanning: false, autoScanDone: true, autoScanFound: false }));
        }
      })
      .catch(err => {
        setState(s => ({ ...s, autoScanning: false, autoScanDone: true, autoScanFound: false, error: err.message }));
      });
  }, [addrA, addrB, tournamentId]);

  const fetchLog = async () => {
    const num = parseInt(state.boutNum, 10);
    if (!num || num < 1) return;
    setState(s => ({ ...s, loading: true, error: undefined, data: null }));
    try {
      const res = await fetch(`/api/admin/tournament/${tournamentId}/firebase-direct-log?boutNum=${num}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setState(s => ({ ...s, loading: false, data: { ...json, pivotalFlags: json.pivotalFlags, source: json.source } }));
    } catch (err: any) {
      setState(s => ({ ...s, loading: false, error: err.message }));
    }
  };

  const turns = state.data?.turns ?? [];
  const hasTurns = turns.length > 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2 flex-wrap">
          <ScrollText className="w-4 h-4" />
          Battle Log
          {state.autoScanning && (
            <span className="flex items-center gap-1 text-xs font-normal text-muted-foreground">
              <RefreshCw className="w-3 h-3 animate-spin" />
              Scanning Firebase for this matchup…
            </span>
          )}
          {state.autoScanDone && state.autoScanFound && (
            <span className="text-xs font-normal text-green-400/80">Auto-loaded bout {state.boutNum}</span>
          )}
          {state.autoScanDone && !state.autoScanFound && !state.autoScanning && (
            <span className="text-xs font-normal text-muted-foreground/60">Not found automatically — enter bout # below</span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <input
            className="w-24 text-xs bg-muted/20 border border-border/50 rounded-md px-2.5 py-1.5 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder="Bout #"
            type="number"
            min="1"
            max="200"
            value={state.boutNum}
            onChange={e => setState(s => ({ ...s, boutNum: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && fetchLog()}
            data-testid="input-direct-log-bout-num"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={fetchLog}
            disabled={state.loading || state.autoScanning || !state.boutNum.trim()}
            data-testid="btn-direct-log-fetch"
          >
            {state.loading
              ? <><RefreshCw className="w-3 h-3 mr-1.5 animate-spin" />Fetching…</>
              : <><ScrollText className="w-3 h-3 mr-1.5" />Fetch Log</>
            }
          </Button>
          {state.data && (
            <span className="text-[10px] font-mono text-muted-foreground/60">{state.data.battleId}</span>
          )}
          {state.data?.battleId && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => window.open(`https://game.defikingdoms.com/combat/pvp/${state.data!.battleId}?replay=true`, '_blank', 'noopener,noreferrer')}
              data-testid="btn-watch-replay"
            >
              <ExternalLink className="w-3 h-3 mr-1.5" />
              Watch Replay
            </Button>
          )}
        </div>

        {state.error && <p className="text-xs text-destructive">{state.error}</p>}

        {state.data && !hasTurns && (
          <p className="text-sm text-muted-foreground">No Firebase data found for bout {state.boutNum}.</p>
        )}

        {hasTurns && (() => {
          const pivotalMap = new Map((state.data?.pivotalFlags ?? []).map(p => [p.turnCount, p.reasons]));
          const formatSkill = (id: string) => {
            if (!id) return '—';
            return id.replace(/([A-Z])/g, ' $1').trim().replace(/\s+Attack$/i, '').replace(/\s+/g, ' ');
          };
          const getHeroName = (beforeDeck: any, side: number | string, slot: number | string) => {
            const sideKey = String(side);
            const slotKey = String(slot);
            return beforeDeck?.[sideKey]?.[slotKey]?.baseCombatant?.name
              ?? beforeDeck?.[sideKey]?.[slotKey]?.name
              ?? null;
          };
          const downloadFile = (content: string, name: string, type: string) => {
            const blob = new Blob([content], { type });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = name; a.click();
            URL.revokeObjectURL(url);
          };
          const exportJson = () => downloadFile(
            JSON.stringify(turns, null, 2),
            `battle-${state.data!.battleId}.json`,
            'application/json'
          );
          const exportCsv = () => {
            const rows = [['Turn#','Actor','Target','Skill','TotalDmg','IsPivotal','Reasons']];
            turns.forEach((t) => {
              const log = t.attackOutcome?.battleLog ?? '';
              const actorM = log.match(/^\[(?:[A-Z]+:\s*)?([^\]]+)\]/);
              const targetM = log.match(/(?:at|on)\s+\[(?:[A-Z]+:\s*)?([^\]]+)\]/);
              const actor = actorM ? actorM[1].trim() : '';
              const target = targetM ? targetM[1].trim() : '';
              const skill = formatSkill(t.attackConfig?.attackId ?? '');
              const dmg = (t.attackOutcome?.outcomeUnits ?? []).reduce((s: number, u: any) =>
                s + (u.damage?.physicalDamage || 0) + (u.damage?.magicalDamage || 0), 0);
              const tc = t.currentTurnCount;
              const reasons = pivotalMap.get(tc) ?? [];
              rows.push([String(tc), actor, target, skill, String(dmg), reasons.length > 0 ? 'yes' : 'no', reasons.join('; ')]);
            });
            downloadFile(rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n'), `battle-${state.data!.battleId}.csv`, 'text/csv');
          };

          return (
            <div className="space-y-3">
              {/* Inventory */}
              {state.data?.playerInventory && (state.data.playerInventory.sideA || state.data.playerInventory.sideB) && (
                <div className="rounded-md border border-border/40 bg-muted/10 p-2.5 space-y-1">
                  <p className="text-[9px] uppercase tracking-wide text-muted-foreground/50 mb-1">Consumable Inventory</p>
                  {(['sideA', 'sideB'] as const).map(sideKey => {
                    const inv = state.data!.playerInventory![sideKey];
                    if (!inv || !inv.items.length) return null;
                    const label = sideKey === 'sideA' ? 'A' : 'B';
                    return (
                      <div key={sideKey} className="flex flex-wrap gap-x-2 gap-y-0.5 items-start">
                        <span className="text-[9px] text-muted-foreground/50 mt-0.5 w-3">{label}:</span>
                        <div className="flex flex-wrap gap-1">
                          {inv.items.map((item, i) => (
                            <span key={i} className="text-[10px] text-blue-300/70">{item.qty}×{item.name}</span>
                          ))}
                          <span className="text-[9px] text-muted-foreground/40">[{inv.usedBudget}/{inv.totalBudget ?? '?'}pts]</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Turn list header with controls */}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground/50">{turns.length} turns{pivotalMap.size > 0 ? ` · ${pivotalMap.size} pivotal` : ''}{state.data?.source === 'cache' ? ' · cached' : ''}</span>
                <div className="flex items-center gap-1.5">
                  <Button size="sm" variant="outline" onClick={exportJson} data-testid="btn-export-json">
                    <ExternalLink className="w-3 h-3 mr-1.5" />JSON
                  </Button>
                  <Button size="sm" variant="outline" onClick={exportCsv} data-testid="btn-export-csv">
                    <ExternalLink className="w-3 h-3 mr-1.5" />CSV
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setState(s => ({ ...s, expanded: !s.expanded }))} data-testid="btn-expand-log">
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${state.expanded ? 'rotate-180' : ''}`} />
                    {state.expanded ? 'Collapse' : 'Expand'}
                  </Button>
                </div>
              </div>

              {/* Turn cards */}
              <div className={`space-y-2 overflow-y-auto ${state.expanded ? 'max-h-none' : 'max-h-[520px]'}`}>
                {turns.map((t, i) => {
                  const tc = t.currentTurnCount ?? i + 1;
                  const pivotReasons = pivotalMap.get(tc);
                  const isPivotal = !!pivotReasons?.length;
                  const log = t.attackOutcome?.battleLog ?? '';
                  const skill = formatSkill(t.attackConfig?.attackId ?? '');
                  const units: any[] = t.attackOutcome?.outcomeUnits ?? [];
                  const actorSide = t.turn?.side ?? 1;
                  const actorSlot = t.turn?.slot ?? 0;
                  const actorName = getHeroName(t.beforeDeckStates, actorSide, actorSlot);

                  return (
                    <div
                      key={i}
                      className={`rounded-md border p-3 text-xs space-y-2 ${isPivotal ? 'border-amber-500/50 bg-amber-500/5' : 'border-border/30 bg-muted/5'}`}
                      data-testid={`turn-card-${tc}`}
                    >
                      {/* Turn header */}
                      <div className="flex items-start gap-2 flex-wrap">
                        <span className="text-[10px] font-mono text-muted-foreground/60 shrink-0">Turn {tc}</span>
                        {isPivotal && (
                          <div className="flex items-center gap-1 flex-wrap">
                            <Badge variant="outline" className="text-[9px] px-1 py-0 border-amber-500/60 text-amber-400">Pivotal</Badge>
                            {pivotReasons!.map(r => (
                              <Badge key={r} variant="outline" className="text-[9px] px-1 py-0 border-amber-500/30 text-amber-400/70">{r}</Badge>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Battle log description */}
                      {log && (
                        <p className="text-[11px] text-foreground/80 leading-snug">{log}</p>
                      )}

                      {/* Outcome units */}
                      {units.map((unit, ui) => {
                        const unitName = getHeroName(t.beforeDeckStates, unit.side, unit.slot);
                        const isPlayerSide = unit.side === actorSide;
                        const physDmg = unit.damage?.physicalDamage || 0;
                        const magDmg = unit.damage?.magicalDamage || 0;
                        const barrierDmg = unit.damage?.barrierDamage || 0;
                        const fxIds = (unit.trackers ?? []).map((tr: any) =>
                          (tr.trackerConfig?.trackerId ?? '').replace(/-passive-tracker$/, '').replace(/-tracker$/, '').replace(/-/g, ' ')
                        ).filter(Boolean);
                        const reactions = (unit.reactionLogs ?? []).filter((r: string) => r?.trim());
                        if (!physDmg && !magDmg && !barrierDmg && !fxIds.length && !reactions.length) return null;
                        return (
                          <div key={ui} className="space-y-1 pl-2 border-l border-border/30">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${isPlayerSide ? 'border-green-500/40 text-green-400/80' : 'border-red-500/40 text-red-400/80'}`}>
                                {isPlayerSide ? 'Player' : 'Enemy'}
                              </Badge>
                              {unitName && (
                                <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-border/40 text-muted-foreground">
                                  P{Number(unit.slot) + 1}: {unitName}
                                </Badge>
                              )}
                              {physDmg > 0 && (
                                <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-red-500/40 text-red-400">PHYSICAL DMG: {physDmg}</Badge>
                              )}
                              {magDmg > 0 && (
                                <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-purple-500/40 text-purple-400">MAGICAL DMG: {magDmg}</Badge>
                              )}
                              {barrierDmg > 0 && (
                                <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-blue-500/40 text-blue-400">BARRIER: {barrierDmg}</Badge>
                              )}
                              {fxIds.map((fx: string, fi: number) => (
                                <Badge key={fi} variant="outline" className="text-[9px] px-1.5 py-0 border-yellow-500/40 text-yellow-400 capitalize">FX: {fx}</Badge>
                              ))}
                            </div>
                            {reactions.length > 0 && (
                              <div className="text-[10px] text-muted-foreground/60 space-y-0.5">
                                {reactions.map((r: string, ri: number) => (
                                  <p key={ri}>{ri + 1}. {r}</p>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
      </CardContent>
    </Card>
  );
}

// ─── Firebase Probe Panel ─────────────────────────────────────────────────────

interface ProbeState {
  sampleIds: string[] | null;
  sampleLoading: boolean;
  sampleError?: string;
  indexedCount: number | null;
  indexSample: string[] | null;
  reindexLoading: boolean;
  reindexResult: string | null;
  probeTournamentId: string;
  probeBoutNum: string;
  directResult: { rawDocCount: number; fieldKeys: string[]; firstDoc: Record<string, unknown> | null; triedId?: string } | null;
  directLoading: boolean;
  directError?: string;
  open: boolean;
}

function FirebaseProbePanel() {
  const [state, setState] = useState<ProbeState>({
    sampleIds: null, sampleLoading: false,
    indexedCount: null, indexSample: null,
    reindexLoading: false, reindexResult: null,
    probeTournamentId: '', probeBoutNum: '',
    directResult: null, directLoading: false,
    open: false,
  });

  const loadSamples = async () => {
    setState(s => ({ ...s, sampleLoading: true, sampleError: undefined }));
    try {
      const res = await fetch('/api/admin/firebase/battle-log-probe');
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setState(s => ({
        ...s,
        sampleIds: data.sampleIds ?? [],
        sampleLoading: false,
        indexedCount: data.indexedCount ?? null,
        indexSample: data.indexSample ?? null,
      }));
    } catch (err: any) {
      setState(s => ({ ...s, sampleLoading: false, sampleError: err.message }));
    }
  };

  const reindex = async () => {
    setState(s => ({ ...s, reindexLoading: true, reindexResult: null }));
    try {
      const res = await fetch('/api/admin/firebase/reindex-battles', { method: 'POST' });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setState(s => ({
        ...s,
        reindexLoading: false,
        reindexResult: `Indexed ${data.indexed} tournaments`,
        indexedCount: data.indexed,
        indexSample: data.sample ?? null,
      }));
    } catch (err: any) {
      setState(s => ({ ...s, reindexLoading: false, reindexResult: `Error: ${err.message}` }));
    }
  };

  const probeId = async () => {
    if (!state.probeTournamentId.trim() || !state.probeBoutNum.trim()) return;
    const composedId = `1088-${state.probeBoutNum.trim()}-tournament-${state.probeTournamentId.trim()}`;
    setState(s => ({ ...s, directLoading: true, directError: undefined, directResult: null }));
    try {
      const res = await fetch(`/api/admin/firebase/battle-log-probe?battleId=${encodeURIComponent(composedId)}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setState(s => ({ ...s, directLoading: false, directResult: { rawDocCount: data.rawDocCount, fieldKeys: data.fieldKeys ?? [], firstDoc: data.firstDoc, triedId: composedId } }));
    } catch (err: any) {
      setState(s => ({ ...s, directLoading: false, directError: err.message }));
    }
  };

  return (
    <Card className="border-border/40">
      <button
        className="w-full flex items-center gap-2 p-4 text-left hover:bg-muted/10 transition-colors rounded-md"
        onClick={() => setState(s => ({ ...s, open: !s.open }))}
        data-testid="btn-firebase-probe-toggle"
      >
        <FlaskConical className="w-4 h-4 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium text-muted-foreground flex-1">Firebase Battle Log Probe</span>
        <Badge variant="outline" className="text-[9px] text-muted-foreground/60">Admin Dev Tool</Badge>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${state.open ? 'rotate-180' : ''}`} />
      </button>
      {state.open && (
        <CardContent className="pt-0 space-y-4">
          {/* Part 0: Re-index — fetch all Firebase battle IDs and build tournament→ID map */}
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground font-medium">Re-index Firebase battle IDs (builds in-memory tournament→firebaseId map)</p>
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                size="sm"
                variant="outline"
                onClick={reindex}
                disabled={state.reindexLoading}
                data-testid="btn-reindex-battles"
              >
                {state.reindexLoading
                  ? <><RefreshCw className="w-3 h-3 mr-1.5 animate-spin" />Indexing…</>
                  : <><Database className="w-3 h-3 mr-1.5" />Re-index All Battles</>
                }
              </Button>
              {state.reindexResult && (
                <span className={`text-xs ${state.reindexResult.startsWith('Error') ? 'text-destructive' : 'text-green-400'}`}>
                  {state.reindexResult}
                </span>
              )}
            </div>
            {state.indexedCount !== null && (
              <div className="rounded-md border border-border/40 bg-muted/10 p-2.5">
                <p className="text-[10px] text-muted-foreground/60 mb-1.5">{state.indexedCount} tournament(s) indexed. Sample mappings:</p>
                <div className="space-y-0.5">
                  {(state.indexSample ?? []).map(entry => (
                    <p key={entry} className="text-[10px] font-mono text-foreground/70">{entry}</p>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Part 1: List sample IDs from Firebase to discover the ID format */}
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground font-medium">List sample battle IDs from Firestore (reveals the format DFK uses)</p>
            <Button
              size="sm"
              variant="outline"
              onClick={loadSamples}
              disabled={state.sampleLoading}
              data-testid="btn-probe-list-samples"
            >
              {state.sampleLoading
                ? <><RefreshCw className="w-3 h-3 mr-1.5 animate-spin" />Loading…</>
                : <><Search className="w-3 h-3 mr-1.5" />List Sample IDs</>
              }
            </Button>
            {state.sampleError && <p className="text-xs text-destructive">{state.sampleError}</p>}
            {state.sampleIds !== null && (
              <div className="rounded-md border border-border/40 bg-muted/10 p-2.5">
                {state.sampleIds.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No documents found in battles collection.</p>
                ) : (
                  <>
                    <p className="text-[10px] text-muted-foreground/60 mb-1.5">{state.sampleIds.length} sample ID(s) found:</p>
                    <div className="space-y-0.5">
                      {state.sampleIds.map(id => (
                        <button
                          key={id}
                          className="block text-xs font-mono text-foreground/80 hover:text-foreground transition-colors text-left w-full hover:bg-muted/30 px-1 rounded"
                          onClick={() => setState(s => ({ ...s, directId: id }))}
                          data-testid={`probe-sample-id-${id}`}
                        >
                          {id}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Part 2: Probe by tournament ID + bout number */}
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground font-medium">Probe by tournament ID + bout number</p>
            <p className="text-[10px] text-muted-foreground/50">Composes: <span className="font-mono">1088-&#123;bout&#125;-tournament-&#123;id&#125;</span></p>
            <div className="flex gap-2 flex-wrap">
              <input
                className="w-28 text-xs bg-muted/20 border border-border/50 rounded-md px-2.5 py-1.5 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="Tournament ID"
                type="number"
                min="1"
                value={state.probeTournamentId}
                onChange={e => setState(s => ({ ...s, probeTournamentId: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && probeId()}
                data-testid="input-probe-tournament-id"
              />
              <input
                className="w-20 text-xs bg-muted/20 border border-border/50 rounded-md px-2.5 py-1.5 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="Bout #"
                type="number"
                min="1"
                max="50"
                value={state.probeBoutNum}
                onChange={e => setState(s => ({ ...s, probeBoutNum: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && probeId()}
                data-testid="input-probe-bout-num"
              />
              <Button size="sm" variant="outline" onClick={probeId} disabled={state.directLoading || !state.probeTournamentId.trim() || !state.probeBoutNum.trim()} data-testid="btn-probe-direct">
                {state.directLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <FlaskConical className="w-3 h-3" />}
              </Button>
            </div>
            {state.directError && <p className="text-xs text-destructive">{state.directError}</p>}
            {state.directResult && (
              <div className="rounded-md border border-border/40 bg-muted/10 p-2.5 space-y-1.5">
                {state.directResult.triedId && (
                  <p className="text-[10px] text-muted-foreground/60">
                    Tried: <span className="font-mono text-foreground/70">{state.directResult.triedId}</span>
                  </p>
                )}
                <p className="text-xs">
                  <span className="text-muted-foreground">Docs found: </span>
                  <span className={state.directResult.rawDocCount > 0 ? 'text-green-400 font-medium' : 'text-muted-foreground'}>{state.directResult.rawDocCount}</span>
                </p>
                {state.directResult.fieldKeys.length > 0 && (
                  <div>
                    <p className="text-[10px] text-muted-foreground/60 mb-1">Field keys in first doc:</p>
                    <div className="flex flex-wrap gap-1">
                      {state.directResult.fieldKeys.map(k => (
                        <span key={k} className="text-[10px] px-1.5 py-0.5 rounded bg-muted/30 text-foreground/70 font-mono">{k}</span>
                      ))}
                    </div>
                  </div>
                )}
                {state.directResult.firstDoc && (
                  <details className="text-[10px] text-muted-foreground/60">
                    <summary className="cursor-pointer hover:text-muted-foreground">First doc raw values</summary>
                    <pre className="mt-1 overflow-auto max-h-32 text-[9px] leading-relaxed">
                      {JSON.stringify(state.directResult.firstDoc, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
