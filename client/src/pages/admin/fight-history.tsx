import { useState } from 'react';
import { useLocation } from 'wouter';
import { History, ArrowLeft, Trophy, ChevronLeft, ChevronRight, Search, Filter, Users, Swords } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { HeroDetailModal } from '@/components/dfk/HeroDetailModal';
import type { HeroDetail, MatchContext } from '@/components/dfk/HeroDetailModal';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Bout {
  id: number;
  tournament_id: string;
  tournament_name: string | null;
  round_number: number;
  match_index: number;
  player_a: string | null;
  player_a_name: string | null;
  player_b: string | null;
  player_b_name: string | null;
  winner_address: string | null;
  is_complete: boolean;
  tournament_format: string | null;
  captured_at: number | null;
}

interface BoutHero {
  id: number;
  bout_id: number;
  player_address: string;
  side: 'a' | 'b';
  is_winner_side: boolean;
  hero_id: string;
  normalized_hero_id: string | null;
  main_class: string | null;
  sub_class: string | null;
  level: number | null;
  rarity: number | null;
  strength: number | null; dexterity: number | null; agility: number | null; intelligence: number | null;
  wisdom: number | null; vitality: number | null; endurance: number | null; luck: number | null;
  hp: number | null; mp: number | null;
  active1: string | null; active2: string | null;
  passive1: string | null; passive2: string | null;
  opponent_leadership_count: number;
  opponent_menacing_count: number;
  effective_dps_mult: string;
  weapon1_json: any; weapon2_json: any;
  armor_json: any; accessory_json: any;
  offhand1_json: any; pet_json: any;
  captured_at: number | null;
}

interface BoutsResponse {
  ok: boolean;
  bouts: Bout[];
  total: number;
  page: number;
  limit: number;
}

interface BoutDetailResponse {
  ok: boolean;
  bout: Bout;
  heroes: BoutHero[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const RARITY_COLORS: Record<number, string> = {
  0: 'text-muted-foreground', 1: 'text-green-400', 2: 'text-blue-400',
  3: 'text-purple-400', 4: 'text-amber-400',
};
const RARITY_NAMES: Record<number, string> = {
  0: 'Common', 1: 'Uncommon', 2: 'Rare', 3: 'Legendary', 4: 'Mythic',
};
const ROUND_NAMES: Record<number, string> = {
  1: 'Round of 8', 2: 'Semifinal', 3: 'Final',
};
const ROUND_LABELS: Record<string, string> = {
  '1': 'Round of 8', '2': 'Semifinal', '3': 'Final',
};

function shortAddr(addr: string | null | undefined): string {
  if (!addr) return '?';
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function displayName(addr: string | null | undefined, name: string | null | undefined): string {
  if (name) return name;
  if (!addr) return 'TBD';
  return shortAddr(addr);
}

function formatDate(ts: number | null | undefined): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// Convert BoutHero DB row → HeroDetail for the modal
function boutHeroToHeroDetail(h: BoutHero): HeroDetail {
  return {
    id: h.hero_id,
    normalizedId: h.normalized_hero_id ?? h.hero_id,
    mainClassStr: h.main_class ?? '?',
    subClassStr: h.sub_class ?? '',
    level: h.level ?? 1,
    rarity: h.rarity ?? 0,
    element: 0,
    strength: h.strength ?? 0,
    agility: h.agility ?? 0,
    dexterity: h.dexterity ?? 0,
    intelligence: h.intelligence ?? 0,
    wisdom: h.wisdom ?? 0,
    vitality: h.vitality ?? 0,
    endurance: h.endurance ?? 0,
    luck: h.luck ?? 0,
    hp: h.hp ?? 0,
    mp: h.mp ?? 0,
    active1: Number(h.active1 ?? 0),
    active2: Number(h.active2 ?? 0),
    passive1: Number(h.passive1 ?? 0),
    passive2: Number(h.passive2 ?? 0),
    pjStatus: null,
    pjLevel: null,
    pet: h.pet_json ?? null,
    weapon1: h.weapon1_json ?? null,
    weapon2: h.weapon2_json ?? null,
    offhand1: h.offhand1_json ?? null,
    offhand2: null,
    armor: h.armor_json ?? null,
    accessory: h.accessory_json ?? null,
  };
}

function boutHeroToMatchContext(h: BoutHero, allHeroes: BoutHero[]): MatchContext {
  // Own team Leadership count
  const ownSideHeroes = allHeroes.filter(x => x.side === h.side);
  let ownLeadershipCount = 0;
  for (const oh of ownSideHeroes) {
    if (oh.passive1 === '9' || oh.passive2 === '9') ownLeadershipCount++;
  }
  return {
    opponentLeadershipCount: h.opponent_leadership_count,
    opponentMenacingCount: h.opponent_menacing_count,
    ownLeadershipCount,
  };
}

// ─── Bout List ────────────────────────────────────────────────────────────────

function BoutRow({ bout, onClick }: { bout: Bout; onClick: () => void }) {
  const nameA = displayName(bout.player_a, bout.player_a_name);
  const nameB = displayName(bout.player_b, bout.player_b_name);
  const winnerIsA = bout.winner_address?.toLowerCase() === bout.player_a?.toLowerCase();
  const winnerIsB = bout.winner_address?.toLowerCase() === bout.player_b?.toLowerCase();

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 border-b border-border/40 last:border-0 hover-elevate cursor-pointer"
      onClick={onClick}
      data-testid={`row-bout-${bout.id}`}
    >
      <div className="w-24 shrink-0">
        <Badge variant="outline" className="text-xs">
          {ROUND_NAMES[bout.round_number] ?? `Rd ${bout.round_number}`}
        </Badge>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap text-sm">
          <span className={`font-medium truncate ${winnerIsA ? 'text-green-400' : ''}`}>
            {winnerIsA && <Trophy className="w-3 h-3 inline mr-1 text-yellow-400" />}
            {nameA}
          </span>
          <span className="text-muted-foreground text-xs">vs</span>
          <span className={`font-medium truncate ${winnerIsB ? 'text-green-400' : ''}`}>
            {winnerIsB && <Trophy className="w-3 h-3 inline mr-1 text-yellow-400" />}
            {nameB}
          </span>
        </div>
        {bout.tournament_name && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">{bout.tournament_name}</p>
        )}
      </div>
      <div className="shrink-0 text-right hidden sm:block">
        {bout.tournament_format && (
          <Badge variant="secondary" className="text-xs mr-1">{bout.tournament_format}</Badge>
        )}
        {!bout.is_complete && (
          <Badge variant="outline" className="text-xs text-muted-foreground">TBD</Badge>
        )}
      </div>
      <div className="text-xs text-muted-foreground shrink-0 hidden md:block w-36 text-right">
        {formatDate(bout.captured_at)}
      </div>
    </div>
  );
}

// ─── Hero button for bout detail ──────────────────────────────────────────────

function HeroButton({
  hero,
  isWinner,
  onOpen,
}: {
  hero: BoutHero;
  isWinner: boolean;
  onOpen: () => void;
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onOpen}
      className={`flex items-center gap-1.5 ${isWinner ? 'border-green-500/40 bg-green-500/5' : ''}`}
      data-testid={`btn-hero-${hero.hero_id}`}
    >
      <span className={`font-medium text-xs ${RARITY_COLORS[hero.rarity ?? 0]}`}>
        {hero.main_class ?? '?'}
      </span>
      <span className="text-muted-foreground text-xs">Lv{hero.level ?? '?'}</span>
      <span className="text-muted-foreground text-xs font-mono">#{hero.normalized_hero_id ?? hero.hero_id}</span>
    </Button>
  );
}

// ─── Bout Detail View ─────────────────────────────────────────────────────────

function BoutDetailView({ boutId, onBack }: { boutId: number; onBack: () => void }) {
  const [selectedHero, setSelectedHero] = useState<{ hero: HeroDetail; context: MatchContext } | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['/api/admin/bouts', boutId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/bouts/${boutId}`);
      if (!res.ok) throw new Error(`Failed to load bout: ${res.status}`);
      return res.json() as Promise<BoutDetailResponse>;
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="h-48 bg-muted animate-pulse rounded-md" />
      </div>
    );
  }

  if (error || !data?.ok) {
    return (
      <div className="text-center py-8">
        <p className="text-destructive font-medium">Failed to load bout detail</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={onBack}>Back</Button>
      </div>
    );
  }

  const { bout, heroes } = data;
  const heroesA = heroes.filter(h => h.side === 'a');
  const heroesB = heroes.filter(h => h.side === 'b');
  const nameA = displayName(bout.player_a, bout.player_a_name);
  const nameB = displayName(bout.player_b, bout.player_b_name);
  const winnerIsA = bout.winner_address?.toLowerCase() === bout.player_a?.toLowerCase();
  const winnerIsB = bout.winner_address?.toLowerCase() === bout.player_b?.toLowerCase();

  // Cross-team context summary — take from first hero on each side
  const ctxA = heroesA[0];
  const ctxB = heroesB[0];

  function getEffectiveMult(h: BoutHero, all: BoutHero[]): number {
    const ownSide = all.filter(x => x.side === h.side);
    let ownLead = 0;
    for (const oh of ownSide) {
      if (oh.passive1 === '9' || oh.passive2 === '9') ownLead++;
    }
    const leadMult = 1 + Math.min(ownLead * 0.05, 0.15);
    const menaceMult = 1 - Math.min(h.opponent_menacing_count * 0.05, 0.15);
    return leadMult * menaceMult;
  }

  const multA = ctxA ? getEffectiveMult(ctxA, heroes) : 1;
  const multB = ctxB ? getEffectiveMult(ctxB, heroes) : 1;

  return (
    <>
      {selectedHero && (
        <HeroDetailModal
          hero={selectedHero.hero}
          matchContext={selectedHero.context}
          onClose={() => setSelectedHero(null)}
        />
      )}

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-4">
        <Button variant="ghost" size="sm" onClick={onBack} data-testid="button-back-to-list">
          <ArrowLeft className="w-4 h-4 mr-1.5" /> Fight History
        </Button>
        <span className="text-muted-foreground text-xs">/</span>
        <span className="text-xs text-muted-foreground">
          Bout #{boutId} — {ROUND_NAMES[bout.round_number] ?? `Round ${bout.round_number}`}
        </span>
      </div>

      {/* Header */}
      <Card className="mb-4">
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">
                {bout.tournament_name ?? `Tournament ${bout.tournament_id}`}
                {bout.tournament_format && <span className="ml-2">{bout.tournament_format}</span>}
              </p>
              <div className="flex items-center gap-3 flex-wrap">
                <span className={`text-sm font-semibold ${winnerIsA ? 'text-green-400' : ''}`}>
                  {winnerIsA && <Trophy className="w-3.5 h-3.5 inline mr-1 text-yellow-400" />}
                  {nameA}
                </span>
                <span className="text-muted-foreground text-sm">vs</span>
                <span className={`text-sm font-semibold ${winnerIsB ? 'text-green-400' : ''}`}>
                  {winnerIsB && <Trophy className="w-3.5 h-3.5 inline mr-1 text-yellow-400" />}
                  {nameB}
                </span>
              </div>
            </div>
            <div className="text-right">
              <Badge variant="outline" className="text-xs">
                {ROUND_NAMES[bout.round_number] ?? `Rd ${bout.round_number}`}
              </Badge>
              {bout.captured_at && (
                <p className="text-xs text-muted-foreground mt-1">{formatDate(bout.captured_at)}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cross-team context banners */}
      {(ctxA || ctxB) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          {[
            { label: nameA, ctx: ctxA, mult: multA, side: 'a' as const, isWinner: winnerIsA },
            { label: nameB, ctx: ctxB, mult: multB, side: 'b' as const, isWinner: winnerIsB },
          ].map(({ label, ctx, mult, isWinner }) => (
            <div key={label} className={`rounded-md px-3 py-2.5 text-xs border ${
              isWinner
                ? 'bg-green-500/5 border-green-500/20'
                : 'bg-muted/20 border-border/40'
            }`}>
              <div className="flex items-center justify-between mb-1.5">
                <p className="font-semibold text-sm">
                  {isWinner && <Trophy className="w-3 h-3 inline mr-1 text-yellow-400" />}
                  {label}
                </p>
                <span className={`font-mono font-semibold ${mult >= 1 ? 'text-green-400' : 'text-red-400'}`}>
                  ×{mult.toFixed(4)} DPS
                </span>
              </div>
              {ctx && (
                <div className="space-y-0.5 text-muted-foreground">
                  {ctx.opponent_menacing_count > 0 && (
                    <p>Opp. <span className="text-red-400 font-medium">{ctx.opponent_menacing_count}× Menacing</span> (−{Math.min(ctx.opponent_menacing_count * 5, 15)}% DPS)</p>
                  )}
                  {(() => {
                    const ownSide = heroes.filter(h => h.side === ctx.side);
                    let ownLead = 0;
                    for (const oh of ownSide) if (oh.passive1 === '9' || oh.passive2 === '9') ownLead++;
                    return ownLead > 0 ? (
                      <p>Own <span className="text-green-400 font-medium">{ownLead}× Leadership</span> (+{Math.min(ownLead * 5, 15)}% DPS)</p>
                    ) : null;
                  })()}
                  {ctx.opponent_menacing_count === 0 && (() => {
                    const ownSide = heroes.filter(h => h.side === ctx.side);
                    let ownLead = 0;
                    for (const oh of ownSide) if (oh.passive1 === '9' || oh.passive2 === '9') ownLead++;
                    return ownLead === 0 ? <p className="text-muted-foreground/60 italic">No passive context modifiers</p> : null;
                  })()}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Hero teams side by side */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[
          { label: nameA, heroes: heroesA, isWinner: winnerIsA },
          { label: nameB, heroes: heroesB, isWinner: winnerIsB },
        ].map(({ label, heroes: sideHeroes, isWinner }) => (
          <div key={label}>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
              {isWinner && <Trophy className="w-3 h-3 text-yellow-400" />}
              {label}
            </p>
            {sideHeroes.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {sideHeroes.map(h => (
                  <HeroButton
                    key={h.id}
                    hero={h}
                    isWinner={h.is_winner_side}
                    onOpen={() => {
                      const heroDetail = boutHeroToHeroDetail(h);
                      const ctx = boutHeroToMatchContext(h, heroes);
                      setSelectedHero({ hero: heroDetail, context: ctx });
                    }}
                  />
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">No hero data recorded</p>
            )}
          </div>
        ))}
      </div>

      {heroes.length === 0 && (
        <div className="text-center py-8 text-muted-foreground text-sm mt-4">
          <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p>Hero snapshot data not yet available for this bout.</p>
          <p className="text-xs mt-1">Hero data is captured when a bracket is indexed.</p>
        </div>
      )}
    </>
  );
}

// ─── Main Fight History Page ──────────────────────────────────────────────────

export default function FightHistoryPage() {
  const [, navigate] = useLocation();
  const [selectedBoutId, setSelectedBoutId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [searchPlayer, setSearchPlayer] = useState('');
  const [filterRound, setFilterRound] = useState<string>('all');
  const [filterTournament, setFilterTournament] = useState('');

  // Applied search state (separate so search only fires on submit/enter)
  const [appliedPlayer, setAppliedPlayer] = useState('');
  const [appliedTournament, setAppliedTournament] = useState('');

  const limit = 50;

  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('limit', String(limit));
  if (appliedPlayer)     params.set('player', appliedPlayer);
  if (filterRound !== 'all') params.set('round', filterRound);
  if (appliedTournament) params.set('tournament_id', appliedTournament);

  const { data, isLoading } = useQuery({
    queryKey: ['/api/admin/bouts', page, appliedPlayer, filterRound, appliedTournament],
    queryFn: async () => {
      const res = await fetch(`/api/admin/bouts?${params}`);
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      return res.json() as Promise<BoutsResponse>;
    },
  });

  function applySearch() {
    setAppliedPlayer(searchPlayer);
    setAppliedTournament(filterTournament);
    setPage(1);
  }

  function clearSearch() {
    setSearchPlayer('');
    setFilterTournament('');
    setAppliedPlayer('');
    setAppliedTournament('');
    setFilterRound('all');
    setPage(1);
  }

  const totalPages = data ? Math.ceil(data.total / limit) : 1;

  if (selectedBoutId !== null) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <BoutDetailView boutId={selectedBoutId} onBack={() => setSelectedBoutId(null)} />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5" data-testid="page-fight-history">
      {/* Header */}
      <div className="flex items-center gap-3">
        <History className="w-5 h-5 text-muted-foreground" />
        <div>
          <h1 className="text-lg font-semibold">Fight History</h1>
          <p className="text-xs text-muted-foreground">
            Historical archive of all tournament bouts with full hero snapshots
          </p>
        </div>
        {data && (
          <Badge variant="secondary" className="ml-auto text-xs">
            {data.total.toLocaleString()} bouts
          </Badge>
        )}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-48">
              <label className="text-xs text-muted-foreground mb-1 block">Player address</label>
              <Input
                placeholder="0x... or partial address"
                value={searchPlayer}
                onChange={e => setSearchPlayer(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && applySearch()}
                className="h-8 text-xs"
                data-testid="input-player-search"
              />
            </div>
            <div className="min-w-36">
              <label className="text-xs text-muted-foreground mb-1 block">Tournament ID</label>
              <Input
                placeholder="e.g. 12345"
                value={filterTournament}
                onChange={e => setFilterTournament(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && applySearch()}
                className="h-8 text-xs"
                data-testid="input-tournament-search"
              />
            </div>
            <div className="min-w-36">
              <label className="text-xs text-muted-foreground mb-1 block">Round</label>
              <Select value={filterRound} onValueChange={v => { setFilterRound(v); setPage(1); }}>
                <SelectTrigger className="h-8 text-xs" data-testid="select-round">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All rounds</SelectItem>
                  <SelectItem value="1">Round of 8</SelectItem>
                  <SelectItem value="2">Semifinal</SelectItem>
                  <SelectItem value="3">Final</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" onClick={applySearch} data-testid="button-search">
              <Search className="w-3.5 h-3.5 mr-1.5" /> Search
            </Button>
            {(appliedPlayer || appliedTournament || filterRound !== 'all') && (
              <Button size="sm" variant="ghost" onClick={clearSearch} data-testid="button-clear">
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        {/* Table header */}
        <div className="flex items-center gap-3 px-4 py-2 border-b border-border/40 text-xs font-medium text-muted-foreground uppercase tracking-wide">
          <div className="w-24 shrink-0">Round</div>
          <div className="flex-1">Match</div>
          <div className="shrink-0 hidden sm:block w-28 text-right">Format</div>
          <div className="shrink-0 hidden md:block w-36 text-right">Date</div>
        </div>

        {isLoading ? (
          <div className="space-y-px py-2">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="h-12 mx-4 bg-muted/30 animate-pulse rounded mb-1" />
            ))}
          </div>
        ) : !data?.bouts?.length ? (
          <div className="text-center py-12" data-testid="section-empty">
            <Swords className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="font-medium text-muted-foreground">No fights recorded yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Fight data is indexed automatically when tournament brackets are captured.
            </p>
            {(appliedPlayer || appliedTournament || filterRound !== 'all') && (
              <Button variant="ghost" size="sm" className="mt-3" onClick={clearSearch}>Clear filters</Button>
            )}
          </div>
        ) : (
          <div data-testid="section-bouts-list">
            {data.bouts.map(bout => (
              <BoutRow
                key={bout.id}
                bout={bout}
                onClick={() => setSelectedBoutId(bout.id)}
              />
            ))}
          </div>
        )}
      </Card>

      {/* Pagination */}
      {data && data.total > limit && (
        <div className="flex items-center justify-between" data-testid="section-pagination">
          <p className="text-xs text-muted-foreground">
            Page {page} of {totalPages} — {data.total.toLocaleString()} total fights
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              data-testid="button-prev-page"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= totalPages}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              data-testid="button-next-page"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
