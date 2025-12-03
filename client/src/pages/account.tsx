import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useSearch } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Copy, Wallet, Users, TrendingUp, Coins, Leaf } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface LPPosition {
  pid: number;
  pairName: string;
  lpToken: string;
  lpBalance: string;
  userTVL: string;
  shareOfPool: string;
  poolData: {
    totalTVL?: string;
    fee24hAPR?: string;
    harvesting24hAPR?: string;
    gardeningQuestAPR?: {
      worst?: string;
      best?: string;
    };
    totalAPR?: string;
    token0?: { symbol: string };
    token1?: { symbol: string };
    daily?: {
      jewel?: number;
      crystal?: number;
    };
  };
}

interface UserAccountData {
  id: number;
  discordId: string;
  discordUsername: string;
  walletAddress: string | null;
  archetype: string;
  tier: number;
  state: string;
  influence: number;
  kpis: {
    engagementScore: number;
    financialScore: number;
    retentionScore: number;
    messagesLast7d: number;
  };
  dfkSnapshot: {
    heroCount: number;
    gen0Count: number;
    dfkAgeDays: number | null;
    lpPositionsCount: number;
    totalLPValue: number;
    jewelBalance: number;
    crystalBalance: number;
    cJewelBalance: number;
    questingStreakDays: number;
  } | null;
  walletBalances: {
    jewel: string;
    crystal: string;
    cJewel: string;
    change7d: string | null;
  } | null;
}

const tierNames: Record<number, string> = {
  0: "Guest",
  1: "Bronze",
  2: "Silver",
  3: "Gold",
  4: "Council"
};

export default function AccountPage() {
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const userId = params.get("userId");
  const { toast } = useToast();
  const [lpViewMode, setLpViewMode] = useState<"apr" | "tokens">("apr");

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("lpViewMode") : null;
    if (saved === "tokens" || saved === "apr") {
      setLpViewMode(saved);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("lpViewMode", lpViewMode);
    }
  }, [lpViewMode]);

  const { data: user, isLoading, error } = useQuery<UserAccountData>({
    queryKey: ["/api/admin/users", userId, "account"],
    queryFn: async () => {
      const response = await fetch(`/api/admin/users`);
      if (!response.ok) {
        console.error("Failed to fetch users:", response.status, response.statusText);
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      const usersArray = Array.isArray(data?.users) ? data.users : Array.isArray(data) ? data : null;
      if (!usersArray) {
        console.error("Invalid API response format:", data);
        throw new Error("Invalid API response");
      }
      const foundUser = usersArray.find((u: any) => u.discordId === userId);
      if (!foundUser) throw new Error("User not found");
      return foundUser;
    },
    enabled: !!userId,
    retry: 1,
  });

  const { data: lpData, isLoading: lpLoading, error: lpError } = useQuery<{
    positions: LPPosition[];
    totalValue: string;
  }>({
    queryKey: ["/api/admin/lp-positions", user?.walletAddress],
    queryFn: async () => {
      console.log(`[LP Fetch] Fetching LP positions for wallet: ${user!.walletAddress}`);
      const response = await fetch(`/api/admin/lp-positions/${user!.walletAddress}`, {
        credentials: 'include'
      });
      console.log(`[LP Fetch] Response status: ${response.status}`);
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[LP Fetch] Error response:`, errorText);
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      console.log(`[LP Fetch] Got ${data.positions?.length || 0} positions, total value: ${data.totalValue}`);
      return { positions: data.positions || [], totalValue: data.totalValue || "0.00" };
    },
    enabled: !!user?.walletAddress,
    retry: 1,
    staleTime: 60000,
  });
  
  if (lpError) {
    console.error("[LP Fetch] Query error:", lpError);
  }

  const formatTokenPerDay = (value?: number) => {
    const num = Number(value);
    return Number.isFinite(num) ? num.toFixed(2) : "0.00";
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard" });
  };

  if (!userId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground">No user ID provided</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          <Skeleton className="h-12 w-64" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center">
            <p className="text-red-500">Failed to load account data</p>
            <p className="text-muted-foreground text-sm mt-2">User may not exist or you may need to log in</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" data-testid="account-page">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold" data-testid="account-title">
              {user.discordUsername}'s Dashboard
            </h1>
            <p className="text-muted-foreground text-sm">Hedge Ledger Account Overview</p>
          </div>
          <Badge className="text-sm px-3 py-1" data-testid="badge-tier">
            {tierNames[user.tier] || "Guest"}
          </Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card data-testid="card-profile">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5" />
                Profile
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Discord</span>
                <span className="font-medium">{user.discordUsername}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Archetype</span>
                <Badge variant="outline">{user.archetype}</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">State</span>
                <span className="font-medium">{user.state}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Influence</span>
                <span className="font-medium">{(user.influence || 0).toLocaleString()}</span>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-wallet">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Wallet className="h-5 w-5" />
                Wallet
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {user.walletAddress ? (
                <>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Address</span>
                    <div className="flex items-center gap-1">
                      <code className="text-xs">{user.walletAddress.slice(0, 6)}...{user.walletAddress.slice(-4)}</code>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        onClick={() => copyToClipboard(user.walletAddress!)}
                        data-testid="button-copy-wallet"
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  {user.walletBalances && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">JEWEL</span>
                        <span className="font-medium">{parseFloat(user.walletBalances.jewel).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">CRYSTAL</span>
                        <span className="font-medium">{parseFloat(user.walletBalances.crystal).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">cJEWEL</span>
                        <span className="font-medium">{parseFloat(user.walletBalances.cJewel).toFixed(2)}</span>
                      </div>
                    </>
                  )}
                </>
              ) : (
                <p className="text-muted-foreground">No wallet linked</p>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-portfolio">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Coins className="h-5 w-5" />
                DFK Portfolio
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {user.dfkSnapshot ? (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Heroes</span>
                    <span className="font-medium">{user.dfkSnapshot.heroCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Gen0 Heroes</span>
                    <span className="font-medium">{user.dfkSnapshot.gen0Count}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">LP Positions</span>
                    <span className="font-medium">{user.dfkSnapshot.lpPositionsCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total LP Value</span>
                    <span className="font-medium">${user.dfkSnapshot.totalLPValue?.toFixed(2) || "0.00"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Quest Streak</span>
                    <span className="font-medium">{user.dfkSnapshot.questingStreakDays || 0} days</span>
                  </div>
                </>
              ) : (
                <p className="text-muted-foreground">No portfolio data available</p>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-kpis">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Performance
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {user.kpis ? (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Engagement Score</span>
                    <span className="font-medium">{user.kpis.engagementScore?.toFixed(0) || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Financial Score</span>
                    <span className="font-medium">{user.kpis.financialScore?.toFixed(0) || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Retention Score</span>
                    <span className="font-medium">{user.kpis.retentionScore?.toFixed(0) || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Messages (7d)</span>
                    <span className="font-medium">{user.kpis.messagesLast7d || 0}</span>
                  </div>
                </>
              ) : (
                <p className="text-muted-foreground">No KPI data available</p>
              )}
            </CardContent>
          </Card>
        </div>

        <Card data-testid="card-lp-positions" className="mt-4">
          <CardHeader className="pb-2 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Leaf className="h-5 w-5" />
              LP Positions (Garden Pools)
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant={lpViewMode === "apr" ? "default" : "outline"}
                size="sm"
                onClick={() => setLpViewMode("apr")}
              >
                APR %
              </Button>
              <Button
                variant={lpViewMode === "tokens" ? "default" : "outline"}
                size="sm"
                onClick={() => setLpViewMode("tokens")}
              >
                Tokens / day
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {!user.walletAddress ? (
              <p className="text-muted-foreground text-sm">No wallet linked to fetch LP positions</p>
            ) : lpLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : lpData?.positions && lpData.positions.length > 0 ? (
              <div className="space-y-4">
                <div className="text-sm text-muted-foreground mb-2">
                  Total Value: <span className="font-semibold text-foreground">${lpData.totalValue}</span>
                </div>
                <div className="space-y-3">
                  {lpData.positions.map((pos) => (
                    <div 
                      key={pos.pid} 
                      className="border rounded-lg p-4 space-y-2"
                      data-testid={`lp-position-${pos.pid}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{pos.pairName}</span>
                          <Badge variant="outline" className="text-xs">
                            PID {pos.pid}
                          </Badge>
                        </div>
                        <span className="font-semibold text-green-600 dark:text-green-400">
                          ${pos.userTVL}
                        </span>
                      </div>
                      
                      {lpViewMode === "apr" ? (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                          <div>
                            <span className="text-muted-foreground">Total APR</span>
                            <div className="font-medium text-green-600 dark:text-green-400">
                              {pos.poolData.totalAPR || 'N/A'}
                            </div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Fee APR</span>
                            <div className="font-medium">{pos.poolData.fee24hAPR || 'N/A'}</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Harvesting APR</span>
                            <div className="font-medium">{pos.poolData.harvesting24hAPR || 'N/A'}</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Quest Boost</span>
                            <div className="font-medium">
                              {pos.poolData.gardeningQuestAPR?.worst && pos.poolData.gardeningQuestAPR?.best
                                ? `${pos.poolData.gardeningQuestAPR.worst} - ${pos.poolData.gardeningQuestAPR.best}`
                                : 'N/A'}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                          <div>
                            <span className="text-muted-foreground">JEWEL / day</span>
                            <div className="font-medium text-green-600 dark:text-green-400">
                              {formatTokenPerDay(pos.poolData.daily?.jewel)}
                            </div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">CRYSTAL / day</span>
                            <div className="font-medium text-green-600 dark:text-green-400">
                              {formatTokenPerDay(pos.poolData.daily?.crystal)}
                            </div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Quest Boost</span>
                            <div className="font-medium">
                              {pos.poolData.gardeningQuestAPR?.worst && pos.poolData.gardeningQuestAPR?.best
                                ? `${pos.poolData.gardeningQuestAPR.worst} - ${pos.poolData.gardeningQuestAPR.best}`
                                : 'N/A'}
                            </div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Share</span>
                            <div className="font-medium">{pos.shareOfPool}</div>
                          </div>
                        </div>
                      )}
                      
                      <div className="flex justify-between text-xs text-muted-foreground pt-1 border-t">
                        <span>Pool Share: {pos.shareOfPool}</span>
                        <span>Pool TVL: {pos.poolData.totalTVL}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">No LP positions found in garden pools</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
