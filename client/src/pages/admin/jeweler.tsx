import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Play, Zap, Square, RefreshCw, Gem, TrendingUp, Users, Coins } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface JewelerStats {
  totalStakers: number;
  totalJewelLocked: number;
  totalCjewelSupply: number;
  currentRatio: number;
  apr: number;
  apr7d: number;
  apr30d: number;
  indexerProgress: {
    indexerName: string;
    lastIndexedBlock: number;
    genesisBlock: number;
    status: string;
    totalEventsIndexed: number;
    totalStakersFound: number;
    lastError: string | null;
    updatedAt: string;
  } | null;
  liveProgress: {
    isRunning: boolean;
    currentBlock: number;
    targetBlock: number;
    eventsFound: number;
    stakersFound: number;
    percentComplete: number;
    startedAt: string | null;
    completedAt: string | null;
  } | null;
  isAutoRunning: boolean;
}

interface JewelerStaker {
  id: number;
  wallet: string;
  stakedJewel: string;
  cjewelBalance: string;
  summonerName: string | null;
  lockEnd: string | null;
  lastActivityType: string | null;
  lastActivityAmount: string | null;
  lastActivityBlock: number | null;
  lastUpdatedAt: string;
}

function formatNumber(n: number | string): string {
  const num = typeof n === 'string' ? parseFloat(n) : n;
  if (isNaN(num)) return '0';
  if (num >= 1000000) return `${(num / 1000000).toFixed(2)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(2)}K`;
  return num.toFixed(2);
}

function formatPercent(n: number): string {
  if (isNaN(n) || !isFinite(n)) return '0.00%';
  return `${n.toFixed(2)}%`;
}

function truncateAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
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

export default function AdminJeweler() {
  const { toast } = useToast();
  
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery<JewelerStats>({
    queryKey: ['/api/admin/jeweler/status'],
    refetchInterval: 3000,
  });
  
  const { data: leaderboardData, isLoading: leaderboardLoading } = useQuery<{ stakers: JewelerStaker[], count: number }>({
    queryKey: ['/api/admin/jeweler/leaderboard'],
    refetchInterval: 30000,
  });
  
  const triggerMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/admin/jeweler/trigger", {});
    },
    onSuccess: () => {
      toast({ title: "Jeweler indexer triggered" });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/jeweler/status'] });
    },
    onError: (error: any) => {
      toast({ title: "Failed to trigger indexer", description: error.message, variant: "destructive" });
    },
  });
  
  const autoRunMutation = useMutation({
    mutationFn: async (action: 'start' | 'stop') => {
      return await apiRequest("POST", "/api/admin/jeweler/auto-run", { action });
    },
    onSuccess: (_, action) => {
      toast({ title: `Auto-run ${action === 'start' ? 'started' : 'stopped'}` });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/jeweler/status'] });
    },
    onError: (error: any) => {
      toast({ title: "Failed to manage auto-run", description: error.message, variant: "destructive" });
    },
  });
  
  const refreshBalancesMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/admin/jeweler/refresh-balances", {});
    },
    onSuccess: () => {
      toast({ 
        title: "Balance refresh started", 
        description: "Fetching live balances and summoner names for all stakers. This may take a few minutes - refresh the page to see updates." 
      });
    },
    onError: (error: any) => {
      toast({ title: "Failed to start balance refresh", description: error.message, variant: "destructive" });
    },
  });
  
  const isRunning = stats?.liveProgress?.isRunning || false;
  const percentComplete = stats?.liveProgress?.percentComplete || 0;
  
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="page-title">
            <Gem className="w-6 h-6 text-purple-500" />
            Jeweler
          </h1>
          <p className="text-muted-foreground">cJEWEL staking analytics and leaderboard</p>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => refetchStats()}
          data-testid="button-refresh"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Coins className="w-4 h-4" />
              JEWEL Locked
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold" data-testid="text-jewel-locked">
              {statsLoading ? '...' : formatNumber(stats?.totalJewelLocked || 0)}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatNumber(stats?.totalCjewelSupply || 0)} cJEWEL supply
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="w-4 h-4" />
              Total Stakers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold" data-testid="text-total-stakers">
              {statsLoading ? '...' : (stats?.totalStakers || 0).toLocaleString()}
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              cJEWEL/JEWEL Ratio
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold" data-testid="text-ratio">
              {statsLoading ? '...' : (stats?.currentRatio || 1).toFixed(6)}
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-green-500" />
              APR
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-500" data-testid="text-apr">
              {statsLoading ? '...' : formatPercent(stats?.apr7d || 0)}
            </p>
            <p className="text-xs text-muted-foreground">
              30d: {formatPercent(stats?.apr30d || 0)}
            </p>
          </CardContent>
        </Card>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Indexer Status</CardTitle>
          <CardDescription>
            Tracks cJEWEL minting/burning events to build staker leaderboard
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <StatusBadge 
                status={stats?.indexerProgress?.status || 'idle'} 
                isRunning={isRunning} 
              />
              {stats?.isAutoRunning && (
                <Badge variant="outline" className="bg-purple-500/20 text-purple-500 border-purple-500/30 gap-1">
                  <Zap className="w-3 h-3" />
                  Auto-run
                </Badge>
              )}
              {isRunning && (
                <div className="flex items-center gap-2">
                  <Progress value={percentComplete} className="w-32 h-2" />
                  <span className="text-sm text-muted-foreground">
                    {percentComplete.toFixed(1)}%
                  </span>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => triggerMutation.mutate()}
                disabled={isRunning || triggerMutation.isPending}
                data-testid="button-trigger"
              >
                {triggerMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Play className="w-4 h-4 mr-2" />
                )}
                Run Now
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => refreshBalancesMutation.mutate()}
                disabled={refreshBalancesMutation.isPending}
                data-testid="button-refresh-balances"
              >
                {refreshBalancesMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                Refresh Balances
              </Button>
              <Button
                size="sm"
                variant={stats?.isAutoRunning ? "destructive" : "outline"}
                onClick={() => autoRunMutation.mutate(stats?.isAutoRunning ? 'stop' : 'start')}
                disabled={autoRunMutation.isPending}
                data-testid="button-auto-run"
              >
                {stats?.isAutoRunning ? (
                  <>
                    <Square className="w-4 h-4 mr-2" />
                    Stop Auto
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 mr-2" />
                    Auto Run
                  </>
                )}
              </Button>
            </div>
          </div>
          
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Last Block</p>
              <p className="font-mono" data-testid="text-last-block">
                {stats?.indexerProgress?.lastIndexedBlock?.toLocaleString() || 0}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Events Indexed</p>
              <p className="font-mono" data-testid="text-events-indexed">
                {stats?.indexerProgress?.totalEventsIndexed?.toLocaleString() || 0}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Stakers Found</p>
              <p className="font-mono" data-testid="text-stakers-found">
                {stats?.indexerProgress?.totalStakersFound?.toLocaleString() || 0}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Top cJEWEL Holders</CardTitle>
          <CardDescription>
            Leaderboard of wallets with the most cJEWEL staked
          </CardDescription>
        </CardHeader>
        <CardContent>
          {leaderboardLoading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Wallet</TableHead>
                  <TableHead>Summoner</TableHead>
                  <TableHead className="text-right">cJEWEL</TableHead>
                  <TableHead className="text-right">JEWEL Value</TableHead>
                  <TableHead className="text-right">Lock End</TableHead>
                  <TableHead className="text-right">Last Activity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(leaderboardData?.stakers || []).slice(0, 50).map((staker, idx) => (
                  <TableRow key={staker.id} data-testid={`row-staker-${staker.id}`}>
                    <TableCell className="font-mono text-muted-foreground">
                      {idx + 1}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      <a 
                        href={`https://subnets.avax.network/defi-kingdoms/address/${staker.wallet}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-500 hover:underline"
                      >
                        {truncateAddress(staker.wallet)}
                      </a>
                    </TableCell>
                    <TableCell>
                      {staker.summonerName || (
                        <span className="text-muted-foreground">*</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatNumber(staker.cjewelBalance)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-green-500">
                      {formatNumber(staker.stakedJewel)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {staker.lockEnd ? (
                        <span className={new Date(staker.lockEnd) > new Date() ? 'text-yellow-500' : 'text-muted-foreground'}>
                          {new Date(staker.lockEnd).toLocaleDateString()}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {staker.lastActivityType && (
                        <Badge variant="outline" className={
                          staker.lastActivityType === 'Deposit' 
                            ? 'bg-green-500/20 text-green-500 border-green-500/30'
                            : 'bg-red-500/20 text-red-500 border-red-500/30'
                        }>
                          {staker.lastActivityType}
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {(!leaderboardData?.stakers || leaderboardData.stakers.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No stakers found. Run the indexer to populate data.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
