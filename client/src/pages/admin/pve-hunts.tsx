import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Swords, Search, Loader2, Clock, Shield, Sparkles, Bot, ChevronRight, Skull, Trophy, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { HeroDetailModal } from '@/components/dfk/HeroDetailModal';
import type { HeroDetail } from '@/components/dfk/HeroDetailModal';
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
  pet?: any;
  weapon1?: any;
  weapon2?: any;
  armor?: any;
  accessory?: any;
  offhand1?: any;
  offhand2?: any;
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

const RARITY_COLORS = ['text-muted-foreground', 'text-green-500', 'text-blue-500', 'text-purple-500', 'text-orange-400', 'text-yellow-400'];
const RARITY_LABELS = ['Common', 'Uncommon', 'Rare', 'Legendary', 'Mythic', 'Transcendent'];
const CHAIN_LABELS: Record<number, string> = { 53935: 'DFK', 8217: 'Klaytn' };

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
                      <p className="text-xs text-muted-foreground">
                        Activity #{selectedZone.activity.activity_id} · {CHAIN_LABELS[selectedZone.activity.chain_id] || `Chain ${selectedZone.activity.chain_id}`} · {selectedZone.heroes.length} heroes
                      </p>
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
                        <div className="space-y-2 max-h-[500px] overflow-y-auto">
                          {encounterData.encounters.map((enc) => (
                            <div
                              key={enc.id}
                              data-testid={`encounter-row-${enc.id}`}
                              className="flex flex-wrap items-center gap-2 p-2 rounded-md bg-muted/30 text-sm"
                            >
                              <span className="font-medium min-w-[120px]">{enc.enemy_id}</span>
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
                                  {enc.drops.map(d => `${d.quantity}x ${d.itemId}`).join(', ')}
                                </span>
                              )}
                              <span className="text-xs text-muted-foreground/60 ml-auto">
                                {formatTimeAgo(enc.encountered_at)}
                              </span>
                            </div>
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
