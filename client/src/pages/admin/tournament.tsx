import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Medal, RefreshCw, Loader2, Trophy, Swords, ChevronRight,
  RotateCcw, Filter, Activity, Database, Zap, Clock,
  CheckCircle2, Circle, Play, Radio, History, Calendar, Users, LayoutGrid
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// ─── Types ──────────────────────────────────────────────────────────────────

interface LiveHero {
  id: string;
  level: number;
  mainClassStr: string;
  subClassStr: string;
  rarity: number;
}

interface LiveBattle {
  id: string;
  battleState: number;
  status: 'open' | 'in_progress' | 'completed';
  host: { id: string; name: string };
  opponent: { id: string; name: string };
  winner: { id: string; name: string } | null;
  battleStartTime: number;
  partyCount: number;
  minLevel: number;
  maxLevel: number;
  minRarity: number;
  gloryBout: boolean | null;
  hostGlories: number;
  opponentGlories: number;
  privateBattle: boolean;
  allUniqueClasses: boolean;
  noTripleClasses: boolean;
  sponsorCount: number;
  hostHeroes: LiveHero[];
  opponentHeroes: LiveHero[];
}

interface HistoryRow {
  id: number;
  tournamentId: number;
  realm: string;
  format: string;
  status: string;
  startTime: string | null;
  levelMin: number | null;
  levelMax: number | null;
  rarityMin: number | null;
  gloryBout: boolean | null;
  hostGlories: number | null;
  opponentGlories: number | null;
  allUniqueClasses: boolean | null;
  noTripleClasses: boolean | null;
  hostPlayer: string | null;
  opponentPlayer: string | null;
  winnerPlayer: string | null;
  sponsorCount: number | null;
  tournamentTypeSignature: string | null;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const RARITY_LABELS = ['Common', 'Uncommon', 'Rare', 'Legendary', 'Mythic'];
const RARITY_COLORS = ['text-muted-foreground', 'text-green-500', 'text-blue-500', 'text-orange-500', 'text-purple-500'];
const REALM_LABELS: Record<string, string> = { cv: 'Crystalvale', sd: 'Sundered Isles' };
const FORMAT: Record<number, string> = { 1: '1v1', 3: '3v3', 6: '6v6' };

const CLASS_COLORS: Record<string, string> = {
  Warrior: 'bg-red-500/15 text-red-400',
  Knight: 'bg-yellow-500/15 text-yellow-400',
  Thief: 'bg-purple-500/15 text-purple-400',
  Archer: 'bg-green-500/15 text-green-400',
  Priest: 'bg-blue-500/15 text-blue-400',
  Wizard: 'bg-indigo-500/15 text-indigo-400',
  Monk: 'bg-orange-500/15 text-orange-400',
  Pirate: 'bg-teal-500/15 text-teal-400',
  Berserker: 'bg-red-600/15 text-red-500',
  Seer: 'bg-cyan-500/15 text-cyan-400',
  Legionnaire: 'bg-amber-500/15 text-amber-400',
  Scholar: 'bg-violet-500/15 text-violet-400',
  default: 'bg-muted text-muted-foreground',
};

function classColor(cls: string) {
  return CLASS_COLORS[cls] || CLASS_COLORS.default;
}

function truncAddr(addr: string | null | undefined) {
  if (!addr) return '—';
  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

function timeAgo(ts: number) {
  const diff = Math.floor((Date.now() / 1000) - ts);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function formatDate(ts: string | null) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Hero lineup strip ────────────────────────────────────────────────────────

function HeroStrip({ heroes, isWinner }: { heroes: LiveHero[]; isWinner?: boolean }) {
  if (heroes.length === 0) {
    return (
      <div className="flex items-center gap-1 text-xs text-muted-foreground italic">
        <Circle className="w-3 h-3" /> Awaiting opponent
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {heroes.map((h, i) => (
        <span
          key={i}
          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium ${classColor(h.mainClassStr)} ${isWinner ? 'ring-1 ring-green-500/40' : ''}`}
        >
          {h.mainClassStr} <span className="opacity-60">Lv{h.level}</span>
        </span>
      ))}
    </div>
  );
}

// ─── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: LiveBattle['status'] }) {
  if (status === 'open') return (
    <Badge variant="outline" className="text-xs text-emerald-500 border-emerald-500/40 animate-pulse">
      <Radio className="w-2.5 h-2.5 mr-1" /> Open
    </Badge>
  );
  if (status === 'in_progress') return (
    <Badge variant="outline" className="text-xs text-amber-500 border-amber-500/40">
      <Zap className="w-2.5 h-2.5 mr-1" /> In Progress
    </Badge>
  );
  return (
    <Badge variant="outline" className="text-xs text-muted-foreground">
      <CheckCircle2 className="w-2.5 h-2.5 mr-1" /> Done
    </Badge>
  );
}

// ─── Restriction badges ───────────────────────────────────────────────────────

function RestrictionBadges({ b }: { b: LiveBattle }) {
  const tags: string[] = [];
  if (b.gloryBout) tags.push('Glory');
  if (b.privateBattle) tags.push('Private');
  if (b.allUniqueClasses) tags.push('All Unique');
  if (b.noTripleClasses) tags.push('No Triple');
  if (b.minRarity > 0) tags.push(`${RARITY_LABELS[b.minRarity]}+`);
  if (b.sponsorCount > 0) tags.push(`${b.sponsorCount} sponsors`);
  const glories = b.hostGlories + b.opponentGlories;
  if (glories > 0) tags.push(`${glories.toLocaleString()} Glories`);
  return (
    <div className="flex gap-1 flex-wrap">
      {tags.map(t => (
        <Badge key={t} variant="outline" className="text-[10px] px-1.5 py-0 h-4">{t}</Badge>
      ))}
    </div>
  );
}

// ─── Live bout card ──────────────────────────────────────────────────────────

function LiveBoutCard({ b, onClick }: { b: LiveBattle; onClick?: () => void }) {
  const fmt = FORMAT[b.partyCount] || `${b.partyCount}v${b.partyCount}`;
  const isHostWin = b.winner && b.host?.id &&
    b.winner.id.toLowerCase() === b.host.id.toLowerCase();

  return (
    <Card
      className={`hover-elevate ${onClick ? 'cursor-pointer' : ''} ${b.status === 'open' ? 'border-emerald-500/30' : b.status === 'in_progress' ? 'border-amber-500/30' : ''}`}
      data-testid={`card-live-bout-${b.id}`}
      onClick={onClick}
    >
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono text-muted-foreground">#{b.id}</span>
            <Badge variant="outline" className="text-xs">{fmt}</Badge>
            <Badge variant="outline" className="text-xs">Lv {b.minLevel}–{b.maxLevel}</Badge>
            <StatusBadge status={b.status} />
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="w-3 h-3" />
            {timeAgo(b.battleStartTime)}
            {onClick && <ChevronRight className="w-3 h-3 ml-1" />}
          </div>
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-center">
          <div className="space-y-1.5">
            <div className={`text-xs font-mono truncate ${isHostWin ? 'text-green-500' : 'text-muted-foreground'}`}>
              {truncAddr(b.host?.id)} {isHostWin && <Trophy className="w-3 h-3 inline" />}
            </div>
            <HeroStrip heroes={b.hostHeroes} isWinner={!!isHostWin} />
          </div>

          <div className="text-center">
            <Swords className="w-4 h-4 text-muted-foreground" />
          </div>

          <div className="space-y-1.5 text-right">
            <div className={`text-xs font-mono truncate ${!isHostWin && b.winner ? 'text-green-500' : 'text-muted-foreground'}`}>
              {b.opponentHeroes.length === 0 ? <span className="italic">Open slot</span> : truncAddr(b.opponent?.id)}
              {!isHostWin && b.winner && <Trophy className="w-3 h-3 inline ml-1" />}
            </div>
            <div className="flex justify-end">
              <HeroStrip heroes={b.opponentHeroes} isWinner={!isHostWin && !!b.winner} />
            </div>
          </div>
        </div>

        <RestrictionBadges b={b} />
      </CardContent>
    </Card>
  );
}

// ─── Countdown timer ──────────────────────────────────────────────────────────

function RefreshCountdown({ cachedAt, ttl, onRefresh }: { cachedAt: number; ttl: number; onRefresh: () => void }) {
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    const tick = () => {
      const age = Date.now() - cachedAt;
      const remaining = Math.max(0, Math.ceil((ttl - age) / 1000));
      setSecondsLeft(remaining);
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [cachedAt, ttl]);

  const pct = secondsLeft === 0 ? 100 : ((ttl / 1000 - secondsLeft) / (ttl / 1000)) * 100;

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <Progress value={pct} className="w-16 h-1.5" />
      {secondsLeft > 0 ? `refresh in ${secondsLeft}s` : 'refreshing…'}
      <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={onRefresh}>
        <RefreshCw className="w-3 h-3 mr-1" /> Now
      </Button>
    </div>
  );
}

// ─── Live tab ─────────────────────────────────────────────────────────────────

function LiveTab() {
  const [, navigate] = useLocation();
  const [forceRefresh, setForceRefresh] = useState(0);

  const { data, isLoading, error } = useQuery({
    queryKey: ['/api/admin/tournament/live', forceRefresh],
    queryFn: async () => {
      const url = forceRefresh > 0
        ? '/api/admin/tournament/live?refresh=1'
        : '/api/admin/tournament/live';
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to load live data');
      return res.json() as Promise<{ ok: boolean; cached: boolean; cachedAt: number; data: LiveBattle[]; stale?: boolean }>;
    },
    refetchInterval: 30_000,
    staleTime: 0,
  });

  const battles: LiveBattle[] = data?.data || [];
  const open = battles.filter(b => b.status === 'open');
  const inProgress = battles.filter(b => b.status === 'in_progress');
  const completed = battles.filter(b => b.status === 'completed');

  const doRefresh = () => {
    setForceRefresh(n => n + 1);
  };

  if (error) return (
    <Card><CardContent className="py-12 text-center text-destructive text-sm">Failed to connect to DFK API. Try again in a moment.</CardContent></Card>
  );

  return (
    <div className="space-y-5">
      {/* Status bar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          {isLoading ? (
            <span className="flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Loading live data…</span>
          ) : (
            <>
              <span className="flex items-center gap-1">
                <Radio className="w-3 h-3 text-emerald-500" />
                {battles.length} bouts
                {data?.stale && <Badge variant="outline" className="text-[10px]">stale</Badge>}
              </span>
              <span>{open.length} open</span>
              <span>{inProgress.length} in progress</span>
              <span className="flex items-center gap-1">
                <Database className="w-3 h-3" />
                {completed.length} auto-saving to history
              </span>
            </>
          )}
        </div>
        {data?.cachedAt && (
          <RefreshCountdown cachedAt={data.cachedAt} ttl={30_000} onRefresh={doRefresh} />
        )}
      </div>

      {/* Open challenges */}
      {open.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Radio className="w-4 h-4 text-emerald-500 animate-pulse" />
            Open Challenges <Badge variant="outline" className="text-xs">{open.length}</Badge>
          </h3>
          {open.map(b => <LiveBoutCard key={b.id} b={b} />)}
        </div>
      )}

      {/* In progress */}
      {inProgress.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-500" />
            In Progress <Badge variant="outline" className="text-xs">{inProgress.length}</Badge>
          </h3>
          {inProgress.map(b => <LiveBoutCard key={b.id} b={b} />)}
        </div>
      )}

      {/* Recent completed */}
      {completed.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-muted-foreground" />
            Recent Results <Badge variant="outline" className="text-xs">{completed.length}</Badge>
          </h3>
          {completed.map(b => (
            <LiveBoutCard
              key={b.id}
              b={b}
              onClick={() => navigate(`/admin/tournament/${b.id}`)}
            />
          ))}
        </div>
      )}

      {!isLoading && battles.length === 0 && (
        <Card>
          <CardContent className="py-16 text-center">
            <Swords className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="font-medium">No recent bouts found</p>
            <p className="text-sm text-muted-foreground mt-1">DFK's arena may be quiet right now. Refreshes automatically every 30 seconds.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── History tab ──────────────────────────────────────────────────────────────

function HistoryTab() {
  const [, navigate] = useLocation();
  const [filters, setFilters] = useState({
    format: 'all',
    glory_bout: false,
    level_min: '',
    level_max: '',
    rarity_min: 'all',
  });
  const [offset, setOffset] = useState(0);
  const LIMIT = 50;

  const buildQuery = () => {
    const p = new URLSearchParams({ limit: String(LIMIT), offset: String(offset) });
    if (filters.format !== 'all') p.set('format', filters.format);
    if (filters.glory_bout) p.set('glory_bout', 'true');
    if (filters.level_min) p.set('level_min', filters.level_min);
    if (filters.level_max) p.set('level_max', filters.level_max);
    if (filters.rarity_min !== 'all') p.set('rarity_min', filters.rarity_min);
    return p.toString();
  };

  const { data, isLoading } = useQuery({
    queryKey: ['/api/admin/tournament/browse', filters, offset],
    queryFn: async () => {
      const res = await fetch(`/api/admin/tournament/browse?${buildQuery()}`);
      if (!res.ok) throw new Error('Failed');
      return res.json() as Promise<{ ok: boolean; data: HistoryRow[]; total: number }>;
    }
  });

  const bouts = data?.data || [];
  const total = data?.total || 0;

  return (
    <div className="flex gap-6">
      {/* Filter sidebar */}
      <div className="w-48 shrink-0 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold flex items-center gap-1"><Filter className="w-3 h-3" /> Filters</span>
          <Button variant="ghost" size="sm" onClick={() => { setFilters({ format: 'all', glory_bout: false, level_min: '', level_max: '', rarity_min: 'all' }); setOffset(0); }} className="h-6 px-2 text-xs">
            <RotateCcw className="w-3 h-3 mr-1" /> Reset
          </Button>
        </div>
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Format</Label>
          <Select value={filters.format} onValueChange={v => { setFilters(p => ({ ...p, format: v })); setOffset(0); }}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="1v1">1v1</SelectItem>
              <SelectItem value="3v3">3v3</SelectItem>
              <SelectItem value="6v6">6v6</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Min Rarity</Label>
          <Select value={filters.rarity_min} onValueChange={v => { setFilters(p => ({ ...p, rarity_min: v })); setOffset(0); }}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any</SelectItem>
              {RARITY_LABELS.map((r, i) => <SelectItem key={i} value={String(i)}>{r}+</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Min Lv</Label>
            <Input className="h-8 text-sm" type="number" value={filters.level_min} onChange={e => { setFilters(p => ({ ...p, level_min: e.target.value })); setOffset(0); }} placeholder="1" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Max Lv</Label>
            <Input className="h-8 text-sm" type="number" value={filters.level_max} onChange={e => { setFilters(p => ({ ...p, level_max: e.target.value })); setOffset(0); }} placeholder="100" />
          </div>
        </div>
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">Glory Only</Label>
          <Switch checked={filters.glory_bout} onCheckedChange={v => { setFilters(p => ({ ...p, glory_bout: v })); setOffset(0); }} />
        </div>
      </div>

      {/* History list */}
      <div className="flex-1 space-y-3">
        {isLoading ? (
          <div className="space-y-2">{[1,2,3,4].map(i => <Card key={i} className="animate-pulse"><CardContent className="h-20 p-4" /></Card>)}</div>
        ) : bouts.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <Database className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="font-medium">No indexed bouts yet</p>
              <p className="text-sm text-muted-foreground mt-1">Browse the Live tab to automatically start saving bouts to history.</p>
            </CardContent>
          </Card>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">{total.toLocaleString()} saved bouts — showing {offset + 1}–{Math.min(offset + LIMIT, total)}</p>
            {bouts.map(t => {
              const isHostWin = t.winnerPlayer && t.hostPlayer &&
                t.winnerPlayer.toLowerCase() === t.hostPlayer.toLowerCase();
              return (
                <Card key={t.id} className="hover-elevate cursor-pointer" data-testid={`card-bout-${t.tournamentId}`} onClick={() => navigate(`/admin/tournament/${t.tournamentId}`)}>
                  <CardContent className="p-4 flex items-center justify-between gap-4 flex-wrap">
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-mono text-muted-foreground">#{t.tournamentId}</span>
                        <Badge variant="outline" className="text-xs">{t.format}</Badge>
                        {t.gloryBout && <Badge variant="outline" className="text-xs text-amber-500 border-amber-500/40">Glory</Badge>}
                        {t.levelMin && <Badge variant="outline" className="text-xs">Lv {t.levelMin}–{t.levelMax ?? '∞'}</Badge>}
                        {t.rarityMin != null && t.rarityMin > 0 && <Badge variant="outline" className="text-xs">{RARITY_LABELS[t.rarityMin]}+</Badge>}
                        {t.allUniqueClasses && <Badge variant="outline" className="text-xs">All Unique</Badge>}
                        {t.noTripleClasses && <Badge variant="outline" className="text-xs">No Triple</Badge>}
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <span className={`font-mono text-xs truncate max-w-[130px] ${isHostWin ? 'text-green-500' : 'text-muted-foreground'}`}>
                          {truncAddr(t.hostPlayer)}
                        </span>
                        <Swords className="w-3 h-3 text-muted-foreground shrink-0" />
                        <span className={`font-mono text-xs truncate max-w-[130px] ${!isHostWin && t.winnerPlayer ? 'text-green-500' : 'text-muted-foreground'}`}>
                          {truncAddr(t.opponentPlayer)}
                        </span>
                        {t.winnerPlayer && (
                          <Badge variant="outline" className="text-xs text-green-600 border-green-500/40 shrink-0">
                            <Trophy className="w-2.5 h-2.5 mr-1" />{isHostWin ? 'Host' : 'Opp'} Win
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{formatDate(t.startTime)}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  </CardContent>
                </Card>
              );
            })}
            <div className="flex items-center justify-between pt-2">
              <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - LIMIT))}>Previous</Button>
              <span className="text-xs text-muted-foreground">Page {Math.floor(offset / LIMIT) + 1} of {Math.ceil(total / LIMIT)}</span>
              <Button variant="outline" size="sm" disabled={offset + LIMIT >= total} onClick={() => setOffset(offset + LIMIT)}>Next</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Tournaments browser tab ──────────────────────────────────────────────────

interface TournamentSession {
  sessionKey: string;
  signature: string | null;
  label: string | null;
  tournamentName: string | null;
  format: string;
  levelMin: number | null;
  levelMax: number | null;
  rarityMin: number | null;
  rarityMax: number | null;
  realm: string;
  boutCount: number;
  startTime: string | null;
  endTime: string | null;
  allUniqueClasses: boolean;
  noTripleClasses: boolean;
  gloryBout: boolean;
  minHeroStatScore: number | null;
  maxHeroStatScore: number | null;
  minTeamStatScore: number | null;
  maxTeamStatScore: number | null;
}

const REALM_DISPLAY: Record<string, { label: string; color: string }> = {
  cv:    { label: 'Crystalvale', color: 'text-teal-400' },
  sd:    { label: 'Sundered',    color: 'text-amber-400' },
  metis: { label: 'Metis',       color: 'text-blue-400' },
};

function sessionTitle(s: TournamentSession): string {
  if (s.tournamentName) return s.tournamentName;
  if (s.label) return s.label;
  const parts: string[] = [s.format];
  if (s.levelMin != null) parts.push(`Lv ${s.levelMin}–${s.levelMax ?? '∞'}`);
  return parts.join(' · ') || 'Tournament';
}

function buildRestrictionLine(s: TournamentSession): string {
  const parts: string[] = [];
  if (s.levelMin != null) parts.push(`Lv ${s.levelMin}–${s.levelMax ?? '∞'}`);
  if (s.rarityMin != null && s.rarityMin > 0) parts.push(`${RARITY_LABELS[s.rarityMin]}+`);
  const realm = REALM_DISPLAY[s.realm]?.label ?? s.realm;
  if (realm) parts.push(realm);
  if (s.allUniqueClasses) parts.push('All Unique');
  if (s.noTripleClasses) parts.push('No Triple');
  if (s.gloryBout) parts.push('Glory');
  return parts.join('  ·  ');
}

function formatSessionDate(start: string | null): string {
  if (!start) return '—';
  return new Date(start).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function TournamentsTab() {
  const [, navigate] = useLocation();

  const { data, isLoading } = useQuery({
    queryKey: ['/api/admin/tournament/sessions'],
    queryFn: async () => {
      const res = await fetch('/api/admin/tournament/sessions');
      if (!res.ok) throw new Error('Failed');
      return res.json() as Promise<{ ok: boolean; sessions: TournamentSession[] }>;
    }
  });

  const sessions = data?.sessions || [];

  if (isLoading) return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {[1,2,3,4,5,6].map(i => (
        <Card key={i} className="animate-pulse"><CardContent className="h-28 p-4" /></Card>
      ))}
    </div>
  );

  if (sessions.length === 0) return (
    <Card>
      <CardContent className="py-16 text-center">
        <LayoutGrid className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
        <p className="font-medium">No tournament sessions indexed yet</p>
        <p className="text-sm text-muted-foreground mt-1">
          Browse the Live tab to automatically start indexing bouts into history.
        </p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => {}}>
          <Radio className="w-3.5 h-3.5 mr-1.5" /> Go to Live tab
        </Button>
      </CardContent>
    </Card>
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {sessions.map(s => {
        const title = sessionTitle(s);
        const restrictionLine = buildRestrictionLine(s);
        const realmInfo = REALM_DISPLAY[s.realm];
        return (
          <Card
            key={s.sessionKey}
            className="hover-elevate cursor-pointer"
            data-testid={`card-session-${s.sessionKey}`}
            onClick={() => navigate(`/admin/tournaments/session/${encodeURIComponent(s.sessionKey)}`)}
          >
            <CardContent className="p-5 flex flex-col gap-3">
              {/* Header: name + format badge */}
              <div className="flex items-start justify-between gap-3">
                <p className="font-bold text-sm leading-snug">{title}</p>
                <Badge variant="outline" className="text-xs shrink-0 font-semibold">{s.format}</Badge>
              </div>

              {/* Restriction subtitle */}
              {restrictionLine && (
                <p className={`text-xs leading-tight ${realmInfo ? realmInfo.color : 'text-muted-foreground'}`}>
                  {restrictionLine}
                </p>
              )}

              {/* Footer: bout count + date */}
              <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border/60">
                <span className="flex items-center gap-1.5">
                  <Users className="w-3 h-3" />
                  {s.boutCount} {s.boutCount !== 1 ? 'bouts' : 'bout'}
                </span>
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3 h-3" />
                  {formatSessionDate(s.startTime)}
                </span>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AdminTournament() {
  return (
    <div className="p-6 space-y-6" data-testid="page-tournament-list">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Medal className="w-8 h-8 text-primary" />
          DFK Tournaments
        </h1>
        <p className="text-muted-foreground mt-1">
          Live arena feed from DFK's on-chain PvP system. Completed bouts are automatically saved to history as you browse.
        </p>
      </div>

      <Tabs defaultValue="tournaments" className="space-y-4">
        <TabsList>
          <TabsTrigger value="tournaments" data-testid="tab-tournaments">
            <LayoutGrid className="w-3.5 h-3.5 mr-1.5" /> Tournaments
          </TabsTrigger>
          <TabsTrigger value="live" data-testid="tab-live">
            <Radio className="w-3.5 h-3.5 mr-1.5 text-emerald-500" /> Live
          </TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-history">
            <History className="w-3.5 h-3.5 mr-1.5" /> History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tournaments" className="mt-4">
          <TournamentsTab />
        </TabsContent>

        <TabsContent value="live" className="mt-4">
          <LiveTab />
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <HistoryTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
