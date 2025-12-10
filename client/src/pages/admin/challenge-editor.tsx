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
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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

  const { data: challenge, isLoading, error } = useQuery<ChallengeDetail>({
    queryKey: ["/api/admin/challenges", id],
    queryFn: async () => {
      const res = await fetch(`/api/admin/challenges/${id}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch challenge");
      return res.json();
    },
    enabled: !!id,
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
    enabled: !!id,
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
    (newTiers[index] as Record<string, unknown>)[field] = value;
    setTiers(newTiers);
  };

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
                            data-testid={`switch-tier-prestige-${index}`}
                          />
                          <span className="text-sm text-muted-foreground">Prestige</span>
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
