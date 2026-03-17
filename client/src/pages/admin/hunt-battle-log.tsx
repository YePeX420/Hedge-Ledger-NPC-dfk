import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ScrollText,
  Search,
  Loader2,
  RefreshCw,
  Swords,
  Shield,
  Skull,
  Trophy,
  Zap,
  ChevronRight,
  AlertCircle,
  Activity,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { API_BASE_URL } from '@/lib/queryClient';

interface CombatantState {
  name: string;
  hp: number | null;
  maxHp: number | null;
  mp: number | null;
  maxMp: number | null;
  debuffs: { id: string | null; name: string | null; turnsLeft: number | null }[];
  isDead: boolean;
}

interface TurnSummary {
  turnId: string;
  turn: number;
  round: number;
  activeSide: number | null;
  activeSlot: number | null;
  actionType: string | null;
  battleLog: string | null;
  afterHp: Record<string, Record<string, number | null>> | null;
}

interface HuntBattleMeta {
  hasWinner: boolean;
  winnerSide: number | null;
  scenarioId: string | null;
  combatType: string | null;
  turnCount: number;
  allTurnCount: number;
  sessionStatus: number;
  created: string | null;
  modified: string | null;
  chainId: number | null;
  playerUids: string[];
}

interface HuntBattleLogResponse {
  ok: boolean;
  error?: string;
  huntRef: string;
  meta: HuntBattleMeta | null;
  latestCombatants: Record<string, Record<string, CombatantState>> | null;
  turns: TurnSummary[];
  totalTurns: number;
}

function HpBar({ current, max, dead }: { current: number | null; max: number | null; dead: boolean }) {
  if (current === null || max === null || max === 0) {
    return <div className="h-2 rounded-sm bg-muted w-full" />;
  }
  const pct = Math.max(0, Math.min(100, (current / max) * 100));
  const color = dead
    ? 'bg-muted-foreground/40'
    : pct > 60
    ? 'bg-green-500'
    : pct > 30
    ? 'bg-yellow-500'
    : 'bg-red-500';

  return (
    <div className="h-2 rounded-sm bg-muted w-full overflow-hidden">
      <div
        className={`h-full rounded-sm transition-all duration-500 ${color}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function MpBar({ current, max }: { current: number | null; max: number | null }) {
  if (current === null || max === null || max === 0) return null;
  const pct = Math.max(0, Math.min(100, (current / max) * 100));
  return (
    <div className="h-1.5 rounded-sm bg-muted w-full overflow-hidden">
      <div
        className="h-full rounded-sm bg-blue-500 transition-all duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function CombatantCard({ unit, side }: { unit: CombatantState; side: 'hero' | 'enemy' }) {
  const hpPct =
    unit.hp !== null && unit.maxHp !== null && unit.maxHp > 0
      ? Math.round((unit.hp / unit.maxHp) * 100)
      : null;

  return (
    <div
      className={`p-3 rounded-md border space-y-2 ${
        unit.isDead ? 'opacity-50 bg-muted/30' : 'bg-card'
      }`}
      data-testid={`combatant-card-${side}-${unit.name.replace(/\s+/g, '-').toLowerCase()}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {unit.isDead ? (
            <Skull className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          ) : side === 'hero' ? (
            <Shield className="w-3.5 h-3.5 text-blue-500 shrink-0" />
          ) : (
            <Swords className="w-3.5 h-3.5 text-red-500 shrink-0" />
          )}
          <span className="text-sm font-medium truncate">{unit.name}</span>
        </div>
        {hpPct !== null && (
          <span
            className="text-xs text-muted-foreground shrink-0"
            data-testid={`text-hp-pct-${unit.name.replace(/\s+/g, '-').toLowerCase()}`}
          >
            {unit.hp}/{unit.maxHp}
          </span>
        )}
      </div>

      <HpBar current={unit.hp} max={unit.maxHp} dead={unit.isDead} />

      {unit.mp !== null && unit.maxMp !== null && unit.maxMp > 0 && (
        <MpBar current={unit.mp} max={unit.maxMp} />
      )}

      {unit.debuffs.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {unit.debuffs.map((d, i) => (
            <Badge key={i} variant="secondary" className="text-xs">
              {d.name || d.id || 'debuff'}
              {d.turnsLeft !== null && ` (${d.turnsLeft})`}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function TurnRow({
  turn,
  heroNames,
  enemyNames,
  prevHp,
}: {
  turn: TurnSummary;
  heroNames: Record<string, string>;
  enemyNames: Record<string, string>;
  prevHp: Record<string, Record<string, number | null>> | null;
}) {
  const isHeroTurn = turn.activeSide === 1;
  const actorNames = isHeroTurn ? heroNames : enemyNames;
  const actorName =
    turn.activeSlot !== null
      ? actorNames[String(turn.activeSlot)] || `Slot ${turn.activeSlot}`
      : '—';

  const hpChanges: string[] = [];
  if (turn.afterHp && prevHp) {
    for (const [side, slots] of Object.entries(turn.afterHp)) {
      const names = side === '1' ? heroNames : enemyNames;
      for (const [slot, hp] of Object.entries(slots)) {
        const prev = prevHp[side]?.[slot];
        if (hp !== null && prev !== null && prev !== undefined && hp !== prev) {
          const diff = (hp as number) - prev;
          const name = names[slot] || `S${side}/${slot}`;
          hpChanges.push(`${name} ${diff > 0 ? '+' : ''}${diff} HP`);
        }
      }
    }
  }

  return (
    <div
      className="grid grid-cols-[3rem_1fr_auto] gap-3 items-start py-2.5 border-b last:border-0"
      data-testid={`turn-row-${turn.turnId}`}
    >
      <div className="text-center">
        <div className="text-xs font-semibold text-foreground">T{turn.turn}</div>
        <div className="text-xs text-muted-foreground">R{turn.round}</div>
      </div>

      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className={`text-xs font-medium px-1.5 py-0.5 rounded ${
              isHeroTurn
                ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                : 'bg-red-500/10 text-red-600 dark:text-red-400'
            }`}
          >
            {actorName}
          </span>
          {turn.actionType && (
            <span className="text-xs text-muted-foreground italic">{turn.actionType}</span>
          )}
        </div>
        {turn.battleLog && (
          <p className="text-xs text-muted-foreground leading-relaxed">{turn.battleLog}</p>
        )}
        {hpChanges.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {hpChanges.map((c, i) => (
              <span
                key={i}
                className={`text-xs px-1 rounded ${
                  c.includes('+')
                    ? 'text-green-600 dark:text-green-400 bg-green-500/10'
                    : 'text-red-600 dark:text-red-400 bg-red-500/10'
                }`}
              >
                {c}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="shrink-0">
        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40" />
      </div>
    </div>
  );
}

export default function HuntBattleLog() {
  const [inputValue, setInputValue] = useState('');
  const [huntRef, setHuntRef] = useState('');
  const timelineRef = useRef<HTMLDivElement>(null);
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);

  const { data, isLoading, isError, error, isFetching } = useQuery<HuntBattleLogResponse>({
    queryKey: ['/api/admin/pve/firebase-hunt-log', huntRef],
    queryFn: async () => {
      if (!huntRef) throw new Error('No hunt ref');
      const res = await fetch(`${API_BASE_URL}/api/admin/pve/firebase-hunt-log?huntRef=${encodeURIComponent(huntRef)}`, {
        credentials: 'include',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      return res.json();
    },
    enabled: !!huntRef,
    refetchInterval: (query) => {
      const d = query.state.data as HuntBattleLogResponse | undefined;
      if (!d || !d.ok) return false;
      return d.meta?.hasWinner === false ? 3000 : false;
    },
    staleTime: 2000,
  });

  const isLive = data?.meta?.hasWinner === false;

  useEffect(() => {
    if (autoScrollEnabled && timelineRef.current && data?.turns?.length) {
      timelineRef.current.scrollTop = timelineRef.current.scrollHeight;
    }
  }, [data?.turns?.length, autoScrollEnabled]);

  function handleSearch() {
    const raw = inputValue.trim();
    if (!raw) return;
    const m = raw.match(/(\d+)-(\d+)/);
    if (m) {
      setHuntRef(`${m[1]}-${m[2]}`);
      setAutoScrollEnabled(true);
    } else {
      alert('Could not parse a hunt ID from that input. Expected format: 53935-762160');
    }
  }

  const heroes = data?.latestCombatants?.['1'] ?? {};
  const enemies = data?.latestCombatants?.['-1'] ?? {};

  const heroNames: Record<string, string> = Object.fromEntries(
    Object.entries(heroes).map(([slot, u]) => [slot, u.name])
  );
  const enemyNames: Record<string, string> = Object.fromEntries(
    Object.entries(enemies).map(([slot, u]) => [slot, u.name])
  );

  const winnerLabel =
    data?.meta?.hasWinner && data?.meta?.winnerSide !== null
      ? data.meta.winnerSide === 1
        ? 'Heroes Win'
        : 'Enemies Win'
      : null;

  const scenarioLabel = data?.meta?.scenarioId
    ? data.meta.scenarioId.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : null;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="border-b bg-background px-6 py-4 shrink-0">
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="flex items-center gap-2">
            <ScrollText className="w-5 h-5 text-muted-foreground" />
            <h1 className="text-xl font-semibold">Hunt Battle Log</h1>
          </div>
          {isLive && (
            <Badge variant="secondary" className="text-xs gap-1">
              <Activity className="w-3 h-3 text-green-500" />
              Live
            </Badge>
          )}
          {winnerLabel && (
            <Badge variant="secondary" className="text-xs gap-1">
              <Trophy className="w-3 h-3" />
              {winnerLabel}
            </Badge>
          )}
        </div>

        <div className="flex gap-2 max-w-xl">
          <Input
            placeholder="Hunt ID or URL (e.g. 53935-762160)"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            data-testid="input-hunt-ref"
            className="font-mono text-sm"
          />
          <Button onClick={handleSearch} data-testid="button-search-hunt" disabled={isLoading}>
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
        {/* Error */}
        {isError && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span className="text-sm">{(error as Error)?.message || 'Failed to load battle log'}</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* No hunt selected */}
        {!huntRef && !isError && (
          <Card>
            <CardContent className="pt-6 text-center text-muted-foreground text-sm py-12">
              <ScrollText className="w-8 h-8 mx-auto mb-3 opacity-30" />
              Enter a hunt ID above to load the battle log.
              <div className="mt-2 font-mono text-xs opacity-60">e.g. 53935-762160</div>
            </CardContent>
          </Card>
        )}

        {data?.ok && (
          <>
            {/* Battle meta */}
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Hunt: </span>
                    <span className="font-mono font-medium" data-testid="text-hunt-ref">{data.huntRef}</span>
                  </div>
                  {scenarioLabel && (
                    <div>
                      <span className="text-muted-foreground">Scenario: </span>
                      <span className="font-medium" data-testid="text-scenario">{scenarioLabel}</span>
                    </div>
                  )}
                  <div>
                    <span className="text-muted-foreground">Turns: </span>
                    <span className="font-medium" data-testid="text-turn-count">{data.totalTurns}</span>
                  </div>
                  {data.meta?.created && (
                    <div>
                      <span className="text-muted-foreground">Started: </span>
                      <span className="font-medium">
                        {new Date(data.meta.created).toLocaleTimeString()}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground">Status: </span>
                    {isLive ? (
                      <span className="text-green-600 dark:text-green-400 font-medium flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" />
                        In Progress
                      </span>
                    ) : winnerLabel ? (
                      <span className="font-medium flex items-center gap-1">
                        <Trophy className="w-3.5 h-3.5" />
                        {winnerLabel}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Unknown</span>
                    )}
                  </div>
                  {isFetching && isLive && (
                    <div className="flex items-center gap-1 text-muted-foreground text-xs">
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      Updating…
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Combatant status */}
            {data.latestCombatants && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Heroes */}
                <Card>
                  <CardHeader className="pb-2 pt-4 px-4">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Shield className="w-4 h-4 text-blue-500" />
                      Heroes
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 space-y-2">
                    {Object.entries(heroes).length === 0 ? (
                      <p className="text-xs text-muted-foreground">No hero data yet</p>
                    ) : (
                      Object.entries(heroes)
                        .sort(([a], [b]) => Number(a) - Number(b))
                        .map(([slot, unit]) => (
                          <CombatantCard key={slot} unit={unit} side="hero" />
                        ))
                    )}
                  </CardContent>
                </Card>

                {/* Enemies */}
                <Card>
                  <CardHeader className="pb-2 pt-4 px-4">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Swords className="w-4 h-4 text-red-500" />
                      Enemies
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 space-y-2">
                    {Object.entries(enemies).length === 0 ? (
                      <p className="text-xs text-muted-foreground">No enemy data yet</p>
                    ) : (
                      Object.entries(enemies)
                        .sort(([a], [b]) => Number(a) - Number(b))
                        .map(([slot, unit]) => (
                          <CombatantCard key={slot} unit={unit} side="enemy" />
                        ))
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Turn timeline */}
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Zap className="w-4 h-4 text-muted-foreground" />
                    Turn Timeline
                    <span className="text-muted-foreground font-normal text-xs">
                      ({data.turns.length} turns)
                    </span>
                  </CardTitle>
                  {isLive && (
                    <Button
                      size="sm"
                      variant={autoScrollEnabled ? 'secondary' : 'outline'}
                      onClick={() => setAutoScrollEnabled((v) => !v)}
                      data-testid="button-toggle-autoscroll"
                    >
                      {autoScrollEnabled ? 'Auto-scroll On' : 'Auto-scroll Off'}
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {data.turns.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No turns recorded yet.</p>
                ) : (
                  <div
                    ref={timelineRef}
                    className="max-h-[480px] overflow-y-auto pr-1"
                    onScroll={(e) => {
                      const el = e.currentTarget;
                      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
                      if (!atBottom) setAutoScrollEnabled(false);
                    }}
                    data-testid="turn-timeline"
                  >
                    {data.turns.map((turn, idx) => (
                      <TurnRow
                        key={turn.turnId}
                        turn={turn}
                        heroNames={heroNames}
                        enemyNames={enemyNames}
                        prevHp={idx > 0 ? data.turns[idx - 1].afterHp : null}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
