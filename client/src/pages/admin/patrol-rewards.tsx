import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Search, Coins, AlertTriangle, CheckCircle, XCircle, ExternalLink, Shield, Clock, TrendingUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface PatrolHealthStats {
  eligible_completions: number;
  refunded_completions: number;
  refund_rate_pct: number | null;
  total_wmetis_24h: number;
  avg_wmetis_per_refund: number | null;
  last_refund_at: string | null;
  total_completions_all_time: number;
  total_full_completions_all_time: number;
  total_wmetis_all_time: number;
}

interface RewardItem {
  item_name: string;
  item_type: string;
  amount: number;
  item_address: string;
}

interface PatrolCompletion {
  id: number;
  tx_hash: string;
  completed_at: string;
  fights_completed: number;
  chain_id: number;
  patrol_name: string | null;
  patrol_type_id: number | null;
  rewards: RewardItem[];
  wmetis_refunded: number;
}

interface WalletSummary {
  total_completions: number;
  total_full_completions: number;
  total_wmetis_earned: number;
  first_patrol_at: string | null;
  last_patrol_at: string | null;
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function formatWmetis(val: number) {
  if (!val || val === 0) return "—";
  return val.toFixed(4);
}

function HealthIndicator({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-muted-foreground text-sm">No data yet</span>;
  if (pct >= 80) return (
    <div className="flex items-center gap-2">
      <CheckCircle className="w-5 h-5 text-green-500" />
      <span className="text-green-500 font-semibold text-2xl">{pct}%</span>
    </div>
  );
  if (pct >= 40) return (
    <div className="flex items-center gap-2">
      <AlertTriangle className="w-5 h-5 text-yellow-500" />
      <span className="text-yellow-500 font-semibold text-2xl">{pct}%</span>
    </div>
  );
  return (
    <div className="flex items-center gap-2">
      <XCircle className="w-5 h-5 text-destructive" />
      <span className="text-destructive font-semibold text-2xl">{pct}%</span>
    </div>
  );
}

function HealthVerdict({ pct }: { pct: number | null }) {
  if (pct === null) return <p className="text-muted-foreground text-sm">Index some Metis patrol data to see pool health.</p>;
  if (pct >= 80) return <p className="text-sm text-green-600 dark:text-green-400">Pool is well-funded. Completing all 3 stages is profitable right now.</p>;
  if (pct >= 40) return <p className="text-sm text-yellow-600 dark:text-yellow-400">Pool is partially funded. Refunds are inconsistent — patrol at your own risk.</p>;
  return <p className="text-sm text-destructive">Pool appears nearly empty. Most 3-stage completions are not receiving WMETIS. Not profitable to patrol.</p>;
}

export default function AdminPatrolRewards() {
  const [walletInput, setWalletInput] = useState("");
  const [submittedWallet, setSubmittedWallet] = useState("");
  const { toast } = useToast();

  const { data: healthData, isLoading: healthLoading, error: healthError } = useQuery<{ ok: boolean; stats: PatrolHealthStats }>({
    queryKey: ["/api/pve/patrol-health"],
    refetchInterval: 60000,
  });

  const { data: rewardsData, isLoading: rewardsLoading } = useQuery<{
    ok: boolean;
    completions: PatrolCompletion[];
    summary: WalletSummary;
  }>({
    queryKey: ["/api/pve/patrol-rewards", submittedWallet],
    enabled: submittedWallet.length > 0,
  });

  const stats = healthData?.stats;
  const completions = rewardsData?.completions ?? [];
  const summary = rewardsData?.summary;

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = walletInput.trim();
    if (!trimmed) return;
    if (!trimmed.startsWith("0x") || trimmed.length < 10) {
      toast({ title: "Invalid wallet address", variant: "destructive" });
      return;
    }
    setSubmittedWallet(trimmed);
  }

  const noMetisData = !healthLoading && stats && stats.total_completions_all_time === 0;

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold">Patrol Refund Pool Health</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Players who complete all 3 stages of a Metis patrol are eligible for a WMETIS gas refund — only when the refund pool is funded. Use this page to check if patrolling is profitable right now.
        </p>
      </div>

      {noMetisData && (
        <Card className="border-yellow-500/40 bg-yellow-500/5">
          <CardContent className="py-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium">No Metis patrol data indexed yet</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Run the Metis chain indexer from the PVE Drop Rates page to populate patrol data. The tool below will update automatically as data comes in.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pool Health Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="w-4 h-4" />
            Refund Pool Health — Last 24 Hours
          </CardTitle>
          <CardDescription>
            Of players who completed all 3 stages, what % received WMETIS?
          </CardDescription>
        </CardHeader>
        <CardContent>
          {healthLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-4">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Loading health stats...</span>
            </div>
          ) : healthError ? (
            <p className="text-sm text-destructive">Failed to load health stats.</p>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-start gap-6">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Refund Rate (24h)</p>
                  <HealthIndicator pct={stats?.refund_rate_pct ?? null} />
                  <div className="mt-1">
                    <HealthVerdict pct={stats?.refund_rate_pct ?? null} />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 pt-2 border-t">
                <div>
                  <p className="text-xs text-muted-foreground">Eligible (3-stage)</p>
                  <p className="text-lg font-semibold">{stats?.eligible_completions ?? 0}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Refunds Paid</p>
                  <p className="text-lg font-semibold">{stats?.refunded_completions ?? 0}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">WMETIS Distributed</p>
                  <p className="text-lg font-semibold">{stats?.total_wmetis_24h?.toFixed(4) ?? "0"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Avg per Refund</p>
                  <p className="text-lg font-semibold">{stats?.avg_wmetis_per_refund?.toFixed(4) ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Last Refund</p>
                  <p className="text-sm font-medium">{formatDate(stats?.last_refund_at ?? null)}</p>
                </div>
              </div>

              {stats && stats.total_completions_all_time > 0 && (
                <div className="grid grid-cols-3 gap-3 pt-2 border-t text-muted-foreground">
                  <div>
                    <p className="text-xs">All-time completions</p>
                    <p className="text-sm font-medium text-foreground">{stats.total_completions_all_time}</p>
                  </div>
                  <div>
                    <p className="text-xs">All-time 3-stage runs</p>
                    <p className="text-sm font-medium text-foreground">{stats.total_full_completions_all_time}</p>
                  </div>
                  <div>
                    <p className="text-xs">All-time WMETIS paid</p>
                    <p className="text-sm font-medium text-foreground">{stats.total_wmetis_all_time?.toFixed(4) ?? "0"}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Per-Wallet Lookup */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Search className="w-4 h-4" />
            Per-Wallet Patrol History
          </CardTitle>
          <CardDescription>Look up patrol completions and WMETIS refunds for a specific wallet</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="flex-1">
              <Label htmlFor="wallet-input" className="sr-only">Wallet address</Label>
              <Input
                id="wallet-input"
                data-testid="input-wallet"
                placeholder="0x... wallet address"
                value={walletInput}
                onChange={e => setWalletInput(e.target.value)}
              />
            </div>
            <Button type="submit" data-testid="button-lookup" disabled={rewardsLoading}>
              {rewardsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              <span className="ml-1">Look Up</span>
            </Button>
          </form>

          {submittedWallet && summary && (
            <div className="grid grid-cols-3 gap-3">
              <Card>
                <CardContent className="py-3">
                  <p className="text-xs text-muted-foreground">Total Patrols</p>
                  <p className="text-xl font-semibold">{summary.total_completions}</p>
                  <p className="text-xs text-muted-foreground">{summary.total_full_completions} full 3-stage runs</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-3">
                  <p className="text-xs text-muted-foreground">WMETIS Earned</p>
                  <p className="text-xl font-semibold">{summary.total_wmetis_earned?.toFixed(4) ?? "0"}</p>
                  <p className="text-xs text-muted-foreground">from 3-stage completions</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-3">
                  <p className="text-xs text-muted-foreground">Last Patrol</p>
                  <p className="text-sm font-semibold">{formatDate(summary.last_patrol_at)}</p>
                  <p className="text-xs text-muted-foreground">First: {formatDate(summary.first_patrol_at)}</p>
                </CardContent>
              </Card>
            </div>
          )}

          {submittedWallet && rewardsLoading && (
            <div className="flex items-center gap-2 text-muted-foreground py-4">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Loading patrol history...</span>
            </div>
          )}

          {submittedWallet && !rewardsLoading && completions.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <Shield className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No Metis patrol completions found for this wallet.</p>
              <p className="text-xs mt-1">Make sure the Metis indexer has run and the wallet has done patrols on Metis chain.</p>
            </div>
          )}

          {completions.length > 0 && (
            <div className="rounded-md border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Patrol</TableHead>
                    <TableHead className="text-center">Stage</TableHead>
                    <TableHead className="text-right">WMETIS Refunded</TableHead>
                    <TableHead>Other Rewards</TableHead>
                    <TableHead className="text-right">Tx</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {completions.map(c => {
                    const otherRewards = (c.rewards || []).filter(r => r.item_type !== 'gas_refund');
                    const isFull = c.fights_completed === 3;
                    return (
                      <TableRow key={c.id} data-testid={`row-patrol-${c.id}`}>
                        <TableCell className="text-sm whitespace-nowrap">
                          {formatDate(c.completed_at)}
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{c.patrol_name ?? `Patrol #${c.patrol_type_id ?? "?"}`}</span>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge
                            variant={isFull ? "default" : "secondary"}
                            data-testid={`badge-stage-${c.id}`}
                          >
                            {c.fights_completed}/3
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {c.wmetis_refunded > 0 ? (
                            <span className="text-green-600 dark:text-green-400 font-medium text-sm">
                              {c.wmetis_refunded.toFixed(4)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {otherRewards.length > 0 ? (
                            <span className="text-xs text-muted-foreground">
                              {otherRewards.map(r => `${r.item_name}${r.amount !== 1 ? ` ×${r.amount}` : ''}`).join(", ")}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <a
                            href={`https://andromeda-explorer.metis.io/tx/${c.tx_hash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                            data-testid={`link-tx-${c.id}`}
                          >
                            {c.tx_hash.slice(0, 8)}…
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
