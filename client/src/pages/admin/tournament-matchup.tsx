import { useState, useEffect, useRef } from 'react';
import { useLocation, useParams } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft, Zap, Users, Shield, Trophy, ChevronDown, Star, RefreshCw, Activity, AlertTriangle,
  ScrollText, FlaskConical, Search, Database,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { HeroDetailModal } from '@/components/dfk/HeroDetailModal';
import type { HeroDetail } from '@/components/dfk/HeroDetailModal';

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
  factors: {
    init: number; dps: number; surv: number;
    passiveDps: number; comp: number; experience: number;
  };
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

// ─── Hero Card ────────────────────────────────────────────────────────────────

function HeroCard({ hero, onViewStats }: { hero: HeroDetail; onViewStats: () => void }) {
  const [open, setOpen] = useState(false);
  const rarityColor = RARITY_COLORS[hero.rarity] ?? 'text-muted-foreground';

  const hasLeadership = hero.passive1 === 9 || hero.passive2 === 9;
  const hasMenacing  = hero.passive1 === 11 || hero.passive2 === 11;

  return (
    <div className="border border-border/50 rounded-md overflow-hidden">
      <button
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setOpen(v => !v)}
        data-testid={`hero-toggle-${hero.id}`}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`text-sm font-semibold ${rarityColor}`}>{hero.mainClassStr}</span>
            <span className="text-xs text-muted-foreground">Lv{hero.level}</span>
            {hasLeadership && (
              <span className="text-[9px] px-1 rounded bg-amber-500/20 text-amber-400 font-medium">Lead</span>
            )}
            {hasMenacing && (
              <span className="text-[9px] px-1 rounded bg-red-500/20 text-red-400 font-medium">Menacing</span>
            )}
          </div>
          <div className="flex gap-2 text-[10px] text-muted-foreground mt-0.5">
            <span>AGI {hero.agility}</span>
            <span>STR {hero.strength}</span>
            <span>VIT {hero.vitality}</span>
          </div>
        </div>
        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="border-t border-border/40 px-3 py-2.5 space-y-2.5 bg-muted/10">
          <div className="grid grid-cols-4 gap-1 text-xs">
            {[
              ['STR', hero.strength], ['DEX', hero.dexterity], ['AGI', hero.agility], ['INT', hero.intelligence],
              ['WIS', hero.wisdom],   ['VIT', hero.vitality],  ['END', hero.endurance], ['LCK', hero.luck],
            ].map(([label, val]) => (
              <div key={label as string} className="flex flex-col items-center rounded-md bg-muted/30 py-1">
                <span className="text-[9px] text-muted-foreground uppercase tracking-wide">{label}</span>
                <span className="font-semibold text-xs">{val}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-3 text-xs text-muted-foreground">
            <span>HP {hero.hp}</span>
            <span>MP {hero.mp}</span>
          </div>
          {(hero.activeSkill1 || hero.activeSkill2 || hero.passiveSkill1 || hero.passiveSkill2) && (
            <div className="text-xs space-y-0.5 text-muted-foreground">
              {hero.activeSkill1 && <div><span className="text-foreground/70">Active:</span> {hero.activeSkill1}{hero.activeSkill2 ? `, ${hero.activeSkill2}` : ''}</div>}
              {(hero.passiveSkill1 || hero.passiveSkill2) && (
                <div><span className="text-foreground/70">Passive:</span> {[hero.passiveSkill1, hero.passiveSkill2].filter(Boolean).join(', ')}</div>
              )}
            </div>
          )}
          <Button variant="ghost" size="sm" className="w-full text-xs" onClick={onViewStats} data-testid={`btn-view-stats-${hero.id}`}>
            View Full Stats
          </Button>
        </div>
      )}
    </div>
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

function AiPredictionSection({ tournamentId, slotA, slotB, hasBothPlayers }: {
  tournamentId: string; slotA: number; slotB: number; hasBothPlayers: boolean;
}) {
  const [result, setResult] = useState<(AiMatchupResult & { loading?: boolean; error?: string }) | null>(null);

  const run = async () => {
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
    } catch (err: any) {
      setResult({ loading: false, error: err.message } as any);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-sm flex items-center gap-2">
            <Zap className="w-4 h-4 text-yellow-400" />
            AI Win Prediction
          </CardTitle>
          <Button size="sm" onClick={run} disabled={result?.loading || !hasBothPlayers} data-testid="btn-run-prediction">
            <Zap className="w-3.5 h-3.5 mr-1.5" />
            {result?.loading ? 'Analyzing…' : result && !result.error ? 'Re-run' : 'Run Prediction'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!hasBothPlayers && !result && (
          <p className="text-sm text-muted-foreground">Both players must have hero data loaded to run a prediction.</p>
        )}
        {result?.error && <p className="text-sm text-destructive">{result.error}</p>}
        {result && !result.loading && !result.error && (
          <>
            <div className="space-y-1.5">
              <div className="flex justify-between text-sm font-semibold">
                <span className="text-green-400">{result.nameA} — {result.winPctA}%</span>
                <span className="text-red-400">{result.winPctB}% — {result.nameB}</span>
              </div>
              <div className="h-4 rounded-full overflow-hidden flex bg-muted">
                <div className="h-full bg-green-500 transition-all duration-700" style={{ width: `${result.winPctA}%` }} />
                <div className="h-full bg-red-500 transition-all duration-700" style={{ width: `${result.winPctB}%` }} />
              </div>
            </div>
            {result.factors && (
              <div className="rounded-md bg-muted/20 p-3 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Factor Breakdown</p>
                {([
                  { label: 'Initiative',    key: 'init',       weight: 25 },
                  { label: 'Effective DPS', key: 'dps',        weight: 30 },
                  { label: 'Survivability', key: 'surv',       weight: 20 },
                  { label: 'Passive DPS',   key: 'passiveDps', weight: 10 },
                  { label: 'Team Comp',     key: 'comp',       weight: 10 },
                  { label: 'Experience',    key: 'experience', weight:  5 },
                ] as { label: string; key: keyof typeof result.factors; weight: number }[]).map(({ label, key, weight }) => {
                  const aVal = result.factors![key];
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
                  <span>{result.nameA}</span><span>{result.nameB}</span>
                </div>
              </div>
            )}
            {result.narrative && (
              <div className="rounded-md border border-blue-500/20 bg-blue-500/5 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-400 mb-1.5 flex items-center gap-1.5">
                  <Star className="w-3 h-3" /> Strategic Assessment
                </p>
                <p className="text-sm text-muted-foreground leading-relaxed">{result.narrative}</p>
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
}: {
  tournamentId: string;
  boutId: number;
  isLive: boolean;
  battleBudget?: number | null;
  onLogLoaded?: (hasData: boolean) => void;
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

  // Live auto-refresh every 15s when open and live
  useEffect(() => {
    if (isLive && state.open) {
      intervalRef.current = setInterval(() => fetchLog(true), 15000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isLive, state.open, boutId, tournamentId]);

  const turns = state.data?.turns ?? [];
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
              <p>No turn data found for this bout in Firebase.{isLive && ' Refreshing every 15s…'}</p>
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
            <div className="space-y-0.5 max-h-52 overflow-y-auto">
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

function BoutCard({ bout, tournamentId, nameA, nameB, addrA, addrB, isLiveTournament, battleBudget }: {
  bout: HistoryBout;
  tournamentId: string;
  nameA: string; nameB: string;
  addrA: string; addrB: string;
  isLiveTournament: boolean;
  battleBudget?: number | null;
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
        body: JSON.stringify({ boutId: bout.id, perspective }),
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
              { name: nameA, heroes: bout.heroesA, isWinner: !!winnerIsA },
              { name: nameB, heroes: bout.heroesB, isWinner: !winnerIsA && !!bout.winnerAddress },
            ].map(({ name, heroes, isWinner }) => (
              <div key={name} className="p-3">
                <p className={`text-xs font-semibold mb-2 truncate ${isWinner ? 'text-green-400' : 'text-muted-foreground'}`}>
                  {isWinner && <Trophy className="w-2.5 h-2.5 inline mr-1" />}{name}
                </p>
                {heroes.length > 0 ? (
                  <div className="space-y-1">
                    {heroes.map((h, i) => (
                      <div key={i} className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <span className="font-medium text-foreground/80">{h.main_class}</span>
                        <span>Lv{h.level}</span>
                        <span className="text-[10px]">AGI {h.agility}</span>
                      </div>
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
  const [, navigate] = useLocation();
  const [selectedHero, setSelectedHero] = useState<HeroDetail | null>(null);

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
  });

  const tournament = bracketData?.tournament;
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
    refetchInterval: tournament?.stateLabel === 'in_progress' ? 20000 : false,
  });

  const hasBothPlayers = !!(playerA?.heroes?.length && playerB?.heroes?.length);

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
      {selectedHero && <HeroDetailModal hero={selectedHero} onClose={() => setSelectedHero(null)} />}

      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(`/admin/tournament/bracket/${tournamentId}`)}
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
            <p className="text-xs text-muted-foreground mt-0.5">
              {tournament.name}
              {tournament.stateLabel === 'in_progress' && (
                <span className="ml-2 text-green-400 font-semibold animate-pulse">● Live</span>
              )}
            </p>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} data-testid="button-refresh">
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Section 1: Team Comparison */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="w-4 h-4" />
            Team Comparison
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            {[
              { player: playerA, name: nameA, slot: slotA },
              { player: playerB, name: nameB, slot: slotB },
            ].map(({ player, name, slot }) => (
              <div key={slot}>
                <div className="mb-3">
                  <p className="text-sm font-semibold truncate">{name}</p>
                  {player?.address && (
                    <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{shortAddr(player.address)}</p>
                  )}
                </div>
                <div className="space-y-2">
                  {player?.heroes && player.heroes.length > 0 ? (
                    player.heroes.map(hero => (
                      <HeroCard
                        key={hero.id}
                        hero={hero}
                        onViewStats={() => setSelectedHero(hero)}
                      />
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground py-2">
                      {player ? 'No hero data loaded yet.' : 'Player not registered yet.'}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

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
      />

      {/* Section 4: Fight History */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <CardTitle className="text-sm flex items-center gap-2">
              <Shield className="w-4 h-4" />
              Fight History
              {tournament?.stateLabel === 'in_progress' && (
                <Badge variant="outline" className="text-[9px] text-green-400 border-green-500/40 ml-1">
                  Live — refreshes every 20s
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
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 5: Firebase Battle Log Probe (admin dev tool) */}
      <FirebaseProbePanel />
    </div>
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
  directId: string;
  directResult: { rawDocCount: number; fieldKeys: string[]; firstDoc: Record<string, unknown> | null } | null;
  directLoading: boolean;
  directError?: string;
  open: boolean;
}

function FirebaseProbePanel() {
  const [state, setState] = useState<ProbeState>({
    sampleIds: null, sampleLoading: false,
    indexedCount: null, indexSample: null,
    reindexLoading: false, reindexResult: null,
    directId: '', directResult: null, directLoading: false,
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
    if (!state.directId.trim()) return;
    setState(s => ({ ...s, directLoading: true, directError: undefined, directResult: null }));
    try {
      const res = await fetch(`/api/admin/firebase/battle-log-probe?battleId=${encodeURIComponent(state.directId.trim())}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setState(s => ({ ...s, directLoading: false, directResult: { rawDocCount: data.rawDocCount, fieldKeys: data.fieldKeys ?? [], firstDoc: data.firstDoc } }));
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

          {/* Part 2: Direct probe a specific ID */}
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground font-medium">Probe a specific battle ID to inspect its schema</p>
            <div className="flex gap-2">
              <input
                className="flex-1 text-xs bg-muted/20 border border-border/50 rounded-md px-2.5 py-1.5 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="Enter battle ID…"
                value={state.directId}
                onChange={e => setState(s => ({ ...s, directId: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && probeId()}
                data-testid="input-probe-battle-id"
              />
              <Button size="sm" variant="outline" onClick={probeId} disabled={state.directLoading || !state.directId.trim()} data-testid="btn-probe-direct">
                {state.directLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <FlaskConical className="w-3 h-3" />}
              </Button>
            </div>
            {state.directError && <p className="text-xs text-destructive">{state.directError}</p>}
            {state.directResult && (
              <div className="rounded-md border border-border/40 bg-muted/10 p-2.5 space-y-1.5">
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
