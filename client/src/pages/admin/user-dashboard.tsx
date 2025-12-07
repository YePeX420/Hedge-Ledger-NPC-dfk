import { useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Copy, RefreshCw, ArrowDownRight, ArrowUpRight, AlertTriangle } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface HedgeSettings {
  notifyOnAprDrop: boolean;
  notifyOnNewOptimization: boolean;
}

interface OptimizationRow {
  id: number;
  createdAt?: string;
  status: string;
  service?: string;
  paymentJewel?: number;
  poolCount?: number;
}

interface LPPosition {
  pid?: number;
  poolName?: string;
  lpToken?: string;
  stakedAmount?: string | number;
  userTVL?: string | number;
}

interface Snapshot {
  heroCount?: number;
  lpPositionsCount?: number;
  lpPositions?: LPPosition[];
  totalLPValue?: number;
  jewelBalance?: number;
  crystalBalance?: number;
  cJewelBalance?: number;
  cJewelLockDaysRemaining?: number;
  dfkAgeDays?: number;
  firstTxAt?: string;
}

interface BridgeActivity {
  totalBridgedInUsd: number;
  totalBridgedOutUsd: number;
  netExtractedUsd: number;
  heroesIn: number;
  heroesOut: number;
  extractorScore: number;
  extractorFlags: string[];
  lastBridgeAt?: string;
}

interface UserSummary {
  success: boolean;
  user: {
    id: number;
    discordId: string;
    discordUsername: string;
    walletAddress?: string | null;
    tier: number;
    archetype: string;
    state: string;
    flags: Record<string, boolean>;
    behaviorTags: string[];
    dfkSnapshot: Snapshot | null;
    recentOptimizations: OptimizationRow[];
    userSettings: HedgeSettings;
    bridgeActivity: BridgeActivity | null;
    lastUpdatedAt: string | null;
  };
}

function formatDate(value?: string | null) {
  if (!value) return "N/A";
  const date = new Date(value);
  return isNaN(date.getTime()) ? "N/A" : date.toLocaleString();
}

function formatUsd(value: number | undefined | null): string {
  const num = typeof value === 'number' && isFinite(value) ? value : 0;
  return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function safeParseFloat(value: string | number | undefined | null, decimals: number = 2): string {
  if (value === undefined || value === null || value === '') return (0).toFixed(decimals);
  const num = typeof value === 'number' ? value : parseFloat(String(value));
  return isFinite(num) ? num.toFixed(decimals) : (0).toFixed(decimals);
}

export default function AdminUserDashboard() {
  const { discordId } = useParams();
  const { toast } = useToast();
  
  console.log('[UserDashboard] Component mounted, discordId:', discordId);

  const { data, isLoading, error } = useQuery<UserSummary>({
    queryKey: ["/api/user/summary", discordId],
    enabled: Boolean(discordId),
  });

  const user = data?.user;

  const settingsMutation = useMutation({
    mutationFn: async (updates: Partial<HedgeSettings>) => {
      if (!discordId) throw new Error("Missing discordId");
      const res = await fetch(`/api/user/settings/${discordId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(updates),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to update settings");
      }

      return (await res.json()) as { userSettings: HedgeSettings };
    },
    onMutate: async (updates) => {
      await queryClient.cancelQueries({ queryKey: ["/api/user/summary", discordId] });
      const previous = queryClient.getQueryData<UserSummary>(["/api/user/summary", discordId]);

      if (previous?.user) {
        queryClient.setQueryData<UserSummary>(["/api/user/summary", discordId], {
          ...previous,
          user: {
            ...previous.user,
            userSettings: {
              ...previous.user.userSettings,
              ...updates,
            },
          },
        });
      }

      return { previous };
    },
    onError: (err: Error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["/api/user/summary", discordId], context.previous);
      }
      toast({
        title: "Failed to save settings",
        description: err.message,
        variant: "destructive",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/summary", discordId] });
      toast({ title: "Settings updated" });
    },
  });

  const archetypeBadge = useMemo(() => {
    switch (user?.archetype) {
      case "INVESTOR":
        return "default";
      case "PLAYER":
        return "secondary";
      case "ADVENTURER":
        return "outline";
      case "EXTRACTOR":
        return "destructive";
      default:
        return "outline";
    }
  }, [user?.archetype]);

  const copyWallet = async () => {
    if (!user?.walletAddress) return;
    await navigator.clipboard.writeText(user.walletAddress);
    toast({ title: "Wallet copied" });
  };

  const toggleSetting = (key: keyof HedgeSettings, value: boolean) => {
    settingsMutation.mutate({ [key]: value });
  };

  const refreshSnapshotMutation = useMutation({
    mutationFn: async () => {
      if (!user?.walletAddress) throw new Error("No wallet address");
      return apiRequest("POST", `/api/admin/refresh-snapshot/${user.walletAddress}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/summary", discordId] });
      toast({ title: "Snapshot refreshed", description: "DFK data has been updated." });
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to refresh snapshot",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="p-6 space-y-4">
        <Link href="/admin/users">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <Card>
          <CardHeader>
            <CardTitle>Error loading user</CardTitle>
            <CardDescription>
              Unable to load user dashboard. Please return to the Users list.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const snapshot = user.dfkSnapshot;

  return (
    <div className="p-6 space-y-6" data-testid="admin-user-dashboard">
      <div className="flex items-center gap-3">
        <Link href="/admin/users">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">{user.discordUsername}</h1>
          <p className="text-muted-foreground text-sm">Discord ID: {user.discordId}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Badge variant={archetypeBadge}>{user.archetype}</Badge>
          <Badge className="bg-blue-600 text-white">Tier {user.tier ?? 0}</Badge>
          <Badge variant="outline">{user.state}</Badge>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Account Overview</CardTitle>
            <CardDescription>
              Wallet and profile snapshot powered by stored data (no live on-chain calls).
            </CardDescription>
          </div>
          {user.lastUpdatedAt && (
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <RefreshCw className="h-4 w-4" />
              Updated {formatDate(user.lastUpdatedAt)}
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Primary Wallet</p>
              <div className="flex items-center gap-2">
                <code className="text-xs bg-muted px-2 py-1 rounded">
                  {user.walletAddress ? `${user.walletAddress.slice(0, 6)}...${user.walletAddress.slice(-4)}` : "Not linked"}
                </code>
                {user.walletAddress && (
                  <Button size="icon" variant="ghost" onClick={copyWallet}>
                    <Copy className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
            <Separator orientation="vertical" className="h-10" />
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Flags</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(user.flags || {}).filter(([, v]) => v).length === 0 && (
                  <span className="text-xs text-muted-foreground">None</span>
                )}
                {Object.entries(user.flags || {})
                  .filter(([, v]) => v)
                  .map(([k]) => (
                    <Badge key={k} variant="secondary" className="text-xs">
                      {k}
                    </Badge>
                  ))}
              </div>
            </div>
            <Separator orientation="vertical" className="h-10" />
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Behavior Tags</p>
              <div className="flex flex-wrap gap-2">
                {user.behaviorTags?.length ? (
                  user.behaviorTags.map((tag) => (
                    <Badge key={tag} variant="outline" className="text-xs">
                      {tag}
                    </Badge>
                  ))
                ) : (
                  <span className="text-xs text-muted-foreground">No tags</span>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div>
              <CardTitle>DeFi Kingdoms Snapshot</CardTitle>
              <CardDescription>Cached hero and garden metrics for this player.</CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refreshSnapshotMutation.mutate()}
              disabled={refreshSnapshotMutation.isPending || !user?.walletAddress}
              data-testid="button-refresh-snapshot"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshSnapshotMutation.isPending ? 'animate-spin' : ''}`} />
              {refreshSnapshotMutation.isPending ? 'Refreshing...' : 'Refresh'}
            </Button>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Hero Count</p>
              <p className="text-lg font-semibold">{snapshot?.heroCount ?? 0}</p>
            </div>
            <div>
              <p className="text-muted-foreground">LP Positions</p>
              <p className="text-lg font-semibold">{snapshot?.lpPositions?.length ?? snapshot?.lpPositionsCount ?? 0}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Total LP Value (USD)</p>
              <p className="text-lg font-semibold">${snapshot?.totalLPValue?.toFixed(2) ?? "0.00"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">DFK Age (days)</p>
              <p className="text-lg font-semibold">{snapshot?.dfkAgeDays ?? "–"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">JEWEL</p>
              <p className="text-lg font-semibold">{snapshot?.jewelBalance ?? 0}</p>
            </div>
            <div>
              <p className="text-muted-foreground">CRYSTAL</p>
              <p className="text-lg font-semibold">{snapshot?.crystalBalance ?? 0}</p>
            </div>
            <div>
              <p className="text-muted-foreground">cJEWEL</p>
              <p className="text-lg font-semibold">{snapshot?.cJewelBalance ?? 0}</p>
            </div>
            <div>
              <p className="text-muted-foreground">cJEWEL Lock (days)</p>
              <p className="text-lg font-semibold">{snapshot?.cJewelLockDaysRemaining ?? "–"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">First TX</p>
              <p className="text-lg font-semibold">{snapshot?.firstTxAt ? formatDate(snapshot.firstTxAt) : "N/A"}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div>
              <CardTitle>Recent Optimizations</CardTitle>
              <CardDescription>Latest garden optimization jobs for this player.</CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              data-testid="button-expire-all"
              onClick={async () => {
                try {
                  const res = await fetch(`/api/user/${discordId}/expire-optimizations`, {
                    method: 'POST',
                    credentials: 'include',
                  });
                  if (!res.ok) throw new Error('Failed to expire optimizations');
                  toast({ title: 'All stale optimizations marked as expired' });
                  queryClient.invalidateQueries({ queryKey: ['/api/user/summary', discordId] });
                } catch (err) {
                  toast({ title: 'Error', description: 'Failed to expire optimizations', variant: 'destructive' });
                }
              }}
            >
              Mark All Expired
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {user.recentOptimizations?.length ? (
              user.recentOptimizations.map((opt) => (
                <div key={opt.id} className="p-3 rounded-lg border flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">{opt.service || "garden_optimization"}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(opt.createdAt)}</p>
                  </div>
                  <div className="text-right space-y-1">
                    <Badge variant="outline" className="uppercase text-[11px]">
                      {opt.status}
                    </Badge>
                    <div className="text-xs text-muted-foreground">
                      {opt.paymentJewel ? `${opt.paymentJewel} JEWEL` : ""}
                      {opt.poolCount ? ` · ${opt.poolCount} pools` : ""}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No optimization history found.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bridge Activity Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Bridge Activity
            {user.bridgeActivity && user.bridgeActivity.netExtractedUsd > 100 && (
              <Badge variant="outline" className="text-orange-600 border-orange-600">
                <AlertTriangle className="h-3 w-3 mr-1" />
                Extractor
              </Badge>
            )}
          </CardTitle>
          <CardDescription>Cross-chain bridge flows for this wallet.</CardDescription>
        </CardHeader>
        <CardContent>
          {user.bridgeActivity ? (
            <div className="grid gap-4 md:grid-cols-4">
              <div>
                <p className="text-sm text-muted-foreground">Bridged In</p>
                <p className="text-xl font-semibold text-green-600 flex items-center gap-1" data-testid="text-bridge-in">
                  <ArrowDownRight className="h-4 w-4" />
                  ${formatUsd(user.bridgeActivity.totalBridgedInUsd)}
                </p>
                <p className="text-xs text-muted-foreground">{user.bridgeActivity.heroesIn ?? 0} heroes</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Bridged Out</p>
                <p className="text-xl font-semibold text-red-600 flex items-center gap-1" data-testid="text-bridge-out">
                  <ArrowUpRight className="h-4 w-4" />
                  ${formatUsd(user.bridgeActivity.totalBridgedOutUsd)}
                </p>
                <p className="text-xs text-muted-foreground">{user.bridgeActivity.heroesOut ?? 0} heroes</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Net Extracted</p>
                <p className={`text-xl font-semibold ${(user.bridgeActivity.netExtractedUsd ?? 0) > 0 ? 'text-orange-600' : 'text-green-600'}`} data-testid="text-net-extracted">
                  ${formatUsd(user.bridgeActivity.netExtractedUsd)}
                </p>
                <p className="text-xs text-muted-foreground">Score: {user.bridgeActivity.extractorScore ?? 0}/10</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Last Bridge</p>
                <p className="text-sm" data-testid="text-last-bridge">
                  {user.bridgeActivity.lastBridgeAt ? formatDate(user.bridgeActivity.lastBridgeAt) : 'N/A'}
                </p>
                {user.bridgeActivity.extractorFlags && user.bridgeActivity.extractorFlags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {user.bridgeActivity.extractorFlags.map((flag) => (
                      <Badge key={flag} variant="outline" className="text-xs">
                        {flag.replace(/_/g, ' ')}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No bridge activity found for this wallet. Run the bridge indexer to populate data.</p>
          )}
        </CardContent>
      </Card>

      {/* LP Positions Details */}
      <Card>
        <CardHeader>
          <CardTitle>LP Positions Details</CardTitle>
          <CardDescription>Breakdown of staked LP tokens across garden pools.</CardDescription>
        </CardHeader>
        <CardContent>
          {snapshot?.lpPositions && snapshot.lpPositions.length > 0 ? (
            <div className="space-y-2">
              <div className="grid grid-cols-4 gap-4 text-xs text-muted-foreground font-medium pb-2 border-b">
                <div>Pool</div>
                <div className="text-right">PID</div>
                <div className="text-right">Staked LP</div>
                <div className="text-right">Value (USD)</div>
              </div>
              {snapshot.lpPositions.map((pos, idx) => (
                <div key={pos.pid ?? idx} className="grid grid-cols-4 gap-4 text-sm py-2 border-b border-muted/50" data-testid={`row-lp-position-${pos.pid ?? idx}`}>
                  <div className="font-medium">{pos.poolName?.replace(/wJEWEL/g, 'JEWEL') || `Pool ${pos.pid ?? idx}`}</div>
                  <div className="text-right text-muted-foreground">{pos.pid ?? '-'}</div>
                  <div className="text-right font-mono">{safeParseFloat(pos.stakedAmount, 4)}</div>
                  <div className="text-right font-semibold">${safeParseFloat(pos.userTVL, 2)}</div>
                </div>
              ))}
              <div className="grid grid-cols-4 gap-4 text-sm pt-2 font-semibold">
                <div className="col-span-3 text-right">Total:</div>
                <div className="text-right">${snapshot.totalLPValue?.toFixed(2) ?? '0.00'}</div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No LP positions found. Click "Refresh Snapshot" above to fetch latest data.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Hedge Settings</CardTitle>
          <CardDescription>Per-user notification preferences.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Notify me when APR drops on one of my pools</p>
              <p className="text-sm text-muted-foreground">Uses cached pool data; no live RPC calls.</p>
            </div>
            <Switch
              checked={user.userSettings.notifyOnAprDrop}
              onCheckedChange={(checked) => toggleSetting("notifyOnAprDrop", checked)}
              disabled={settingsMutation.isPending}
            />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Notify me when a new optimization report is ready</p>
              <p className="text-sm text-muted-foreground">Alerts when fresh optimization output is available.</p>
            </div>
            <Switch
              checked={user.userSettings.notifyOnNewOptimization}
              onCheckedChange={(checked) => toggleSetting("notifyOnNewOptimization", checked)}
              disabled={settingsMutation.isPending}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
