import { useState } from "react";
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

interface Staker {
  wallet: string;
  summonerName?: string | null;
  stakedLP: string;
  stakedValue: string;
  poolShare: string;
  lastActivity: {
    type: 'Deposit' | 'Withdraw' | 'Unknown';
    amount: string;
    blockNumber: number;
    txHash: string;
  };
}

interface AllStakersResponse {
  stakers: Staker[];
  count: number;
  poolTVL: number;
  totalStakedLP: number;
  source?: 'indexed' | 'onchain';
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

  const { data: stakersData, isLoading: stakersLoading, refetch: refetchStakers, isFetching: stakersFetching } = useQuery<AllStakersResponse>({
    queryKey: ["/api/admin/pools", pid, "all-stakers"],
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
    refetchStakers();
  };

  const pool = poolData?.pool;
  const apr = poolData?.aprBreakdown;
  const isLoading = poolLoading || stakersLoading;

  const [aprWindow, setAprWindow] = useState<'1y' | '1m' | '24h'>('1y');

  const scaleApr = (annualizedApr: number | null | undefined) => {
    if (annualizedApr == null) return 0;
    switch (aprWindow) {
      case '1m': return annualizedApr / 12;
      case '24h': return annualizedApr / 365;
      default: return annualizedApr;
    }
  };

  const getWindowLabel = () => {
    switch (aprWindow) {
      case '1m': return 'Monthly';
      case '24h': return 'Daily';
      default: return 'Annual';
    }
  };

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
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm text-muted-foreground">APR Window:</span>
            <div className="flex gap-1">
              {(['1y', '1m', '24h'] as const).map((w) => (
                <Button
                  key={w}
                  variant={aprWindow === w ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setAprWindow(w)}
                  data-testid={`button-apr-${w}`}
                >
                  {w.toUpperCase()}
                </Button>
              ))}
            </div>
            <span className="text-xs text-muted-foreground ml-2">({getWindowLabel()} rates)</span>
          </div>

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
                  {formatAPR(scaleApr(apr?.passive?.totalPassive))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Fee: {formatAPR(scaleApr(apr?.passive?.feeAprValue))} + Harvest: {formatAPR(scaleApr(apr?.passive?.harvestAprValue))}
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
                  {scaleApr(apr?.active?.questAprWorst) === scaleApr(apr?.active?.questAprBest) 
                    ? formatAPR(scaleApr(apr?.active?.questAprWorst))
                    : `${formatAPR(scaleApr(apr?.active?.questAprWorst))} - ${formatAPR(scaleApr(apr?.active?.questAprBest))}`
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
                  {scaleApr(apr?.total?.worst) === scaleApr(apr?.total?.best) 
                    ? formatAPR(scaleApr(apr?.total?.worst))
                    : `${formatAPR(scaleApr(apr?.total?.worst))} - ${formatAPR(scaleApr(apr?.total?.best))}`
                  }
                </div>
                <p className="text-xs text-muted-foreground">
                  Combined passive + active APR
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  All Gardeners List
                </CardTitle>
                <CardDescription className="flex items-center gap-2">
                  {stakersData?.count || 0} wallets staked in this pool
                  {stakersData?.source && (
                    <Badge variant={stakersData.source === 'indexed' ? 'default' : 'secondary'}>
                      {stakersData.source === 'indexed' ? 'Indexed' : 'Live Scan'}
                    </Badge>
                  )}
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchStakers()}
                disabled={stakersFetching}
                data-testid="button-fetch-stakers"
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${stakersFetching ? "animate-spin" : ""}`} />
                {stakersFetching ? "Fetching..." : "Fetch Stakers"}
              </Button>
            </CardHeader>
            <CardContent>
              {stakersLoading || stakersFetching ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-muted-foreground">Scanning blockchain...</span>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Wallet</TableHead>
                      <TableHead>Summoner</TableHead>
                      <TableHead className="text-right">Staked Value</TableHead>
                      <TableHead className="text-right">Pool Share</TableHead>
                      <TableHead className="text-right">Last Activity</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stakersData?.stakers.map((staker, index) => (
                      <TableRow key={staker.wallet} data-testid={`row-staker-${index}`}>
                        <TableCell>
                          <a 
                            href={`https://subnets.avax.network/defi-kingdoms/address/${staker.wallet}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-sm hover:underline"
                            onClick={(e) => e.stopPropagation()}
                            data-testid={`link-wallet-${index}`}
                          >
                            <code className="text-xs bg-muted px-2 py-1 rounded">
                              {formatAddress(staker.wallet)}
                            </code>
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </TableCell>
                        <TableCell data-testid={`text-summoner-${index}`}>
                          {staker.summonerName ? (
                            <span className="font-medium text-primary">{staker.summonerName}</span>
                          ) : (
                            <span className="text-muted-foreground text-xs">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium" data-testid={`text-staked-${index}`}>
                          ${parseFloat(staker.stakedValue).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right" data-testid={`text-share-${index}`}>
                          <div className="flex items-center justify-end gap-2">
                            <Progress 
                              value={Math.min(parseFloat(staker.poolShare), 100)} 
                              className="w-16 h-2"
                            />
                            <span className="text-sm text-muted-foreground w-14 text-right">
                              {parseFloat(staker.poolShare).toFixed(2)}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right" data-testid={`text-activity-${index}`}>
                          <div className="flex flex-col items-end">
                            <Badge variant={staker.lastActivity.type === 'Deposit' ? 'default' : 'secondary'}>
                              {staker.lastActivity.type}
                            </Badge>
                            <span className="text-xs text-muted-foreground mt-1">
                              {parseFloat(staker.lastActivity.amount).toLocaleString(undefined, { maximumFractionDigits: 4 })} LP
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {(!stakersData?.stakers || stakersData.stakers.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          No stakers found. Click "Fetch Stakers" to scan blockchain.
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
