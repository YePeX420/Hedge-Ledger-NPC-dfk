import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, RefreshCw, Target, Coins, Landmark, ArrowLeftRight, Wrench, Droplets, ExternalLink, Globe } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
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
}

interface Category {
  category: string;
  contracts: Contract[];
  totalJewel: number;
  totalCrystal: number;
  totalValueUSD: number;
}

interface CoverageKPI {
  trackedJewel: number;
  circulatingSupply: number;
  coverageRatio: number;
  unaccountedJewel: number;
  multiChainTotal?: number;
}

interface ChainBalance {
  chain: string;
  chainId: string;
  tokenAddress: string;
  contracts: {
    name: string;
    address: string;
    jewelBalance: number;
  }[];
  totalJewel: number;
  status: 'success' | 'error';
  error?: string;
}

interface JewelSupplyData {
  totalSupply: number;
  circulatingSupply: number;
  lockedSupply: number;
  burnedSupply: number;
  source: string;
  updatedAt: string;
}

interface ValueBreakdownData {
  timestamp: string;
  prices: {
    jewel: number;
    crystal: number;
    jewelSource: string;
    crystalSource: string;
  };
  categories: Category[];
  coverageKPI?: CoverageKPI;
  jewelSupply?: JewelSupplyData;
  multiChainBalances?: ChainBalance[];
  summary: {
    totalJewelLocked: number;
    totalCrystalLocked: number;
    totalValueUSD: number;
    lpPoolsValue: number;
    stakingValue: number;
    bridgeValue: number;
    systemValue: number;
    multiChainJewel?: number;
  };
}

interface SourceBreakdown {
  name: string;
  jewel: number;
  percentage: number;
  icon: typeof Coins;
  color: string;
  contracts: { name: string; address: string; jewel: number }[];
}

const COLORS: Record<string, string> = {
  'LP Pools': '#22c55e',
  'Staking/Governance': '#3b82f6',
  'Bridge Contracts': '#f59e0b',
  'System Contracts': '#8b5cf6',
  'Multi-Chain': '#ec4899',
  'Unaccounted': '#6b7280',
};

const CATEGORY_ICONS: Record<string, typeof Coins> = {
  'LP Pools': Droplets,
  'Staking/Governance': Landmark,
  'Bridge Contracts': ArrowLeftRight,
  'System Contracts': Wrench,
  'Multi-Chain': Globe,
};

function formatNumber(num: number): string {
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(2)}M`;
  } else if (num >= 1_000) {
    return `${(num / 1_000).toFixed(2)}K`;
  }
  return num.toFixed(2);
}

function formatAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export default function CoverageDetailsPage() {
  const [, setLocation] = useLocation();
  const { data, isLoading, refetch, isFetching } = useQuery<ValueBreakdownData>({
    queryKey: ['/api/admin/bridge/value-breakdown'],
    staleTime: 60000,
    refetchOnWindowFocus: false,
  });

  // Calculate breakdown by source
  const sourceBreakdown: SourceBreakdown[] = [];
  let totalTracked = 0;

  if (data) {
    // LP Pools - only wJEWEL (not xJEWEL which is a share token)
    const lpCategory = data.categories.find(c => c.category === 'LP Pools');
    if (lpCategory) {
      let lpJewel = 0;
      const lpContracts: { name: string; address: string; jewel: number }[] = [];
      
      for (const pool of lpCategory.contracts) {
        let poolJewel = 0;
        if (pool.token0Symbol === 'wJEWEL') {
          poolJewel += pool.token0Balance || 0;
        }
        if (pool.token1Symbol === 'wJEWEL') {
          poolJewel += pool.token1Balance || 0;
        }
        if (poolJewel > 0) {
          lpJewel += poolJewel;
          lpContracts.push({ name: pool.name, address: pool.address, jewel: poolJewel });
        }
      }
      
      if (lpJewel > 0) {
        sourceBreakdown.push({
          name: 'LP Pools (wJEWEL)',
          jewel: lpJewel,
          percentage: 0,
          icon: Droplets,
          color: COLORS['LP Pools'],
          contracts: lpContracts.sort((a, b) => b.jewel - a.jewel),
        });
        totalTracked += lpJewel;
      }
    }

    // Staking/Governance
    const stakingCategory = data.categories.find(c => c.category === 'Staking/Governance');
    if (stakingCategory && stakingCategory.totalJewel > 0) {
      sourceBreakdown.push({
        name: 'Staking (cJEWEL)',
        jewel: stakingCategory.totalJewel,
        percentage: 0,
        icon: Landmark,
        color: COLORS['Staking/Governance'],
        contracts: stakingCategory.contracts
          .filter(c => c.jewelBalance > 0)
          .map(c => ({ name: c.name, address: c.address, jewel: c.jewelBalance }))
          .sort((a, b) => b.jewel - a.jewel),
      });
      totalTracked += stakingCategory.totalJewel;
    }

    // Bridge Contracts
    const bridgeCategory = data.categories.find(c => c.category === 'Bridge Contracts');
    if (bridgeCategory && bridgeCategory.totalJewel > 0) {
      sourceBreakdown.push({
        name: 'Bridge Contracts',
        jewel: bridgeCategory.totalJewel,
        percentage: 0,
        icon: ArrowLeftRight,
        color: COLORS['Bridge Contracts'],
        contracts: bridgeCategory.contracts
          .filter(c => c.jewelBalance > 0)
          .map(c => ({ name: c.name, address: c.address, jewel: c.jewelBalance }))
          .sort((a, b) => b.jewel - a.jewel),
      });
      totalTracked += bridgeCategory.totalJewel;
    }

    // System Contracts
    const systemCategory = data.categories.find(c => c.category === 'System Contracts');
    if (systemCategory && systemCategory.totalJewel > 0) {
      sourceBreakdown.push({
        name: 'System Contracts',
        jewel: systemCategory.totalJewel,
        percentage: 0,
        icon: Wrench,
        color: COLORS['System Contracts'],
        contracts: systemCategory.contracts
          .filter(c => c.jewelBalance > 0)
          .map(c => ({ name: c.name, address: c.address, jewel: c.jewelBalance }))
          .sort((a, b) => b.jewel - a.jewel),
      });
      totalTracked += systemCategory.totalJewel;
    }

    // Multi-Chain Bridges (Harmony, Kaia, Metis)
    if (data.multiChainBalances && data.multiChainBalances.length > 0) {
      let multiChainJewel = 0;
      const multiChainContracts: { name: string; address: string; jewel: number }[] = [];
      
      for (const chain of data.multiChainBalances) {
        if (chain.status === 'success' && chain.totalJewel > 0) {
          multiChainJewel += chain.totalJewel;
          for (const contract of chain.contracts) {
            multiChainContracts.push({
              name: `${contract.name} (${chain.chain})`,
              address: contract.address,
              jewel: contract.jewelBalance,
            });
          }
        }
      }
      
      if (multiChainJewel > 0) {
        sourceBreakdown.push({
          name: 'Multi-Chain Bridges',
          jewel: multiChainJewel,
          percentage: 0,
          icon: Globe,
          color: COLORS['Multi-Chain'],
          contracts: multiChainContracts.sort((a, b) => b.jewel - a.jewel),
        });
        totalTracked += multiChainJewel;
      }
    }

    // Calculate percentages
    for (const source of sourceBreakdown) {
      source.percentage = totalTracked > 0 ? (source.jewel / totalTracked) * 100 : 0;
    }
  }

  // Prepare chart data
  const chartData = sourceBreakdown.map(s => ({
    name: s.name,
    value: s.jewel,
    color: s.color,
  }));

  // Add unaccounted to chart if applicable
  if (data?.coverageKPI && data.coverageKPI.unaccountedJewel > 0) {
    chartData.push({
      name: 'Unaccounted',
      value: data.coverageKPI.unaccountedJewel,
      color: COLORS['Unaccounted'],
    });
  }

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/admin/bridge/value-breakdown'] });
    refetch();
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-8 w-64" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Skeleton className="h-[400px]" />
          <Skeleton className="h-[400px]" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon" 
            data-testid="button-back"
            onClick={() => setLocation('/admin/value-allocation')}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Target className="w-6 h-6 text-cyan-500" />
              Coverage Breakdown
            </h1>
            <p className="text-muted-foreground">
              Detailed view of tracked JEWEL across all sources
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isFetching}
          data-testid="button-refresh"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      {data?.coverageKPI && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card data-testid="card-coverage-ratio">
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-4xl font-bold text-cyan-500">
                  {(data.coverageKPI.coverageRatio * 100).toFixed(1)}%
                </p>
                <p className="text-sm text-muted-foreground mt-1">Coverage Ratio</p>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-tracked-total">
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-2xl font-bold text-green-500 font-mono">
                  {formatNumber(data.coverageKPI.trackedJewel)}
                </p>
                <p className="text-sm text-muted-foreground mt-1">Tracked JEWEL</p>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-circulating">
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-2xl font-bold font-mono">
                  {formatNumber(data.coverageKPI.circulatingSupply)}
                </p>
                <p className="text-sm text-muted-foreground mt-1">Circulating Supply</p>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-unaccounted">
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-2xl font-bold text-amber-500 font-mono">
                  {formatNumber(data.coverageKPI.unaccountedJewel)}
                </p>
                <p className="text-sm text-muted-foreground mt-1">Unaccounted</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pie Chart */}
        <Card data-testid="card-distribution-chart">
          <CardHeader>
            <CardTitle>JEWEL Distribution by Source</CardTitle>
            <CardDescription>
              Visual breakdown of tracked JEWEL across categories
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={120}
                    dataKey="value"
                    nameKey="name"
                    label={({ name, percent }) => `${(name || '').split(' ')[0]} ${((percent || 0) * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => [formatNumber(value), 'JEWEL']}
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Source Breakdown List */}
        <Card data-testid="card-source-breakdown">
          <CardHeader>
            <CardTitle>Breakdown by Source</CardTitle>
            <CardDescription>
              JEWEL allocation across different contract types
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {sourceBreakdown.map((source) => {
              const Icon = source.icon;
              return (
                <div key={source.name} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: source.color }}
                      />
                      <Icon className="w-4 h-4" style={{ color: source.color }} />
                      <span className="font-medium">{source.name}</span>
                    </div>
                    <div className="text-right">
                      <span className="font-mono font-medium">{formatNumber(source.jewel)}</span>
                      <Badge variant="secondary" className="ml-2">
                        {source.percentage.toFixed(1)}%
                      </Badge>
                    </div>
                  </div>
                  <Progress 
                    value={source.percentage} 
                    className="h-2"
                    style={{ '--progress-color': source.color } as React.CSSProperties}
                  />
                </div>
              );
            })}

            {data?.coverageKPI && data.coverageKPI.unaccountedJewel > 0 && (
              <div className="space-y-2 pt-2 border-t">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-3 h-3 rounded-full" 
                      style={{ backgroundColor: COLORS['Unaccounted'] }}
                    />
                    <span className="font-medium text-muted-foreground">Unaccounted</span>
                  </div>
                  <div className="text-right">
                    <span className="font-mono font-medium text-amber-500">
                      {formatNumber(data.coverageKPI.unaccountedJewel)}
                    </span>
                    <Badge variant="outline" className="ml-2 border-amber-500/50 text-amber-500">
                      {((data.coverageKPI.unaccountedJewel / data.coverageKPI.circulatingSupply) * 100).toFixed(1)}%
                    </Badge>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Detailed Contract Tables */}
      <div className="space-y-6">
        {sourceBreakdown.map((source) => {
          const Icon = source.icon;
          return (
            <Card key={source.name} data-testid={`card-contracts-${source.name.toLowerCase().replace(/[^a-z]/g, '-')}`}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Icon className="w-5 h-5" style={{ color: source.color }} />
                  {source.name}
                  <Badge style={{ backgroundColor: source.color, color: 'white' }}>
                    {formatNumber(source.jewel)} JEWEL
                  </Badge>
                </CardTitle>
                <CardDescription>
                  {source.contracts.length} contract{source.contracts.length !== 1 ? 's' : ''} tracked
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Contract</TableHead>
                      <TableHead>Address</TableHead>
                      <TableHead className="text-right">JEWEL</TableHead>
                      <TableHead className="text-right">% of Source</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {source.contracts.slice(0, 10).map((contract) => (
                      <TableRow key={contract.address}>
                        <TableCell className="font-medium">{contract.name}</TableCell>
                        <TableCell>
                          <a
                            href={`https://subnets.avax.network/defi-kingdoms/address/${contract.address}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
                          >
                            <span className="font-mono text-sm">{formatAddress(contract.address)}</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatNumber(contract.jewel)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant="outline">
                            {((contract.jewel / source.jewel) * 100).toFixed(1)}%
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                    {source.contracts.length > 10 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground">
                          ... and {source.contracts.length - 10} more contracts
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Data Source Info */}
      {data && (
        <div className="text-sm text-muted-foreground text-center">
          Last updated: {new Date(data.timestamp).toLocaleString()} | 
          JEWEL Price: ${data.prices.jewel.toFixed(4)} ({data.prices.jewelSource})
        </div>
      )}
    </div>
  );
}
