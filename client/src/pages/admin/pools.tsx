import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
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
import { RefreshCw, Droplets, TrendingUp, ChevronRight } from "lucide-react";

interface Pool {
  pid: number;
  pairName: string;
  lpToken: string;
  tokens: { symbol: string; address: string }[];
  tvl: number;
  v1TVL: number;
  v2TVL: number;
  passiveAPR: number;
  activeAPRMin: number;
  activeAPRMax: number;
  totalAPRMin: number;
  totalAPRMax: number;
}

interface PoolsResponse {
  pools: Pool[];
  count: number;
}

export default function AdminPools() {
  const [, setLocation] = useLocation();
  
  const { data, isLoading, refetch } = useQuery<PoolsResponse>({
    queryKey: ["/api/admin/pools"],
    refetchInterval: 30000, // Auto-refresh every 30 seconds to get updated cache
  });

  const formatCurrency = (value: number | undefined | null) => {
    if (value === undefined || value === null || isNaN(value)) {
      return "$0.00";
    }
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(2)}M`;
    } else if (value >= 1000) {
      return `$${(value / 1000).toFixed(2)}K`;
    }
    return `$${value.toFixed(2)}`;
  };

  const formatAPR = (value: number | undefined | null) => {
    if (value === undefined || value === null || isNaN(value)) {
      return "0.00%";
    }
    return `${(value * 100).toFixed(2)}%`;
  };

  const handleRowClick = (pid: number) => {
    setLocation(`/admin/pools/${pid}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Garden Pools</h1>
          <p className="text-muted-foreground">
            LP pools with APR breakdowns and gardener analytics
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => refetch()}
          disabled={isLoading}
          data-testid="button-refresh"
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Droplets className="h-5 w-5" />
            Active Pools
          </CardTitle>
          <CardDescription>
            {data?.count || 0} pools with staked liquidity
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PID</TableHead>
                  <TableHead>Pair</TableHead>
                  <TableHead className="text-right">V1 TVL</TableHead>
                  <TableHead className="text-right">V2 TVL</TableHead>
                  <TableHead className="text-right">Total TVL</TableHead>
                  <TableHead className="text-right">Passive APR</TableHead>
                  <TableHead className="text-right">Active APR</TableHead>
                  <TableHead className="text-right">Total APR</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.pools.map((pool) => (
                  <TableRow 
                    key={pool.pid} 
                    className="cursor-pointer hover-elevate"
                    onClick={() => handleRowClick(pool.pid)}
                    data-testid={`row-pool-${pool.pid}`}
                  >
                    <TableCell>
                      <Badge variant="outline" data-testid={`badge-pid-${pool.pid}`}>
                        {pool.pid}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium" data-testid={`text-pair-${pool.pid}`}>
                          {pool.pairName}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right" data-testid={`text-v1-tvl-${pool.pid}`}>
                      {pool.v1TVL > 0 ? (
                        <span className="text-amber-600 dark:text-amber-400 font-medium">
                          {formatCurrency(pool.v1TVL)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right" data-testid={`text-v2-tvl-${pool.pid}`}>
                      {pool.v2TVL > 0 ? (
                        <span className="text-green-600 dark:text-green-400 font-medium">
                          {formatCurrency(pool.v2TVL)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium" data-testid={`text-tvl-${pool.pid}`}>
                      {formatCurrency(pool.tvl)}
                    </TableCell>
                    <TableCell className="text-right" data-testid={`text-passive-apr-${pool.pid}`}>
                      <div className="flex items-center justify-end gap-1">
                        <TrendingUp className="h-3 w-3 text-muted-foreground" />
                        {formatAPR(pool.passiveAPR)}
                      </div>
                    </TableCell>
                    <TableCell className="text-right" data-testid={`text-active-apr-${pool.pid}`}>
                      {pool.activeAPRMin === pool.activeAPRMax ? (
                        formatAPR(pool.activeAPRMin)
                      ) : (
                        <span className="text-muted-foreground">
                          {formatAPR(pool.activeAPRMin)} - {formatAPR(pool.activeAPRMax)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right" data-testid={`text-total-apr-${pool.pid}`}>
                      <Badge variant="secondary">
                        {pool.totalAPRMin === pool.totalAPRMax ? (
                          formatAPR(pool.totalAPRMin)
                        ) : (
                          `${formatAPR(pool.totalAPRMin)} - ${formatAPR(pool.totalAPRMax)}`
                        )}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ))}
                {(!data?.pools || data.pools.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      No pools found. Check that pool analytics cache is populated.
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
