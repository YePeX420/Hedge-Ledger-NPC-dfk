import { useQuery } from "@tanstack/react-query";
import { useSearch } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Copy, Wallet, Users, TrendingUp, Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

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

  const { data: user, isLoading, error } = useQuery<UserAccountData>({
    queryKey: ["/api/admin/users", userId, "account"],
    queryFn: async () => {
      const response = await fetch(`/api/admin/users`);
      if (!response.ok) throw new Error("Failed to fetch users");
      const users = await response.json();
      const foundUser = users.find((u: any) => u.discordId === userId);
      if (!foundUser) throw new Error("User not found");
      return foundUser;
    },
    enabled: !!userId,
  });

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
      </div>
    </div>
  );
}
