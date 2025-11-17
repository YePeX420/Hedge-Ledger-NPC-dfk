import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, Coins, TrendingUp, Activity } from "lucide-react";

interface OverviewData {
  players: {
    total: number;
    withBalance: number;
  };
  deposits: {
    total: number;
    completed: number;
    totalJewel: string;
  };
  balances: {
    totalBalance: string;
    activeBalances: number;
  };
  revenue: {
    totalRevenue: string;
    totalProfit: string;
    totalQueries: number;
    paidQueries: number;
  };
}

interface Player {
  id: number;
  discordId: string;
  discordUsername: string;
  tier: string | null;
  balance: string | null;
  firstSeenAt: string;
}

interface Deposit {
  id: number;
  playerId: number;
  discordUsername: string | null;
  requestedAmount: string;
  uniqueAmount: string;
  status: string;
  transactionHash: string | null;
  requestedAt: string;
  completedAt: string | null;
}

interface QueryBreakdown {
  queryType: string;
  count: number;
  totalRevenue: string;
  freeTier: number;
}

export default function Dashboard() {
  const { data: overview, isLoading: loadingOverview } = useQuery<OverviewData>({
    queryKey: ['/api/analytics/overview'],
  });

  const { data: players } = useQuery<Player[]>({
    queryKey: ['/api/analytics/players'],
  });

  const { data: deposits } = useQuery<Deposit[]>({
    queryKey: ['/api/analytics/deposits'],
  });

  const { data: queryBreakdown } = useQuery<QueryBreakdown[]>({
    queryKey: ['/api/analytics/query-breakdown'],
  });

  if (loadingOverview) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <Skeleton className="h-12 w-64" />
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6" data-testid="dashboard-container">
      <div>
        <h1 className="text-3xl font-bold" data-testid="dashboard-title">Hedge Ledger Analytics</h1>
        <p className="text-muted-foreground" data-testid="dashboard-subtitle">
          Real-time metrics for your DeFi Kingdoms Discord bot
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card data-testid="card-players">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Players</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-players">
              {overview?.players.total || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {overview?.players.withBalance || 0} with active balances
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-deposits">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">JEWEL Deposits</CardTitle>
            <Coins className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-jewel">
              {parseFloat(overview?.deposits.totalJewel || '0').toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground">
              {overview?.deposits.completed || 0} completed deposits
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-revenue">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-revenue">
              ${parseFloat(overview?.revenue.totalRevenue || '0').toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground">
              Profit: ${parseFloat(overview?.revenue.totalProfit || '0').toFixed(2)}
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-queries">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Queries</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-queries">
              {overview?.revenue.totalQueries || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {overview?.revenue.paidQueries || 0} paid queries
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card data-testid="card-recent-players">
          <CardHeader>
            <CardTitle>Recent Players</CardTitle>
            <CardDescription>Latest users who joined the bot</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Username</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {players?.slice(0, 5).map((player) => (
                  <TableRow key={player.id} data-testid={`row-player-${player.id}`}>
                    <TableCell className="font-medium">{player.discordUsername}</TableCell>
                    <TableCell>
                      <Badge variant={player.tier === 'free' ? 'secondary' : 'default'}>
                        {player.tier || 'free'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {parseFloat(player.balance || '0').toFixed(2)} JEWEL
                    </TableCell>
                  </TableRow>
                ))}
                {!players || players.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">
                      No players yet
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card data-testid="card-recent-deposits">
          <CardHeader>
            <CardTitle>Recent Deposits</CardTitle>
            <CardDescription>Latest JEWEL deposits to the bot</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deposits?.slice(0, 5).map((deposit) => (
                  <TableRow key={deposit.id} data-testid={`row-deposit-${deposit.id}`}>
                    <TableCell className="font-medium">
                      {deposit.discordUsername || `Player #${deposit.playerId}`}
                    </TableCell>
                    <TableCell>{parseFloat(deposit.requestedAmount).toFixed(2)} JEWEL</TableCell>
                    <TableCell>
                      <Badge 
                        variant={deposit.status === 'completed' ? 'default' : 'secondary'}
                        data-testid={`badge-status-${deposit.id}`}
                      >
                        {deposit.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {!deposits || deposits.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">
                      No deposits yet
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card data-testid="card-query-breakdown">
        <CardHeader>
          <CardTitle>Query Type Breakdown</CardTitle>
          <CardDescription>Analytics queries by type</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Query Type</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Free Tier</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {queryBreakdown?.map((query) => (
                <TableRow key={query.queryType} data-testid={`row-query-${query.queryType}`}>
                  <TableCell className="font-medium">{query.queryType}</TableCell>
                  <TableCell className="text-right">{query.count}</TableCell>
                  <TableCell className="text-right">{query.freeTier}</TableCell>
                  <TableCell className="text-right">
                    ${parseFloat(query.totalRevenue).toFixed(2)}
                  </TableCell>
                </TableRow>
              ))}
              {!queryBreakdown || queryBreakdown.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    No queries yet
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
