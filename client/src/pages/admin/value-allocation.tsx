import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw, PieChart, Coins, Landmark, ArrowLeftRight, Wrench, ExternalLink, TrendingUp, AlertCircle, Info } from "lucide-react";
import { Tooltip as ShadcnTooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PieChart as RechartsPieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip as RechartsTooltip } from "recharts";
import { queryClient } from "@/lib/queryClient";

interface Contract {
  name: string;
  address: string;
  jewelBalance: number;
  crystalBalance: number;
  jewelValueUSD: number;
  crystalValueUSD: number;
  totalValueUSD: number;
  token0Symbol?: string;
  token1Symbol?: string;
  token0Balance?: number;
  token1Balance?: number;
  token0ValueUSD?: number;
  token1ValueUSD?: number;
  pid?: number;
  v2StakedLP?: number;
  v1StakedLP?: number;
  totalStakedLP?: number;
  totalLPSupply?: number;
  stakedRatio?: number;
  v2ValueUSD?: number;
  v1ValueUSD?: number;
  passive24hAPR?: number;
}

interface Category {
  category: string;
  contracts: Contract[];
  totalJewel: number;
  totalCrystal: number;
  totalValueUSD: number;
}

interface TokenPrice {
  symbol: string;
  price: number;
  source: string;
}

interface CexExchange {
  exchange: string;
  pair: string;
  midPrice: number;
  bidDepthUSD: number;
  askDepthUSD: number;
  totalDepthUSD: number;
  spread: number;
  spreadPercent: number;
  depthBand: string;
  timestamp: string;
  error?: string;
}

interface CexLiquidityData {
  exchanges: CexExchange[];
  totalLiquidityUSD: number;
  averageSpread: number;
  depthBand: string;
  updatedAt: string;
  failedCount: number;
  totalCount: number;
}

interface ValueBreakdownData {
  timestamp: string;
  prices: {
    jewel: number;
    crystal: number;
    jewelSource: string;
    crystalSource: string;
  };
  tokenPrices: TokenPrice[];
  categories: Category[];
  summary: {
    totalJewelLocked: number;
    totalCrystalLocked: number;
    totalValueUSD: number;
    lpPoolsValue: number;
    stakingValue: number;
    bridgeValue: number;
    systemValue: number;
  };
}

const COLORS = {
  'LP Pools': '#22c55e',
  'Staking/Governance': '#3b82f6',
  'Bridge Contracts': '#f59e0b',
  'System Contracts': '#8b5cf6',
};

const CATEGORY_ICONS = {
  'LP Pools': Coins,
  'Staking/Governance': Landmark,
  'Bridge Contracts': ArrowLeftRight,
  'System Contracts': Wrench,
};

function formatUSD(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
  return `$${value.toFixed(2)}`;
}

function formatNumber(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
  return value.toFixed(2);
}

function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export default function ValueAllocationPage() {
  const [, setLocation] = useLocation();
  const { data, isLoading, refetch, isFetching } = useQuery<ValueBreakdownData>({
    queryKey: ['/api/admin/bridge/value-breakdown'],
    refetchInterval: 300000,
  });

  const { data: cexData, isLoading: cexLoading, refetch: refetchCex } = useQuery<CexLiquidityData>({
    queryKey: ['/api/admin/bridge/cex-liquidity'],
    refetchInterval: 60000,
  });

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/admin/bridge/value-breakdown'] });
    queryClient.invalidateQueries({ queryKey: ['/api/admin/bridge/cex-liquidity'] });
    refetch();
    refetchCex();
  };

  const pieData = data ? [
    { name: 'LP Pools', value: data.summary.lpPoolsValue, color: COLORS['LP Pools'] },
    { name: 'Staking', value: data.summary.stakingValue, color: COLORS['Staking/Governance'] },
    { name: 'Bridges', value: data.summary.bridgeValue, color: COLORS['Bridge Contracts'] },
    { name: 'System', value: data.summary.systemValue, color: COLORS['System Contracts'] },
  ].filter(d => d.value > 0) : [];

  const totalValue = pieData.reduce((sum, d) => sum + d.value, 0);

  const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }: any) => {
    if (percent < 0.03) return null;
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    return (
      <text
        x={x}
        y={y}
        fill="white"
        textAnchor="middle"
        dominantBaseline="central"
        className="text-xs font-medium"
        style={{ textShadow: '1px 1px 2px rgba(0,0,0,0.8)' }}
      >
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  const lpPools = data?.categories.find(c => c.category === 'LP Pools');
  const staking = data?.categories.find(c => c.category === 'Staking/Governance');
  const bridges = data?.categories.find(c => c.category === 'Bridge Contracts');
  const system = data?.categories.find(c => c.category === 'System Contracts');

  return (
    <div className="p-6 space-y-6" data-testid="value-allocation-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Value Allocation</h1>
          <p className="text-muted-foreground">
            Complete breakdown of DFK Chain value distribution across LP pools, staking, bridges, and system contracts
          </p>
        </div>
        <Button
          onClick={handleRefresh}
          disabled={isFetching}
          variant="outline"
          data-testid="button-refresh"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
      ) : data ? (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card data-testid="card-pie-chart">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PieChart className="w-5 h-5" />
                  Value Distribution
                </CardTitle>
                <CardDescription>
                  Total Value Locked: {formatUSD(data.summary.totalValueUSD)}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={90}
                        paddingAngle={2}
                        dataKey="value"
                        labelLine={false}
                        label={renderCustomLabel}
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} stroke={entry.color} />
                        ))}
                      </Pie>
                      <RechartsTooltip
                        formatter={(value: number) => formatUSD(value)}
                        contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                      />
                      <Legend
                        formatter={(value, entry: any) => {
                          const item = pieData.find(d => d.name === value);
                          const pct = item && totalValue > 0 ? ((item.value / totalValue) * 100).toFixed(1) : '0';
                          return <span className="text-sm">{value} ({pct}%)</span>;
                        }}
                      />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-summary">
              <CardHeader>
                <CardTitle>Summary</CardTitle>
                <CardDescription>
                  Updated: {new Date(data.timestamp).toLocaleString()}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 rounded-lg bg-muted/50 border border-border" data-testid="card-total-usd">
                  <p className="text-sm text-muted-foreground">Total Value Locked</p>
                  <p className="text-3xl font-bold text-foreground" data-testid="text-total-usd">
                    {formatUSD(data.summary.totalValueUSD)}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                    <p className="text-sm text-muted-foreground">LP Pools</p>
                    <p className="text-xl font-bold text-green-500" data-testid="text-lp-pools-value">{formatUSD(data.summary.lpPoolsValue)}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                    <p className="text-sm text-muted-foreground">Staking</p>
                    <p className="text-xl font-bold text-blue-500" data-testid="text-staking-value">{formatUSD(data.summary.stakingValue)}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <p className="text-sm text-muted-foreground">Bridges</p>
                    <p className="text-xl font-bold text-amber-500" data-testid="text-bridges-value">{formatUSD(data.summary.bridgeValue)}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-violet-500/10 border border-violet-500/20">
                    <p className="text-sm text-muted-foreground">System</p>
                    <p className="text-xl font-bold text-violet-500" data-testid="text-system-value">{formatUSD(data.summary.systemValue)}</p>
                  </div>
                </div>

                <div className="pt-4 border-t space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total JEWEL Locked</span>
                    <span className="font-medium">{formatNumber(data.summary.totalJewelLocked)} JEWEL</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total CRYSTAL Locked</span>
                    <span className="font-medium">{formatNumber(data.summary.totalCrystalLocked)} CRYSTAL</span>
                  </div>
                  <div className="flex justify-between text-sm pt-2 border-t">
                    <span className="text-muted-foreground">JEWEL Price</span>
                    <span className="font-medium">
                      ${data.prices.jewel.toFixed(4)}
                      <Badge variant="outline" className="ml-2 text-xs">{data.prices.jewelSource}</Badge>
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">CRYSTAL Price</span>
                    <span className="font-medium">
                      ${data.prices.crystal.toFixed(4)}
                      <Badge variant="outline" className="ml-2 text-xs">{data.prices.crystalSource}</Badge>
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card data-testid="card-token-prices">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Coins className="w-5 h-5 text-yellow-500" />
                Token Prices
              </CardTitle>
              <CardDescription>
                Current prices used for TVL calculations
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
                {(data.tokenPrices ?? []).map((token) => (
                  <div key={token.symbol} className="p-3 rounded-lg bg-muted/50" data-testid={`token-price-${token.symbol}`}>
                    <div className="text-sm font-medium">{token.symbol}</div>
                    <div className="text-lg font-bold font-mono">
                      {token.price >= 1 ? `$${token.price.toFixed(2)}` : `$${token.price.toFixed(4)}`}
                    </div>
                    <div className="text-xs text-muted-foreground">{token.source}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-cex-liquidity">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-cyan-500" />
                CEX Liquidity (Off-Chain)
                <ShadcnTooltip>
                  <TooltipTrigger>
                    <Info className="w-4 h-4 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p>Order book depth within {cexData?.depthBand || '±2%'} of mid-price. This measures immediately tradable liquidity, not total CEX holdings.</p>
                  </TooltipContent>
                </ShadcnTooltip>
              </CardTitle>
              <CardDescription>
                JEWEL order book depth on centralized exchanges
              </CardDescription>
            </CardHeader>
            <CardContent>
              {cexLoading ? (
                <Skeleton className="h-32" />
              ) : cexData ? (
                <div className="space-y-4">
                  {cexData.failedCount === cexData.totalCount ? (
                    <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center gap-3">
                      <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-red-700 dark:text-red-400">All CEX APIs Failed</p>
                        <p className="text-xs text-muted-foreground">
                          Unable to fetch order books from any exchange. Check API connectivity.
                        </p>
                      </div>
                    </div>
                  ) : cexData.totalLiquidityUSD === 0 ? (
                    <div className="p-4 rounded-lg bg-muted/50 border border-border flex items-center gap-3">
                      <Info className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium">No Active CEX Markets</p>
                        <p className="text-xs text-muted-foreground">
                          JEWEL is primarily traded on decentralized exchanges (DFK DEX, Trader Joe). CEX order books show no active liquidity.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <>
                      {cexData.failedCount > 0 && (
                        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center gap-2">
                          <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                          <p className="text-sm text-amber-700 dark:text-amber-400">
                            {cexData.failedCount}/{cexData.totalCount} exchanges failed. Totals may be incomplete.
                          </p>
                        </div>
                      )}
                      <div className="p-4 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
                        <p className="text-sm text-muted-foreground">Total CEX Liquidity ({cexData.depthBand})</p>
                        <p className="text-2xl font-bold text-cyan-500" data-testid="text-cex-liquidity-total">
                          {formatUSD(cexData.totalLiquidityUSD)}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Avg spread: {cexData.averageSpread.toFixed(2)}%
                        </p>
                      </div>
                    </>
                  )}
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Exchange</TableHead>
                        <TableHead>Pair</TableHead>
                        <TableHead className="text-right">Mid Price</TableHead>
                        <TableHead className="text-right">Bid Depth</TableHead>
                        <TableHead className="text-right">Ask Depth</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right">Spread</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cexData.exchanges.map((ex) => (
                        <TableRow key={ex.exchange} data-testid={`row-cex-${ex.exchange}`}>
                          <TableCell className="font-medium">{ex.exchange}</TableCell>
                          <TableCell>{ex.pair}</TableCell>
                          <TableCell className="text-right font-mono">
                            {ex.error ? (
                              <Badge variant="outline" className="text-red-500">Error</Badge>
                            ) : (
                              `$${ex.midPrice.toFixed(4)}`
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono text-green-500">
                            {ex.error ? '-' : formatUSD(ex.bidDepthUSD)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-red-500">
                            {ex.error ? '-' : formatUSD(ex.askDepthUSD)}
                          </TableCell>
                          <TableCell className="text-right font-mono font-bold">
                            {ex.error ? '-' : formatUSD(ex.totalDepthUSD)}
                          </TableCell>
                          <TableCell className="text-right">
                            {ex.error ? '-' : `${ex.spreadPercent.toFixed(2)}%`}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <p className="text-xs text-muted-foreground text-center">
                    Updated: {new Date(cexData.updatedAt).toLocaleString()}
                  </p>
                </div>
              ) : (
                <div className="flex items-center justify-center p-8 text-muted-foreground">
                  <AlertCircle className="w-5 h-5 mr-2" />
                  Failed to load CEX data
                </div>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-lp-pools">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Coins className="w-5 h-5 text-green-500" />
                LP Pools Staked Value (V2 + V1)
              </CardTitle>
              <CardDescription>
                Value of LP tokens staked in Master Gardener V2 and legacy V1 contracts
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pool</TableHead>
                    <TableHead className="text-right text-green-400">24hr APR</TableHead>
                    <TableHead>Contract</TableHead>
                    <TableHead className="text-right">Staked Token 0</TableHead>
                    <TableHead className="text-right">Staked Token 1</TableHead>
                    <TableHead className="text-right text-blue-400">V2 Value</TableHead>
                    <TableHead className="text-right text-amber-400">V1 Value</TableHead>
                    <TableHead className="text-right">Total Staked</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(lpPools?.contracts ?? []).map((contract) => (
                    <TableRow 
                      key={contract.address} 
                      data-testid={`row-lp-${contract.name}`}
                      className={contract.pid !== undefined ? "cursor-pointer hover-elevate" : ""}
                      onClick={() => contract.pid !== undefined && setLocation(`/admin/pools/${contract.pid}`)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="font-mono text-xs">
                            {contract.token0Symbol || 'TOKEN0'}
                          </Badge>
                          <span className="text-muted-foreground">/</span>
                          <Badge variant="secondary" className="font-mono text-xs">
                            {contract.token1Symbol || 'TOKEN1'}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-green-400">
                        {contract.passive24hAPR != null ? `${contract.passive24hAPR.toFixed(2)}%` : '-'}
                      </TableCell>
                      <TableCell>
                        <a
                          href={`https://subnets.avax.network/defi-kingdoms/address/${contract.address}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs font-mono text-muted-foreground hover:text-foreground"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {shortenAddress(contract.address)}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        <div className="flex flex-col items-end">
                          <span>{formatNumber(contract.token0Balance || 0)}</span>
                          <span className="text-xs text-muted-foreground">{contract.token0Symbol}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        <div className="flex flex-col items-end">
                          <span>{formatNumber(contract.token1Balance || 0)}</span>
                          <span className="text-xs text-muted-foreground">{contract.token1Symbol}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-sm text-blue-400 font-mono">
                        {formatUSD(contract.v2ValueUSD || 0)}
                      </TableCell>
                      <TableCell className="text-right text-sm text-amber-400 font-mono">
                        {formatUSD(contract.v1ValueUSD || 0)}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatUSD(contract.totalValueUSD)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-green-500/5 font-medium">
                    <TableCell colSpan={5}>Total Staked LP</TableCell>
                    <TableCell className="text-right text-blue-400">
                      {formatUSD((lpPools?.contracts ?? []).reduce((sum, c) => sum + (c.v2ValueUSD || 0), 0))}
                    </TableCell>
                    <TableCell className="text-right text-amber-400">
                      {formatUSD((lpPools?.contracts ?? []).reduce((sum, c) => sum + (c.v1ValueUSD || 0), 0))}
                    </TableCell>
                    <TableCell className="text-right text-green-500">
                      {formatUSD(lpPools?.totalValueUSD || 0)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card data-testid="card-staking">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Landmark className="w-5 h-5 text-blue-500" />
                Staking / Governance Breakdown
              </CardTitle>
              <CardDescription>
                Locked tokens in governance and staking contracts
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Contract Name</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead className="text-right">JEWEL</TableHead>
                    <TableHead className="text-right">CRYSTAL</TableHead>
                    <TableHead className="text-right">Total USD</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(staking?.contracts ?? []).map((contract) => (
                    <TableRow key={contract.address} data-testid={`row-staking-${contract.name}`}>
                      <TableCell className="font-medium">{contract.name}</TableCell>
                      <TableCell>
                        <a
                          href={`https://subnets.avax.network/defi-kingdoms/address/${contract.address}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs font-mono text-muted-foreground hover:text-foreground"
                        >
                          {shortenAddress(contract.address)}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatNumber(contract.jewelBalance)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatNumber(contract.crystalBalance)}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatUSD(contract.totalValueUSD)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-blue-500/5 font-medium">
                    <TableCell colSpan={2}>Total Staking</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatNumber(staking?.totalJewel || 0)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatNumber(staking?.totalCrystal || 0)}
                    </TableCell>
                    <TableCell className="text-right text-blue-500">
                      {formatUSD(staking?.totalValueUSD || 0)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card data-testid="card-bridges">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ArrowLeftRight className="w-5 h-5 text-amber-500" />
                Bridge Contracts Breakdown
              </CardTitle>
              <CardDescription>
                Tokens held in cross-chain bridge contracts
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Contract Name</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead className="text-right">JEWEL</TableHead>
                    <TableHead className="text-right">CRYSTAL</TableHead>
                    <TableHead className="text-right">Total USD</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(bridges?.contracts ?? []).map((contract) => (
                    <TableRow key={contract.address} data-testid={`row-bridge-${contract.name}`}>
                      <TableCell className="font-medium">{contract.name}</TableCell>
                      <TableCell>
                        <a
                          href={`https://subnets.avax.network/defi-kingdoms/address/${contract.address}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs font-mono text-muted-foreground hover:text-foreground"
                        >
                          {shortenAddress(contract.address)}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatNumber(contract.jewelBalance)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatNumber(contract.crystalBalance)}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatUSD(contract.totalValueUSD)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-amber-500/5 font-medium">
                    <TableCell colSpan={2}>Total Bridges</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatNumber(bridges?.totalJewel || 0)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatNumber(bridges?.totalCrystal || 0)}
                    </TableCell>
                    <TableCell className="text-right text-amber-500">
                      {formatUSD(bridges?.totalValueUSD || 0)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card data-testid="card-system">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wrench className="w-5 h-5 text-violet-500" />
                System Contracts Breakdown
              </CardTitle>
              <CardDescription>
                Tokens held in game system and operational contracts
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Contract Name</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead className="text-right">JEWEL</TableHead>
                    <TableHead className="text-right">CRYSTAL</TableHead>
                    <TableHead className="text-right">Total USD</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(system?.contracts ?? []).map((contract) => (
                    <TableRow key={contract.address} data-testid={`row-system-${contract.name}`}>
                      <TableCell className="font-medium">{contract.name}</TableCell>
                      <TableCell>
                        <a
                          href={`https://subnets.avax.network/defi-kingdoms/address/${contract.address}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs font-mono text-muted-foreground hover:text-foreground"
                        >
                          {shortenAddress(contract.address)}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatNumber(contract.jewelBalance)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatNumber(contract.crystalBalance)}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatUSD(contract.totalValueUSD)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-violet-500/5 font-medium">
                    <TableCell colSpan={2}>Total System</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatNumber(system?.totalJewel || 0)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatNumber(system?.totalCrystal || 0)}
                    </TableCell>
                    <TableCell className="text-right text-violet-500">
                      {formatUSD(system?.totalValueUSD || 0)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Failed to load value breakdown data
          </CardContent>
        </Card>
      )}
    </div>
  );
}
