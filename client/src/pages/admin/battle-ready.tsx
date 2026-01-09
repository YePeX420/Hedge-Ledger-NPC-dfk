import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Loader2, Play, RefreshCw, Swords, Target, Trophy, Settings, Star, Square, Users, Clock, Zap, MapPin, ShoppingCart, DollarSign, Tag, ChevronDown, ChevronRight, Plus, RotateCcw, Trash2, Edit } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// Realm display names for marketplace locations
const REALM_DISPLAY_NAMES: Record<string, string> = {
  cv: 'Crystalvale Tavern',
  sd: 'Sundered Isles Barkeep',
};

interface SimilarityConfig {
  id: number;
  configName: string;
  statsWeight: string;
  activeAbilitiesWeight: string;
  passiveAbilitiesWeight: string;
  classMatchWeight: string;
  rarityMatchWeight: string;
  geneQualityWeight: string;
  statWeights: {
    strength: number;
    agility: number;
    dexterity: number;
    vitality: number;
    endurance: number;
    intelligence: number;
    wisdom: number;
    luck: number;
  };
  createdAt: string;
  updatedAt: string;
}

interface IndexerProgress {
  realm: string;
  lastTournamentId: number;
  tournamentsIndexed: number;
  placementsIndexed: number;
  snapshotsIndexed: number;
  status: string;
  lastError: string | null;
  lastRunAt: string | null;
}

interface TournamentStats {
  tournaments: number;
  placements: number;
  snapshots: number;
  placementBreakdown: Record<string, number>;
}

interface WorkerState {
  id: number;
  status: 'idle' | 'working' | 'stealing' | 'done';
  battlesProcessed: number;
  lastBattleId: number | null;
  errors: number;
}

interface LiveIndexerState {
  isRunning: boolean;
  isAutoRunning: boolean;
  startedAt: string | null;
  totalBattlesToProcess: number;
  battlesProcessed: number;
  placementsIndexed: number;
  snapshotsIndexed: number;
  throughputPerMinute: number;
  estimatedSecondsRemaining: number | null;
  workers: WorkerState[];
  workQueueSize: number;
}

interface TournamentStatus {
  ok: boolean;
  progress: IndexerProgress;
  stats: TournamentStats;
  live: LiveIndexerState;
}

interface Tournament {
  tournamentId: number;
  realm: string;
  name: string;
  format: string;
  status: string;
  partySize: number;
  levelMin: number;
  levelMax: number;
  rarityMin: number;
  rarityMax: number;
  totalEntrants: number;
}

interface HeroSnapshot {
  heroId: number;
  tournamentId: number;
  mainClass: string;
  subClass: string | null;
  level: number;
  rarity: number;
  combatPowerScore: number | null;
  strength: number | null;
  agility: number | null;
  dexterity: number | null;
  vitality: number | null;
  endurance: number | null;
  intelligence: number | null;
  wisdom: number | null;
  luck: number | null;
  active1: string | null;
  active2: string | null;
  passive1: string | null;
  passive2: string | null;
}

interface TournamentPlacement {
  heroId: number;
  tournamentId: number;
  placement: string;
}

interface WinnerRecommendation {
  snapshot: HeroSnapshot;
  tournament: Tournament | null;
  placement: TournamentPlacement | null;
}

interface TavernHero {
  id: string;
  normalizedId: number;
  mainClassStr: string;
  subClassStr: string;
  professionStr: string;
  rarity: number;
  level: number;
  generation: number;
  summons: number;
  maxSummons: number;
  salePrice: string;
  strength: number;
  agility: number;
  intelligence: number;
  wisdom: number;
  luck: number;
  dexterity: number;
  vitality: number;
  endurance: number;
  hp: number;
  mp: number;
  stamina: number;
  tavern: 'cv' | 'sd';
  nativeToken: 'CRYSTAL' | 'JEWEL';
  priceNative: number;
  priceUSD: number | null;
}

interface TavernListingsResponse {
  ok: boolean;
  prices: {
    crystal: number;
    jewel: number;
  };
  crystalvale: TavernHero[];
  serendale: TavernHero[];
  totalListings: number;
}

interface TournamentPattern {
  signature: string;
  tournament_name: string;
  level_min: number;
  level_max: number;
  rarity_min: number | null;
  rarity_max: number | null;
  party_size: number;
  all_unique_classes: boolean;
  no_triple_classes: boolean;
  must_include_class: boolean;
  included_class_id: number | null;
  excluded_classes: number | null;
  excluded_consumables: number | null;
  excluded_origin: number | null;
  battle_inventory: number | null;
  battle_budget: number | null;
  min_hero_stat_score: number | null;
  max_hero_stat_score: number | null;
  min_team_stat_score: number | null;
  max_team_stat_score: number | null;
  shot_clock_duration: number | null;
  private_battle: boolean;
  glory_bout: boolean;
  map_id: number | null;
  min_glories: number | null;
  max_sponsor_count: number | null;
  occurrence_count: number | string;
  last_seen_at: string | null;
  label: string | null;
  labelInfo?: TournamentType | null;
}

interface TournamentType {
  id: number;
  signature: string | null;
  name_pattern: string | null;
  label: string;
  description: string | null;
  category: string;
  color: string;
  occurrence_count: number;
  last_seen_at: string | null;
  is_active: boolean;
}

interface PatternHero {
  hero_id: string;
  main_class: string;
  sub_class: string;
  level: number;
  rarity: number;
  strength: number;
  agility: number;
  intelligence: number;
  wisdom: number;
  tournament_name: string;
}

const RARITY_NAMES = ['Common', 'Uncommon', 'Rare', 'Legendary', 'Mythic'];
const RARITY_COLORS = ['text-gray-500', 'text-green-500', 'text-blue-500', 'text-orange-500', 'text-purple-500'];

// DFK class ID to name mapping
const CLASS_NAMES: Record<number, string> = {
  0: 'Warrior', 1: 'Knight', 2: 'Thief', 3: 'Archer', 4: 'Priest', 5: 'Wizard',
  6: 'Monk', 7: 'Pirate', 8: 'Paladin', 9: 'DarkKnight', 10: 'Summoner', 11: 'Ninja',
  16: 'Dragoon', 17: 'Sage', 18: 'DreadKnight', 19: 'Shapeshifter', 24: 'Bard'
};

// Decode bitmask to class names
function decodeClassBitmask(bitmask: number | null): string[] {
  if (!bitmask || bitmask === 0) return [];
  const classes: string[] = [];
  for (let i = 0; i < 32; i++) {
    if (bitmask & (1 << i)) {
      classes.push(CLASS_NAMES[i] || `Class${i}`);
    }
  }
  return classes;
}

function formatWeight(w: string | number): string {
  const num = typeof w === 'string' ? parseFloat(w) : w;
  return `${(num * 100).toFixed(0)}%`;
}

// Smart level display - hide unrestricted (1-100), show actual brackets
function formatLevelRange(minLevel: number | null, maxLevel: number | null): string | null {
  const min = minLevel ?? 1;
  const max = maxLevel ?? 100;
  
  // Hide if unrestricted (1-100 or similar wide open ranges)
  if (min <= 1 && max >= 100) return null;
  
  // Same level (e.g., Lv 10)
  if (min === max) return `Lv ${min}`;
  
  // Range (e.g., Lv 10-14)
  return `Lv ${min}-${max}`;
}

// Format Team Trait Score (TTS) - only show if restricted
function formatTTS(maxTeamStatScore: number | null): string | null {
  const max = maxTeamStatScore ?? 9000;
  // Hide if unrestricted (9000 is default)
  if (max >= 9000) return null;
  return `TTS ≤${max}`;
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'running') {
    return (
      <Badge variant="default" className="bg-green-500">
        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
        Running
      </Badge>
    );
  }
  if (status === 'error') {
    return <Badge variant="destructive">Error</Badge>;
  }
  return <Badge variant="secondary">Idle</Badge>;
}

export default function BattleReadyAdmin() {
  const { toast } = useToast();
  const [maxBattles, setMaxBattles] = useState("100");
  const [selectedRealm, setSelectedRealm] = useState<string>("cv");
  const [editingConfig, setEditingConfig] = useState<SimilarityConfig | null>(null);
  const [selectedHeroes, setSelectedHeroes] = useState<Set<string>>(new Set());
  const [tavernFilter, setTavernFilter] = useState<'all' | 'cv' | 'sd'>('all');
  const [expandedPattern, setExpandedPattern] = useState<string | null>(null);
  const [labelForm, setLabelForm] = useState<{ signature: string; label: string; category: string; color: string } | null>(null);

  const { data: statusData, isLoading: statusLoading, refetch: refetchStatus } = useQuery<TournamentStatus>({
    queryKey: ['/api/admin/tournament/status'],
    refetchInterval: 5000,
  });

  const { data: recentData, isLoading: recentLoading } = useQuery<{ ok: boolean; tournaments: Tournament[] }>({
    queryKey: ['/api/admin/tournament/recent'],
    refetchInterval: 10000,
  });

  const { data: configData, isLoading: configLoading, refetch: refetchConfig } = useQuery<{ ok: boolean; config: SimilarityConfig | null }>({
    queryKey: ['/api/admin/similarity/config'],
  });

  const { data: winnersData, isLoading: winnersLoading } = useQuery<{ ok: boolean; recommendations: WinnerRecommendation[]; totalWinners: number }>({
    queryKey: ['/api/admin/battle-ready/recommendations'],
  });

  const { data: tavernData, isLoading: tavernLoading, refetch: refetchTavern } = useQuery<TavernListingsResponse>({
    queryKey: ['/api/admin/tavern-listings'],
  });

  const { data: patternsData, isLoading: patternsLoading, refetch: refetchPatterns } = useQuery<{ ok: boolean; patterns: TournamentPattern[]; totalLabels: number }>({
    queryKey: ['/api/admin/tournament/patterns'],
  });

  // Get the label ID for the expanded pattern
  const expandedLabelId = expandedPattern 
    ? patternsData?.patterns.find(p => p.signature === expandedPattern)?.labelInfo?.id 
    : null;

  const { data: patternHeroesData, isLoading: patternHeroesLoading } = useQuery<{ ok: boolean; type: TournamentType; heroes: PatternHero[] }>({
    queryKey: ['/api/admin/tournament/types', expandedLabelId, 'heroes'],
    queryFn: async () => {
      const response = await fetch(`/api/admin/tournament/types/${expandedLabelId}/heroes`);
      if (!response.ok) throw new Error('Failed to fetch heroes');
      return response.json();
    },
    enabled: !!expandedLabelId,
  });

  const createLabelMutation = useMutation({
    mutationFn: async (data: { signature: string; label: string; category: string; color: string }) => {
      return apiRequest('POST', '/api/admin/tournament/types', data);
    },
    onSuccess: () => {
      toast({ title: "Label created", description: "Tournament type label saved" });
      setLabelForm(null);
      queryClient.invalidateQueries({ queryKey: ['/api/admin/tournament/patterns'] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteLabelMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest('DELETE', `/api/admin/tournament/types/${id}`, {});
    },
    onSuccess: () => {
      toast({ title: "Label deleted", description: "Tournament type label removed" });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/tournament/patterns'] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const triggerMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', '/api/admin/tournament/trigger', { 
        maxBattles: parseInt(maxBattles) || 100,
        realm: selectedRealm 
      });
    },
    onSuccess: () => {
      const realmName = REALM_DISPLAY_NAMES[selectedRealm] || selectedRealm;
      toast({ title: "Indexer triggered", description: `Battle indexing started for ${realmName}` });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/tournament/status'] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateConfigMutation = useMutation({
    mutationFn: async (updates: Partial<SimilarityConfig>) => {
      return apiRequest('PUT', '/api/admin/similarity/config', updates);
    },
    onSuccess: () => {
      toast({ title: "Config saved", description: "Similarity weights updated" });
      setEditingConfig(null);
      refetchConfig();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const stopMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', '/api/admin/tournament/stop');
    },
    onSuccess: () => {
      toast({ title: "Indexer stopped", description: "Battle indexing stopped" });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/tournament/status'] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const startAutoRunMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', '/api/admin/tournament/autorun/start', { maxBattlesPerRun: 200 });
    },
    onSuccess: () => {
      toast({ title: "Auto-run started", description: "Indexer will run periodically" });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/tournament/status'] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const stopAutoRunMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', '/api/admin/tournament/autorun/stop');
    },
    onSuccess: () => {
      toast({ title: "Auto-run stopped", description: "Periodic indexing stopped" });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/tournament/status'] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', '/api/admin/tournament/reset');
    },
    onSuccess: () => {
      toast({ title: "Reset complete", description: "All tournament data cleared. Ready to re-index." });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/tournament/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/tournament/patterns'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/battle-ready/recommendations'] });
    },
    onError: (error: Error) => {
      toast({ title: "Reset failed", description: error.message, variant: "destructive" });
    },
  });

  const config = editingConfig || configData?.config;
  const progress = statusData?.progress;
  const stats = statusData?.stats;
  const live = statusData?.live;

  // Format ETA as readable string
  const formatEta = (seconds: number | null): string => {
    if (!seconds) return 'N/A';
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${mins}m`;
  };

  // Calculate progress percentage
  const progressPercent = live?.totalBattlesToProcess 
    ? Math.round((live.battlesProcessed / live.totalBattlesToProcess) * 100)
    : 0;

  // Tavern heroes filtered and combined
  const allTavernHeroes = useMemo(() => {
    if (!tavernData) return [];
    const cv = tavernData.crystalvale || [];
    const sd = tavernData.serendale || [];
    if (tavernFilter === 'cv') return cv;
    if (tavernFilter === 'sd') return sd;
    return [...cv, ...sd].sort((a, b) => (a.priceUSD ?? 999999) - (b.priceUSD ?? 999999));
  }, [tavernData, tavernFilter]);

  // Calculate team cost totals for selected heroes
  const teamCostTotals = useMemo(() => {
    const selected = allTavernHeroes.filter(h => selectedHeroes.has(h.id));
    const crystalTotal = selected.filter(h => h.nativeToken === 'CRYSTAL').reduce((sum, h) => sum + h.priceNative, 0);
    const jewelTotal = selected.filter(h => h.nativeToken === 'JEWEL').reduce((sum, h) => sum + h.priceNative, 0);
    const usdTotal = selected.reduce((sum, h) => sum + (h.priceUSD ?? 0), 0);
    return { crystalTotal, jewelTotal, usdTotal, count: selected.length };
  }, [allTavernHeroes, selectedHeroes]);

  // Toggle hero selection
  const toggleHeroSelection = (heroId: string) => {
    setSelectedHeroes(prev => {
      const next = new Set(prev);
      if (next.has(heroId)) {
        next.delete(heroId);
      } else {
        next.add(heroId);
      }
      return next;
    });
  };

  // Clear selection
  const clearSelection = () => setSelectedHeroes(new Set());

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Swords className="h-8 w-8 text-primary" />
            Battle-Ready Heroes
          </h1>
          <p className="text-muted-foreground mt-1">
            Index PVP battle data and configure similarity scoring for hero recommendations
          </p>
        </div>
        <Button variant="outline" onClick={() => refetchStatus()} data-testid="button-refresh-status">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-sm font-medium">Battles Indexed</CardTitle>
            <Trophy className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-tournaments-count">
              {statusLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : stats?.tournaments.toLocaleString() || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-sm font-medium">Hero Placements</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-placements-count">
              {statusLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : stats?.placements.toLocaleString() || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-sm font-medium">Hero Snapshots</CardTitle>
            <Star className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-snapshots-count">
              {statusLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : stats?.snapshots.toLocaleString() || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-sm font-medium">Winners</CardTitle>
            <Trophy className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-500" data-testid="text-winners-count">
              {statusLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : stats?.placementBreakdown?.winner?.toLocaleString() || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Live Progress Section */}
      {live?.isRunning && (
        <Card className="border-green-500/50 bg-green-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-green-500" />
              Indexer Running - {live.workers.length} Workers
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Progress Bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Progress: {live.battlesProcessed} / {live.totalBattlesToProcess} battles</span>
                <span className="font-mono">{progressPercent}%</span>
              </div>
              <Progress value={progressPercent} className="h-3" data-testid="progress-indexer" />
            </div>
            
            {/* Stats Row */}
            <div className="grid grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-lg font-bold text-green-500">{live.throughputPerMinute}</div>
                <div className="text-xs text-muted-foreground">battles/min</div>
              </div>
              <div>
                <div className="text-lg font-bold">{formatEta(live.estimatedSecondsRemaining)}</div>
                <div className="text-xs text-muted-foreground">ETA</div>
              </div>
              <div>
                <div className="text-lg font-bold">{live.placementsIndexed}</div>
                <div className="text-xs text-muted-foreground">placements</div>
              </div>
              <div>
                <div className="text-lg font-bold">{live.workQueueSize}</div>
                <div className="text-xs text-muted-foreground">queue size</div>
              </div>
            </div>
            
            {/* Worker Cards */}
            <div className="grid grid-cols-5 gap-2">
              {live.workers.map((worker) => (
                <div 
                  key={worker.id}
                  className={`p-2 rounded border text-center text-xs ${
                    worker.status === 'working' ? 'bg-green-500/20 border-green-500/50' :
                    worker.status === 'stealing' ? 'bg-yellow-500/20 border-yellow-500/50' :
                    worker.status === 'done' ? 'bg-muted border-muted-foreground/20' :
                    'bg-background border-border'
                  }`}
                  data-testid={`worker-card-${worker.id}`}
                >
                  <div className="font-bold">W{worker.id + 1}</div>
                  <div className="capitalize">{worker.status}</div>
                  <div className="text-muted-foreground">{worker.battlesProcessed}</div>
                </div>
              ))}
            </div>
            
            {/* Stop Button */}
            <Button
              variant="destructive"
              onClick={() => stopMutation.mutate()}
              disabled={stopMutation.isPending}
              className="w-full"
              data-testid="button-stop-indexer"
            >
              {stopMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Square className="h-4 w-4 mr-2" />
              )}
              Stop Indexer
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Play className="h-5 w-5" />
              Indexer Control
            </CardTitle>
            <CardDescription>Trigger battle data indexing with 5 parallel workers</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Manual Trigger */}
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <Label htmlFor="maxBattles">Max Battles:</Label>
                <Input
                  id="maxBattles"
                  type="number"
                  value={maxBattles}
                  onChange={(e) => setMaxBattles(e.target.value)}
                  className="w-24"
                  data-testid="input-max-battles"
                />
              </div>
              <div className="flex items-center gap-2">
                <Label>
                  <MapPin className="h-4 w-4 inline mr-1" />
                  Realm:
                </Label>
                <Select value={selectedRealm} onValueChange={setSelectedRealm}>
                  <SelectTrigger className="w-48" data-testid="select-realm">
                    <SelectValue placeholder="Select realm" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cv">Crystalvale Tavern</SelectItem>
                    <SelectItem value="sd">Sundered Isles Barkeep</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={() => triggerMutation.mutate()}
                disabled={triggerMutation.isPending || live?.isRunning}
                data-testid="button-trigger-indexer"
              >
                {triggerMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                Index Battles
              </Button>
            </div>
            
            {/* Auto-Run Controls */}
            <div className="border-t pt-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Auto-Run (Production):</span>
                {live?.isAutoRunning ? (
                  <Badge variant="default" className="bg-green-500">Active</Badge>
                ) : (
                  <Badge variant="secondary">Inactive</Badge>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => startAutoRunMutation.mutate()}
                  disabled={startAutoRunMutation.isPending || live?.isAutoRunning}
                  data-testid="button-start-autorun"
                >
                  <Play className="h-3 w-3 mr-1" />
                  Start Auto-Run
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => stopAutoRunMutation.mutate()}
                  disabled={stopAutoRunMutation.isPending || !live?.isAutoRunning}
                  data-testid="button-stop-autorun"
                >
                  <Square className="h-3 w-3 mr-1" />
                  Stop Auto-Run
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={resetMutation.isPending || live?.isRunning || live?.isAutoRunning}
                      data-testid="button-reset-tournaments"
                    >
                      <RotateCcw className="h-3 w-3 mr-1" />
                      Reset & Re-index
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Reset Tournament Data?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will delete all indexed tournament data including heroes, placements, and snapshots. 
                        You'll need to re-index to restore the data with the latest capture fields (entry fees, rewards, etc).
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => resetMutation.mutate()}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        data-testid="button-confirm-reset"
                      >
                        {resetMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : null}
                        Reset All Data
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
            
            {/* Status */}
            <div className="space-y-2 border-t pt-4">
              <div className="flex items-center justify-between text-sm">
                <span>Status:</span>
                <StatusBadge status={progress?.status || 'idle'} />
              </div>
              {progress?.lastRunAt && (
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>Last Run:</span>
                  <span>{new Date(progress.lastRunAt).toLocaleString()}</span>
                </div>
              )}
              {progress?.lastError && (
                <div className="text-sm text-destructive bg-destructive/10 p-2 rounded">
                  {progress.lastError}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Similarity Weights
            </CardTitle>
            <CardDescription>Configure how heroes are scored for similarity to battle winners</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {configLoading ? (
              <Loader2 className="h-8 w-8 animate-spin mx-auto" />
            ) : config ? (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Stats Weight</Label>
                    <div className="flex items-center gap-2">
                      <Slider
                        value={[parseFloat(config.statsWeight) * 100]}
                        max={100}
                        step={5}
                        onValueChange={(v) => setEditingConfig({
                          ...config,
                          statsWeight: (v[0] / 100).toString()
                        })}
                        data-testid="slider-stats-weight"
                      />
                      <span className="w-12 text-sm">{formatWeight(config.statsWeight)}</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Active Abilities</Label>
                    <div className="flex items-center gap-2">
                      <Slider
                        value={[parseFloat(config.activeAbilitiesWeight) * 100]}
                        max={100}
                        step={5}
                        onValueChange={(v) => setEditingConfig({
                          ...config,
                          activeAbilitiesWeight: (v[0] / 100).toString()
                        })}
                        data-testid="slider-active-weight"
                      />
                      <span className="w-12 text-sm">{formatWeight(config.activeAbilitiesWeight)}</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Passive Abilities</Label>
                    <div className="flex items-center gap-2">
                      <Slider
                        value={[parseFloat(config.passiveAbilitiesWeight) * 100]}
                        max={100}
                        step={5}
                        onValueChange={(v) => setEditingConfig({
                          ...config,
                          passiveAbilitiesWeight: (v[0] / 100).toString()
                        })}
                        data-testid="slider-passive-weight"
                      />
                      <span className="w-12 text-sm">{formatWeight(config.passiveAbilitiesWeight)}</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Class Match</Label>
                    <div className="flex items-center gap-2">
                      <Slider
                        value={[parseFloat(config.classMatchWeight) * 100]}
                        max={100}
                        step={5}
                        onValueChange={(v) => setEditingConfig({
                          ...config,
                          classMatchWeight: (v[0] / 100).toString()
                        })}
                        data-testid="slider-class-weight"
                      />
                      <span className="w-12 text-sm">{formatWeight(config.classMatchWeight)}</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Rarity Match</Label>
                    <div className="flex items-center gap-2">
                      <Slider
                        value={[parseFloat(config.rarityMatchWeight) * 100]}
                        max={100}
                        step={5}
                        onValueChange={(v) => setEditingConfig({
                          ...config,
                          rarityMatchWeight: (v[0] / 100).toString()
                        })}
                        data-testid="slider-rarity-weight"
                      />
                      <span className="w-12 text-sm">{formatWeight(config.rarityMatchWeight)}</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Gene Quality</Label>
                    <div className="flex items-center gap-2">
                      <Slider
                        value={[parseFloat(config.geneQualityWeight) * 100]}
                        max={100}
                        step={5}
                        onValueChange={(v) => setEditingConfig({
                          ...config,
                          geneQualityWeight: (v[0] / 100).toString()
                        })}
                        data-testid="slider-gene-weight"
                      />
                      <span className="w-12 text-sm">{formatWeight(config.geneQualityWeight)}</span>
                    </div>
                  </div>
                </div>
                <div className="pt-4 border-t">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Total Weight Sum:</span>
                    <span className="font-mono">
                      {(
                        parseFloat(config.statsWeight) +
                        parseFloat(config.activeAbilitiesWeight) +
                        parseFloat(config.passiveAbilitiesWeight) +
                        parseFloat(config.classMatchWeight) +
                        parseFloat(config.rarityMatchWeight) +
                        parseFloat(config.geneQualityWeight)
                      ).toFixed(2)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Weights are auto-normalized when calculating scores (final score always 0-1)
                  </p>
                </div>
                {editingConfig && (
                  <div className="flex gap-2 pt-4">
                    <Button
                      onClick={() => updateConfigMutation.mutate(editingConfig)}
                      disabled={updateConfigMutation.isPending}
                      data-testid="button-save-config"
                    >
                      {updateConfigMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Save Changes
                    </Button>
                    <Button variant="outline" onClick={() => setEditingConfig(null)}>
                      Cancel
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <div className="text-muted-foreground text-center py-4">
                No config found. Trigger the indexer to create default config.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Battle Winners</CardTitle>
          <CardDescription>Heroes that have won recent PVP battles with their combat stats</CardDescription>
        </CardHeader>
        <CardContent>
          {winnersLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : winnersData?.recommendations && winnersData.recommendations.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hero ID</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>Level</TableHead>
                  <TableHead>Rarity</TableHead>
                  <TableHead>Combat Power</TableHead>
                  <TableHead>Stats</TableHead>
                  <TableHead>Abilities</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {winnersData.recommendations.slice(0, 20).map((rec) => {
                  const hero = rec.snapshot;
                  const tournament = rec.tournament;
                  if (!hero) return null;
                  return (
                    <TableRow key={`${hero.heroId}-${tournament?.tournamentId || hero.tournamentId}`} data-testid={`row-winner-${hero.heroId}`}>
                      <TableCell className="font-mono">{hero.heroId}</TableCell>
                      <TableCell>{hero.mainClass}</TableCell>
                      <TableCell>{hero.level}</TableCell>
                      <TableCell>
                        <span className={RARITY_COLORS[hero.rarity] || ''}>
                          {RARITY_NAMES[hero.rarity] || hero.rarity}
                        </span>
                      </TableCell>
                      <TableCell className="font-bold">{hero.combatPowerScore || 'N/A'}</TableCell>
                      <TableCell className="text-xs">
                        STR:{hero.strength ?? '-'} AGI:{hero.agility ?? '-'} DEX:{hero.dexterity ?? '-'}
                        <br />
                        VIT:{hero.vitality ?? '-'} END:{hero.endurance ?? '-'} INT:{hero.intelligence ?? '-'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {[hero.active1, hero.active2].filter(Boolean).join(', ') || 'None'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No battle winners indexed yet. Trigger the indexer to start collecting data.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Battles</CardTitle>
          <CardDescription>Recently indexed PVP battles with their requirements</CardDescription>
        </CardHeader>
        <CardContent>
          {recentLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : recentData?.tournaments && recentData.tournaments.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Battle ID</TableHead>
                  <TableHead>Format</TableHead>
                  <TableHead>Level Range</TableHead>
                  <TableHead>Rarity Range</TableHead>
                  <TableHead>Party Size</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentData.tournaments.slice(0, 20).map((t) => (
                  <TableRow key={t.tournamentId} data-testid={`row-battle-${t.tournamentId}`}>
                    <TableCell className="font-mono">{t.tournamentId}</TableCell>
                    <TableCell>{t.format}</TableCell>
                    <TableCell>
                      {formatLevelRange(t.levelMin, t.levelMax) || <span className="text-muted-foreground">Open</span>}
                    </TableCell>
                    <TableCell>
                      {(t.rarityMin !== 0 || t.rarityMax !== 4) 
                        ? `${RARITY_NAMES[t.rarityMin] || t.rarityMin} - ${RARITY_NAMES[t.rarityMax] || t.rarityMax}`
                        : <span className="text-muted-foreground">Any</span>
                      }
                    </TableCell>
                    <TableCell>{t.partySize}v{t.partySize}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{t.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No battles indexed yet.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tournament Types Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Tag className="h-5 w-5" />
                Tournament Types
              </CardTitle>
              <CardDescription>
                Discovered tournament patterns with restrictions. {patternsData?.totalLabels || 0} labeled.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => refetchPatterns()} data-testid="button-refresh-patterns">
                <RefreshCw className="h-4 w-4 mr-1" />
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {patternsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : patternsData?.patterns && patternsData.patterns.length > 0 ? (
            <div className="space-y-2">
              {/* Label creation form */}
              {labelForm && (
                <div className="p-4 bg-muted rounded-lg mb-4 space-y-3" data-testid="label-form">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Create Label for: <code className="text-xs">{labelForm.signature}</code></span>
                    <Button variant="ghost" size="sm" onClick={() => setLabelForm(null)}>Cancel</Button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <Label htmlFor="label-name">Label Name</Label>
                      <Input 
                        id="label-name"
                        value={labelForm.label}
                        onChange={(e) => setLabelForm({ ...labelForm, label: e.target.value })}
                        placeholder="e.g., Beginner 3v3"
                        data-testid="input-label-name"
                      />
                    </div>
                    <div>
                      <Label htmlFor="label-category">Category</Label>
                      <Select value={labelForm.category} onValueChange={(v) => setLabelForm({ ...labelForm, category: v })}>
                        <SelectTrigger data-testid="select-label-category">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="open">Open</SelectItem>
                          <SelectItem value="beginner">Beginner</SelectItem>
                          <SelectItem value="veteran">Veteran</SelectItem>
                          <SelectItem value="specialty">Specialty</SelectItem>
                          <SelectItem value="general">General</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="label-color">Color</Label>
                      <Input 
                        id="label-color"
                        type="color"
                        value={labelForm.color}
                        onChange={(e) => setLabelForm({ ...labelForm, color: e.target.value })}
                        className="h-9 w-full"
                        data-testid="input-label-color"
                      />
                    </div>
                  </div>
                  <Button 
                    onClick={() => createLabelMutation.mutate(labelForm)}
                    disabled={!labelForm.label || createLabelMutation.isPending}
                    data-testid="button-save-label"
                  >
                    {createLabelMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
                    Save Label
                  </Button>
                </div>
              )}

              {/* Patterns table */}
              <div className="max-h-[400px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8"></TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Restrictions</TableHead>
                      <TableHead>Occurrences</TableHead>
                      <TableHead>Label</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {patternsData.patterns.slice(0, 30).map((pattern, idx) => (
                      <>
                        <TableRow key={`${pattern.signature}-${idx}`} data-testid={`row-pattern-${idx}`}>
                          <TableCell>
                            {pattern.labelInfo && (
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-6 w-6"
                                onClick={() => setExpandedPattern(expandedPattern === pattern.signature ? null : pattern.signature)}
                                data-testid={`button-expand-${idx}`}
                              >
                                {expandedPattern === pattern.signature ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                              </Button>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="text-xs font-mono">{pattern.signature}</div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {formatLevelRange(pattern.level_min, pattern.level_max) && (
                                <Badge variant="default" className="text-xs bg-blue-600">
                                  {formatLevelRange(pattern.level_min, pattern.level_max)}
                                </Badge>
                              )}
                              <Badge variant="outline" className="text-xs">
                                {pattern.party_size}v{pattern.party_size}
                              </Badge>
                              {formatTTS(pattern.max_team_stat_score) && (
                                <Badge variant="default" className="text-xs bg-amber-600">
                                  {formatTTS(pattern.max_team_stat_score)}
                                </Badge>
                              )}
                              {pattern.rarity_min !== null && pattern.rarity_max !== null && (pattern.rarity_min !== 0 || pattern.rarity_max !== 4) && (
                                <Badge variant="outline" className="text-xs">
                                  {RARITY_NAMES[pattern.rarity_min] || 'Common'}-{RARITY_NAMES[pattern.rarity_max] || 'Mythic'}
                                </Badge>
                              )}
                              {pattern.all_unique_classes && (
                                <Badge variant="secondary" className="text-xs">All Unique</Badge>
                              )}
                              {pattern.no_triple_classes && (
                                <Badge variant="secondary" className="text-xs">No Triples</Badge>
                              )}
                              {pattern.excluded_classes && pattern.excluded_classes > 0 && (
                                <Badge variant="destructive" className="text-xs">
                                  No: {decodeClassBitmask(pattern.excluded_classes).join(', ')}
                                </Badge>
                              )}
                              {pattern.must_include_class && pattern.included_class_id !== null && (
                                <Badge className="text-xs bg-green-600">
                                  Req: {CLASS_NAMES[pattern.included_class_id] || `Class${pattern.included_class_id}`}
                                </Badge>
                              )}
                              {pattern.max_hero_stat_score !== null && pattern.max_hero_stat_score < 3000 && (
                                <Badge variant="secondary" className="text-xs">
                                  Hero≤{pattern.max_hero_stat_score}
                                </Badge>
                              )}
                              {pattern.battle_budget && (
                                <Badge variant="secondary" className="text-xs">Budget: {pattern.battle_budget}</Badge>
                              )}
                              {pattern.battle_inventory && pattern.battle_inventory > 0 && (
                                <Badge variant="secondary" className="text-xs">Inv: {pattern.battle_inventory}</Badge>
                              )}
                              {pattern.shot_clock_duration && pattern.shot_clock_duration !== 45 && (
                                <Badge variant="outline" className="text-xs">{pattern.shot_clock_duration}s</Badge>
                              )}
                              {pattern.min_glories && pattern.min_glories > 0 && (
                                <Badge variant="outline" className="text-xs bg-yellow-600/20 border-yellow-500">
                                  Entry: {pattern.min_glories} Glory
                                </Badge>
                              )}
                              {pattern.max_sponsor_count && pattern.max_sponsor_count > 0 && (
                                <Badge variant="outline" className="text-xs bg-blue-600/20 border-blue-500">
                                  Sponsored
                                </Badge>
                              )}
                              {pattern.glory_bout && (
                                <Badge variant="outline" className="text-xs bg-purple-600/20 border-purple-500">
                                  Glory Bout
                                </Badge>
                              )}
                              {pattern.private_battle && (
                                <Badge variant="outline" className="text-xs bg-gray-600/20 border-gray-500">
                                  Private
                                </Badge>
                              )}
                              {pattern.map_id !== null && pattern.map_id > 0 && (
                                <Badge variant="outline" className="text-xs">
                                  Map: {pattern.map_id}
                                </Badge>
                              )}
                              {pattern.excluded_consumables && pattern.excluded_consumables > 0 && (
                                <Badge variant="destructive" className="text-xs">
                                  No Items
                                </Badge>
                              )}
                              {pattern.excluded_origin && pattern.excluded_origin > 0 && (
                                <Badge variant="secondary" className="text-xs">
                                  Origin Excl
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="font-mono">
                              {typeof pattern.occurrence_count === 'number' 
                                ? pattern.occurrence_count.toLocaleString() 
                                : parseInt(String(pattern.occurrence_count)).toLocaleString()}
                            </span>
                          </TableCell>
                          <TableCell>
                            {pattern.label ? (
                              <Badge style={{ backgroundColor: pattern.labelInfo?.color || '#6366f1' }}>
                                {pattern.label}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground text-xs">Unlabeled</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {!pattern.label ? (
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  onClick={() => setLabelForm({ 
                                    signature: pattern.signature, 
                                    label: '', 
                                    category: 'general', 
                                    color: '#6366f1' 
                                  })}
                                  data-testid={`button-add-label-${idx}`}
                                >
                                  <Plus className="h-3 w-3 mr-1" />
                                  Label
                                </Button>
                              ) : (
                                <>
                                  <Button 
                                    variant="ghost" 
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => setLabelForm({ 
                                      signature: pattern.signature, 
                                      label: pattern.label || '', 
                                      category: pattern.labelInfo?.category || 'general', 
                                      color: pattern.labelInfo?.color || '#6366f1' 
                                    })}
                                    data-testid={`button-edit-label-${idx}`}
                                  >
                                    <Edit className="h-3 w-3" />
                                  </Button>
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <Button 
                                        variant="ghost" 
                                        size="icon"
                                        className="h-7 w-7 text-destructive hover:text-destructive"
                                        data-testid={`button-delete-label-${idx}`}
                                      >
                                        <Trash2 className="h-3 w-3" />
                                      </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>Delete Label</AlertDialogTitle>
                                        <AlertDialogDescription>
                                          Are you sure you want to delete the label "{pattern.label}"? This cannot be undone.
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction 
                                          onClick={() => pattern.labelInfo?.id && deleteLabelMutation.mutate(pattern.labelInfo.id)}
                                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                        >
                                          Delete
                                        </AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                        {/* Expanded heroes row */}
                        {expandedPattern === pattern.signature && pattern.labelInfo && (
                          <TableRow key={`${pattern.signature}-heroes`}>
                            <TableCell colSpan={6} className="bg-muted/30">
                              <div className="p-2">
                                <div className="text-sm font-medium mb-2">Winning Heroes for "{pattern.label}"</div>
                                {patternHeroesLoading ? (
                                  <div className="flex items-center justify-center py-4">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  </div>
                                ) : patternHeroesData?.heroes && patternHeroesData.heroes.length > 0 ? (
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                    {patternHeroesData.heroes.slice(0, 8).map((hero, hIdx) => (
                                      <div key={hIdx} className="p-2 bg-background rounded border text-xs">
                                        <div className="font-medium">{hero.main_class}/{hero.sub_class}</div>
                                        <div className="text-muted-foreground">
                                          Lv {hero.level} | <span className={RARITY_COLORS[hero.rarity]}>{RARITY_NAMES[hero.rarity]}</span>
                                        </div>
                                        <div className="text-muted-foreground">
                                          STR:{hero.strength} AGI:{hero.agility} INT:{hero.intelligence}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="text-muted-foreground text-xs">No winning heroes found for this type.</div>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No tournament patterns discovered yet. Run the indexer to collect data.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5" />
                Tavern Listings
              </CardTitle>
              <CardDescription>Top 50 cheapest heroes for sale from both taverns</CardDescription>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={tavernFilter} onValueChange={(v) => setTavernFilter(v as 'all' | 'cv' | 'sd')}>
                <SelectTrigger className="w-40" data-testid="select-tavern-filter">
                  <SelectValue placeholder="Filter tavern" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Taverns</SelectItem>
                  <SelectItem value="cv">Crystalvale</SelectItem>
                  <SelectItem value="sd">Sundered Isles</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={() => refetchTavern()} data-testid="button-refresh-tavern">
                <RefreshCw className="h-4 w-4 mr-1" />
                Refresh
              </Button>
              {teamCostTotals.count > 0 && (
                <Button variant="ghost" size="sm" onClick={clearSelection} data-testid="button-clear-selection">
                  Clear ({teamCostTotals.count})
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {teamCostTotals.count > 0 && (
            <div className="mb-4 p-4 bg-muted rounded-lg flex flex-wrap items-center gap-4" data-testid="team-cost-summary">
              <div className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-green-500" />
                <span className="font-semibold">Team Cost ({teamCostTotals.count} heroes):</span>
              </div>
              {teamCostTotals.crystalTotal > 0 && (
                <Badge variant="outline" className="text-blue-400" data-testid="text-crystal-total">
                  {teamCostTotals.crystalTotal.toFixed(2)} CRYSTAL
                </Badge>
              )}
              {teamCostTotals.jewelTotal > 0 && (
                <Badge variant="outline" className="text-purple-400" data-testid="text-jewel-total">
                  {teamCostTotals.jewelTotal.toFixed(2)} JEWEL
                </Badge>
              )}
              <Badge className="bg-green-600" data-testid="text-usd-total">
                ${teamCostTotals.usdTotal.toFixed(2)} USD
              </Badge>
            </div>
          )}
          
          {tavernLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : allTavernHeroes.length > 0 ? (
            <>
              <div className="text-xs text-muted-foreground mb-2">
                Prices: CRYSTAL ${tavernData?.prices.crystal?.toFixed(4) || 'N/A'} | JEWEL ${tavernData?.prices.jewel?.toFixed(4) || 'N/A'}
              </div>
              <div className="max-h-[500px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10"></TableHead>
                      <TableHead>Hero ID</TableHead>
                      <TableHead>Class</TableHead>
                      <TableHead>Level</TableHead>
                      <TableHead>Rarity</TableHead>
                      <TableHead>Profession</TableHead>
                      <TableHead>Summons</TableHead>
                      <TableHead>Stats</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allTavernHeroes.map((hero) => (
                      <TableRow 
                        key={hero.id} 
                        data-testid={`row-tavern-${hero.id}`}
                        className={selectedHeroes.has(hero.id) ? 'bg-muted/50' : ''}
                      >
                        <TableCell>
                          <Checkbox
                            checked={selectedHeroes.has(hero.id)}
                            onCheckedChange={() => toggleHeroSelection(hero.id)}
                            data-testid={`checkbox-hero-${hero.id}`}
                          />
                        </TableCell>
                        <TableCell className="font-mono text-xs">{hero.normalizedId}</TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">{hero.mainClassStr}</span>
                            <span className="text-xs text-muted-foreground">{hero.subClassStr}</span>
                          </div>
                        </TableCell>
                        <TableCell>{hero.level}</TableCell>
                        <TableCell>
                          <span className={RARITY_COLORS[hero.rarity] || ''}>
                            {RARITY_NAMES[hero.rarity] || hero.rarity}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs">{hero.professionStr}</TableCell>
                        <TableCell className="text-xs">{hero.summons}/{hero.maxSummons}</TableCell>
                        <TableCell className="text-xs">
                          STR:{hero.strength} AGI:{hero.agility}
                          <br />
                          INT:{hero.intelligence} WIS:{hero.wisdom}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-col items-end">
                            <span className={hero.nativeToken === 'CRYSTAL' ? 'text-blue-400 font-medium' : 'text-purple-400 font-medium'}>
                              {hero.priceNative.toFixed(2)} {hero.nativeToken}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              ${hero.priceUSD?.toFixed(2) ?? 'N/A'}
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No heroes for sale found. Try refreshing.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
