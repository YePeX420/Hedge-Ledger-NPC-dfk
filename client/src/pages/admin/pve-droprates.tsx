import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Play, Square, RefreshCw, Target, Sword, Shield, Percent, Activity, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ChainStatus {
  chainId: number;
  checkpoint: {
    chain_id: number;
    last_indexed_block: string;
    total_completions: number;
    total_rewards: number;
    status: string;
    last_indexed_at: string | null;
    last_error: string | null;
  };
  isAutoRunning: boolean;
}

interface PVEStatus {
  ok: boolean;
  dfk: ChainStatus;
  metis: ChainStatus;
  liveProgress: Record<string, {
    chain: string;
    isRunning: boolean;
    currentBlock: number;
    targetBlock: number;
    startBlock: number;
    eventsFound: number;
    completionsFound: number;
    batchesCompleted: number;
    percentComplete: number;
    startedAt: string | null;
    completedAt: string | null;
    lastError: string | null;
  }>;
}

interface ActivityStats {
  id: number;
  chain_id: number;
  activity_type: string;
  activity_id: number;
  name: string;
  contract_address: string;
  total_completions: string;
  total_rewards: string;
}

interface LootDrop {
  item_address: string;
  item_name: string | null;
  drop_count: string;
  total_completions: string;
  observed_rate: string;
}

function formatNumber(n: number | string): string {
  const num = typeof n === 'string' ? parseFloat(n) : n;
  if (isNaN(num)) return '0';
  if (num >= 1000000) return `${(num / 1000000).toFixed(2)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(2)}K`;
  return num.toLocaleString();
}

function formatBlocks(n: number | string): string {
  const num = typeof n === 'string' ? parseInt(n) : n;
  if (num >= 1000000) return `${(num / 1000000).toFixed(2)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toLocaleString();
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
    running: "bg-blue-500/20 text-blue-500 border-blue-500/30",
    complete: "bg-green-500/20 text-green-500 border-green-500/30",
    error: "bg-red-500/20 text-red-500 border-red-500/30",
  };
  
  return (
    <Badge className={variants[status] || variants.idle}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}

function ChainCard({ 
  chain, 
  chainStatus, 
  liveProgress,
  onStart,
  onStop,
  onRun,
  isStarting,
  isStopping,
  isRunning: isTriggering
}: { 
  chain: 'dfk' | 'metis';
  chainStatus: ChainStatus;
  liveProgress?: PVEStatus['liveProgress'][string];
  onStart: () => void;
  onStop: () => void;
  onRun: () => void;
  isStarting: boolean;
  isStopping: boolean;
  isRunning: boolean;
}) {
  const isChainRunning = liveProgress?.isRunning || chainStatus.isAutoRunning;
  const chainName = chain === 'dfk' ? 'DFK Chain' : 'Metis';
  const activityType = chain === 'dfk' ? 'Hunts' : 'Patrols';
  const ChainIcon = chain === 'dfk' ? Sword : Shield;

  return (
    <Card data-testid={`card-chain-${chain}`}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ChainIcon className="w-5 h-5 text-amber-500" />
            <span>{chainName} - {activityType}</span>
          </div>
          <StatusBadge 
            status={chainStatus.checkpoint.status} 
            isRunning={isChainRunning} 
          />
        </CardTitle>
        <CardDescription>
          Chain ID: {chainStatus.chainId} | {activityType} encounter tracking
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-sm text-muted-foreground">Last Block</div>
            <div className="font-mono font-bold" data-testid={`text-${chain}-last-block`}>
              {formatBlocks(chainStatus.checkpoint.last_indexed_block)}
            </div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Completions</div>
            <div className="font-bold text-green-500" data-testid={`text-${chain}-completions`}>
              {formatNumber(chainStatus.checkpoint.total_completions)}
            </div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Rewards</div>
            <div className="font-bold text-amber-500" data-testid={`text-${chain}-rewards`}>
              {formatNumber(chainStatus.checkpoint.total_rewards)}
            </div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Last Run</div>
            <div className="text-xs">
              {chainStatus.checkpoint.last_indexed_at 
                ? new Date(chainStatus.checkpoint.last_indexed_at).toLocaleString()
                : 'Never'}
            </div>
          </div>
        </div>

        {liveProgress && liveProgress.isRunning && (
          <div className="space-y-2 p-3 bg-muted/50 rounded-lg">
            <div className="flex justify-between text-sm">
              <span>Block {formatBlocks(liveProgress.currentBlock)} / {formatBlocks(liveProgress.targetBlock)}</span>
              <span>{liveProgress.percentComplete.toFixed(1)}%</span>
            </div>
            <Progress value={liveProgress.percentComplete} />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Completions: {liveProgress.completionsFound}</span>
              <span>Rewards: {liveProgress.eventsFound}</span>
            </div>
          </div>
        )}

        {chainStatus.checkpoint.last_error && (
          <div className="flex items-center gap-2 p-2 bg-red-500/10 rounded text-red-500 text-sm">
            <AlertCircle className="w-4 h-4" />
            {chainStatus.checkpoint.last_error}
          </div>
        )}

        <div className="flex gap-2">
          <Button
            onClick={onRun}
            disabled={isTriggering || isChainRunning}
            size="sm"
            data-testid={`button-${chain}-run`}
          >
            {isTriggering ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Play className="w-4 h-4 mr-2" />
            )}
            Run Batch
          </Button>
          
          {chainStatus.isAutoRunning ? (
            <Button
              onClick={onStop}
              disabled={isStopping}
              variant="destructive"
              size="sm"
              data-testid={`button-${chain}-stop`}
            >
              {isStopping ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Square className="w-4 h-4 mr-2" />
              )}
              Stop Auto
            </Button>
          ) : (
            <Button
              onClick={onStart}
              disabled={isStarting}
              variant="outline"
              size="sm"
              data-testid={`button-${chain}-start`}
            >
              {isStarting ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Play className="w-4 h-4 mr-2" />
              )}
              Start Auto
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ActivityTable({ activities, type }: { activities: ActivityStats[]; type: 'hunt' | 'patrol' }) {
  const [selectedActivityId, setSelectedActivityId] = useState<number | null>(null);
  
  const { data: lootResponse, isLoading: lootLoading } = useQuery<{ ok: boolean; loot: LootDrop[] }>({
    queryKey: [`/api/pve/loot/${selectedActivityId}`],
    enabled: selectedActivityId !== null,
  });
  const lootData = lootResponse?.loot || [];

  if (activities.length === 0) {
    return (
      <div className="text-center p-8 text-muted-foreground">
        No {type}s indexed yet. Start the indexer to begin collecting data.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ID</TableHead>
            <TableHead>Name</TableHead>
            <TableHead className="text-right">Completions</TableHead>
            <TableHead className="text-right">Rewards</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {activities.map((activity) => (
            <TableRow 
              key={activity.id} 
              data-testid={`row-activity-${activity.id}`}
              className={selectedActivityId === activity.id ? 'bg-muted/50' : ''}
            >
              <TableCell className="font-mono">{activity.activity_id}</TableCell>
              <TableCell className="font-medium">{activity.name}</TableCell>
              <TableCell className="text-right">{formatNumber(activity.total_completions)}</TableCell>
              <TableCell className="text-right">{formatNumber(activity.total_rewards)}</TableCell>
              <TableCell>
                <Button
                  variant={selectedActivityId === activity.id ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => setSelectedActivityId(
                    selectedActivityId === activity.id ? null : activity.id
                  )}
                  data-testid={`button-view-loot-${activity.id}`}
                >
                  {selectedActivityId === activity.id ? 'Hide Loot' : 'View Loot'}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {selectedActivityId && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Percent className="w-4 h-4" />
              Drop Rates for {activities.find(a => a.id === selectedActivityId)?.name}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {lootLoading ? (
              <div className="flex items-center justify-center p-4">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : lootData && lootData.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Drops</TableHead>
                    <TableHead className="text-right">Sample Size</TableHead>
                    <TableHead className="text-right">Observed Rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lootData.map((loot, idx) => (
                    <TableRow key={idx} data-testid={`row-loot-${idx}`}>
                      <TableCell className="font-mono text-xs">
                        {loot.item_name || loot.item_address.slice(0, 10) + '...'}
                      </TableCell>
                      <TableCell className="text-right">{formatNumber(loot.drop_count)}</TableCell>
                      <TableCell className="text-right">{formatNumber(loot.total_completions)}</TableCell>
                      <TableCell className="text-right font-bold">
                        {(parseFloat(loot.observed_rate) * 100).toFixed(2)}%
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center p-4 text-muted-foreground">
                No loot data available for this activity yet.
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function AdminPVEDropRates() {
  const { toast } = useToast();
  const [activeChain, setActiveChain] = useState<'dfk' | 'metis'>('dfk');

  const { data: status, isLoading: statusLoading, refetch: refetchStatus } = useQuery<PVEStatus>({
    queryKey: ['/api/admin/pve/status'],
    refetchInterval: 3000,
  });

  const { data: huntsData } = useQuery<{ ok: boolean; hunts: ActivityStats[] }>({
    queryKey: ['/api/pve/hunts'],
  });

  const { data: patrolsData } = useQuery<{ ok: boolean; patrols: ActivityStats[] }>({
    queryKey: ['/api/pve/patrols'],
  });
  
  const hunts = huntsData?.hunts || [];
  const patrols = patrolsData?.patrols || [];

  const runMutation = useMutation({
    mutationFn: async (chain: string) => {
      return await apiRequest("POST", `/api/admin/pve/run/${chain}`, {});
    },
    onSuccess: (_, chain) => {
      toast({ title: `${chain.toUpperCase()} indexer batch started` });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/pve/status'] });
    },
    onError: (error: any) => {
      toast({ title: "Failed to run indexer", description: error.message, variant: "destructive" });
    },
  });

  const startMutation = useMutation({
    mutationFn: async (chain: string) => {
      return await apiRequest("POST", `/api/admin/pve/start/${chain}`, {});
    },
    onSuccess: (_, chain) => {
      toast({ title: `${chain.toUpperCase()} auto-run started` });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/pve/status'] });
    },
    onError: (error: any) => {
      toast({ title: "Failed to start auto-run", description: error.message, variant: "destructive" });
    },
  });

  const stopMutation = useMutation({
    mutationFn: async (chain: string) => {
      return await apiRequest("POST", `/api/admin/pve/stop/${chain}`, {});
    },
    onSuccess: (_, chain) => {
      toast({ title: `${chain.toUpperCase()} auto-run stopped` });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/pve/status'] });
    },
    onError: (error: any) => {
      toast({ title: "Failed to stop auto-run", description: error.message, variant: "destructive" });
    },
  });

  const totalCompletions = (status?.dfk?.checkpoint?.total_completions || 0) + 
                           (status?.metis?.checkpoint?.total_completions || 0);
  const totalRewards = (status?.dfk?.checkpoint?.total_rewards || 0) + 
                       (status?.metis?.checkpoint?.total_rewards || 0);

  return (
    <div className="space-y-6" data-testid="page-pve-droprates">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Target className="w-6 h-6 text-red-500" />
            PVE Drop Rates
          </h1>
          <p className="text-muted-foreground">
            Track Hunts (DFK Chain) and Patrols (Metis) with Scavenger pet detection
          </p>
        </div>
        <Button variant="outline" size="icon" onClick={() => refetchStatus()} data-testid="button-refresh">
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {statusLoading ? (
        <div className="flex items-center justify-center p-8">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : status ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Sword className="w-4 h-4 text-amber-500" />
                  DFK Hunts
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-dfk-total">
                  {formatNumber(status.dfk?.checkpoint?.total_completions || 0)}
                </div>
                <div className="text-xs text-muted-foreground">completions</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Shield className="w-4 h-4 text-blue-500" />
                  Metis Patrols
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-metis-total">
                  {formatNumber(status.metis?.checkpoint?.total_completions || 0)}
                </div>
                <div className="text-xs text-muted-foreground">completions</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Activity className="w-4 h-4 text-green-500" />
                  Total Encounters
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-500" data-testid="text-total-encounters">
                  {formatNumber(totalCompletions)}
                </div>
                <div className="text-xs text-muted-foreground">indexed</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Percent className="w-4 h-4 text-purple-500" />
                  Total Drops
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-purple-500" data-testid="text-total-drops">
                  {formatNumber(totalRewards)}
                </div>
                <div className="text-xs text-muted-foreground">reward events</div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChainCard
              chain="dfk"
              chainStatus={status.dfk}
              liveProgress={status.liveProgress?.dfk}
              onStart={() => startMutation.mutate('dfk')}
              onStop={() => stopMutation.mutate('dfk')}
              onRun={() => runMutation.mutate('dfk')}
              isStarting={startMutation.isPending}
              isStopping={stopMutation.isPending}
              isRunning={runMutation.isPending}
            />
            <ChainCard
              chain="metis"
              chainStatus={status.metis}
              liveProgress={status.liveProgress?.metis}
              onStart={() => startMutation.mutate('metis')}
              onStop={() => stopMutation.mutate('metis')}
              onRun={() => runMutation.mutate('metis')}
              isStarting={startMutation.isPending}
              isStopping={stopMutation.isPending}
              isRunning={runMutation.isPending}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Activity Drop Rates</CardTitle>
              <CardDescription>
                View indexed activities and their loot drop statistics
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs value={activeChain} onValueChange={(v) => setActiveChain(v as 'dfk' | 'metis')}>
                <TabsList className="mb-4">
                  <TabsTrigger value="dfk" data-testid="tab-hunts">
                    <Sword className="w-4 h-4 mr-2" />
                    Hunts ({hunts?.length || 0})
                  </TabsTrigger>
                  <TabsTrigger value="metis" data-testid="tab-patrols">
                    <Shield className="w-4 h-4 mr-2" />
                    Patrols ({patrols?.length || 0})
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="dfk">
                  <ActivityTable activities={hunts || []} type="hunt" />
                </TabsContent>
                <TabsContent value="metis">
                  <ActivityTable activities={patrols || []} type="patrol" />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="flex items-center justify-center p-8">
            <div className="text-center text-muted-foreground">
              <AlertCircle className="w-8 h-8 mx-auto mb-2" />
              Failed to load PVE status
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
