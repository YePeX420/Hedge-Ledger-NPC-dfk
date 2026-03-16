import { useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ArrowLeft, Trophy, Swords, Loader2, Medal, Brain, History, CheckCircle2, XCircle, ChevronDown, ChevronRight as ChevronRightIcon, Zap, BookOpen, FlaskConical } from 'lucide-react';
import { ABILITY_FORMULAS, projectHeroOutput } from '@/data/ability-formulas';
import { SKILL_CODEX, hasFullCodex } from '@/data/skill-codex';

const RARITY_LABELS = ['Common', 'Uncommon', 'Rare', 'Legendary', 'Mythic'];
const RARITY_COLORS = ['text-muted-foreground', 'text-green-500', 'text-blue-500', 'text-orange-500', 'text-purple-500'];
const REALM_LABELS: Record<string, string> = { cv: 'Crystalvale', sd: 'Sundered Isles', metis: 'Metis' };
const FORMAT_LABELS: Record<string, string> = { '1v1': '1v1', '3v3': '3v3', '6v6': '6v6' };

// ─── Ability rarity lookup (extracted from DFK game client) ──────────────────
type SkillRarity = 'basic' | 'advanced' | 'elite' | 'exalted';
const ACTIVE_RARITY: Record<string, SkillRarity> = {
  'Poisoned Blade': 'basic', 'Blinding Winds': 'basic', 'Heal': 'basic', 'Cleanse': 'basic',
  'Iron Skin': 'basic', 'Speed': 'basic', 'Critical Aim': 'basic', 'Deathmark': 'basic',
  'Exhaust': 'advanced', 'Daze': 'advanced', 'Explosion': 'advanced', 'Hardened Shield': 'advanced',
  'Stun': 'elite', 'Second Wind': 'elite',
  'Resurrection': 'exalted',
};
const PASSIVE_RARITY: Record<string, SkillRarity> = {
  'Duelist': 'basic', 'Clutch': 'basic', 'Foresight': 'basic', 'Headstrong': 'basic',
  'Clear Vision': 'basic', 'Fearless': 'basic', 'Chatterbox': 'basic', 'Stalwart': 'basic',
  'Leadership': 'advanced', 'Efficient': 'advanced', 'Menacing': 'advanced', 'Toxic': 'advanced',
  'Giant Slayer': 'elite', 'Last Stand': 'elite',
  'Second Life': 'exalted',
};
const SKILL_RARITY_STYLE: Record<SkillRarity, string> = {
  basic:    'border-border text-muted-foreground',
  advanced: 'border-blue-500/40 text-blue-400',
  elite:    'border-purple-500/40 text-purple-400',
  exalted:  'border-amber-500/40 text-amber-400',
};
function SkillBadge({ name, type }: { name: string; type: 'active' | 'passive' }) {
  const table = type === 'active' ? ACTIVE_RARITY : PASSIVE_RARITY;
  const rarity: SkillRarity = table[name] ?? 'basic';
  return (
    <Badge variant="outline" className={`text-[11px] px-1.5 py-0 ${SKILL_RARITY_STYLE[rarity]}`}>
      {name}
    </Badge>
  );
}

interface HeroSnapshot {
  id: number;
  heroId: number;
  realm: string;
  mainClass: string;
  subClass: string;
  rarity: number;
  level: number;
  strength: number;
  dexterity: number;
  agility: number;
  vitality: number;
  endurance: number;
  intelligence: number;
  wisdom: number;
  luck: number;
  hp: number | null;
  active1: string | null;
  active2: string | null;
  passive1: string | null;
  passive2: string | null;
  combatPowerScore: number | null;
}

interface TournamentPlacement {
  placement: {
    tournamentId: number;
    heroId: number;
    playerAddress: string;
    placement: string;
    matchesWon: number;
    matchesLost: number;
  };
  snapshot: HeroSnapshot;
}

interface TournamentDetail {
  tournament: {
    id: number;
    tournamentId: number;
    realm: string;
    format: string;
    status: string;
    startTime: string | null;
    hostPlayer: string | null;
    opponentPlayer: string | null;
    winnerPlayer: string | null;
    levelMin: number | null;
    levelMax: number | null;
    rarityMin: number | null;
    rarityMax: number | null;
    partySize: number;
    allUniqueClasses: boolean | null;
    noTripleClasses: boolean | null;
    gloryBout: boolean | null;
    minGlories: number | null;
    hostGlories: number | null;
    opponentGlories: number | null;
    sponsorCount: number | null;
    rewardsJson: unknown;
    tournamentTypeSignature: string | null;
    rawBattleData: unknown;
  };
  placements: TournamentPlacement[];
}

interface PredictionData {
  hostWinPct: number;
  opponentWinPct: number;
  initPctHost: number;
  hostDps: number;
  opponentDps: number;
  predictedWinner: 'host' | 'opponent';
  actualWinner: 'host' | 'opponent' | null;
  correct: boolean | null;
  hostProfiles: Array<{ heroId: number; class: string | null; level: number | null; STR: number; DEX: number; AGI: number; INT: number; initExpected: number }>;
  opponentProfiles: Array<{ heroId: number; class: string | null; level: number | null; STR: number; DEX: number; AGI: number; INT: number; initExpected: number }>;
}

interface ClassWinrate {
  winner_class: string;
  finalist_class: string;
  bouts: number;
  win_pct: number;
}

interface HeroCompData {
  heroId: number;
  mainClass: string;
  subClass: string;
  level: number;
  rarity: number;
  str: number;
  dex: number;
  agi: number;
  int: number;
  wis: number;
  vit: number;
  end: number;
  lck: number;
  active1: string | null;
  active2: string | null;
  passive1: string | null;
  passive2: string | null;
}

interface CompData {
  ok: boolean;
  source: 'snapshot' | 'live';
  hostHeroes: HeroCompData[];
  opponentHeroes: HeroCompData[];
}

function truncAddr(addr: string | null) {
  if (!addr) return '—';
  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

function formatDate(ts: string | null) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString();
}

function StatRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between text-xs py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono font-medium">{value}</span>
    </div>
  );
}

function HeroCard({ hero, isWinner }: { hero: HeroSnapshot; isWinner: boolean }) {
  return (
    <Card className={`${isWinner ? 'border-green-500/40 bg-green-500/5' : ''}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold">{hero.mainClass}</span>
            <span className="text-xs text-muted-foreground">/{hero.subClass}</span>
            {isWinner && <Trophy className="w-3 h-3 text-green-500" />}
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            <Badge variant="outline" className={`text-xs ${RARITY_COLORS[hero.rarity]}`}>{RARITY_LABELS[hero.rarity]}</Badge>
            <Badge variant="outline" className="text-xs">Lv {hero.level}</Badge>
          </div>
        </div>
        <p className="text-xs text-muted-foreground font-mono">Hero #{hero.heroId}</p>
      </CardHeader>
      <CardContent className="pt-0 grid grid-cols-2 gap-x-4">
        <div>
          <StatRow label="STR" value={hero.strength} />
          <StatRow label="DEX" value={hero.dexterity} />
          <StatRow label="AGI" value={hero.agility} />
          <StatRow label="VIT" value={hero.vitality} />
        </div>
        <div>
          <StatRow label="END" value={hero.endurance} />
          <StatRow label="INT" value={hero.intelligence} />
          <StatRow label="WIS" value={hero.wisdom} />
          <StatRow label="LCK" value={hero.luck} />
        </div>
        {(hero.active1 || hero.active2 || hero.passive1 || hero.passive2) && (
          <div className="col-span-2 mt-2 space-y-1">
            {(hero.active1 || hero.active2) && (
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-[10px] text-muted-foreground w-10 shrink-0">Active</span>
                {[hero.active1, hero.active2].filter(Boolean).map((a, i) => (
                  <SkillBadge key={i} name={String(a)} type="active" />
                ))}
              </div>
            )}
            {(hero.passive1 || hero.passive2) && (
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-[10px] text-muted-foreground w-10 shrink-0">Passive</span>
                {[hero.passive1, hero.passive2].filter(Boolean).map((a, i) => (
                  <SkillBadge key={i} name={String(a)} type="passive" />
                ))}
              </div>
            )}
          </div>
        )}
        {hero.combatPowerScore != null && (
          <div className="col-span-2 mt-1 text-xs text-muted-foreground">CP: <span className="font-mono font-bold text-foreground">{hero.combatPowerScore}</span></div>
        )}
      </CardContent>
    </Card>
  );
}

function heroToStats(h: HeroCompData) {
  return { str: h.str, dex: h.dex, agi: h.agi, int: h.int, wis: h.wis, vit: h.vit, end: h.end, lck: h.lck };
}

const CLASS_CHIP: Record<string, string> = {
  Warrior: 'bg-red-500/15 text-red-400',
  Knight: 'bg-yellow-500/15 text-yellow-400',
  Archer: 'bg-green-500/15 text-green-400',
  Priest: 'bg-blue-500/15 text-blue-400',
  Wizard: 'bg-indigo-500/15 text-indigo-400',
  Pirate: 'bg-teal-500/15 text-teal-400',
  Berserker: 'bg-red-600/15 text-red-500',
  Seer: 'bg-cyan-500/15 text-cyan-400',
};

const ABILITY_TYPE_STYLE: Record<string, string> = {
  physical_damage: 'border-red-500/40 text-red-400',
  magical_damage: 'border-indigo-500/40 text-indigo-400',
  heal: 'border-green-500/40 text-green-400',
  buff: 'border-blue-500/40 text-blue-400',
  debuff: 'border-orange-500/40 text-orange-400',
  cc: 'border-purple-500/40 text-purple-400',
  mixed: 'border-teal-500/40 text-teal-400',
  passive: 'border-muted-foreground/40 text-muted-foreground',
};

function CompHeroRow({ hero, side }: { hero: HeroCompData; side: 'host' | 'opponent' }) {
  const [codexOpen, setCodexOpen] = useState(false);
  const stats = heroToStats(hero);
  const proj = projectHeroOutput(stats, {
    active1: hero.active1,
    active2: hero.active2,
    passive1: hero.passive1,
    passive2: hero.passive2,
  });

  const abilities = [
    { name: hero.active1, slot: 'active' as const },
    { name: hero.active2, slot: 'active' as const },
    { name: hero.passive1, slot: 'passive' as const },
    { name: hero.passive2, slot: 'passive' as const },
  ].filter(a => !!a.name);

  const classAbilities = SKILL_CODEX[hero.mainClass] || [];
  const showCodex = hasFullCodex(hero.mainClass);

  return (
    <div className="space-y-3" data-testid={`comp-hero-${side}-${hero.heroId}`}>
      {/* Hero header */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${CLASS_CHIP[hero.mainClass] ?? 'bg-muted text-muted-foreground'}`}>
          {hero.mainClass}
        </span>
        <span className="text-xs text-muted-foreground">/{hero.subClass}</span>
        <Badge variant="outline" className="text-xs">Lv {hero.level}</Badge>
        <span className={`text-xs ${RARITY_COLORS[hero.rarity]}`}>{RARITY_LABELS[hero.rarity]}</span>
        <span className="text-xs font-mono text-muted-foreground ml-auto">#{hero.heroId}</span>
      </div>

      {/* Equipped abilities with tooltips */}
      {abilities.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {abilities.map((a, i) => {
            const formula = ABILITY_FORMULAS[a.name!];
            const badge = (
              <Badge
                key={i}
                variant="outline"
                className={`text-[11px] cursor-default ${formula
                  ? ABILITY_TYPE_STYLE[formula.type] ?? ''
                  : a.slot === 'active' ? SKILL_RARITY_STYLE[ACTIVE_RARITY[a.name!] ?? 'basic'] : SKILL_RARITY_STYLE[PASSIVE_RARITY[a.name!] ?? 'basic']
                }`}
              >
                {a.slot === 'passive' && <span className="opacity-50 mr-1 text-[10px]">P</span>}
                {a.name}
              </Badge>
            );
            if (!formula) return badge;
            return (
              <Tooltip key={i}>
                <TooltipTrigger asChild>{badge}</TooltipTrigger>
                <TooltipContent className="max-w-xs space-y-1">
                  <p className="font-semibold text-xs">{a.name}</p>
                  <p className="text-xs font-mono text-muted-foreground">{formula.formulaStr}</p>
                  <p className="text-xs">{formula.description}</p>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      )}

      {/* Projection scores */}
      <div className="grid grid-cols-4 gap-2">
        <div className="bg-red-500/5 border border-red-500/20 rounded-md p-2 text-center">
          <p className="text-[10px] text-muted-foreground mb-0.5">Phys DPS</p>
          <p className="text-sm font-mono font-bold text-red-400">{Math.round(proj.physDps) || '—'}</p>
        </div>
        <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-md p-2 text-center">
          <p className="text-[10px] text-muted-foreground mb-0.5">Mag DPS</p>
          <p className="text-sm font-mono font-bold text-indigo-400">{Math.round(proj.magicDps) || '—'}</p>
        </div>
        <div className="bg-green-500/5 border border-green-500/20 rounded-md p-2 text-center">
          <p className="text-[10px] text-muted-foreground mb-0.5">Heal</p>
          <p className="text-sm font-mono font-bold text-green-400">{Math.round(proj.healValue) || '—'}</p>
        </div>
        <div className="bg-purple-500/5 border border-purple-500/20 rounded-md p-2 text-center">
          <p className="text-[10px] text-muted-foreground mb-0.5">CC</p>
          <p className="text-sm font-mono font-bold text-purple-400">
            {proj.ccCount > 0 ? proj.ccCount : '—'}
          </p>
        </div>
      </div>

      {/* CC type chips */}
      {proj.ccTypes.length > 0 && (
        <div className="flex gap-1 flex-wrap">
          {proj.ccTypes.map((cc, i) => (
            <Badge key={i} variant="outline" className="text-[10px] border-purple-500/30 text-purple-400 px-1.5 py-0 capitalize">{cc}</Badge>
          ))}
          {proj.passiveFlags.filter(p => ['Leadership', 'Duelist', 'Menacing', 'Toxic', 'Last Stand', 'Second Life'].includes(p)).map((p, i) => (
            <Badge key={`p-${i}`} variant="outline" className="text-[10px] border-amber-500/30 text-amber-400 px-1.5 py-0">{p}</Badge>
          ))}
        </div>
      )}
      {proj.passiveFlags.filter(p => ['Leadership', 'Duelist', 'Menacing', 'Toxic', 'Last Stand', 'Second Life'].includes(p) && !proj.ccTypes.length).map((p, i) => (
        <Badge key={`np-${i}`} variant="outline" className="text-[10px] border-amber-500/30 text-amber-400 px-1.5 py-0">{p}</Badge>
      ))}

      {/* Skill Codex collapsible */}
      {showCodex && classAbilities.length > 0 && (
        <div className="mt-1">
          <button
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setCodexOpen(o => !o)}
            data-testid={`btn-codex-toggle-${hero.heroId}`}
          >
            {codexOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRightIcon className="w-3 h-3" />}
            <BookOpen className="w-3 h-3" />
            {hero.mainClass} Skill Codex ({classAbilities.length} abilities)
          </button>
          {codexOpen && (
            <div className="mt-2 pl-4 space-y-1.5 border-l border-border">
              <p className="text-[10px] text-muted-foreground italic mb-2">
                Codex path selections are not exposed by the public API — showing all abilities available to {hero.mainClass} as reference.
              </p>
              {classAbilities.map(ab => (
                <div key={ab.id} className="flex items-start gap-2 py-0.5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-medium">{ab.name}</span>
                      <Badge variant="outline" className={`text-[9px] px-1 py-0 ${ABILITY_TYPE_STYLE[ab.type] ?? ''}`}>
                        {ab.type.replace('_', ' ')}
                      </Badge>
                      {ab.manaCost != null && ab.manaCost > 0 && (
                        <Badge variant="outline" className="text-[9px] px-1 py-0 border-blue-400/40 text-blue-400" data-testid={`badge-mana-${ab.id}`}>
                          {ab.manaCost} MP
                        </Badge>
                      )}
                      {ab.accModifierPct != null && ab.accModifierPct !== 0 && (
                        <Badge variant="outline" className="text-[9px] px-1 py-0 border-yellow-500/40 text-yellow-400" data-testid={`badge-acc-${ab.id}`}>
                          {ab.accModifierPct > 0 ? '+' : ''}{ab.accModifierPct}% acc
                        </Badge>
                      )}
                      {ab.combo ? (
                        <Badge variant="outline" className="text-[9px] px-1 py-0 border-amber-500/40 text-amber-400" data-testid={`badge-combo-${ab.id}`}>
                          {ab.combo.condition}
                        </Badge>
                      ) : ab.hasCombo ? (
                        <Badge variant="outline" className="text-[9px] px-1 py-0 border-amber-500/40 text-amber-400">COMBO</Badge>
                      ) : null}
                    </div>
                    <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{ab.formulaStr}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AdminTournamentDetail({ id }: { id: string }) {
  const [location, navigate] = useLocation();
  const basePath = location.startsWith('/user/') ? '/user/dfk-tournament' : '/admin/tournament';
  const baseListPath = location.startsWith('/user/') ? '/user/dfk-tournaments' : '/admin/tournament';
  const tournamentId = parseInt(id);

  const { data: detailData, isLoading: detailLoading, error: detailError } = useQuery({
    queryKey: ['/api/admin/tournament', tournamentId],
    enabled: !isNaN(tournamentId),
    queryFn: async () => {
      const res = await fetch(`/api/admin/tournament/${tournamentId}`);
      if (!res.ok) throw new Error('Tournament not found');
      const json = await res.json();
      return json as { ok: boolean } & TournamentDetail;
    }
  });

  const { data: predData, isLoading: predLoading } = useQuery({
    queryKey: ['/api/admin/tournament', tournamentId, 'predict'],
    enabled: !isNaN(tournamentId) && !!detailData?.ok,
    queryFn: async () => {
      const res = await fetch(`/api/admin/tournament/${tournamentId}/predict`);
      if (!res.ok) throw new Error('Prediction failed');
      const json = await res.json();
      return json.data as PredictionData | null;
    }
  });

  const { data: classWinrateData, isLoading: classLoading } = useQuery({
    queryKey: ['/api/admin/tournament/class-winrates'],
    queryFn: async () => {
      const res = await fetch('/api/admin/tournament/class-winrates');
      if (!res.ok) throw new Error('Failed');
      const json = await res.json();
      return json.data as ClassWinrate[];
    }
  });

  const { data: similarData, isLoading: similarLoading } = useQuery({
    queryKey: ['/api/admin/tournament/by-signature', detailData?.tournament?.tournamentTypeSignature],
    enabled: !!detailData?.tournament?.tournamentTypeSignature,
    queryFn: async () => {
      const sig = encodeURIComponent(detailData!.tournament.tournamentTypeSignature!);
      const res = await fetch(`/api/admin/tournament/by-signature/${sig}?limit=20`);
      if (!res.ok) throw new Error('Failed');
      const json = await res.json();
      return json.tournaments as Array<{
        tournamentId: number;
        startTime: string | null;
        winnerPlayer: string | null;
        hostPlayer: string | null;
        opponentPlayer: string | null;
        format: string;
      }>;
    }
  });

  const { data: compData, isLoading: compLoading } = useQuery({
    queryKey: ['/api/admin/tournament', tournamentId, 'comp-data'],
    enabled: !isNaN(tournamentId) && !!detailData?.ok,
    queryFn: async () => {
      const res = await fetch(`/api/admin/tournament/${tournamentId}/comp-data`);
      if (!res.ok) throw new Error('Comp data unavailable');
      return res.json() as Promise<CompData>;
    }
  });

  if (detailLoading) return (
    <div className="p-6 flex items-center gap-2 text-muted-foreground">
      <Loader2 className="w-4 h-4 animate-spin" />Loading bout...
    </div>
  );

  if (detailError || !detailData?.ok) return (
    <div className="p-6">
      <p className="text-destructive">Bout not found or not yet indexed.</p>
      <Button variant="outline" onClick={() => navigate(baseListPath)} className="mt-4">
        <ArrowLeft className="w-4 h-4 mr-2" />Back
      </Button>
    </div>
  );

  const { tournament, placements } = detailData;

  const hostPlacements = placements.filter(p =>
    p.placement.playerAddress?.toLowerCase() === tournament.hostPlayer?.toLowerCase()
  );
  const opponentPlacements = placements.filter(p =>
    p.placement.playerAddress?.toLowerCase() === tournament.opponentPlayer?.toLowerCase()
  );

  const isHostWin = tournament.winnerPlayer &&
    tournament.winnerPlayer.toLowerCase() === tournament.hostPlayer?.toLowerCase();

  // Find relevant class winrate for this matchup
  const matchupWinrates = detailData && classWinrateData && hostPlacements.length > 0 && opponentPlacements.length > 0
    ? classWinrateData.filter(r =>
        (r.winner_class === hostPlacements[0]?.snapshot?.mainClass && r.finalist_class === opponentPlacements[0]?.snapshot?.mainClass) ||
        (r.winner_class === opponentPlacements[0]?.snapshot?.mainClass && r.finalist_class === hostPlacements[0]?.snapshot?.mainClass)
      )
    : [];

  const similarBouts = similarData?.filter(s => s.tournamentId !== tournamentId) || [];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto" data-testid="page-tournament-detail">
      {/* Header */}
      <div className="space-y-2">
        <Button variant="ghost" size="sm" onClick={() => navigate(baseListPath)} className="-ml-2">
          <ArrowLeft className="w-4 h-4 mr-1" /> All Bouts
        </Button>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Medal className="w-6 h-6 text-primary" />
              Bout #{tournament.tournamentId}
            </h1>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline">{FORMAT_LABELS[tournament.format] || tournament.format}</Badge>
              <Badge variant="outline">{REALM_LABELS[tournament.realm] || tournament.realm}</Badge>
              {tournament.gloryBout && <Badge variant="outline" className="text-amber-500 border-amber-500/40">Glory Bout</Badge>}
              {tournament.levelMin && <Badge variant="outline">Lv {tournament.levelMin}–{tournament.levelMax ?? '∞'}</Badge>}
              {tournament.rarityMin != null && tournament.rarityMin > 0 && <Badge variant="outline">{RARITY_LABELS[tournament.rarityMin]}+</Badge>}
              {tournament.allUniqueClasses && <Badge variant="outline">All Unique Classes</Badge>}
              {tournament.noTripleClasses && <Badge variant="outline">No Triple Classes</Badge>}
            </div>
            <p className="text-sm text-muted-foreground">{formatDate(tournament.startTime)}</p>
          </div>
          {tournament.winnerPlayer && (
            <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/30 rounded-lg px-4 py-2">
              <Trophy className="w-5 h-5 text-green-500" />
              <div>
                <p className="text-xs text-muted-foreground">Winner</p>
                <p className="font-semibold text-green-600 dark:text-green-400 font-mono text-sm">{truncAddr(tournament.winnerPlayer)}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="bout">
        <TabsList data-testid="tabs-tournament-detail">
          <TabsTrigger value="bout" data-testid="tab-bout-details"><Swords className="w-3.5 h-3.5 mr-1.5" />Bout Details</TabsTrigger>
          <TabsTrigger value="prediction" data-testid="tab-prediction"><Brain className="w-3.5 h-3.5 mr-1.5" />Combat Prediction</TabsTrigger>
          <TabsTrigger value="similar" data-testid="tab-similar"><History className="w-3.5 h-3.5 mr-1.5" />Similar Bouts</TabsTrigger>
          <TabsTrigger value="comp" data-testid="tab-comp-analysis"><FlaskConical className="w-3.5 h-3.5 mr-1.5" />Comp Analysis</TabsTrigger>
        </TabsList>

        {/* Tab 1: Bout Details */}
        <TabsContent value="bout" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 gap-6">
            {/* Host side */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className={`px-3 py-1 rounded-md text-sm font-medium ${isHostWin ? 'bg-green-500/10 text-green-600 dark:text-green-400' : 'bg-muted text-muted-foreground'}`}>
                  Host {isHostWin && <Trophy className="w-3.5 h-3.5 inline ml-1" />}
                </div>
                <span className="text-xs font-mono text-muted-foreground">{truncAddr(tournament.hostPlayer)}</span>
              </div>
              {hostPlacements.length > 0 ? (
                hostPlacements.map((p, i) => (
                  <HeroCard key={i} hero={p.snapshot} isWinner={!!isHostWin} />
                ))
              ) : (
                <Card>
                  <CardContent className="py-8 text-center text-sm text-muted-foreground">
                    No hero snapshot data indexed for this player
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Opponent side */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className={`px-3 py-1 rounded-md text-sm font-medium ${!isHostWin && tournament.winnerPlayer ? 'bg-green-500/10 text-green-600 dark:text-green-400' : 'bg-muted text-muted-foreground'}`}>
                  Opponent {!isHostWin && tournament.winnerPlayer && <Trophy className="w-3.5 h-3.5 inline ml-1" />}
                </div>
                <span className="text-xs font-mono text-muted-foreground">{truncAddr(tournament.opponentPlayer)}</span>
              </div>
              {opponentPlacements.length > 0 ? (
                opponentPlacements.map((p, i) => (
                  <HeroCard key={i} hero={p.snapshot} isWinner={!isHostWin && !!tournament.winnerPlayer} />
                ))
              ) : (
                <Card>
                  <CardContent className="py-8 text-center text-sm text-muted-foreground">
                    No hero snapshot data indexed for this player
                  </CardContent>
                </Card>
              )}
            </div>
          </div>

          {/* Glories & Rewards */}
          {((tournament.hostGlories ?? 0) + (tournament.opponentGlories ?? 0) > 0) && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Glories & Stakes</CardTitle>
              </CardHeader>
              <CardContent className="flex gap-8 text-sm">
                <div><span className="text-muted-foreground">Host staked: </span><span className="font-mono font-bold">{(tournament.hostGlories ?? 0).toLocaleString()}</span></div>
                <div><span className="text-muted-foreground">Opponent staked: </span><span className="font-mono font-bold">{(tournament.opponentGlories ?? 0).toLocaleString()}</span></div>
                {tournament.sponsorCount != null && tournament.sponsorCount > 0 && (
                  <div><span className="text-muted-foreground">Sponsors: </span><span className="font-mono font-bold">{tournament.sponsorCount}</span></div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Tab 2: Combat Prediction */}
        <TabsContent value="prediction" className="space-y-4 mt-4">
          {predLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-8">
              <Loader2 className="w-4 h-4 animate-spin" />Computing prediction...
            </div>
          ) : !predData ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Brain className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="font-medium">Insufficient data for prediction</p>
                <p className="text-sm text-muted-foreground mt-1">Hero snapshots are needed for both sides to run the combat formula.</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Verdict */}
              <Card className={predData.correct === true ? 'border-green-500/40' : predData.correct === false ? 'border-red-500/40' : ''}>
                <CardContent className="p-5 flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Formula Prediction</p>
                    <p className="text-xl font-bold">
                      {predData.predictedWinner === 'host' ? truncAddr(tournament.hostPlayer) : truncAddr(tournament.opponentPlayer)} wins
                    </p>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {predData.hostWinPct.toFixed(1)}% host vs {predData.opponentWinPct.toFixed(1)}% opponent
                    </p>
                  </div>
                  {predData.correct !== null && (
                    <div className={`flex items-center gap-2 px-4 py-3 rounded-lg font-semibold ${predData.correct ? 'bg-green-500/10 text-green-600 dark:text-green-400' : 'bg-red-500/10 text-red-600 dark:text-red-400'}`}>
                      {predData.correct ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                      <span>{predData.correct ? 'Correct' : 'Incorrect'} Prediction</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Probability bars */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Win Probabilities</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Overall Win Chance</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs w-24 text-right font-mono font-bold">{predData.hostWinPct.toFixed(1)}% Host</span>
                      <Progress value={predData.hostWinPct} className="flex-1 h-4" />
                      <span className="text-xs w-28 font-mono font-bold">Opp {predData.opponentWinPct.toFixed(1)}%</span>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-xs text-muted-foreground">Initiative Advantage</p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs w-24 text-right font-mono">{predData.initPctHost.toFixed(1)}%</span>
                      <Progress value={predData.initPctHost} className="flex-1 h-3" />
                      <span className="text-xs w-28 font-mono">{(100 - predData.initPctHost).toFixed(1)}%</span>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-xs text-muted-foreground">DPS Comparison</p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs w-24 text-right font-mono">{predData.hostDps}</span>
                      <Progress value={(predData.hostDps / (predData.hostDps + predData.opponentDps)) * 100} className="flex-1 h-3" />
                      <span className="text-xs w-28 font-mono">{predData.opponentDps}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Hero profiles table */}
              {(predData.hostProfiles.length > 0 || predData.opponentProfiles.length > 0) && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Per-Hero Combat Profiles</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Side</TableHead>
                          <TableHead>Hero</TableHead>
                          <TableHead>Class</TableHead>
                          <TableHead>Lv</TableHead>
                          <TableHead>STR</TableHead>
                          <TableHead>DEX</TableHead>
                          <TableHead>AGI</TableHead>
                          <TableHead>Init Expected</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {predData.hostProfiles.map((p, i) => (
                          <TableRow key={`host-${i}`}>
                            <TableCell><Badge variant="outline" className="text-xs">Host</Badge></TableCell>
                            <TableCell className="font-mono text-xs">{p.heroId ?? '—'}</TableCell>
                            <TableCell className="text-sm">{p.class ?? '—'}</TableCell>
                            <TableCell>{p.level ?? '—'}</TableCell>
                            <TableCell className="font-mono">{p.STR}</TableCell>
                            <TableCell className="font-mono">{p.DEX}</TableCell>
                            <TableCell className="font-mono">{p.AGI}</TableCell>
                            <TableCell className="font-mono">{p.initExpected?.toFixed(1) ?? '—'}</TableCell>
                          </TableRow>
                        ))}
                        {predData.opponentProfiles.map((p, i) => (
                          <TableRow key={`opp-${i}`}>
                            <TableCell><Badge variant="outline" className="text-xs">Opp</Badge></TableCell>
                            <TableCell className="font-mono text-xs">{p.heroId ?? '—'}</TableCell>
                            <TableCell className="text-sm">{p.class ?? '—'}</TableCell>
                            <TableCell>{p.level ?? '—'}</TableCell>
                            <TableCell className="font-mono">{p.STR}</TableCell>
                            <TableCell className="font-mono">{p.DEX}</TableCell>
                            <TableCell className="font-mono">{p.AGI}</TableCell>
                            <TableCell className="font-mono">{p.initExpected?.toFixed(1) ?? '—'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}

              {/* Class matchup winrates */}
              {matchupWinrates.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Historical Class Matchup Data</CardTitle>
                    <CardDescription className="text-xs">Win rates for this class combination from all indexed bouts</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Winner Class</TableHead>
                          <TableHead>vs</TableHead>
                          <TableHead>Loser Class</TableHead>
                          <TableHead>Bouts</TableHead>
                          <TableHead>Win %</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {matchupWinrates.map((r, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-medium">{r.winner_class}</TableCell>
                            <TableCell className="text-muted-foreground">beats</TableCell>
                            <TableCell>{r.finalist_class}</TableCell>
                            <TableCell className="font-mono">{r.bouts}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Progress value={r.win_pct} className="w-16 h-2" />
                                <span className="font-mono text-xs">{r.win_pct}%</span>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        {/* Tab 3: Similar Bouts */}
        <TabsContent value="similar" className="space-y-4 mt-4">
          {!tournament.tournamentTypeSignature ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground text-sm">
                No tournament type signature for this bout.
              </CardContent>
            </Card>
          ) : similarLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-8">
              <Loader2 className="w-4 h-4 animate-spin" />Loading similar bouts...
            </div>
          ) : similarBouts.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground text-sm">
                No other bouts found with the same restrictions signature.
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs font-mono">{tournament.tournamentTypeSignature}</Badge>
                <span className="text-xs text-muted-foreground">{similarBouts.length} similar bouts</span>
              </div>

              {/* Win rate summary */}
              {(() => {
                const hostWins = similarBouts.filter(s => s.winnerPlayer && s.hostPlayer && s.winnerPlayer.toLowerCase() === s.hostPlayer.toLowerCase()).length;
                const total = similarBouts.filter(s => s.winnerPlayer).length;
                const hostPct = total > 0 ? Math.round((hostWins / total) * 100) : null;
                return total > 0 ? (
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-xs text-muted-foreground mb-2">Host vs Opponent Win Rate (this format)</p>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-mono">{hostPct}% Host</span>
                        <Progress value={hostPct ?? 50} className="flex-1 h-3" />
                        <span className="text-sm font-mono">{100 - (hostPct ?? 50)}% Opp</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">{total} completed bouts</p>
                    </CardContent>
                  </Card>
                ) : null;
              })()}

              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Bout #</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Host</TableHead>
                        <TableHead>Opponent</TableHead>
                        <TableHead>Result</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {similarBouts.slice(0, 15).map(s => {
                        const sHostWin = s.winnerPlayer && s.hostPlayer && s.winnerPlayer.toLowerCase() === s.hostPlayer.toLowerCase();
                        return (
                          <TableRow key={s.tournamentId} className="cursor-pointer hover-elevate" onClick={() => navigate(`${basePath}/${s.tournamentId}`)}>
                            <TableCell className="font-mono text-xs">#{s.tournamentId}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{s.startTime ? new Date(s.startTime).toLocaleDateString() : '—'}</TableCell>
                            <TableCell className="font-mono text-xs">{s.hostPlayer ? `${s.hostPlayer.slice(0, 6)}…` : '—'}</TableCell>
                            <TableCell className="font-mono text-xs">{s.opponentPlayer ? `${s.opponentPlayer.slice(0, 6)}…` : '—'}</TableCell>
                            <TableCell>
                              {s.winnerPlayer ? (
                                <Badge variant="outline" className={`text-xs ${sHostWin ? 'text-green-600 border-green-500/40' : 'text-blue-500 border-blue-500/40'}`}>
                                  {sHostWin ? 'Host' : 'Opponent'}
                                </Badge>
                              ) : <span className="text-xs text-muted-foreground">Pending</span>}
                            </TableCell>
                            <TableCell>
                              <ChevronRight className="w-3 h-3 text-muted-foreground" />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* Tab 4: Comp Analysis */}
        <TabsContent value="comp" className="space-y-6 mt-4" data-testid="tab-content-comp">
          {compLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-8">
              <Loader2 className="w-4 h-4 animate-spin" />Loading comp data…
            </div>
          ) : !compData?.ok ? (
            <Card>
              <CardContent className="py-12 text-center">
                <FlaskConical className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="font-medium">Comp data unavailable</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Hero data could not be retrieved. The bout may not be indexed yet, or the DFK GraphQL is unavailable.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Source badge */}
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={compData.source === 'live'
                    ? 'border-orange-500/40 text-orange-400'
                    : 'border-green-500/40 text-green-400'}
                  data-testid="badge-comp-source"
                >
                  <Zap className="w-2.5 h-2.5 mr-1" />
                  {compData.source === 'live' ? 'Live Data' : 'Indexed Data'}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {compData.source === 'live'
                    ? 'Fetched directly from DFK GraphQL — bout may be in progress'
                    : 'From indexed hero snapshots'}
                </span>
              </div>

              {/* Team comparison */}
              {(() => {
                const hasPassive = (h: { passive1: string | null; passive2: string | null }, name: string) =>
                  h.passive1 === name || h.passive2 === name;

                // Raw per-hero projections
                const projectAll = (heroes: typeof compData.hostHeroes) =>
                  heroes.map(h => projectHeroOutput(heroToStats(h), { active1: h.active1, active2: h.active2, passive1: h.passive1, passive2: h.passive2 }));

                const hostProjs = projectAll(compData.hostHeroes);
                const oppProjs  = projectAll(compData.opponentHeroes);

                const hostTeamPhysRaw = hostProjs.reduce((s, p) => s + p.physDps, 0);
                const hostTeamMagRaw  = hostProjs.reduce((s, p) => s + p.magicDps, 0);
                const hostTeamHeal    = hostProjs.reduce((s, p) => s + p.healValue, 0);
                const hostTeamCc      = hostProjs.reduce((s, p) => s + p.ccCount, 0);

                const oppTeamPhysRaw  = oppProjs.reduce((s, p) => s + p.physDps, 0);
                const oppTeamMagRaw   = oppProjs.reduce((s, p) => s + p.magicDps, 0);
                const oppTeamHeal     = oppProjs.reduce((s, p) => s + p.healValue, 0);
                const oppTeamCc       = oppProjs.reduce((s, p) => s + p.ccCount, 0);

                // Cross-team passive multipliers
                // Leadership: +5%/hero to own team output, cap +15%
                // Menacing: -5%/hero applied against opposing team output, cap -15%
                const hostLeadershipCount = compData.hostHeroes.filter(h => hasPassive(h, 'Leadership')).length;
                const hostMenacingCount   = compData.hostHeroes.filter(h => hasPassive(h, 'Menacing')).length;
                const oppLeadershipCount  = compData.opponentHeroes.filter(h => hasPassive(h, 'Leadership')).length;
                const oppMenacingCount    = compData.opponentHeroes.filter(h => hasPassive(h, 'Menacing')).length;

                const hostLeadershipMult = 1 + Math.min(hostLeadershipCount * 0.05, 0.15);
                const oppLeadershipMult  = 1 + Math.min(oppLeadershipCount  * 0.05, 0.15);
                // Opponent's Menacing debuffs host; host's Menacing debuffs opponent
                const hostEffectiveMult  = hostLeadershipMult * (1 - Math.min(oppMenacingCount  * 0.05, 0.15));
                const oppEffectiveMult   = oppLeadershipMult  * (1 - Math.min(hostMenacingCount * 0.05, 0.15));

                const hostTeamPhys = hostTeamPhysRaw * hostEffectiveMult;
                const hostTeamMag  = hostTeamMagRaw  * hostEffectiveMult;
                const oppTeamPhys  = oppTeamPhysRaw  * oppEffectiveMult;
                const oppTeamMag   = oppTeamMagRaw   * oppEffectiveMult;

                const hasCrossTeamPassives =
                  hostLeadershipCount > 0 || hostMenacingCount > 0 ||
                  oppLeadershipCount  > 0 || oppMenacingCount  > 0;

                const adv = (hostVal: number, oppVal: number) => {
                  if (hostVal === 0 && oppVal === 0) return null;
                  const diff = hostVal - oppVal;
                  if (Math.abs(diff) < 5) return 'tied';
                  return diff > 0 ? 'host' : 'opponent';
                };

                const physAdv = adv(hostTeamPhys, oppTeamPhys);
                const magAdv = adv(hostTeamMag, oppTeamMag);
                const healAdv = adv(hostTeamHeal, oppTeamHeal);
                const ccAdv = adv(hostTeamCc, oppTeamCc);

                const advStyle = (a: string | null, side: 'host' | 'opponent' | 'tied') =>
                  a === side ? (side === 'host' ? 'bg-blue-500/10 text-blue-400 font-bold' : side === 'opponent' ? 'bg-orange-500/10 text-orange-400 font-bold' : 'bg-muted') : 'text-muted-foreground';

                const advLabel = (a: string | null) => {
                  if (!a) return '—';
                  if (a === 'tied') return 'Tied';
                  if (a === 'host') return 'Host edge';
                  return 'Opp edge';
                };
                const advStyle2 = (a: string | null) => {
                  if (!a || a === 'tied') return 'text-muted-foreground text-xs';
                  return a === 'host' ? 'text-blue-400 text-xs font-semibold' : 'text-orange-400 text-xs font-semibold';
                };

                return (
                  <Card data-testid="card-team-summary">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Team Summary</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Category</TableHead>
                            <TableHead className="text-xs text-blue-400">Host</TableHead>
                            <TableHead className="text-xs text-orange-400">Opponent</TableHead>
                            <TableHead className="text-xs">Edge</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {[
                            { label: 'Phys DPS', hv: hostTeamPhys, ov: oppTeamPhys, a: physAdv },
                            { label: 'Mag DPS', hv: hostTeamMag, ov: oppTeamMag, a: magAdv },
                            { label: 'Heal', hv: hostTeamHeal, ov: oppTeamHeal, a: healAdv },
                            { label: 'CC Threats', hv: hostTeamCc, ov: oppTeamCc, a: ccAdv },
                          ].map(row => (
                            <TableRow key={row.label}>
                              <TableCell className="text-xs font-medium">{row.label}</TableCell>
                              <TableCell className={`text-xs font-mono ${advStyle(row.a, 'host')}`}>{Math.round(row.hv) || '—'}</TableCell>
                              <TableCell className={`text-xs font-mono ${advStyle(row.a, 'opponent')}`}>{Math.round(row.ov) || '—'}</TableCell>
                              <TableCell className={advStyle2(row.a)}>{advLabel(row.a)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      {hasCrossTeamPassives && (
                        <div className="mt-2 space-y-0.5">
                          {(hostLeadershipCount > 0 || oppMenacingCount > 0) && (
                            <p className="text-[10px] text-muted-foreground">
                              <span className="text-blue-400">Host</span>
                              {' '}effective×{hostEffectiveMult.toFixed(2)}
                              {hostLeadershipCount > 0 && ` (+${hostLeadershipCount * 5}% Leadership)`}
                              {oppMenacingCount > 0 && ` (−${oppMenacingCount * 5}% opp. Menacing)`}
                            </p>
                          )}
                          {(oppLeadershipCount > 0 || hostMenacingCount > 0) && (
                            <p className="text-[10px] text-muted-foreground">
                              <span className="text-orange-400">Opp</span>
                              {' '}effective×{oppEffectiveMult.toFixed(2)}
                              {oppLeadershipCount > 0 && ` (+${oppLeadershipCount * 5}% Leadership)`}
                              {hostMenacingCount > 0 && ` (−${hostMenacingCount * 5}% host Menacing)`}
                            </p>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })()}

              {/* Per-hero breakdown */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Host side */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="px-3 py-1 rounded-md text-sm font-medium bg-blue-500/10 text-blue-400">
                      Host
                    </div>
                    <span className="text-xs font-mono text-muted-foreground">{truncAddr(tournament.hostPlayer)}</span>
                  </div>
                  {compData.hostHeroes.length > 0 ? (
                    compData.hostHeroes.map((hero, i) => (
                      <Card key={i}>
                        <CardContent className="p-4">
                          <CompHeroRow hero={hero} side="host" />
                        </CardContent>
                      </Card>
                    ))
                  ) : (
                    <Card>
                      <CardContent className="py-8 text-center text-sm text-muted-foreground">
                        No hero data for host
                      </CardContent>
                    </Card>
                  )}
                </div>

                {/* Opponent side */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="px-3 py-1 rounded-md text-sm font-medium bg-orange-500/10 text-orange-400">
                      Opponent
                    </div>
                    <span className="text-xs font-mono text-muted-foreground">{truncAddr(tournament.opponentPlayer)}</span>
                  </div>
                  {compData.opponentHeroes.length > 0 ? (
                    compData.opponentHeroes.map((hero, i) => (
                      <Card key={i}>
                        <CardContent className="p-4">
                          <CompHeroRow hero={hero} side="opponent" />
                        </CardContent>
                      </Card>
                    ))
                  ) : (
                    <Card>
                      <CardContent className="py-8 text-center text-sm text-muted-foreground">
                        No hero data for opponent
                      </CardContent>
                    </Card>
                  )}
                </div>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ChevronRight({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}
