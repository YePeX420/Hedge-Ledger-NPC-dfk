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
import { ArrowLeft, Copy, RefreshCw } from "lucide-react";
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

interface Snapshot {
  heroCount?: number;
  lpPositionsCount?: number;
  totalLPValue?: number;
  jewelBalance?: number;
  crystalBalance?: number;
  cJewelBalance?: number;
  dfkAgeDays?: number;
  firstTxAt?: string;
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
    lastUpdatedAt: string | null;
  };
}

function formatDate(value?: string | null) {
  if (!value) return "N/A";
  const date = new Date(value);
  return isNaN(date.getTime()) ? "N/A" : date.toLocaleString();
}

export default function AdminUserDashboard() {
  const { discordId } = useParams();
  const { toast } = useToast();

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
          <CardHeader>
            <CardTitle>DeFi Kingdoms Snapshot</CardTitle>
            <CardDescription>Cached hero and garden metrics for this player.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Hero Count</p>
              <p className="text-lg font-semibold">{snapshot?.heroCount ?? 0}</p>
            </div>
            <div>
              <p className="text-muted-foreground">LP Positions</p>
              <p className="text-lg font-semibold">{snapshot?.lpPositionsCount ?? 0}</p>
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
              <p className="text-muted-foreground">First TX</p>
              <p className="text-lg font-semibold">{snapshot?.firstTxAt ? formatDate(snapshot.firstTxAt) : "N/A"}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Optimizations</CardTitle>
            <CardDescription>Latest garden optimization jobs for this player.</CardDescription>
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
