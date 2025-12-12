import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { 
  ArrowDownRight, 
  ArrowUpRight, 
  TrendingDown, 
  TrendingUp,
  Users, 
  AlertTriangle,
  DollarSign,
  Wallet,
  ExternalLink
} from 'lucide-react';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, PieChart as RechartsPieChart, Pie, Legend } from 'recharts';

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

const chartConfig: ChartConfig = {
  bridgedIn: {
    label: 'Bridged In',
    color: 'hsl(var(--chart-1))',
  },
  bridgedOut: {
    label: 'Bridged Out',
    color: 'hsl(var(--chart-2))',
  },
  netFlow: {
    label: 'Net Flow',
    color: 'hsl(var(--chart-3))',
  },
  extracted: {
    label: 'Extracted',
    color: 'hsl(var(--chart-4))',
  },
  value: {
    label: 'Value',
    color: 'hsl(var(--chart-1))',
  },
};

export default function ExtractorsAnalysis() {
  const { data: overview, isLoading: overviewLoading } = useQuery<BridgeOverview>({
    queryKey: ['/api/admin/bridge/overview'],
  });

  const { data: extractors, isLoading: extractorsLoading } = useQuery<Extractor[]>({
    queryKey: ['/api/admin/bridge/extractors'],
  });

  const safeOverview = overview && !('error' in overview) ? overview : null;
  const safeExtractors = Array.isArray(extractors) ? extractors : [];

  const formatUsd = (value: number | string) => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (num >= 1_000_000_000) {
      return `$${(num / 1_000_000_000).toFixed(2)}B`;
    }
    if (num >= 1_000_000) {
      return `$${(num / 1_000_000).toFixed(2)}M`;
    }
    if (num >= 1_000) {
      return `$${(num / 1_000).toFixed(2)}K`;
    }
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
  };

  const formatFullUsd = (value: number | string) => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(num);
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

  const bridgedIn = safeOverview?.events?.totalUsdIn || 0;
  const bridgedOut = safeOverview?.events?.totalUsdOut || 0;
  const netFlow = bridgedIn - bridgedOut;
  const extractorCount = safeOverview?.metrics?.extractorCount || 0;
  const totalExtracted = safeOverview?.metrics?.totalExtracted || 0;

  const flowChartData = [
    { name: 'Bridged In', value: bridgedIn, fill: 'hsl(var(--chart-1))' },
    { name: 'Bridged Out', value: bridgedOut, fill: 'hsl(var(--chart-2))' },
  ];

  const topExtractorChartData = safeExtractors.slice(0, 10).map((e, i) => ({
    name: shortenAddress(e.wallet),
    extracted: parseFloat(e.netExtractedUsd),
    fill: `hsl(var(--chart-${(i % 5) + 1}))`,
  }));

  return (
    <div className="p-6 space-y-6" data-testid="extractors-analysis">
      <div>
        <h1 className="text-2xl font-bold">Extractor Analysis</h1>
        <p className="text-muted-foreground">Analyze bridge flow delta and identify value extractors</p>
      </div>

      {overviewLoading ? (
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <>
          {/* Flow Summary Cards */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card data-testid="card-bridged-in">
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-sm font-medium">Bridged In</CardTitle>
                <ArrowDownRight className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600" data-testid="text-bridged-in">
                  {formatUsd(bridgedIn)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {safeOverview?.events?.in?.toLocaleString() || 0} events
                </p>
              </CardContent>
            </Card>

            <Card data-testid="card-bridged-out">
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-sm font-medium">Bridged Out</CardTitle>
                <ArrowUpRight className="h-4 w-4 text-red-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600" data-testid="text-bridged-out">
                  {formatUsd(bridgedOut)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {safeOverview?.events?.out?.toLocaleString() || 0} events
                </p>
              </CardContent>
            </Card>

            <Card data-testid="card-net-flow">
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-sm font-medium">Net Flow (Delta)</CardTitle>
                {netFlow >= 0 ? (
                  <TrendingUp className="h-4 w-4 text-green-500" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-red-500" />
                )}
              </CardHeader>
              <CardContent>
                <div 
                  className={`text-2xl font-bold ${netFlow >= 0 ? 'text-green-600' : 'text-red-600'}`}
                  data-testid="text-net-flow"
                >
                  {netFlow >= 0 ? '+' : ''}{formatUsd(netFlow)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {netFlow >= 0 ? 'Net inflow to DFK' : 'Net outflow from DFK'}
                </p>
              </CardContent>
            </Card>

            <Card data-testid="card-extractors">
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-sm font-medium">Extractors Identified</CardTitle>
                <AlertTriangle className="h-4 w-4 text-amber-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-extractor-count">
                  {extractorCount.toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatUsd(totalExtracted)} total extracted
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Flow Breakdown Chart */}
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Bridge Flow Breakdown</CardTitle>
                <CardDescription>Total USD value bridged in vs out</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ChartContainer config={chartConfig} className="h-full w-full">
                    <RechartsPieChart>
                      <Pie
                        data={flowChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        dataKey="value"
                        nameKey="name"
                        label={({ name, value }) => `${name}: ${formatUsd(value)}`}
                        labelLine={true}
                      >
                        {flowChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Pie>
                      <ChartTooltip content={<ChartTooltipContent formatter={(value) => formatFullUsd(value as number)} />} />
                      <Legend />
                    </RechartsPieChart>
                  </ChartContainer>
                </div>
                <div className="mt-4 p-4 bg-muted/50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Retention Rate</span>
                    <span className="text-lg font-bold">
                      {bridgedIn > 0 ? ((netFlow / bridgedIn) * 100).toFixed(1) : 0}%
                    </span>
                  </div>
                  <Progress 
                    value={bridgedIn > 0 ? Math.max(0, (netFlow / bridgedIn) * 100) : 0} 
                    className="mt-2 h-2"
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    Percentage of bridged-in value retained in DFK
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Top 10 Extractors</CardTitle>
                <CardDescription>Wallets with highest net extraction</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  {topExtractorChartData.length > 0 ? (
                    <ChartContainer config={chartConfig} className="h-full w-full">
                      <BarChart 
                        data={topExtractorChartData} 
                        layout="vertical"
                        margin={{ left: 80, right: 20, top: 10, bottom: 10 }}
                      >
                        <XAxis type="number" tickFormatter={(v) => formatUsd(v)} />
                        <YAxis type="category" dataKey="name" width={75} tick={{ fontSize: 11 }} />
                        <ChartTooltip content={<ChartTooltipContent formatter={(value) => formatFullUsd(value as number)} />} />
                        <Bar dataKey="extracted" radius={4}>
                          {topExtractorChartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ChartContainer>
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                      No extractor data available
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* Extractors Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            All Extractors
          </CardTitle>
          <CardDescription>
            Wallets that have extracted more value than they brought in (net extracted &gt; $100)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {extractorsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : safeExtractors.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No extractors identified yet. Run the bridge indexer and metrics refresh.
            </div>
          ) : (
            <ScrollArea className="h-[500px]">
              <div className="space-y-1">
                {/* Header */}
                <div className="grid grid-cols-7 gap-2 px-3 py-2 text-xs font-medium text-muted-foreground bg-muted/50 rounded-md">
                  <div>Wallet</div>
                  <div className="text-right">Bridged In</div>
                  <div className="text-right">Bridged Out</div>
                  <div className="text-right">Net Extracted</div>
                  <div className="text-right">Heroes In/Out</div>
                  <div className="text-center">Flags</div>
                  <div className="text-right">Last Bridge</div>
                </div>
                <Separator />
                
                {safeExtractors.map((extractor) => {
                  const netExtracted = parseFloat(extractor.netExtractedUsd);
                  const isMajor = extractor.extractorFlags?.includes('major_extractor');
                  const isSignificant = extractor.extractorFlags?.includes('significant_extractor');
                  
                  return (
                    <div 
                      key={extractor.id}
                      className="grid grid-cols-7 gap-2 px-3 py-3 text-sm items-center hover-elevate rounded-md"
                      data-testid={`row-extractor-${extractor.id}`}
                    >
                      <div className="flex items-center gap-2">
                        <Wallet className="h-4 w-4 text-muted-foreground" />
                        <a 
                          href={`https://subnets.avax.network/defi-kingdoms/address/${extractor.wallet}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-xs hover:underline flex items-center gap-1"
                          data-testid={`link-wallet-${extractor.id}`}
                        >
                          {shortenAddress(extractor.wallet)}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                      <div className="text-right text-green-600 font-medium">
                        {formatUsd(extractor.totalBridgedInUsd)}
                      </div>
                      <div className="text-right text-red-600 font-medium">
                        {formatUsd(extractor.totalBridgedOutUsd)}
                      </div>
                      <div className={`text-right font-bold ${netExtracted > 0 ? 'text-amber-600' : 'text-foreground'}`}>
                        {formatUsd(netExtracted)}
                      </div>
                      <div className="text-right text-muted-foreground">
                        {extractor.heroesIn} / {extractor.heroesOut}
                      </div>
                      <div className="flex justify-center gap-1 flex-wrap">
                        {isMajor && (
                          <Badge variant="destructive" className="text-xs">
                            Major
                          </Badge>
                        )}
                        {isSignificant && !isMajor && (
                          <Badge variant="secondary" className="text-xs">
                            Significant
                          </Badge>
                        )}
                        {!isMajor && !isSignificant && (
                          <Badge variant="outline" className="text-xs">
                            Net
                          </Badge>
                        )}
                      </div>
                      <div className="text-right text-muted-foreground text-xs">
                        {extractor.lastBridgeAt ? formatDate(extractor.lastBridgeAt) : '-'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Flow Summary Stats */}
      <Card>
        <CardHeader>
          <CardTitle>Flow Statistics</CardTitle>
          <CardDescription>Detailed breakdown of bridge activity</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="h-5 w-5 text-green-500" />
                <span className="text-sm font-medium">Total Value Bridged In</span>
              </div>
              <p className="text-2xl font-bold">{formatFullUsd(bridgedIn)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Across {safeOverview?.events?.in?.toLocaleString() || 0} transactions
              </p>
            </div>
            <div className="p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="h-5 w-5 text-red-500" />
                <span className="text-sm font-medium">Total Value Bridged Out</span>
              </div>
              <p className="text-2xl font-bold">{formatFullUsd(bridgedOut)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Across {safeOverview?.events?.out?.toLocaleString() || 0} transactions
              </p>
            </div>
            <div className="p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                {netFlow >= 0 ? (
                  <TrendingUp className="h-5 w-5 text-green-500" />
                ) : (
                  <TrendingDown className="h-5 w-5 text-red-500" />
                )}
                <span className="text-sm font-medium">Net Flow (Delta)</span>
              </div>
              <p className={`text-2xl font-bold ${netFlow >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {netFlow >= 0 ? '+' : ''}{formatFullUsd(netFlow)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {netFlow >= 0 ? 'Value retained in ecosystem' : 'Value extracted from ecosystem'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
