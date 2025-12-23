import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  RefreshCw,
  Loader2,
  CheckCircle,
  AlertCircle,
  Clock,
  Database,
  FileText,
  Link as LinkIcon,
  Play,
  BookOpen,
  Swords,
  Tag,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface SyncSummary {
  ok: boolean;
  counts: {
    keywords: number;
    classes: number;
    skills: number;
  };
  lastSuccess: {
    id: number;
    started_at: string;
    finished_at: string;
    discovered_urls: number;
    classes_ingested: number;
    skills_upserted: number;
  } | null;
  lastRun: {
    id: number;
    started_at: string;
    finished_at: string | null;
    status: string;
    error: string | null;
  } | null;
  runningRun: {
    id: number;
    started_at: string;
  } | null;
}

interface SyncRun {
  id: number;
  domain: string;
  startedAt: string;
  finishedAt: string | null;
  status: string;
  discoveredUrls: number | null;
  keywordsUpserted: number | null;
  classesAttempted: number | null;
  classesIngested: number | null;
  skillsUpserted: number | null;
  ragDocsUpserted: number | null;
  error: string | null;
}

interface SyncRunItem {
  id: number;
  syncRunId: number;
  itemType: string;
  itemKey: string;
  status: string;
  details: Record<string, unknown> | null;
  error: string | null;
}

interface CombatSource {
  url: string;
  kind: string;
  enabled: boolean;
  discoveredAt: string | null;
  lastFetchedAt: string | null;
  lastError: string | null;
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "success":
      return (
        <Badge variant="default" className="bg-green-600" data-testid="badge-status-success">
          <CheckCircle className="w-3 h-3 mr-1" /> Success
        </Badge>
      );
    case "running":
      return (
        <Badge variant="secondary" data-testid="badge-status-running">
          <Loader2 className="w-3 h-3 mr-1 animate-spin" /> Running
        </Badge>
      );
    case "failed":
      return (
        <Badge variant="destructive" data-testid="badge-status-failed">
          <AlertCircle className="w-3 h-3 mr-1" /> Failed
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" data-testid="badge-status-unknown">
          <Clock className="w-3 h-3 mr-1" /> {status}
        </Badge>
      );
  }
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString();
}

function formatDuration(startStr: string, endStr: string | null) {
  if (!endStr) return "—";
  const start = new Date(startStr).getTime();
  const end = new Date(endStr).getTime();
  const seconds = Math.round((end - start) / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export default function HedgeCombatSync() {
  const { toast } = useToast();
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [runDetailOpen, setRunDetailOpen] = useState(false);

  // Fetch sync summary
  const { data: summary, isLoading: summaryLoading } = useQuery<SyncSummary>({
    queryKey: ["/api/admin/hedge/combat/sync/summary"],
    refetchInterval: 10000,
  });

  // Fetch sync runs
  const { data: runsData, isLoading: runsLoading } = useQuery<{ ok: boolean; results: SyncRun[] }>({
    queryKey: ["/api/admin/hedge/combat/sync/runs"],
    refetchInterval: 10000,
  });

  // Fetch sources
  const { data: sourcesData, isLoading: sourcesLoading } = useQuery<{ ok: boolean; results: CombatSource[] }>({
    queryKey: ["/api/admin/hedge/combat/sources"],
  });

  // Fetch run detail when selected
  const { data: runDetail, isLoading: runDetailLoading } = useQuery<{
    ok: boolean;
    run: SyncRun;
    items: SyncRunItem[];
  }>({
    queryKey: ["/api/admin/hedge/combat/sync/runs", selectedRunId],
    enabled: !!selectedRunId,
  });

  // Refresh mutation
  const refreshMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/hedge/combat/refresh", { discover: true, concurrency: 3 });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Sync started", description: "Combat codex sync is now running" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/hedge/combat/sync"] });
    },
    onError: (error: Error) => {
      toast({ title: "Sync failed", description: error.message, variant: "destructive" });
    },
  });

  // Toggle source mutation
  const toggleSourceMutation = useMutation({
    mutationFn: async ({ url, enabled }: { url: string; enabled: boolean }) => {
      const res = await apiRequest("PATCH", "/api/admin/hedge/combat/sources", { url, enabled });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/hedge/combat/sources"] });
      toast({ title: "Source updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update source", description: error.message, variant: "destructive" });
    },
  });

  const isRefreshing = summary?.runningRun !== null || refreshMutation.isPending;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Combat Sync Status</h1>
          <p className="text-muted-foreground">Manage combat codex data ingestion from DFK Wiki</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/combat-classes">
            <Button variant="outline" data-testid="button-view-classes">
              <Swords className="w-4 h-4 mr-2" />
              View Class Skills
            </Button>
          </Link>
          <Button
            onClick={() => refreshMutation.mutate()}
            disabled={isRefreshing}
            data-testid="button-refresh-sync"
          >
            {isRefreshing ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Play className="w-4 h-4 mr-2" />
            )}
            {isRefreshing ? "Syncing..." : "Run Sync"}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Classes</CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {summaryLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold" data-testid="text-class-count">
                {summary?.counts.classes ?? 0}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Skills</CardTitle>
            <Swords className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {summaryLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold" data-testid="text-skill-count">
                {summary?.counts.skills ?? 0}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Keywords</CardTitle>
            <Tag className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {summaryLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold" data-testid="text-keyword-count">
                {summary?.counts.keywords ?? 0}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Last Sync</CardTitle>
            <RefreshCw className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {summaryLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : summary?.lastRun ? (
              <div className="space-y-1">
                <StatusBadge status={summary.lastRun.status} />
                <p className="text-xs text-muted-foreground" data-testid="text-last-sync">
                  {formatDate(summary.lastRun.started_at)}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Never</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="runs" className="space-y-4">
        <TabsList>
          <TabsTrigger value="runs" data-testid="tab-runs">
            <Database className="w-4 h-4 mr-2" /> Sync Runs
          </TabsTrigger>
          <TabsTrigger value="sources" data-testid="tab-sources">
            <LinkIcon className="w-4 h-4 mr-2" /> Sources
          </TabsTrigger>
        </TabsList>

        {/* Sync Runs Tab */}
        <TabsContent value="runs">
          <Card>
            <CardHeader>
              <CardTitle>Sync Run History</CardTitle>
              <CardDescription>Recent combat codex ingestion runs</CardDescription>
            </CardHeader>
            <CardContent>
              {runsLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Started</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>URLs</TableHead>
                      <TableHead>Classes</TableHead>
                      <TableHead>Skills</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {runsData?.results?.map((run) => (
                      <TableRow key={run.id} data-testid={`row-sync-run-${run.id}`}>
                        <TableCell className="font-mono">{run.id}</TableCell>
                        <TableCell className="text-sm">{formatDate(run.startedAt)}</TableCell>
                        <TableCell className="text-sm">
                          {formatDuration(run.startedAt, run.finishedAt)}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={run.status} />
                        </TableCell>
                        <TableCell>{run.discoveredUrls ?? "—"}</TableCell>
                        <TableCell>{run.classesIngested ?? "—"}</TableCell>
                        <TableCell>{run.skillsUpserted ?? "—"}</TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedRunId(run.id);
                              setRunDetailOpen(true);
                            }}
                            data-testid={`button-view-run-${run.id}`}
                          >
                            <FileText className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Sources Tab */}
        <TabsContent value="sources">
          <Card>
            <CardHeader>
              <CardTitle>Combat Sources</CardTitle>
              <CardDescription>URLs discovered and tracked for combat data ingestion</CardDescription>
            </CardHeader>
            <CardContent>
              {sourcesLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>URL</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Discovered</TableHead>
                      <TableHead>Last Fetched</TableHead>
                      <TableHead>Enabled</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sourcesData?.results?.map((source, idx) => (
                      <TableRow key={source.url} data-testid={`row-source-${idx}`}>
                        <TableCell className="max-w-xs truncate font-mono text-xs">
                          {source.url}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{source.kind}</Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {formatDate(source.discoveredAt)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {formatDate(source.lastFetchedAt)}
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={source.enabled}
                            onCheckedChange={(checked) =>
                              toggleSourceMutation.mutate({ url: source.url, enabled: checked })
                            }
                            disabled={toggleSourceMutation.isPending}
                            data-testid={`switch-source-enabled-${idx}`}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Run Detail Dialog */}
      <Dialog open={runDetailOpen} onOpenChange={setRunDetailOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Sync Run #{selectedRunId}</DialogTitle>
            <DialogDescription>
              Detailed breakdown of items processed during this sync run
            </DialogDescription>
          </DialogHeader>

          {runDetailLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : runDetail ? (
            <div className="space-y-4">
              {/* Run Overview */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Status:</span>{" "}
                  <StatusBadge status={runDetail.run.status} />
                </div>
                <div>
                  <span className="text-muted-foreground">Started:</span>{" "}
                  {formatDate(runDetail.run.startedAt)}
                </div>
                <div>
                  <span className="text-muted-foreground">Duration:</span>{" "}
                  {formatDuration(runDetail.run.startedAt, runDetail.run.finishedAt)}
                </div>
                <div>
                  <span className="text-muted-foreground">URLs Discovered:</span>{" "}
                  {runDetail.run.discoveredUrls ?? "—"}
                </div>
              </div>

              {runDetail.run.error && (
                <div className="p-3 bg-destructive/10 rounded-md text-destructive text-sm">
                  <strong>Error:</strong> {runDetail.run.error}
                </div>
              )}

              {/* Items Table */}
              {runDetail.items.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2">Processed Items ({runDetail.items.length})</h4>
                  <div className="max-h-64 overflow-y-auto border rounded-md">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Type</TableHead>
                          <TableHead>Key</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Error</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {runDetail.items.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">
                                {item.itemType}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-mono text-xs max-w-xs truncate">
                              {item.itemKey}
                            </TableCell>
                            <TableCell>
                              <StatusBadge status={item.status} />
                            </TableCell>
                            <TableCell className="text-xs text-destructive max-w-xs truncate">
                              {item.error || "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
