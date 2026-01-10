import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { queryClient } from "@/lib/queryClient";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  ArrowLeft,
  Save,
  Play,
  CheckCircle,
  XCircle,
  AlertCircle,
  Rocket,
  Archive,
  FileCheck,
  Edit,
  History,
  Plus,
  Trash2,
  RefreshCw,
  Calculator,
  TrendingUp,
  Target,
  BarChart3,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";

interface ChallengeTier {
  id?: number;
  tierCode: string;
  displayName: string;
  thresholdValue: number;
  isPrestige: boolean;
  sortOrder: number;
}

interface ValidationChecks {
  hasMetricSource?: boolean;
  fieldValid?: boolean;
  hasTierConfig?: boolean;
  codeUnique?: boolean;
}

interface ManualChecks {
  etlOutputVerified?: boolean;
  copyApproved?: boolean;
}

interface ChallengeDetail {
  id: number;
  code: string;
  name: string;
  category: string;
  type: string;
  state: string;
  descriptionShort: string;
  descriptionLong: string;
  metricType: string;
  metricSource: string;
  metricKey: string;
  metricAggregation: string;
  metricFilters: Record<string, unknown>;
  tierSystemOverride: string | null;
  tieringMode: string;
  tierConfig: Record<string, unknown>;
  isClusterBased: boolean;
  isTestOnly: boolean;
  isVisibleFe: boolean;
  isActive: boolean;
  sortOrder: number;
  meta: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  tiers: ChallengeTier[];
  validation: {
    autoChecks: ValidationChecks;
    manualChecks: ManualChecks;
    lastRunAt: string | null;
    lastRunBy: string | null;
  } | null;
}

interface AuditLog {
  id: number;
  actor: string;
  action: string;
  fromState: string | null;
  toState: string | null;
  createdAt: string;
}

interface ChallengeCategory {
  key: string;
  name: string;
  description: string;
  tierSystem: string;
}

interface TierLadderItem {
  tierCode: string;
  displayName: string;
  thresholdValue: number;
  isPrestige: boolean;
  sortOrder: number;
}

interface CalibrationStats {
  cached: boolean;
  challengeKey: string;
  cohortKey: string;
  computedAt: string;
  clusterCount: number;
  nonzeroCount: number;
  tierSystem: string;
  tierLadder: TierLadderItem[];
  suggestableTiers: TierLadderItem[];
  isPrestige: boolean;
  percentiles: {
    min: number;
    p10: number;
    p25: number;
    p40: number;
    p50: number;
    p70: number;
    p75: number;
    p90: number;
    p95: number;
    p97: number;
    p99: number;
    max: number;
    mean: number;
  };
  targets: {
    pct1: number;
    pct2: number;
    pct3: number;
    pct4: number;
  };
  suggestedByTier: Record<string, number>;
  warnings: string[];
  zeroInflated: boolean;
  whaleSkew: boolean;
  lowSample: boolean;
}

interface SimulationResult {
  total: number;
  tierSystem?: string;
  tierLadder?: string[];
  isPrestige?: boolean;
  distribution: Record<string, { count: number; pct: number }>;
}

interface CalibrationPanelProps {
  challengeKey: string;
  canEdit: boolean;
  tiers: ChallengeTier[];
  setTiers: (tiers: ChallengeTier[]) => void;
}

function CalibrationPanel({ challengeKey, canEdit, tiers, setTiers }: CalibrationPanelProps) {
  const { toast } = useToast();
  const [cohortKey, setCohortKey] = useState("ALL");
  const [targets, setTargets] = useState({
    pct1: 0.40,
    pct2: 0.70,
    pct3: 0.90,
    pct4: 0.97,
  });
  const [stats, setStats] = useState<CalibrationStats | null>(null);
  const [simulation, setSimulation] = useState<SimulationResult | null>(null);
  const [suggestedSimulation, setSuggestedSimulation] = useState<SimulationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);

  const tierColors: Record<string, string> = {
    COMMON: "text-gray-500",
    UNCOMMON: "text-green-600",
    RARE: "text-blue-600",
    LEGENDARY: "text-orange-600",
    MYTHIC: "text-purple-600",
    BASIC: "text-blue-600",
    ADVANCED: "text-green-600",
    ELITE: "text-purple-600",
    EXALTED: "text-amber-600",
    UNLOCKED: "text-green-600",
    LOCKED: "text-gray-500",
  };

  const tierProgressColors: Record<string, string> = {
    COMMON: "[&>div]:bg-gray-400",
    UNCOMMON: "[&>div]:bg-green-500",
    RARE: "[&>div]:bg-blue-500",
    LEGENDARY: "[&>div]:bg-orange-500",
    MYTHIC: "[&>div]:bg-purple-500",
    BASIC: "[&>div]:bg-blue-500",
    ADVANCED: "[&>div]:bg-green-500",
    ELITE: "[&>div]:bg-purple-500",
    EXALTED: "[&>div]:bg-amber-500",
  };

  const loadStats = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/admin/challenges/${challengeKey}/calibration?cohortKey=${cohortKey}`, {
        credentials: "include",
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      if (data.cached) {
        setStats(data);
        if (data.targets) {
          setTargets({
            pct1: data.targets.pct1 ?? 0.40,
            pct2: data.targets.pct2 ?? 0.70,
            pct3: data.targets.pct3 ?? 0.90,
            pct4: data.targets.pct4 ?? 0.97,
          });
        }
      } else {
        setStats(null);
        toast({ title: "No Cached Stats", description: "Click Refresh to compute calibration stats", variant: "default" });
      }
    } catch (err) {
      toast({ title: "Error Loading Stats", description: err instanceof Error ? err.message : "Failed to load calibration stats", variant: "destructive" });
    }
    setIsLoading(false);
  };

  const refreshStats = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch(`/api/admin/challenges/${challengeKey}/calibration/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ cohortKey, targets }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      if (data.success) {
        setStats({
          cached: true,
          challengeKey: data.challengeKey,
          cohortKey: data.cohortKey,
          computedAt: new Date().toISOString(),
          clusterCount: data.clusterCount,
          nonzeroCount: data.nonzeroCount,
          tierSystem: data.tierSystem,
          tierLadder: data.tierLadder || [],
          suggestableTiers: data.suggestableTiers || [],
          isPrestige: data.isPrestige || false,
          percentiles: data.percentiles,
          targets: data.targets,
          suggestedByTier: data.suggestedByTier || {},
          warnings: data.warnings || [],
          zeroInflated: data.zeroInflated || false,
          whaleSkew: data.whaleSkew || false,
          lowSample: data.lowSample || false,
        });
        toast({ title: "Stats Refreshed", description: `Computed for ${data.clusterCount?.toLocaleString() || 0} clusters` });
      } else {
        throw new Error(data.error || "Refresh failed");
      }
    } catch (err) {
      toast({ title: "Refresh Failed", description: err instanceof Error ? err.message : "Failed to refresh stats", variant: "destructive" });
    }
    setIsRefreshing(false);
  };

  const simulateThresholds = async (thresholds: Record<string, number>, isSuggested = false) => {
    setIsSimulating(true);
    try {
      const res = await fetch(`/api/admin/challenges/${challengeKey}/calibration/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ cohortKey, thresholds }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      if (isSuggested) {
        setSuggestedSimulation(data);
      } else {
        setSimulation(data);
      }
    } catch (err) {
      toast({ title: "Simulation Failed", description: err instanceof Error ? err.message : "Failed to simulate", variant: "destructive" });
    }
    setIsSimulating(false);
  };

  const applyThresholds = async (thresholds: Record<string, number>) => {
    try {
      const res = await fetch(`/api/admin/challenges/${challengeKey}/calibration/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ thresholds }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      if (data.success) {
        const updatedTiers = tiers.map(t => {
          const newVal = thresholds[t.tierCode];
          return newVal !== undefined ? { ...t, thresholdValue: Math.round(newVal) } : t;
        });
        setTiers(updatedTiers);
        queryClient.invalidateQueries({ queryKey: ["/api/admin/challenges"] });
        toast({ title: "Thresholds Applied", description: `Updated ${data.updatedTiers?.length || 0} tier thresholds` });
      } else {
        throw new Error(data.error || "Apply failed");
      }
    } catch (err) {
      toast({ title: "Apply Failed", description: err instanceof Error ? err.message : "Failed to apply thresholds", variant: "destructive" });
    }
  };

  const getCurrentThresholds = (): Record<string, number> => {
    const thresholds: Record<string, number> = {};
    for (const tier of tiers) {
      thresholds[tier.tierCode] = tier.thresholdValue;
    }
    return thresholds;
  };

  const getSuggestableTiers = (): TierLadderItem[] => {
    // Use server-provided suggestableTiers (already filtered for ladder type)
    return stats?.suggestableTiers || [];
  };

  const resetTargets = () => {
    setTargets({ pct1: 0.40, pct2: 0.70, pct3: 0.90, pct4: 0.97 });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5" />
                Calibration & Distribution
              </CardTitle>
              <CardDescription>Analyze player distribution and tune tier thresholds</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select value={cohortKey} onValueChange={setCohortKey}>
                <SelectTrigger className="w-40" data-testid="select-cohort">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Players</SelectItem>
                  <SelectItem value="NONZERO">Non-zero Only</SelectItem>
                  <SelectItem value="ACTIVE_30D">Active (30 days)</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={loadStats} disabled={isLoading} data-testid="button-load-stats">
                {isLoading ? "Loading..." : "Load Stats"}
              </Button>
              <Button onClick={refreshStats} disabled={isRefreshing} data-testid="button-refresh-stats">
                <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
              <Target className="w-4 h-4" />
              Target Percentiles
              {stats?.tierSystem && (
                <Badge variant="outline" className="text-xs">{stats.tierSystem}</Badge>
              )}
            </h4>
            <div className="grid gap-4 md:grid-cols-4">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Tier 2 (p{Math.round(targets.pct1 * 100)})</label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  value={targets.pct1}
                  onChange={(e) => setTargets({ ...targets, pct1: parseFloat(e.target.value) || 0 })}
                  data-testid="input-target-pct1"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Tier 3 (p{Math.round(targets.pct2 * 100)})</label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  value={targets.pct2}
                  onChange={(e) => setTargets({ ...targets, pct2: parseFloat(e.target.value) || 0 })}
                  data-testid="input-target-pct2"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Tier 4 (p{Math.round(targets.pct3 * 100)})</label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  value={targets.pct3}
                  onChange={(e) => setTargets({ ...targets, pct3: parseFloat(e.target.value) || 0 })}
                  data-testid="input-target-pct3"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Tier 5 (p{Math.round(targets.pct4 * 100)})</label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  value={targets.pct4}
                  onChange={(e) => setTargets({ ...targets, pct4: parseFloat(e.target.value) || 0 })}
                  data-testid="input-target-pct4"
                />
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={resetTargets} className="mt-2" data-testid="button-reset-targets">
              Reset to Defaults
            </Button>
          </div>

          {stats && (
            <>
              <div className="grid gap-4 md:grid-cols-3">
                <Card>
                  <CardContent className="pt-4">
                    <div className="text-2xl font-bold" data-testid="text-cluster-count">{stats.clusterCount.toLocaleString()}</div>
                    <p className="text-xs text-muted-foreground">Total Clusters</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="text-2xl font-bold" data-testid="text-nonzero-count">{stats.nonzeroCount.toLocaleString()}</div>
                    <p className="text-xs text-muted-foreground">Non-zero Progress</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="text-2xl font-bold" data-testid="text-computed-at">
                      {stats.computedAt ? new Date(stats.computedAt).toLocaleDateString() : "N/A"}
                    </div>
                    <p className="text-xs text-muted-foreground">Last Computed</p>
                  </CardContent>
                </Card>
              </div>

              {stats.warnings.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {stats.zeroInflated && (
                    <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/30">
                      <AlertCircle className="w-3 h-3 mr-1" />
                      Zero Inflated
                    </Badge>
                  )}
                  {stats.whaleSkew && (
                    <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-500/30">
                      <TrendingUp className="w-3 h-3 mr-1" />
                      Whale Skew
                    </Badge>
                  )}
                  {stats.lowSample && (
                    <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/30">
                      <AlertCircle className="w-3 h-3 mr-1" />
                      Low Sample
                    </Badge>
                  )}
                </div>
              )}

              <div>
                <h4 className="text-sm font-medium mb-3">Percentile Distribution</h4>
                <div className="grid gap-2 grid-cols-4 md:grid-cols-7 text-center text-xs">
                  <div className="p-2 bg-muted rounded">
                    <div className="font-medium">Min</div>
                    <div className="text-muted-foreground">{stats.percentiles.min.toLocaleString()}</div>
                  </div>
                  <div className="p-2 bg-muted rounded">
                    <div className="font-medium">p25</div>
                    <div className="text-muted-foreground">{stats.percentiles.p25.toLocaleString()}</div>
                  </div>
                  <div className="p-2 bg-muted rounded">
                    <div className="font-medium">p50</div>
                    <div className="text-muted-foreground">{stats.percentiles.p50.toLocaleString()}</div>
                  </div>
                  <div className="p-2 bg-muted rounded">
                    <div className="font-medium">p75</div>
                    <div className="text-muted-foreground">{stats.percentiles.p75.toLocaleString()}</div>
                  </div>
                  <div className="p-2 bg-muted rounded">
                    <div className="font-medium">p90</div>
                    <div className="text-muted-foreground">{stats.percentiles.p90.toLocaleString()}</div>
                  </div>
                  <div className="p-2 bg-muted rounded">
                    <div className="font-medium">p95</div>
                    <div className="text-muted-foreground">{stats.percentiles.p95.toLocaleString()}</div>
                  </div>
                  <div className="p-2 bg-muted rounded">
                    <div className="font-medium">Max</div>
                    <div className="text-muted-foreground">{stats.percentiles.max.toLocaleString()}</div>
                  </div>
                </div>
              </div>

              <div className="border rounded-lg p-4 space-y-4">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <Calculator className="w-4 h-4" />
                  Suggested Thresholds
                  <Badge variant="outline" className="text-xs">{stats.tierSystem}</Badge>
                </h4>
                {stats.isPrestige ? (
                  <div className="text-sm text-muted-foreground">
                    Feat challenges use boolean (unlocked/locked) and don't have threshold suggestions.
                  </div>
                ) : (
                  <>
                    <div className={`grid gap-4 md:grid-cols-${getSuggestableTiers().length}`}>
                      {getSuggestableTiers().map((tier) => (
                        <div key={tier.tierCode} className="text-center p-3 bg-muted/50 rounded">
                          <div className={`text-lg font-bold ${tierColors[tier.tierCode] || "text-foreground"}`} data-testid={`text-suggested-${tier.tierCode.toLowerCase()}`}>
                            {Math.round(stats.suggestedByTier[tier.tierCode] || 0).toLocaleString()}
                          </div>
                          <p className="text-xs text-muted-foreground">{tier.displayName || tier.tierCode}</p>
                        </div>
                      ))}
                    </div>
                    {canEdit && Object.keys(stats.suggestedByTier).length > 0 && (
                      <Button 
                        variant="outline" 
                        onClick={() => applyThresholds(stats.suggestedByTier)}
                        data-testid="button-apply-suggested"
                      >
                        Apply Suggested Thresholds
                      </Button>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Tier Distribution Simulation
          </CardTitle>
          <CardDescription>Preview how players would be distributed across tiers</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            <Button 
              variant="outline" 
              onClick={() => simulateThresholds(getCurrentThresholds())}
              disabled={isSimulating}
              data-testid="button-simulate-current"
            >
              Simulate Current Thresholds
            </Button>
            {stats && !stats.isPrestige && (
              <Button 
                variant="outline" 
                onClick={() => simulateThresholds(stats.suggestedByTier, true)}
                disabled={isSimulating}
                data-testid="button-simulate-suggested"
              >
                Simulate Suggested Thresholds
              </Button>
            )}
          </div>

          {(simulation || suggestedSimulation) && (
            <div className="grid gap-4 md:grid-cols-2">
              {simulation && (
                <div className="border rounded-lg p-4">
                  <h5 className="font-medium mb-3">Current Thresholds</h5>
                  <div className="space-y-2">
                    {Object.entries(simulation.distribution).map(([tierCode, data]) => (
                      <div key={tierCode}>
                        <div className="flex justify-between text-sm">
                          <span className={tierCode === "_BELOW_TIER1" ? "text-muted-foreground" : tierColors[tierCode] || "text-foreground"}>
                            {tierCode === "_BELOW_TIER1" ? "Below Tier 1" : tierCode}
                          </span>
                          <span>{data.count.toLocaleString()} ({data.pct}%)</span>
                        </div>
                        <Progress 
                          value={data.pct} 
                          className={`h-2 ${tierCode === "_BELOW_TIER1" ? "" : tierProgressColors[tierCode] || ""}`} 
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {suggestedSimulation && (
                <div className="border rounded-lg p-4">
                  <h5 className="font-medium mb-3">Suggested Thresholds</h5>
                  <div className="space-y-2">
                    {Object.entries(suggestedSimulation.distribution).map(([tierCode, data]) => (
                      <div key={tierCode}>
                        <div className="flex justify-between text-sm">
                          <span className={tierCode === "_BELOW_TIER1" ? "text-muted-foreground" : tierColors[tierCode] || "text-foreground"}>
                            {tierCode === "_BELOW_TIER1" ? "Below Tier 1" : tierCode}
                          </span>
                          <span>{data.count.toLocaleString()} ({data.pct}%)</span>
                        </div>
                        <Progress 
                          value={data.pct} 
                          className={`h-2 ${tierCode === "_BELOW_TIER1" ? "" : tierProgressColors[tierCode] || ""}`} 
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

const stateColors: Record<string, string> = {
  draft: "bg-yellow-500/20 text-yellow-500 border-yellow-500/30",
  validated: "bg-blue-500/20 text-blue-500 border-blue-500/30",
  deployed: "bg-green-500/20 text-green-500 border-green-500/30",
  deprecated: "bg-gray-500/20 text-gray-500 border-gray-500/30",
};

const stateIcons: Record<string, typeof Edit> = {
  draft: Edit,
  validated: FileCheck,
  deployed: Rocket,
  deprecated: Archive,
};

function StateBadge({ state }: { state: string }) {
  const colorClass = stateColors[state] || "bg-muted text-muted-foreground";
  const Icon = stateIcons[state] || AlertCircle;
  return (
    <Badge variant="outline" className={`text-xs ${colorClass} gap-1`}>
      <Icon className="w-3 h-3" />
      {state.toUpperCase()}
    </Badge>
  );
}

export default function ChallengeEditor() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const isEditMode = window.location.pathname.includes("/edit");
  
  // Check if id is a valid numeric ID (not "new" or other invalid strings)
  const numericId = id && /^\d+$/.test(id) ? parseInt(id, 10) : null;
  const isValidId = numericId !== null && !isNaN(numericId);

  const { data: challenge, isLoading, error } = useQuery<ChallengeDetail>({
    queryKey: ["/api/admin/challenges", id],
    queryFn: async () => {
      const res = await fetch(`/api/admin/challenges/${id}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch challenge");
      return res.json();
    },
    enabled: isValidId,
  });

  const { data: categories } = useQuery<ChallengeCategory[]>({
    queryKey: ["/api/admin/challenge-categories"],
    queryFn: async () => {
      const res = await fetch("/api/admin/challenge-categories", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch categories");
      return res.json();
    },
  });

  const { data: auditLog } = useQuery<AuditLog[]>({
    queryKey: ["/api/admin/challenges", id, "audit"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/challenges/${id}/audit`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch audit log");
      return res.json();
    },
    enabled: isValidId,
  });

  const [formData, setFormData] = useState<Partial<ChallengeDetail>>({});
  const [tiers, setTiers] = useState<ChallengeTier[]>([]);
  const [manualChecks, setManualChecks] = useState<ManualChecks>({});

  useEffect(() => {
    if (challenge) {
      setFormData({
        name: challenge.name,
        category: challenge.category,
        type: challenge.type,
        descriptionShort: challenge.descriptionShort,
        descriptionLong: challenge.descriptionLong,
        metricType: challenge.metricType,
        metricSource: challenge.metricSource,
        metricKey: challenge.metricKey,
        metricAggregation: challenge.metricAggregation,
        metricFilters: challenge.metricFilters,
        tieringMode: challenge.tieringMode,
        tierConfig: challenge.tierConfig,
        isClusterBased: challenge.isClusterBased,
        isTestOnly: challenge.isTestOnly,
        isVisibleFe: challenge.isVisibleFe,
        sortOrder: challenge.sortOrder,
      });
      setTiers(challenge.tiers || []);
      setManualChecks(challenge.validation?.manualChecks || {});
    }
  }, [challenge]);

  const updateMutation = useMutation({
    mutationFn: async (data: Partial<ChallengeDetail>) => {
      const res = await fetch(`/api/admin/challenges/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ...data, tiers }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to update challenge");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/challenges", id] });
      toast({ title: "Challenge updated", description: "Changes saved successfully." });
    },
    onError: (err) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const validateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/challenges/${id}/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ manualChecks }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to validate");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/challenges", id] });
      toast({ 
        title: "Validation complete", 
        description: data.canPromoteToValidated 
          ? "Challenge can be promoted to validated." 
          : "Some checks are failing." 
      });
    },
    onError: (err) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const transitionMutation = useMutation({
    mutationFn: async (targetState: string) => {
      const res = await fetch(`/api/admin/challenges/${id}/state`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ targetState }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to transition state");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/challenges", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/challenges"] });
      toast({ 
        title: "State changed", 
        description: `Challenge is now ${data.newState}.` 
      });
    },
    onError: (err) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleSave = () => {
    updateMutation.mutate(formData);
  };

  const addTier = () => {
    setTiers([...tiers, {
      tierCode: "",
      displayName: "",
      thresholdValue: 0,
      isPrestige: false,
      sortOrder: tiers.length + 1,
    }]);
  };

  const removeTier = (index: number) => {
    setTiers(tiers.filter((_, i) => i !== index));
  };

  const updateTier = (index: number, field: keyof ChallengeTier, value: unknown) => {
    const newTiers = [...tiers];
    (newTiers[index] as unknown as Record<string, unknown>)[field] = value;
    setTiers(newTiers);
  };

  // Handle invalid IDs (like "new" or non-numeric strings)
  if (!isValidId) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>Invalid Challenge ID</CardTitle>
            <CardDescription>
              The challenge ID "{id}" is not valid. Please select a challenge from the list or create a new one.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate("/admin/challenges")} data-testid="button-back-to-list">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Challenges
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  if (error || !challenge) {
    return (
      <div className="p-6">
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Error</CardTitle>
            <CardDescription>
              {error instanceof Error ? error.message : "Challenge not found"}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const canEdit = challenge.state === "draft" || challenge.state === "validated";
  const autoChecks = challenge.validation?.autoChecks || {};

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin/challenges")} data-testid="button-back">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold" data-testid="text-challenge-name">{challenge.name}</h1>
              <StateBadge state={challenge.state} />
            </div>
            <p className="text-muted-foreground font-mono text-sm">{challenge.code}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && isEditMode && (
            <Button onClick={handleSave} disabled={updateMutation.isPending} data-testid="button-save">
              <Save className="w-4 h-4 mr-2" />
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          )}
          {!isEditMode && canEdit && (
            <Button onClick={() => navigate(`/admin/challenges/${id}/edit`)} data-testid="button-edit">
              <Edit className="w-4 h-4 mr-2" />
              Edit
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="basic" className="space-y-6">
        <TabsList>
          <TabsTrigger value="basic" data-testid="tab-basic">Basic Info</TabsTrigger>
          <TabsTrigger value="metric" data-testid="tab-metric">Metric Definition</TabsTrigger>
          <TabsTrigger value="tiers" data-testid="tab-tiers">Tiering</TabsTrigger>
          <TabsTrigger value="calibration" data-testid="tab-calibration">Calibration</TabsTrigger>
          <TabsTrigger value="display" data-testid="tab-display">Frontend Display</TabsTrigger>
          <TabsTrigger value="validation" data-testid="tab-validation">Validation</TabsTrigger>
          <TabsTrigger value="deploy" data-testid="tab-deploy">Deploy Controls</TabsTrigger>
          <TabsTrigger value="audit" data-testid="tab-audit">Audit Log</TabsTrigger>
        </TabsList>

        <TabsContent value="basic">
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
              <CardDescription>Core challenge identity and categorization</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Display Name</label>
                  <Input
                    value={formData.name || ""}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    disabled={!canEdit || !isEditMode}
                    data-testid="input-name"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Category</label>
                  <Select 
                    value={formData.category || ""} 
                    onValueChange={(v) => setFormData({ ...formData, category: v })}
                    disabled={!canEdit || !isEditMode}
                  >
                    <SelectTrigger data-testid="select-category">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {categories?.map(cat => (
                        <SelectItem key={cat.key} value={cat.key}>{cat.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Challenge Type</label>
                  <Select 
                    value={formData.type || ""} 
                    onValueChange={(v) => setFormData({ ...formData, type: v })}
                    disabled={!canEdit || !isEditMode}
                  >
                    <SelectTrigger data-testid="select-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tiered">Tiered</SelectItem>
                      <SelectItem value="binary">Binary</SelectItem>
                      <SelectItem value="milestone">Milestone</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Sort Order</label>
                  <Input
                    type="number"
                    value={formData.sortOrder || 0}
                    onChange={(e) => setFormData({ ...formData, sortOrder: parseInt(e.target.value) })}
                    disabled={!canEdit || !isEditMode}
                    data-testid="input-sort-order"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Short Description</label>
                <Input
                  value={formData.descriptionShort || ""}
                  onChange={(e) => setFormData({ ...formData, descriptionShort: e.target.value })}
                  disabled={!canEdit || !isEditMode}
                  data-testid="input-description-short"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Long Description</label>
                <Textarea
                  value={formData.descriptionLong || ""}
                  onChange={(e) => setFormData({ ...formData, descriptionLong: e.target.value })}
                  disabled={!canEdit || !isEditMode}
                  rows={4}
                  data-testid="input-description-long"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="metric">
          <Card>
            <CardHeader>
              <CardTitle>Metric Definition</CardTitle>
              <CardDescription>How progress is measured for this challenge</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Metric Type</label>
                  <Select 
                    value={formData.metricType || ""} 
                    onValueChange={(v) => setFormData({ ...formData, metricType: v })}
                    disabled={!canEdit || !isEditMode}
                  >
                    <SelectTrigger data-testid="select-metric-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="integer">Integer</SelectItem>
                      <SelectItem value="decimal">Decimal</SelectItem>
                      <SelectItem value="boolean">Boolean</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Metric Source</label>
                  <Select 
                    value={formData.metricSource || ""} 
                    onValueChange={(v) => setFormData({ ...formData, metricSource: v })}
                    disabled={!canEdit || !isEditMode}
                  >
                    <SelectTrigger data-testid="select-metric-source">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="onchain_heroes">On-chain: Heroes</SelectItem>
                      <SelectItem value="onchain_quests">On-chain: Quests</SelectItem>
                      <SelectItem value="onchain_summons">On-chain: Summons</SelectItem>
                      <SelectItem value="onchain_pets">On-chain: Pets</SelectItem>
                      <SelectItem value="onchain_meditation">On-chain: Meditation</SelectItem>
                      <SelectItem value="onchain_gardens">On-chain: Gardens</SelectItem>
                      <SelectItem value="onchain_portfolio">On-chain: Portfolio</SelectItem>
                      <SelectItem value="behavior_model">Behavior Model</SelectItem>
                      <SelectItem value="discord_interactions">Discord Activity</SelectItem>
                      <SelectItem value="payment_events">Payment Events</SelectItem>
                      <SelectItem value="event_progress">Event Progress</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Metric Key</label>
                  <Input
                    value={formData.metricKey || ""}
                    onChange={(e) => setFormData({ ...formData, metricKey: e.target.value })}
                    disabled={!canEdit || !isEditMode}
                    data-testid="input-metric-key"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Aggregation</label>
                  <Select 
                    value={formData.metricAggregation || ""} 
                    onValueChange={(v) => setFormData({ ...formData, metricAggregation: v })}
                    disabled={!canEdit || !isEditMode}
                  >
                    <SelectTrigger data-testid="select-aggregation">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="count">Count</SelectItem>
                      <SelectItem value="sum">Sum</SelectItem>
                      <SelectItem value="max">Maximum</SelectItem>
                      <SelectItem value="min">Minimum</SelectItem>
                      <SelectItem value="avg">Average</SelectItem>
                      <SelectItem value="latest">Latest Value</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Tiering Mode</label>
                  <Select 
                    value={formData.tieringMode || ""} 
                    onValueChange={(v) => setFormData({ ...formData, tieringMode: v })}
                    disabled={!canEdit || !isEditMode}
                  >
                    <SelectTrigger data-testid="select-tiering-mode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="threshold">Threshold-based</SelectItem>
                      <SelectItem value="percentile">Percentile-based</SelectItem>
                      <SelectItem value="none">No Tiers</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={formData.isClusterBased || false}
                    onCheckedChange={(v) => setFormData({ ...formData, isClusterBased: v })}
                    disabled={!canEdit || !isEditMode}
                    data-testid="switch-cluster-based"
                  />
                  <label className="text-sm">Cluster-based metrics</label>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tiers">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Tier Thresholds</CardTitle>
                  <CardDescription>Define progression tiers and their requirements</CardDescription>
                </div>
                {canEdit && isEditMode && (
                  <Button size="sm" onClick={addTier} data-testid="button-add-tier">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Tier
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {tiers.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No tiers defined yet.</p>
              ) : (
                <div className="space-y-3">
                  {tiers.map((tier, index) => (
                    <div key={index} className="flex items-center gap-4 p-3 border rounded-md" data-testid={`tier-row-${index}`}>
                      <div className="flex-1 grid gap-4 md:grid-cols-4">
                        <Input
                          placeholder="Tier Code"
                          value={tier.tierCode}
                          onChange={(e) => updateTier(index, "tierCode", e.target.value)}
                          disabled={!canEdit || !isEditMode}
                          data-testid={`input-tier-code-${index}`}
                        />
                        <Input
                          placeholder="Display Name"
                          value={tier.displayName}
                          onChange={(e) => updateTier(index, "displayName", e.target.value)}
                          disabled={!canEdit || !isEditMode}
                          data-testid={`input-tier-display-${index}`}
                        />
                        <Input
                          type="number"
                          placeholder="Threshold"
                          value={tier.thresholdValue}
                          onChange={(e) => updateTier(index, "thresholdValue", parseFloat(e.target.value))}
                          disabled={!canEdit || !isEditMode}
                          data-testid={`input-tier-threshold-${index}`}
                        />
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={tier.isPrestige}
                            onCheckedChange={(v) => updateTier(index, "isPrestige", v)}
                            disabled={!canEdit || !isEditMode}
                            data-testid={`switch-tier-top-tier-${index}`}
                          />
                          <span className="text-sm text-muted-foreground">Top Tier</span>
                        </div>
                      </div>
                      {canEdit && isEditMode && (
                        <Button size="icon" variant="ghost" onClick={() => removeTier(index)} data-testid={`button-remove-tier-${index}`}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="calibration">
          <CalibrationPanel challengeKey={challenge.code} canEdit={canEdit} tiers={tiers} setTiers={setTiers} />
        </TabsContent>

        <TabsContent value="display">
          <Card>
            <CardHeader>
              <CardTitle>Frontend Display</CardTitle>
              <CardDescription>Control visibility and presentation</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={formData.isVisibleFe || false}
                    onCheckedChange={(v) => setFormData({ ...formData, isVisibleFe: v })}
                    disabled={!canEdit || !isEditMode}
                    data-testid="switch-visible-fe"
                  />
                  <label className="text-sm">Visible in Frontend</label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={formData.isTestOnly || false}
                    onCheckedChange={(v) => setFormData({ ...formData, isTestOnly: v })}
                    disabled={!canEdit || !isEditMode}
                    data-testid="switch-test-only"
                  />
                  <label className="text-sm">Test Only (hidden from production)</label>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="validation">
          <Card>
            <CardHeader>
              <CardTitle>Validation Status</CardTitle>
              <CardDescription>Automated and manual validation checks</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h4 className="text-sm font-medium mb-3">Automated Checks</h4>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="flex items-center gap-2">
                    {autoChecks.hasMetricSource ? (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    ) : (
                      <XCircle className="w-4 h-4 text-destructive" />
                    )}
                    <span className="text-sm">Valid metric source</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {autoChecks.fieldValid ? (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    ) : (
                      <XCircle className="w-4 h-4 text-destructive" />
                    )}
                    <span className="text-sm">Metric key defined</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {autoChecks.hasTierConfig ? (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    ) : (
                      <XCircle className="w-4 h-4 text-destructive" />
                    )}
                    <span className="text-sm">Tier configuration valid</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {autoChecks.codeUnique ? (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    ) : (
                      <XCircle className="w-4 h-4 text-destructive" />
                    )}
                    <span className="text-sm">Unique challenge code</span>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium mb-3">Manual Checks (for deployment)</h4>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={manualChecks.etlOutputVerified || false}
                      onCheckedChange={(v) => setManualChecks({ ...manualChecks, etlOutputVerified: !!v })}
                      data-testid="checkbox-etl-verified"
                    />
                    <label className="text-sm">ETL output verified</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={manualChecks.copyApproved || false}
                      onCheckedChange={(v) => setManualChecks({ ...manualChecks, copyApproved: !!v })}
                      data-testid="checkbox-copy-approved"
                    />
                    <label className="text-sm">Copy/description approved</label>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <Button onClick={() => validateMutation.mutate()} disabled={validateMutation.isPending} data-testid="button-run-validation">
                  <Play className="w-4 h-4 mr-2" />
                  {validateMutation.isPending ? "Running..." : "Run Validation"}
                </Button>
                {challenge.validation?.lastRunAt && (
                  <span className="text-xs text-muted-foreground">
                    Last run: {new Date(challenge.validation.lastRunAt).toLocaleString()} by {challenge.validation.lastRunBy}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="deploy">
          <Card>
            <CardHeader>
              <CardTitle>Deploy Controls</CardTitle>
              <CardDescription>Manage challenge state lifecycle</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium">Current State:</span>
                <StateBadge state={challenge.state} />
              </div>

              <div className="space-y-4">
                {challenge.state === "draft" && (
                  <div className="p-4 border rounded-lg space-y-3">
                    <h4 className="font-medium">Promote to Validated</h4>
                    <p className="text-sm text-muted-foreground">
                      Mark this challenge as validated after passing all automated checks.
                    </p>
                    <Button 
                      onClick={() => transitionMutation.mutate("validated")}
                      disabled={transitionMutation.isPending || !autoChecks.hasMetricSource || !autoChecks.fieldValid}
                      data-testid="button-promote-validated"
                    >
                      <FileCheck className="w-4 h-4 mr-2" />
                      Promote to Validated
                    </Button>
                  </div>
                )}

                {challenge.state === "validated" && (
                  <>
                    <div className="p-4 border rounded-lg space-y-3">
                      <h4 className="font-medium">Deploy to Production</h4>
                      <p className="text-sm text-muted-foreground">
                        Make this challenge live. Requires all manual checks to be completed.
                      </p>
                      <Button 
                        onClick={() => transitionMutation.mutate("deployed")}
                        disabled={transitionMutation.isPending || !manualChecks.etlOutputVerified || !manualChecks.copyApproved}
                        data-testid="button-deploy"
                      >
                        <Rocket className="w-4 h-4 mr-2" />
                        Deploy
                      </Button>
                    </div>
                    <div className="p-4 border border-dashed rounded-lg space-y-3">
                      <h4 className="font-medium text-muted-foreground">Rollback to Draft</h4>
                      <p className="text-sm text-muted-foreground">
                        Return this challenge to draft state for further editing.
                      </p>
                      <Button 
                        variant="outline"
                        onClick={() => transitionMutation.mutate("draft")}
                        disabled={transitionMutation.isPending}
                        data-testid="button-rollback-draft"
                      >
                        <Edit className="w-4 h-4 mr-2" />
                        Rollback to Draft
                      </Button>
                    </div>
                  </>
                )}

                {challenge.state === "deployed" && (
                  <>
                    <div className="p-4 border border-amber-500/30 rounded-lg space-y-3">
                      <h4 className="font-medium">Hotfix Mode</h4>
                      <p className="text-sm text-muted-foreground">
                        Return to validated state to make urgent fixes.
                      </p>
                      <Button 
                        variant="outline"
                        onClick={() => transitionMutation.mutate("validated")}
                        disabled={transitionMutation.isPending}
                        data-testid="button-hotfix"
                      >
                        <AlertCircle className="w-4 h-4 mr-2" />
                        Enter Hotfix Mode
                      </Button>
                    </div>
                    <div className="p-4 border border-destructive/30 rounded-lg space-y-3">
                      <h4 className="font-medium text-destructive">Deprecate</h4>
                      <p className="text-sm text-muted-foreground">
                        Remove this challenge from production. This action cannot be undone.
                      </p>
                      <Button 
                        variant="destructive"
                        onClick={() => transitionMutation.mutate("deprecated")}
                        disabled={transitionMutation.isPending}
                        data-testid="button-deprecate"
                      >
                        <Archive className="w-4 h-4 mr-2" />
                        Deprecate
                      </Button>
                    </div>
                  </>
                )}

                {challenge.state === "deprecated" && (
                  <div className="p-4 border rounded-lg">
                    <p className="text-muted-foreground">
                      This challenge has been deprecated and cannot be reactivated.
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="w-5 h-5" />
                Audit Log
              </CardTitle>
              <CardDescription>History of changes to this challenge</CardDescription>
            </CardHeader>
            <CardContent>
              {!auditLog || auditLog.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No audit history yet.</p>
              ) : (
                <div className="space-y-3">
                  {auditLog.map((log) => (
                    <div key={log.id} className="flex items-center gap-4 p-3 border rounded-md" data-testid={`audit-row-${log.id}`}>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">{log.action}</Badge>
                          {log.fromState && log.toState && (
                            <span className="text-sm text-muted-foreground">
                              {log.fromState} → {log.toState}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          by {log.actor} at {new Date(log.createdAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
