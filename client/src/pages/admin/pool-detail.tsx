import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  RefreshCw, 
  ArrowLeft, 
  TrendingUp, 
  Zap, 
  Users,
  Droplets,
  ExternalLink
} from "lucide-react";

interface PoolInfo {
  pid: number;
  pairName: string;
  lpToken: string;
  token0: string;
  token1: string;
  totalTVL: number;
}

interface APRBreakdown {
  passive: {
    feeAprValue: number;
    harvestAprValue: number;
    totalPassive: number;
  };
  active: {
    questAprWorst: number;
    questAprBest: number;
  };
  total: {
    worst: number;
    best: number;
  };
}

interface Provider {
  wallet: string;
  discordId: string | null;
  username: string | null;
  stakedLP: number;
  stakedValue: number;
  sharePercent: number;
  heroes: number;
  realizedQuestAPR: number | null;
}

interface ProvidersResponse {
  providers: Provider[];
  count: number;
  totalStaked: number;
}

interface PoolDetailResponse {
  pool: PoolInfo;
  aprBreakdown: APRBreakdown;
}

export default function PoolDetailPage() {
  const { pid } = useParams<{ pid: string }>();
  const [, setLocation] = useLocation();

  const { data: poolData, isLoading: poolLoading, refetch: refetchPool } = useQuery<PoolDetailResponse>({
    queryKey: ["/api/admin/pools", pid],
    enabled: !!pid,
  });

  const { data: providersData, isLoading: providersLoading, refetch: refetchProviders } = useQuery<ProvidersResponse>({
    queryKey: ["/api/admin/pools", pid, "providers"],
    enabled: !!pid,
  });

  const formatCurrency = (value: number | null | undefined) => {
    if (value == null) return "$0.00";
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(2)}M`;
    } else if (value >= 1000) {
      return `$${(value / 1000).toFixed(2)}K`;
    }
    return `$${value.toFixed(2)}`;
  };

  const formatAPR = (value: number | null | undefined) => {
    if (value == null) return "0.00%";
    return `${value.toFixed(2)}%`;
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const handleRefresh = () => {
    refetchPool();
    refetchProviders();
  };

  const pool = poolData?.pool;
  const apr = poolData?.aprBreakdown;
  const isLoading = poolLoading || providersLoading;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/admin/pools")}
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">
              {pool?.pairName || `Pool ${pid}`}
            </h1>
            <p className="text-muted-foreground">
              Pool ID: {pid} {pool?.lpToken && `• LP: ${formatAddress(pool.lpToken)}`}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          onClick={handleRefresh}
          disabled={isLoading}
          data-testid="button-refresh"
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {poolLoading ? (
        <div className="flex items-center justify-center py-8">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : pool ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Value Locked</CardTitle>
                <Droplets className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-tvl">
                  {formatCurrency(pool.totalTVL)}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Passive APR</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-passive-apr">
                  {formatAPR(apr?.passive?.totalPassive)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Fee: {formatAPR(apr?.passive?.feeAprValue)} + Harvest: {formatAPR(apr?.passive?.harvestAprValue)}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active APR</CardTitle>
                <Zap className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-active-apr">
                  {apr?.active?.questAprWorst === apr?.active?.questAprBest 
                    ? formatAPR(apr?.active?.questAprWorst)
                    : `${formatAPR(apr?.active?.questAprWorst)} - ${formatAPR(apr?.active?.questAprBest)}`
                  }
                </div>
                <p className="text-xs text-muted-foreground">
                  Hero-dependent quest rewards
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total APR</CardTitle>
                <TrendingUp className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600 dark:text-green-400" data-testid="text-total-apr">
                  {apr?.total?.worst === apr?.total?.best 
                    ? formatAPR(apr?.total?.worst)
                    : `${formatAPR(apr?.total?.worst)} - ${formatAPR(apr?.total?.best)}`
                  }
                </div>
                <p className="text-xs text-muted-foreground">
                  Combined passive + active APR
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Top Gardeners
              </CardTitle>
              <CardDescription>
                {providersData?.count || 0} registered players with positions in this pool
              </CardDescription>
            </CardHeader>
            <CardContent>
              {providersLoading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Player</TableHead>
                      <TableHead>Wallet</TableHead>
                      <TableHead className="text-right">Staked Value</TableHead>
                      <TableHead className="text-right">Pool Share</TableHead>
                      <TableHead className="text-right">Heroes</TableHead>
                      <TableHead className="text-right">Realized Quest APR</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {providersData?.providers.map((provider, index) => (
                      <TableRow key={provider.wallet} data-testid={`row-provider-${index}`}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {provider.username ? (
                              <span className="font-medium" data-testid={`text-username-${index}`}>
                                {provider.username}
                              </span>
                            ) : (
                              <span className="text-muted-foreground italic">
                                Unknown
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <a 
                            href={`https://subnets.avax.network/defi-kingdoms/address/${provider.wallet}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-sm hover:underline"
                            onClick={(e) => e.stopPropagation()}
                            data-testid={`link-wallet-${index}`}
                          >
                            <code className="text-xs bg-muted px-2 py-1 rounded">
                              {formatAddress(provider.wallet)}
                            </code>
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </TableCell>
                        <TableCell className="text-right font-medium" data-testid={`text-staked-${index}`}>
                          {formatCurrency(provider.stakedValue)}
                        </TableCell>
                        <TableCell className="text-right" data-testid={`text-share-${index}`}>
                          <div className="flex items-center justify-end gap-2">
                            <Progress 
                              value={Math.min(provider.sharePercent * 100, 100)} 
                              className="w-16 h-2"
                            />
                            <span className="text-sm text-muted-foreground w-12 text-right">
                              {(provider.sharePercent * 100).toFixed(2)}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right" data-testid={`text-heroes-${index}`}>
                          <Badge variant="outline">{provider.heroes}</Badge>
                        </TableCell>
                        <TableCell className="text-right" data-testid={`text-quest-apr-${index}`}>
                          {provider.realizedQuestAPR !== null ? (
                            <Badge variant="secondary">
                              {formatAPR(provider.realizedQuestAPR)}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {(!providersData?.providers || providersData.providers.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          No registered players found with positions in this pool.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Pool Activity
              </CardTitle>
              <CardDescription>
                Recent staking and unstaking activity for this pool
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="py-8 text-center text-muted-foreground" data-testid="text-activity-placeholder">
                <p>Activity tracking coming soon.</p>
                <p className="text-sm mt-2">
                  This section will show recent deposits, withdrawals, and quest completions.
                </p>
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-muted-foreground">
              Pool not found or data unavailable.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
