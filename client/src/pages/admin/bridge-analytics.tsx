import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { ArrowDownRight, ArrowUpRight, RefreshCw, Search, TrendingDown, Users, Activity, AlertTriangle, Play, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface BridgeOverview {
  events: {
    total: number;
    in: number;
    out: number;
    heroes: number;
    items: number;
    totalUsdIn: number;
    totalUsdOut: number;
  };
  metrics: {
    trackedWallets: number;
    totalExtracted: number;
    extractorCount: number;
  };
  chain: {
    latestBlock: number;
  };
}

interface Extractor {
  id: number;
  wallet: string;
  playerId: number | null;
  totalBridgedInUsd: string;
  totalBridgedOutUsd: string;
  netExtractedUsd: string;
  heroesIn: number;
  heroesOut: number;
  extractorScore: string;
  extractorFlags: string[];
  totalTransactions: number;
  lastBridgeAt: string;
}

interface WalletDetails {
  summary: Extractor | null;
  events: Array<{
    id: number;
    bridgeType: string;
    direction: string;
    tokenSymbol: string;
    amount: string | null;
    usdValue: string | null;
    blockTimestamp: string;
    txHash: string;
  }>;
}

export default function BridgeAnalytics() {
  const { toast } = useToast();
  const [walletSearch, setWalletSearch] = useState('');
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);

  const { data: overview, isLoading: overviewLoading, isError: overviewError, refetch: refetchOverview } = useQuery<BridgeOverview>({
    queryKey: ['/api/admin/bridge/overview'],
  });

  const { data: extractors, isLoading: extractorsLoading, isError: extractorsError } = useQuery<Extractor[]>({
    queryKey: ['/api/admin/bridge/extractors'],
  });
  
  const safeOverview = overview && !('error' in overview) ? overview : null;
  const safeExtractors = Array.isArray(extractors) ? extractors : [];

  const { data: walletDetails, isLoading: walletLoading } = useQuery<WalletDetails>({
    queryKey: ['/api/admin/bridge/wallet', selectedWallet],
    enabled: !!selectedWallet,
  });

  const indexWalletMutation = useMutation({
    mutationFn: async (wallet: string) => {
      return apiRequest('POST', '/api/admin/bridge/index-wallet', { wallet });
    },
    onSuccess: () => {
      toast({ title: 'Wallet indexed successfully' });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/bridge'] });
    },
    onError: () => {
      toast({ title: 'Failed to index wallet', variant: 'destructive' });
    },
  });

  const refreshMetricsMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', '/api/admin/bridge/refresh-metrics');
    },
    onSuccess: () => {
      toast({ title: 'Metrics refreshed' });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/bridge'] });
    },
  });

  const { data: indexerStatus } = useQuery<{ running: boolean }>({
    queryKey: ['/api/admin/bridge/indexer-status'],
    refetchInterval: 5000,
  });

  const runIndexerMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', '/api/admin/bridge/run-indexer');
    },
    onSuccess: () => {
      toast({ title: 'Bridge indexer started', description: 'Scanning last 100k blocks (~2-3 days). This may take several minutes.' });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/bridge/indexer-status'] });
    },
    onError: (err: any) => {
      if (err?.message?.includes('409')) {
        toast({ title: 'Indexer already running', variant: 'destructive' });
      } else {
        toast({ title: 'Failed to start indexer', variant: 'destructive' });
      }
    },
  });

  const handleSearch = () => {
    if (walletSearch.trim()) {
      indexWalletMutation.mutate(walletSearch.trim());
      setSelectedWallet(walletSearch.trim().toLowerCase());
    }
  };

  const formatUsd = (value: number | string) => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };

  const shortenAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  return (
    <div className="p-6 space-y-6" data-testid="bridge-analytics">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Bridge Analytics</h1>
          <p className="text-muted-foreground">Track cross-chain bridge flows and identify extractors</p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => runIndexerMutation.mutate()}
            disabled={runIndexerMutation.isPending || indexerStatus?.running}
            data-testid="button-run-indexer"
          >
            {indexerStatus?.running ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Play className="h-4 w-4 mr-2" />
            )}
            {indexerStatus?.running ? 'Indexer Running...' : 'Run Indexer'}
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => refreshMetricsMutation.mutate()}
            disabled={refreshMetricsMutation.isPending}
            data-testid="button-refresh-metrics"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshMetricsMutation.isPending ? 'animate-spin' : ''}`} />
            Refresh Metrics
          </Button>
        </div>
      </div>

      {/* Overview Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">Bridge Events</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {overviewLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className="text-2xl font-bold" data-testid="stat-total-events">
                  {safeOverview?.events?.total ?? 0}
                </div>
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <ArrowDownRight className="h-3 w-3 text-green-500" /> 
                    {safeOverview?.events?.in ?? 0} in
                  </span>
                  <span className="flex items-center gap-1">
                    <ArrowUpRight className="h-3 w-3 text-red-500" /> 
                    {safeOverview?.events?.out ?? 0} out
                  </span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">Total Bridged In</CardTitle>
            <ArrowDownRight className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            {overviewLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold text-green-600" data-testid="stat-bridged-in">
                {formatUsd(safeOverview?.events?.totalUsdIn ?? 0)}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">Total Bridged Out</CardTitle>
            <ArrowUpRight className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            {overviewLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold text-red-600" data-testid="stat-bridged-out">
                {formatUsd(safeOverview?.events?.totalUsdOut ?? 0)}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">Extractors Identified</CardTitle>
            <AlertTriangle className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            {overviewLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className="text-2xl font-bold text-orange-600" data-testid="stat-extractors">
                  {safeOverview?.metrics?.extractorCount ?? 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatUsd(safeOverview?.metrics?.totalExtracted ?? 0)} extracted
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Wallet Search */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Analyze Wallet</CardTitle>
          <CardDescription>Enter a wallet address to index and analyze bridge activity</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="0x..."
              value={walletSearch}
              onChange={(e) => setWalletSearch(e.target.value)}
              className="font-mono"
              data-testid="input-wallet-search"
            />
            <Button 
              onClick={handleSearch}
              disabled={indexWalletMutation.isPending}
              data-testid="button-search-wallet"
            >
              <Search className="h-4 w-4 mr-2" />
              {indexWalletMutation.isPending ? 'Indexing...' : 'Analyze'}
            </Button>
          </div>

          {selectedWallet && walletDetails && (
            <div className="mt-4 space-y-4">
              <Separator />
              {walletDetails.summary ? (
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <p className="text-sm text-muted-foreground">Total In</p>
                    <p className="text-xl font-semibold text-green-600">
                      {formatUsd(walletDetails.summary.totalBridgedInUsd)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Out</p>
                    <p className="text-xl font-semibold text-red-600">
                      {formatUsd(walletDetails.summary.totalBridgedOutUsd)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Net Extracted</p>
                    <p className={`text-xl font-semibold ${parseFloat(walletDetails.summary.netExtractedUsd) > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                      {formatUsd(walletDetails.summary.netExtractedUsd)}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground">No bridge activity found for this wallet</p>
              )}

              {walletDetails.events.length > 0 && (
                <ScrollArea className="h-[300px]">
                  <div className="space-y-2">
                    {walletDetails.events.map((event) => (
                      <div key={event.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                        <div className="flex items-center gap-3">
                          {event.direction === 'in' ? (
                            <ArrowDownRight className="h-4 w-4 text-green-500" />
                          ) : (
                            <ArrowUpRight className="h-4 w-4 text-red-500" />
                          )}
                          <div>
                            <p className="text-sm font-medium">
                              {event.tokenSymbol} {event.bridgeType}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatDate(event.blockTimestamp)}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          {event.usdValue && (
                            <p className={`text-sm font-medium ${event.direction === 'in' ? 'text-green-600' : 'text-red-600'}`}>
                              {formatUsd(event.usdValue)}
                            </p>
                          )}
                          {event.amount && (
                            <p className="text-xs text-muted-foreground">
                              {parseFloat(event.amount).toFixed(2)} {event.tokenSymbol}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top Extractors */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingDown className="h-5 w-5 text-orange-500" />
            Top Extractors
          </CardTitle>
          <CardDescription>Wallets with highest net value extracted from DFK Chain</CardDescription>
        </CardHeader>
        <CardContent>
          {extractorsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : safeExtractors.length > 0 ? (
            <ScrollArea className="h-[400px]">
              <div className="space-y-2">
                {safeExtractors.map((extractor, index) => (
                  <div 
                    key={extractor.id} 
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50 cursor-pointer hover-elevate"
                    onClick={() => setSelectedWallet(extractor.wallet)}
                    data-testid={`extractor-row-${index}`}
                  >
                    <div className="flex items-center gap-4">
                      <span className="text-lg font-bold text-muted-foreground w-8">
                        #{index + 1}
                      </span>
                      <div>
                        <p className="font-mono text-sm">{shortenAddress(extractor.wallet)}</p>
                        <div className="flex gap-2 mt-1">
                          {extractor.extractorFlags?.map((flag) => (
                            <Badge key={flag} variant="outline" className="text-xs">
                              {flag.replace(/_/g, ' ')}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-orange-600">
                        {formatUsd(extractor.netExtractedUsd)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Score: {extractor.extractorScore}/10
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <p>No extractors identified yet</p>
              <p className="text-sm">Index some wallets to start tracking</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
