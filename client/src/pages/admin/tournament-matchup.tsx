import { useState } from 'react';
import { useLocation, useParams } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft, Zap, Users, Shield, Trophy, ChevronDown, Star, RefreshCw, Activity,
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
  vitality: number;
  endurance: number;
  passive1: string | null;
  passive2: string | null;
  active1: string | null;
  active2: string | null;
  is_winner_side: boolean;
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

// ─── Fight History Section ─────────────────────────────────────────────────────

function BoutCard({ bout, tournamentId, nameA, nameB, addrA, addrB }: {
  bout: HistoryBout;
  tournamentId: string;
  nameA: string; nameB: string;
  addrA: string; addrB: string;
}) {
  const [open, setOpen] = useState(false);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const winnerIsA = bout.winnerAddress &&
    bout.winnerAddress.toLowerCase() === addrA.toLowerCase();
  const winnerName = winnerIsA ? nameA : (bout.winnerAddress ? nameB : null);

  const runAnalysis = async () => {
    setAnalysisLoading(true);
    setAnalysisError(null);
    try {
      const res = await fetch(`/api/admin/tournament/bracket/${tournamentId}/bout-analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boutId: bout.id }),
      });
      const data = await res.json();
      if (!data.ok && data.error) throw new Error(data.error);
      setAnalysis(data.analysis ?? 'No analysis available.');
    } catch (err: any) {
      setAnalysisError(err.message);
    } finally {
      setAnalysisLoading(false);
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
          {bout.isComplete && (
            <div className="border-t border-border/40 p-3 space-y-2">
              {!analysis && !analysisLoading && (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full text-xs"
                  onClick={runAnalysis}
                  data-testid={`btn-bout-analysis-${bout.id}`}
                >
                  <Zap className="w-3 h-3 mr-1.5" />
                  Get Post-Match Coaching for Losing Team
                </Button>
              )}
              {analysisLoading && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  Generating coaching analysis…
                </div>
              )}
              {analysisError && <p className="text-xs text-destructive">{analysisError}</p>}
              {analysis && (
                <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-400 mb-1.5 flex items-center gap-1.5">
                    <Shield className="w-3 h-3" /> Coaching Advice
                  </p>
                  <p className="text-sm text-muted-foreground leading-relaxed">{analysis}</p>
                </div>
              )}
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

  const { data: histData, isLoading: histLoading } = useQuery<{ ok: boolean; bouts: HistoryBout[] }>({
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
          <CardTitle className="text-sm flex items-center gap-2">
            <Shield className="w-4 h-4" />
            Fight History
            {tournament?.stateLabel === 'in_progress' && (
              <Badge variant="outline" className="text-[9px] text-green-400 border-green-500/40 ml-1">
                Live — refreshes every 20s
              </Badge>
            )}
          </CardTitle>
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
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
