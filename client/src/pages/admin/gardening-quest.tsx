import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Play, Square, RefreshCw, Gem, Coins, Users, Search, Sprout, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface WorkerProgress {
  workerId: number;
  isActive: boolean;
  isRunning: boolean;
  currentBlock: number;
  targetBlock: number;
  rangeStart: number;
  rangeEnd: number | null;
  eventsFound: number;
  batchesCompleted: number;
  percentComplete: number;
  completedAt: string | null;
  runsCompleted: number;
  lastRunAt: string | null;
}

interface WorkersStatus {
  activeWorkers: number;
  maxWorkers: number;
  minWorkers: number;
  workers: WorkerProgress[];
}

interface PoolBreakdown {
  poolId: number;
  poolName: string;
  rewardCount: number;
  crystalAmount: number;
  jewelAmount: number;
  uniqueHeroes: number;
}

interface GardeningQuestStats {
  indexerProgress: {
    indexerName: string;
    lastIndexedBlock: number;
    genesisBlock: number;
    status: string;
    totalEventsIndexed: number;
    lastError: string | null;
    updatedAt: string;
  } | null;
  liveProgress: {
    isRunning: boolean;
    currentBlock: number;
    targetBlock: number;
    eventsFound: number;
    percentComplete: number;
    startedAt: string | null;
    completedAt: string | null;
  } | null;
  isAutoRunning: boolean;
  workers: WorkersStatus;
  stats: {
    totalRewards: number;
    crystalCount: number;
    jewelCount: number;
    uniqueHeroes: number;
    uniquePlayers: number;
    totalCrystal: number;
    totalJewel: number;
  };
  poolBreakdown?: PoolBreakdown[];
}

interface QuestReward {
  id: number;
  questId: number;
  heroId: number;
  player: string;
  poolId: number;
  rewardToken: string;
  rewardSymbol: string;
  rewardAmount: string;
  source: string | null; // 'manual_quest' or 'expedition'
  expeditionId: number | null;
  blockNumber: number;
  txHash: string;
  timestamp: string;
}

interface HeroStats {
  heroId: number;
  totalQuests: number;
  totalCrystal: number;
  totalJewel: number;
  manualQuestCount: number;
  expeditionCount: number;
  firstQuest: string | null;
  lastQuest: string | null;
}

function formatNumber(n: number | string): string {
  const num = typeof n === 'string' ? parseFloat(n) : n;
  if (isNaN(num)) return '0';
  if (num >= 1000000) return `${(num / 1000000).toFixed(2)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(2)}K`;
  return num.toFixed(4);
}

function formatBlocks(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString();
}

function truncateTxHash(hash: string): string {
  return `${hash.slice(0, 10)}...${hash.slice(-6)}`;
}

function StatusBadge({ status, isRunning }: { status: string; isRunning: boolean }) {
  if (isRunning) {
    return (
      <Badge className="bg-blue-500/20 text-blue-500 border-blue-500/30 gap-1">
        <Loader2 className="w-3 h-3 animate-spin" />
        Running
      </Badge>
    );
  }
  
  const variants: Record<string, string> = {
    idle: "bg-gray-500/20 text-gray-500 border-gray-500/30",
    complete: "bg-green-500/20 text-green-500 border-green-500/30",
    error: "bg-red-500/20 text-red-500 border-red-500/30",
  };
  
  return (
    <Badge className={variants[status] || variants.idle}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}

function WorkerStatusCard({ worker }: { worker: WorkerProgress }) {
  const isComplete = worker.completedAt !== null;
  const statusColor = worker.isRunning 
    ? 'text-blue-500' 
    : isComplete 
      ? 'text-green-500' 
      : worker.isActive 
        ? 'text-amber-500' 
        : 'text-gray-500';

  return (
    <div className="p-3 rounded-lg bg-muted/50 space-y-2" data-testid={`worker-card-${worker.workerId}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-medium">Worker {worker.workerId}</span>
          {worker.isRunning && <Loader2 className="w-3 h-3 animate-spin text-blue-500" />}
          {isComplete && <Badge variant="outline" className="text-green-500 border-green-500/30">Done</Badge>}
        </div>
        <span className={`text-sm ${statusColor}`}>
          {worker.isRunning ? 'Indexing...' : isComplete ? 'Complete' : worker.isActive ? 'Waiting' : 'Idle'}
        </span>
      </div>
      
      <div className="text-xs text-muted-foreground">
        Range: {formatBlocks(worker.rangeStart)} - {worker.rangeEnd ? formatBlocks(worker.rangeEnd) : 'latest'}
      </div>
      
      <Progress value={worker.percentComplete} className="h-2" />
      
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Block {formatBlocks(worker.currentBlock)}</span>
        <span>{worker.percentComplete.toFixed(1)}%</span>
      </div>
      
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">Events: {worker.eventsFound}</span>
        <span className="text-muted-foreground">Runs: {worker.runsCompleted}</span>
      </div>
    </div>
  );
}

export default function AdminGardeningQuest() {
  const { toast } = useToast();
  const [heroIdSearch, setHeroIdSearch] = useState("");
  const [searchedHeroId, setSearchedHeroId] = useState<number | null>(null);
  
  const { data: status, isLoading: statusLoading, refetch: refetchStatus } = useQuery<GardeningQuestStats>({
    queryKey: ['/api/admin/gardening-quest/status'],
    refetchInterval: 3000,
  });
  
  const { data: heroData, isLoading: heroLoading } = useQuery<{ rewards: QuestReward[], stats: HeroStats }>({
    queryKey: ['/api/admin/gardening-quest/hero', searchedHeroId],
    enabled: searchedHeroId !== null,
  });
  
  const triggerMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/admin/gardening-quest/trigger", {});
    },
    onSuccess: () => {
      toast({ title: "Gardening quest indexer triggered" });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/gardening-quest/status'] });
    },
    onError: (error: any) => {
      toast({ title: "Failed to trigger indexer", description: error.message, variant: "destructive" });
    },
  });
  
  const autoRunMutation = useMutation({
    mutationFn: async (action: 'start' | 'stop') => {
      return await apiRequest("POST", "/api/admin/gardening-quest/auto-run", { action });
    },
    onSuccess: (_, action) => {
      toast({ title: `Auto-run ${action === 'start' ? 'started with 5 parallel workers' : 'stopped'}` });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/gardening-quest/status'] });
    },
    onError: (error: any) => {
      toast({ title: "Failed to manage auto-run", description: error.message, variant: "destructive" });
    },
  });
  
  const resetToBlockMutation = useMutation({
    mutationFn: async ({ startBlock, clearRewards }: { startBlock: number; clearRewards: boolean }) => {
      return await apiRequest("POST", "/api/admin/gardening-quest/reset-to-block", { startBlock, clearRewards });
    },
    onSuccess: (data: any) => {
      toast({ 
        title: "Indexer reset to recent blocks", 
        description: `Starting from block ${data.startBlock?.toLocaleString()}, ${data.blocksToIndex?.toLocaleString()} blocks to scan` 
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/gardening-quest/status'] });
    },
    onError: (error: any) => {
      toast({ title: "Failed to reset indexer", description: error.message, variant: "destructive" });
    },
  });
  
  const handleResetToRecentBlocks = async () => {
    // DFK Chain produces ~1 block per 2 seconds = ~43200 blocks/day
    // Current block ~56.8M as of Dec 2024, use a conservative estimate
    // The backend will validate and return the actual latest block
    const estimatedCurrentBlock = 57000000;
    const startBlock = Math.max(0, estimatedCurrentBlock - 1000000);
    resetToBlockMutation.mutate({ startBlock, clearRewards: true });
  };
  
  const handleSearchHero = () => {
    const heroId = parseInt(heroIdSearch);
    if (!isNaN(heroId) && heroId > 0) {
      setSearchedHeroId(heroId);
    }
  };
  
  const isRunning = status?.liveProgress?.isRunning || false;
  const progress = status?.liveProgress;
  const indexerProgress = status?.indexerProgress;
  const stats = status?.stats;
  const workers = status?.workers;
  const hasActiveWorkers = (workers?.activeWorkers || 0) > 0;

  return (
    <div className="space-y-6" data-testid="page-gardening-quest">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sprout className="w-6 h-6 text-green-500" />
            Gardening Quest Rewards
          </h1>
          <p className="text-muted-foreground">Track actual CRYSTAL/JEWEL earned per hero from gardening quests</p>
        </div>
        <Button variant="outline" size="icon" onClick={() => refetchStatus()} data-testid="button-refresh">
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {statusLoading ? (
        <div className="flex items-center justify-center p-8">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Gem className="w-4 h-4 text-purple-500" />
                  Total CRYSTAL
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-purple-500" data-testid="text-total-crystal">
                  {formatNumber(stats?.totalCrystal || 0)}
                </div>
                <div className="text-xs text-muted-foreground">{stats?.crystalCount || 0} rewards</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Coins className="w-4 h-4 text-amber-500" />
                  Total JEWEL
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-amber-500" data-testid="text-total-jewel">
                  {formatNumber(stats?.totalJewel || 0)}
                </div>
                <div className="text-xs text-muted-foreground">{stats?.jewelCount || 0} rewards</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Unique Heroes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-unique-heroes">
                  {formatNumber(stats?.uniqueHeroes || 0)}
                </div>
                <div className="text-xs text-muted-foreground">{stats?.uniquePlayers || 0} players</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Rewards</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-total-rewards">
                  {formatNumber(stats?.totalRewards || 0)}
                </div>
                <div className="text-xs text-muted-foreground">indexed events</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="w-5 h-5 text-amber-500" />
                  <span>Parallel Workers</span>
                </div>
                <div className="flex items-center gap-2">
                  {hasActiveWorkers && (
                    <Badge className="bg-green-500/20 text-green-500 border-green-500/30">
                      {workers?.activeWorkers} / {workers?.maxWorkers} Workers
                    </Badge>
                  )}
                  <StatusBadge 
                    status={indexerProgress?.status || 'idle'} 
                    isRunning={hasActiveWorkers || isRunning} 
                  />
                </div>
              </CardTitle>
              <CardDescription>
                5 parallel workers with work-stealing for fast historical scanning
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Button
                  onClick={() => triggerMutation.mutate()}
                  disabled={triggerMutation.isPending || isRunning || hasActiveWorkers}
                  size="sm"
                  data-testid="button-trigger"
                >
                  {triggerMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Play className="w-4 h-4 mr-2" />
                  )}
                  Run Once
                </Button>
                
                {status?.isAutoRunning ? (
                  <Button
                    onClick={() => autoRunMutation.mutate('stop')}
                    disabled={autoRunMutation.isPending}
                    variant="destructive"
                    size="sm"
                    data-testid="button-stop-auto"
                  >
                    <Square className="w-4 h-4 mr-2" />
                    Stop Workers
                  </Button>
                ) : (
                  <Button
                    onClick={() => autoRunMutation.mutate('start')}
                    disabled={autoRunMutation.isPending}
                    variant="outline"
                    size="sm"
                    data-testid="button-start-auto"
                  >
                    <Play className="w-4 h-4 mr-2" />
                    Start 5 Workers
                  </Button>
                )}
                
                <Button
                  onClick={handleResetToRecentBlocks}
                  disabled={resetToBlockMutation.isPending || status?.isAutoRunning || hasActiveWorkers}
                  variant="outline"
                  size="sm"
                  data-testid="button-reset-recent"
                >
                  {resetToBlockMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <RefreshCw className="w-4 h-4 mr-2" />
                  )}
                  Reset to Last 1M Blocks
                </Button>
              </div>
              
              {workers && workers.workers.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
                  {workers.workers.map((worker) => (
                    <WorkerStatusCard key={worker.workerId} worker={worker} />
                  ))}
                </div>
              )}
              
              {progress && isRunning && !hasActiveWorkers && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Block {progress.currentBlock.toLocaleString()} / {progress.targetBlock.toLocaleString()}</span>
                    <span>{progress.percentComplete.toFixed(1)}%</span>
                  </div>
                  <Progress value={progress.percentComplete} />
                  <div className="text-xs text-muted-foreground">
                    Found {progress.eventsFound} rewards
                  </div>
                </div>
              )}
              
              {indexerProgress && (
                <div className="grid grid-cols-2 gap-4 text-sm border-t pt-4">
                  <div>
                    <span className="text-muted-foreground">Last Block:</span>
                    <span className="ml-2 font-mono">{indexerProgress.lastIndexedBlock.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Events Indexed:</span>
                    <span className="ml-2">{indexerProgress.totalEventsIndexed.toLocaleString()}</span>
                  </div>
                  {indexerProgress.lastError && (
                    <div className="col-span-2 text-red-500 text-xs">
                      Error: {indexerProgress.lastError}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {status?.poolBreakdown && status.poolBreakdown.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sprout className="w-5 h-5 text-green-500" />
                  Rewards by Pool
                </CardTitle>
                <CardDescription>Breakdown of rewards earned across all gardening pools</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pool</TableHead>
                      <TableHead className="text-right">CRYSTAL</TableHead>
                      <TableHead className="text-right">JEWEL</TableHead>
                      <TableHead className="text-right">Rewards</TableHead>
                      <TableHead className="text-right">Heroes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {status.poolBreakdown.map((pool) => (
                      <TableRow key={pool.poolId} data-testid={`row-pool-${pool.poolId}`}>
                        <TableCell className="font-medium">
                          {pool.poolName}
                          {pool.poolId === 255 && (
                            <Badge variant="outline" className="ml-2 text-xs">Unlimited</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-purple-500 font-medium">
                          {formatNumber(pool.crystalAmount)}
                        </TableCell>
                        <TableCell className="text-right text-amber-500 font-medium">
                          {formatNumber(pool.jewelAmount)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {pool.rewardCount.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {pool.uniqueHeroes.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Search Hero Rewards</CardTitle>
              <CardDescription>Look up actual rewards earned by a specific hero</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  type="number"
                  placeholder="Enter Hero ID..."
                  value={heroIdSearch}
                  onChange={(e) => setHeroIdSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearchHero()}
                  className="max-w-xs"
                  data-testid="input-hero-search"
                />
                <Button onClick={handleSearchHero} disabled={heroLoading} data-testid="button-search-hero">
                  {heroLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                </Button>
              </div>

              {heroData && searchedHeroId && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-6 gap-4 p-4 bg-muted/50 rounded-lg">
                    <div>
                      <div className="text-sm text-muted-foreground">Hero ID</div>
                      <div className="font-bold" data-testid="text-hero-id">{heroData.stats.heroId}</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Total Quests</div>
                      <div className="font-bold">{heroData.stats.totalQuests}</div>
                      <div className="text-xs text-muted-foreground">
                        {heroData.stats.manualQuestCount || 0} manual / {heroData.stats.expeditionCount || 0} expedition
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Total CRYSTAL</div>
                      <div className="font-bold text-purple-500">{formatNumber(heroData.stats.totalCrystal)}</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Total JEWEL</div>
                      <div className="font-bold text-amber-500">{formatNumber(heroData.stats.totalJewel)}</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Last Quest</div>
                      <div className="font-bold text-xs">
                        {heroData.stats.lastQuest ? new Date(heroData.stats.lastQuest).toLocaleDateString() : '-'}
                      </div>
                    </div>
                  </div>

                  {heroData.rewards.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Time</TableHead>
                          <TableHead>Source</TableHead>
                          <TableHead>Pool</TableHead>
                          <TableHead>Token</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead>Tx</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {heroData.rewards.slice(0, 20).map((reward) => (
                          <TableRow key={reward.id} data-testid={`row-reward-${reward.id}`}>
                            <TableCell className="text-xs">
                              {new Date(reward.timestamp).toLocaleString()}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={reward.source === 'expedition' ? 'border-blue-500/30 text-blue-500' : 'border-gray-500/30'}>
                                {reward.source === 'expedition' ? 'Expedition' : 'Manual'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">Pool {reward.poolId}</Badge>
                            </TableCell>
                            <TableCell>
                              <Badge className={reward.rewardSymbol === 'CRYSTAL' ? 'bg-purple-500/20 text-purple-500' : reward.rewardSymbol === 'JEWEL' ? 'bg-amber-500/20 text-amber-500' : ''}>
                                {reward.rewardSymbol}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {formatNumber(reward.rewardAmount)}
                            </TableCell>
                            <TableCell className="text-xs font-mono">
                              <a
                                href={`https://subnets.avax.network/defi-kingdoms/tx/${reward.txHash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-500 hover:underline"
                              >
                                {truncateTxHash(reward.txHash)}
                              </a>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="text-center text-muted-foreground py-8">
                      No rewards found for this hero yet
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
