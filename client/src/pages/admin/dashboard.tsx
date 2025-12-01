import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Users, DollarSign, TrendingUp, Activity } from 'lucide-react';

interface OverviewStats {
  players: {
    total: number;
    withBalance: number;
  };
  deposits: {
    totalJewel: string;
    completed: number;
  };
  revenue: {
    totalRevenue: string;
    totalProfit: string;
    totalQueries: number;
    paidQueries: number;
  };
}

export default function AdminDashboard() {
  const { data: overview, isLoading } = useQuery<OverviewStats>({
    queryKey: ['/api/analytics/overview'],
  });

  return (
    <div className="p-6 space-y-6" data-testid="admin-dashboard">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Overview of Hedge Ledger activity and metrics</p>
      </div>

      {/* Metrics Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">Total Players</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className="text-2xl font-bold" data-testid="stat-total-players">
                  {overview?.players.total ?? 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  {overview?.players.withBalance ?? 0} with active balances
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">JEWEL Deposits</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className="text-2xl font-bold" data-testid="stat-total-jewel">
                  {parseFloat(overview?.deposits.totalJewel ?? '0').toFixed(2)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {overview?.deposits.completed ?? 0} completed deposits
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className="text-2xl font-bold" data-testid="stat-total-revenue">
                  ${parseFloat(overview?.revenue.totalRevenue ?? '0').toFixed(2)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Profit: ${parseFloat(overview?.revenue.totalProfit ?? '0').toFixed(2)}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">Total Queries</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className="text-2xl font-bold" data-testid="stat-total-queries">
                  {overview?.revenue.totalQueries ?? 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  {overview?.revenue.paidQueries ?? 0} paid queries
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Placeholder for more content */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Latest player interactions and system events</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Activity feed will be displayed here. Navigate to Users to manage player profiles.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
