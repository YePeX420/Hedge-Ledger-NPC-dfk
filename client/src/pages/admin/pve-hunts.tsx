import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Swords, Search, Loader2, Clock, Shield, Sparkles, Bot, ChevronRight, ChevronDown, Skull, Trophy, Package, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { HeroDetailModal } from '@/components/dfk/HeroDetailModal';
import type { HeroDetail, HeroPet, HeroWeapon, HeroArmor, HeroAccessory, HeroEquipItem } from '@/components/dfk/HeroDetailModal';
import { apiRequest } from '@/lib/queryClient';

interface Activity {
  id: number;
  chain_id: number;
  activity_type: string;
  activity_id: number;
  name: string;
  contract_address: string;
}

interface HeroRaw {
  id: string;
  normalizedId: string;
  mainClassStr: string;
  subClassStr: string;
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
  professionStr: string;
  staminaFullAt: number;
  currentQuest: string;
  active1?: number;
  active2?: number;
  passive1?: number;
  passive2?: number;
  pet?: HeroPet | null;
  weapon1?: HeroWeapon | null;
  weapon2?: HeroWeapon | null;
  armor?: HeroArmor | null;
  accessory?: HeroAccessory | null;
  offhand1?: HeroEquipItem | null;
  offhand2?: HeroEquipItem | null;
}

interface ZoneGroup {
  activity: Activity;
  heroes: HeroRaw[];
}

interface Encounter {
  id: number;
  enemy_id: string;
  result: string;
  surviving_hero_count: number;
  surviving_hero_hp: number | null;
  drops: Array<{ itemId: string; quantity: number }>;
  encountered_at: string;
}

interface BattleTurnTarget {
  slot: number;
  hpBefore: number;
  hpAfter: number;
  damage: number;
  statusEffects?: string[];
}

interface BattleTurn {
  turnNumber: number;
  actorSide: string;
  actorSlot: number;
  heroId?: string;
  skillId?: string;
  targets: BattleTurnTarget[];
}

interface BattleLogData {
  ok: boolean;
  decoded: boolean;
  eventDecoded?: boolean;
  turnDataAvailable?: boolean;
  reason?: string;
  turns?: BattleTurn[];
  huntEventData?: {
    huntId: string;
    huntWon: boolean;
    heroIds: string[];
    huntDataId?: string;
    player?: string;
  };
}

const RARITY_COLORS = ['text-muted-foreground', 'text-green-500', 'text-blue-500', 'text-purple-500', 'text-orange-400', 'text-yellow-400'];
const RARITY_LABELS = ['Common', 'Uncommon', 'Rare', 'Legendary', 'Mythic', 'Transcendent'];
const CHAIN_LABELS: Record<number, string> = { 53935: 'DFK', 8217: 'Klaytn' };

function formatEnemyName(enemyId: string): string {
  return enemyId
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function formatTimeUntil(staminaFullAt: number): string {
  if (!staminaFullAt) return '—';
  const now = Math.floor(Date.now() / 1000);
  const diff = staminaFullAt - now;
  if (diff <= 0) return 'Ready';
  const hours = Math.floor(diff / 3600);
  const mins = Math.floor((diff % 3600) / 60);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function heroRawToDetail(h: HeroRaw): HeroDetail {
  return {
    id: h.id,
    normalizedId: h.normalizedId,
    mainClassStr: h.mainClassStr,
    subClassStr: h.subClassStr || '',
    level: h.level,
    rarity: h.rarity || 0,
    element: 0,
    strength: h.strength || 0,
    agility: h.agility || 0,
    dexterity: h.dexterity || 0,
    intelligence: h.intelligence || 0,
    wisdom: h.wisdom || 0,
    vitality: h.vitality || 0,
    endurance: h.endurance || 0,
    luck: h.luck || 0,
    hp: h.hp || 0,
    mp: h.mp || 0,
    active1: h.active1 ?? 0,
    active2: h.active2 ?? 0,
    passive1: h.passive1 ?? 0,
    passive2: h.passive2 ?? 0,
    pjStatus: null,
    pjLevel: null,
    pet: h.pet ?? null,
    weapon1: h.weapon1 ?? null,
    weapon2: h.weapon2 ?? null,
    armor: h.armor ?? null,
    accessory: h.accessory ?? null,
    offhand1: h.offhand1 ?? null,
    offhand2: h.offhand2 ?? null,
  };
}

function EncounterRow({ enc, heroes }: { enc: Encounter; heroes: HeroRaw[] }) {
  const [expanded, setExpanded] = useState(false);

  const battleLogQuery = useQuery<BattleLogData>({
    queryKey: ['/api/admin/pve/hunt-battle-log', enc.id],
    enabled: expanded,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const resp = await fetch(`/api/admin/pve/hunt-battle-log?encounterId=${enc.id}`);
      if (!resp.ok) throw new Error('Failed to fetch battle log');
      return resp.json();
    },
  });

  const encounterAiMutation = useMutation({
    mutationFn: async () => {
      const resp = await apiRequest('POST', '/api/admin/pve/hunt-encounter-analysis', {
        encounterId: enc.id,
        heroes,
        enemyId: enc.enemy_id,
        result: enc.result,
        turns: battleLogQuery.data?.turns || [],
        survivingHeroCount: enc.surviving_hero_count,
        survivingHeroHp: enc.surviving_hero_hp,
        drops: enc.drops,
      });
      return resp.json();
    },
  });

  const battleLog = battleLogQuery.data;

  return (
    <div data-testid={`encounter-row-${enc.id}`}>
      <div
        className="flex flex-wrap items-center gap-2 p-2 rounded-md bg-muted/30 text-sm cursor-pointer hover-elevate"
        onClick={() => setExpanded(!expanded)}
        data-testid={`encounter-toggle-${enc.id}`}
      >
        {expanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
        <span className="font-medium min-w-[120px]">
          {formatEnemyName(enc.enemy_id)}
          <span className="text-[10px] text-muted-foreground/50 ml-1 font-mono">{enc.enemy_id}</span>
        </span>
        <Badge
          variant={enc.result === 'WIN' ? 'default' : 'destructive'}
          className="text-[10px]"
        >
          {enc.result === 'WIN' ? <Trophy className="w-3 h-3 mr-1" /> : <Skull className="w-3 h-3 mr-1" />}
          {enc.result}
        </Badge>
        {enc.surviving_hero_count > 0 && (
          <span className="text-xs text-muted-foreground">
            {enc.surviving_hero_count} survived
            {enc.surviving_hero_hp != null && ` (${enc.surviving_hero_hp}% HP)`}
          </span>
        )}
        {enc.drops && Array.isArray(enc.drops) && enc.drops.length > 0 && (
          <span className="text-xs text-green-500 flex items-center gap-1">
            <Package className="w-3 h-3" />
            {enc.drops.map(d => `${d.quantity}x ${formatEnemyName(d.itemId)}`).join(', ')}
          </span>
        )}
        <span className="text-xs text-muted-foreground/60 ml-auto">
          {formatTimeAgo(enc.encountered_at)}
        </span>
      </div>

      {expanded && (
        <div className="ml-6 mt-2 mb-3 space-y-3" data-testid={`encounter-expanded-${enc.id}`}>
          {battleLogQuery.isLoading && (
            <div className="space-y-2 animate-pulse">
              <div className="h-8 bg-muted/40 rounded-md w-full" />
              <div className="h-8 bg-muted/30 rounded-md w-3/4" />
              <div className="h-8 bg-muted/20 rounded-md w-1/2" />
            </div>
          )}

          {battleLogQuery.isError && (
            <div className="py-3 text-center">
              <p className="text-xs text-red-400">Failed to load battle log.</p>
            </div>
          )}

          {battleLog && !battleLogQuery.isLoading && (
            <div className="space-y-2">
              {battleLog.decoded && battleLog.turns && battleLog.turns.length > 0 ? (
                <div className="space-y-1" data-testid={`battle-turns-${enc.id}`}>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                    Battle Log ({battleLog.turns.length} turns)
                  </p>
                  {battleLog.turns.map((turn) => (
                    <div key={turn.turnNumber} className="flex flex-wrap items-center gap-2 text-xs p-1.5 rounded bg-muted/20">
                      <Badge variant="outline" className="text-[10px] font-mono">T{turn.turnNumber}</Badge>
                      <span className={turn.actorSide === 'hero' ? 'text-blue-400' : 'text-red-400'}>
                        {turn.actorSide === 'hero' ? `Hero #${turn.heroId || turn.actorSlot}` : `Enemy slot ${turn.actorSlot}`}
                      </span>
                      {turn.skillId && <span className="text-muted-foreground">{turn.skillId}</span>}
                      {turn.targets.map((tgt, i) => (
                        <span key={i} className="flex items-center gap-1">
                          <span className="text-muted-foreground/60">slot {tgt.slot}:</span>
                          <span className={tgt.damage > 0 ? 'text-red-400' : tgt.damage < 0 ? 'text-green-400' : 'text-muted-foreground'}>
                            {tgt.hpBefore} {tgt.damage > 0 ? `(-${tgt.damage})` : tgt.damage < 0 ? `(+${Math.abs(tgt.damage)})` : '(0)'} {tgt.hpAfter}
                          </span>
                          {tgt.statusEffects && tgt.statusEffects.length > 0 && (
                            <Badge variant="secondary" className="text-[9px]">{tgt.statusEffects.join(', ')}</Badge>
                          )}
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-start gap-2 p-3 rounded-md bg-muted/20 border border-dashed border-muted-foreground/20" data-testid={`battle-log-fallback-${enc.id}`}>
                  <AlertTriangle className="w-4 h-4 text-muted-foreground/50 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs text-muted-foreground">Turn data unavailable for this encounter.</p>
                    {battleLog.reason && (
                      <p className="text-[10px] text-muted-foreground/50 mt-0.5">{battleLog.reason}</p>
                    )}
                    {battleLog.huntEventData && (
                      <div className="mt-2 text-[10px] text-muted-foreground/60 space-y-0.5">
                        {battleLog.huntEventData.huntId && <p>Hunt ID: {battleLog.huntEventData.huntId}</p>}
                        {battleLog.huntEventData.heroIds && battleLog.huntEventData.heroIds.length > 0 && (
                          <p>Heroes: {battleLog.huntEventData.heroIds.map(id => `#${id}`).join(', ')}</p>
                        )}
                        <p>Result: {battleLog.huntEventData.huntWon ? 'Won' : 'Lost'}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <Button
                  data-testid={`button-analyze-encounter-${enc.id}`}
                  size="sm"
                  variant="ghost"
                  onClick={(e) => { e.stopPropagation(); encounterAiMutation.mutate(); }}
                  disabled={encounterAiMutation.isPending}
                >
                  {encounterAiMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Bot className="w-3.5 h-3.5 mr-1" />}
                  Analyze This Encounter
                </Button>
              </div>

              {encounterAiMutation.isPending && (
                <div className="py-3 text-center">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto mb-1 text-primary" />
                  <p className="text-xs text-muted-foreground">Analyzing encounter...</p>
                </div>
              )}

              {encounterAiMutation.data?.analysis && (
                <div className="p-3 rounded-md bg-muted/20 border border-muted-foreground/10" data-testid={`encounter-ai-result-${enc.id}`}>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5 flex items-center gap-1">
                    <Sparkles className="w-3 h-3" /> AI Analysis
                  </p>
                  <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap text-xs leading-relaxed">
                    {encounterAiMutation.data.analysis}
                  </div>
                  <p className="text-[9px] text-muted-foreground/40 mt-2">
                    Based on current party stats. If party composition changed since this encounter, recommendations may differ.
                  </p>
                </div>
              )}

              {encounterAiMutation.isError && (
                <p className="text-xs text-red-400">Failed to analyze encounter. Please try again.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function PveHunts() {
  const [walletInput, setWalletInput] = useState('');
  const [searchWallet, setSearchWallet] = useState('');
  const [selectedZone, setSelectedZone] = useState<ZoneGroup | null>(null);
  const [activeTab, setActiveTab] = useState<'party' | 'encounters' | 'ai'>('party');
  const [selectedHero, setSelectedHero] = useState<HeroDetail | null>(null);

  const handleSearch = () => {
    const trimmed = walletInput.trim();
    if (/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
      setSearchWallet(trimmed);
      setSelectedZone(null);
    }
  };

  const queryUrl = useMemo(() => searchWallet ? `/api/admin/pve/live-hunts?wallet=${searchWallet}` : null, [searchWallet]);

  const { data, isLoading, error } = useQuery<{ wallet: string; zones: ZoneGroup[]; totalHeroes: number }>({
    queryKey: ['/api/admin/pve/live-hunts', searchWallet],
    enabled: !!queryUrl,
    staleTime: 60_000,
    queryFn: async () => {
      const resp = await fetch(queryUrl!);
      if (!resp.ok) throw new Error('Failed to fetch');
      return resp.json();
    },
  });

  const encounterUrl = useMemo(() =>
    searchWallet && selectedZone
      ? `/api/admin/pve/hunt-encounters?wallet=${searchWallet}&activityId=${selectedZone.activity.id}&limit=30`
      : null,
    [searchWallet, selectedZone]
  );

  const { data: encounterData, isLoading: encountersLoading } = useQuery<{ encounters: Encounter[] }>({
    queryKey: ['/api/admin/pve/hunt-encounters', searchWallet, selectedZone?.activity.id],
    enabled: !!encounterUrl,
    staleTime: 60_000,
    queryFn: async () => {
      const resp = await fetch(encounterUrl!);
      if (!resp.ok) throw new Error('Failed to fetch encounters');
      return resp.json();
    },
  });

  const aiMutation = useMutation({
    mutationFn: async () => {
      if (!selectedZone) throw new Error('No zone selected');
      const resp = await apiRequest('POST', '/api/admin/pve/hunt-ai-analysis', {
        wallet: searchWallet,
        zone: selectedZone,
        heroes: selectedZone.heroes,
        recentEncounters: encounterData?.encounters || [],
      });
      return resp.json();
    },
  });

  const zones = data?.zones || [];

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto" data-testid="pve-hunts-page">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-2">
          <Swords className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-bold">PVE Hunt Tracker</h1>
        </div>
        <div className="flex items-center gap-2">
          <Input
            data-testid="input-wallet"
            placeholder="0x... wallet address"
            value={walletInput}
            onChange={(e) => setWalletInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="w-[340px] font-mono text-sm"
          />
          <Button data-testid="button-load" onClick={handleSearch} disabled={isLoading}>
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Load
          </Button>
        </div>
      </div>

      {!searchWallet && (
        <Card>
          <CardContent className="py-16 text-center">
            <Swords className="w-12 h-12 mx-auto mb-4 text-muted-foreground/30" />
            <p className="text-muted-foreground">Enter a wallet address to see active hunt expeditions.</p>
          </CardContent>
        </Card>
      )}

      {isLoading && (
        <Card>
          <CardContent className="py-16 text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-primary" />
            <p className="text-muted-foreground">Fetching heroes from blockchain...</p>
            <p className="text-xs text-muted-foreground/60 mt-1">This may take a few seconds for large wallets</p>
          </CardContent>
        </Card>
      )}

      {error && (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-red-400">Failed to load hunt data. Please try again.</p>
          </CardContent>
        </Card>
      )}

      {data && !isLoading && zones.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Shield className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-muted-foreground font-medium">No active hunts found</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              {data.totalHeroes} heroes in wallet — none are currently on a hunt quest.
            </p>
          </CardContent>
        </Card>
      )}

      {data && zones.length > 0 && (
        <div className="flex flex-col md:flex-row gap-4">
          <div className="w-full md:w-[280px] shrink-0 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Active Zones ({zones.length})
            </p>
            {zones.map((zone) => {
              const partyEta = (() => {
                const now = Math.floor(Date.now() / 1000);
                const maxFull = Math.max(...zone.heroes.map(h => h.staminaFullAt || 0));
                if (maxFull <= now) return 'All Ready';
                return formatTimeUntil(maxFull);
              })();
              const heroIds = zone.heroes.map(h => `#${h.normalizedId || h.id}`);
              return (
                <Card
                  key={zone.activity.id}
                  data-testid={`zone-card-${zone.activity.id}`}
                  className={`cursor-pointer transition-colors ${selectedZone?.activity.id === zone.activity.id ? 'border-primary bg-accent/30' : 'hover-elevate'}`}
                  onClick={() => { setSelectedZone(zone); setActiveTab('party'); }}
                >
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{zone.activity.name}</p>
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-[10px]">Tier {zone.activity.activity_id}</Badge>
                          <Badge variant="outline" className="text-[10px]">
                            {CHAIN_LABELS[zone.activity.chain_id] || `Chain ${zone.activity.chain_id}`}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{zone.heroes.length} heroes</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground/70 mt-1 truncate font-mono">
                          {heroIds.join(', ')}
                        </p>
                        <div className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground/60">
                          <Clock className="w-3 h-3" />
                          <span>Party ETA: {partyEta}</span>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            <p className="text-xs text-muted-foreground/60 mt-3 px-1">
              {data.totalHeroes} total heroes in wallet
            </p>
          </div>

          <div className="flex-1 min-w-0">
            {!selectedZone ? (
              <Card>
                <CardContent className="py-16 text-center">
                  <p className="text-muted-foreground">Select a zone to see party details</p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                    <div>
                      <h2 className="font-bold text-lg">{selectedZone.activity.name}</h2>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-[10px]">Tier {selectedZone.activity.activity_id}</Badge>
                        <Badge variant="outline" className="text-[10px]">{CHAIN_LABELS[selectedZone.activity.chain_id] || `Chain ${selectedZone.activity.chain_id}`}</Badge>
                        <span className="text-xs text-muted-foreground">{selectedZone.heroes.length} heroes</span>
                        <span className="text-xs text-muted-foreground font-mono">
                          [{selectedZone.heroes.map(h => `#${h.normalizedId || h.id}`).join(', ')}]
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      {(['party', 'encounters', 'ai'] as const).map((tab) => (
                        <Button
                          key={tab}
                          data-testid={`tab-${tab}`}
                          variant={activeTab === tab ? 'default' : 'ghost'}
                          size="sm"
                          onClick={() => setActiveTab(tab)}
                        >
                          {tab === 'party' && <Shield className="w-3.5 h-3.5 mr-1" />}
                          {tab === 'encounters' && <Skull className="w-3.5 h-3.5 mr-1" />}
                          {tab === 'ai' && <Bot className="w-3.5 h-3.5 mr-1" />}
                          {tab === 'party' ? 'Party' : tab === 'encounters' ? 'Encounters' : 'AI Advice'}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {activeTab === 'party' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="party-panel">
                      {selectedZone.heroes.map((hero) => (
                        <Card
                          key={hero.id}
                          data-testid={`hero-card-${hero.normalizedId || hero.id}`}
                          className="cursor-pointer hover-elevate"
                          onClick={() => setSelectedHero(heroRawToDetail(hero))}
                        >
                          <CardContent className="p-3">
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <span className="font-mono text-sm font-medium">#{hero.normalizedId || hero.id}</span>
                              <Badge variant="outline" className={`text-[10px] ${RARITY_COLORS[hero.rarity || 0]}`}>
                                {RARITY_LABELS[hero.rarity || 0]}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-sm font-medium">{hero.mainClassStr}</span>
                              {hero.subClassStr && <span className="text-xs text-muted-foreground">/ {hero.subClassStr}</span>}
                              <Badge variant="secondary" className="text-[10px] ml-auto">Lv {hero.level}</Badge>
                            </div>
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span>{hero.professionStr || '—'}</span>
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {formatTimeUntil(hero.staminaFullAt)}
                              </span>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}

                  {activeTab === 'encounters' && (
                    <div data-testid="encounters-panel">
                      {encountersLoading ? (
                        <div className="py-8 text-center">
                          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-primary" />
                          <p className="text-sm text-muted-foreground">Loading encounters...</p>
                        </div>
                      ) : !encounterData?.encounters?.length ? (
                        <div className="py-8 text-center">
                          <Skull className="w-8 h-8 mx-auto mb-2 text-muted-foreground/30" />
                          <p className="text-sm text-muted-foreground">No encounter history found for this wallet.</p>
                        </div>
                      ) : (
                        <div className="space-y-2 max-h-[600px] overflow-y-auto">
                          {encounterData.encounters.map((enc) => (
                            <EncounterRow
                              key={enc.id}
                              enc={enc}
                              heroes={selectedZone?.heroes || []}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {activeTab === 'ai' && (
                    <div data-testid="ai-panel">
                      {!aiMutation.data?.analysis && !aiMutation.isPending && (
                        <div className="py-8 text-center">
                          <Sparkles className="w-8 h-8 mx-auto mb-3 text-muted-foreground/30" />
                          <p className="text-sm text-muted-foreground mb-4">
                            Get AI-powered analysis of your party's fitness for this zone.
                          </p>
                          <Button
                            data-testid="button-generate-ai"
                            onClick={() => aiMutation.mutate()}
                            disabled={aiMutation.isPending}
                          >
                            <Bot className="w-4 h-4 mr-1" />
                            Generate AI Advice
                          </Button>
                        </div>
                      )}
                      {aiMutation.isPending && (
                        <div className="py-8 text-center">
                          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-primary" />
                          <p className="text-sm text-muted-foreground">Analyzing your party...</p>
                        </div>
                      )}
                      {aiMutation.data?.analysis && (
                        <div className="space-y-3">
                          <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap text-sm leading-relaxed">
                            {aiMutation.data.analysis}
                          </div>
                          <Button
                            data-testid="button-regenerate-ai"
                            variant="ghost"
                            size="sm"
                            onClick={() => aiMutation.mutate()}
                            disabled={aiMutation.isPending}
                          >
                            Regenerate
                          </Button>
                        </div>
                      )}
                      {aiMutation.isError && (
                        <p className="text-sm text-red-400 mt-2">Failed to generate advice. Please try again.</p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {selectedHero && (
        <HeroDetailModal
          hero={selectedHero}
          onClose={() => setSelectedHero(null)}
        />
      )}
    </div>
  );
}
