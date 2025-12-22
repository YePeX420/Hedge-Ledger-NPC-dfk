import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Play, RefreshCw, Swords, Target, Trophy, Settings, Star } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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

interface TournamentStatus {
  ok: boolean;
  progress: IndexerProgress;
  stats: TournamentStats;
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

interface WinnerHero {
  heroId: number;
  mainClass: string;
  level: number;
  rarity: number;
  placement: string;
  tournamentId: number;
  combatPowerScore: number | null;
  stats: {
    strength: number | null;
    agility: number | null;
    dexterity: number | null;
    vitality: number | null;
    endurance: number | null;
    intelligence: number | null;
    wisdom: number | null;
    luck: number | null;
  };
  abilities: {
    active1: string | null;
    active2: string | null;
    passive1: string | null;
    passive2: string | null;
  };
}

const RARITY_NAMES = ['Common', 'Uncommon', 'Rare', 'Legendary', 'Mythic'];
const RARITY_COLORS = ['text-gray-500', 'text-green-500', 'text-blue-500', 'text-orange-500', 'text-purple-500'];

function formatWeight(w: string | number): string {
  const num = typeof w === 'string' ? parseFloat(w) : w;
  return `${(num * 100).toFixed(0)}%`;
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
  const [editingConfig, setEditingConfig] = useState<SimilarityConfig | null>(null);

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

  const { data: winnersData, isLoading: winnersLoading } = useQuery<{ ok: boolean; recommendations: WinnerHero[]; totalWinners: number }>({
    queryKey: ['/api/admin/battle-ready/recommendations'],
  });

  const triggerMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', '/api/admin/tournament/trigger', { maxBattles: parseInt(maxBattles) || 100 });
    },
    onSuccess: () => {
      toast({ title: "Indexer triggered", description: "Battle indexing started" });
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

  const config = editingConfig || configData?.config;
  const progress = statusData?.progress;
  const stats = statusData?.stats;

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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Play className="h-5 w-5" />
              Indexer Control
            </CardTitle>
            <CardDescription>Trigger battle data indexing from the DFK GraphQL API</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
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
              <Button
                onClick={() => triggerMutation.mutate()}
                disabled={triggerMutation.isPending || progress?.status === 'running'}
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
            <div className="space-y-2">
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
                {winnersData.recommendations.slice(0, 20).map((hero) => (
                  <TableRow key={`${hero.heroId}-${hero.tournamentId}`} data-testid={`row-winner-${hero.heroId}`}>
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
                      STR:{hero.stats.strength} AGI:{hero.stats.agility} DEX:{hero.stats.dexterity}
                      <br />
                      VIT:{hero.stats.vitality} END:{hero.stats.endurance} INT:{hero.stats.intelligence}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {[hero.abilities.active1, hero.abilities.active2].filter(Boolean).join(', ') || 'None'}
                    </TableCell>
                  </TableRow>
                ))}
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
                    <TableCell>Lv {t.levelMin}-{t.levelMax}</TableCell>
                    <TableCell>
                      {RARITY_NAMES[t.rarityMin] || t.rarityMin} - {RARITY_NAMES[t.rarityMax] || t.rarityMax}
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
    </div>
  );
}
