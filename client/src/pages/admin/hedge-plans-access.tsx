import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
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
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
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
  DialogFooter,
} from "@/components/ui/dialog";
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
  Edit,
  Save,
  Loader2,
  Crown,
  Key,
  Shield,
  Eye,
  Plus,
  CheckCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Tier {
  tier_id: string;
  display_name: string;
  description: string | null;
  price_monthly: string | null;
  enabled: boolean;
  sort_order: number;
  updated_at: string;
}

interface Rule {
  id: number;
  domain: string;
  resource: string;
  tier_id: string;
  mode: string;
  rule: Record<string, unknown>;
  updated_at: string;
}

interface SkillField {
  name: string;
  type: string;
  description: string;
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString();
}

function TierIcon({ tierId }: { tierId: string }) {
  switch (tierId) {
    case "premium_plus":
      return <Crown className="w-4 h-4 text-yellow-500" />;
    case "premium":
      return <Key className="w-4 h-4 text-blue-500" />;
    default:
      return <Shield className="w-4 h-4 text-muted-foreground" />;
  }
}

export default function HedgePlansAccess() {
  const { toast } = useToast();
  const [editingTier, setEditingTier] = useState<Tier | null>(null);
  const [tierEditOpen, setTierEditOpen] = useState(false);
  
  const [ruleEditOpen, setRuleEditOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<{
    domain: string;
    resource: string;
    tier_id: string;
    mode: string;
    rule: string;
  }>({
    domain: "combat",
    resource: "skills",
    tier_id: "free",
    mode: "allowlist",
    rule: "[]",
  });

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewConfig, setPreviewConfig] = useState({
    domain: "combat",
    resource: "skills",
    tier_id: "free",
    sample: "{}",
  });
  const [previewResult, setPreviewResult] = useState<{
    tier: string;
    features: Record<string, boolean>;
    result: Record<string, unknown>;
  } | null>(null);

  // Fetch tiers
  const { data: tiersData, isLoading: tiersLoading } = useQuery<{ ok: boolean; results: Tier[] }>({
    queryKey: ["/api/admin/hedge/entitlements/tiers"],
  });

  // Fetch rules
  const { data: rulesData, isLoading: rulesLoading } = useQuery<{ ok: boolean; results: Rule[] }>({
    queryKey: ["/api/admin/hedge/entitlements/rules"],
  });

  // Fetch schema registry for skills fields
  const { data: schemaData } = useQuery<{ ok: boolean; fields: SkillField[] }>({
    queryKey: ["/api/admin/hedge/schema/combat/skills"],
  });

  // Tier update mutation
  const updateTierMutation = useMutation({
    mutationFn: async (data: { tierId: string; patch: Partial<Tier> }) => {
      const res = await apiRequest("PATCH", `/api/admin/hedge/entitlements/tiers/${data.tierId}`, data.patch);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/hedge/entitlements/tiers"] });
      setTierEditOpen(false);
      setEditingTier(null);
      toast({ title: "Tier updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update tier", description: error.message, variant: "destructive" });
    },
  });

  // Rule upsert mutation
  const upsertRuleMutation = useMutation({
    mutationFn: async (data: { domain: string; resource: string; tier_id: string; mode: string; rule: unknown }) => {
      const res = await apiRequest("PUT", "/api/admin/hedge/entitlements/rules", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/hedge/entitlements/rules"] });
      setRuleEditOpen(false);
      toast({ title: "Rule saved successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to save rule", description: error.message, variant: "destructive" });
    },
  });

  // Preview mutation
  const previewMutation = useMutation({
    mutationFn: async (data: { domain: string; resource: string; tier_id: string; sample: unknown }) => {
      const res = await apiRequest("POST", "/api/admin/hedge/entitlements/preview", data);
      return res.json();
    },
    onSuccess: (data) => {
      setPreviewResult(data);
    },
    onError: (error: Error) => {
      toast({ title: "Preview failed", description: error.message, variant: "destructive" });
    },
  });

  const handleSaveTier = () => {
    if (!editingTier) return;
    updateTierMutation.mutate({
      tierId: editingTier.tier_id,
      patch: {
        display_name: editingTier.display_name,
        description: editingTier.description,
        price_monthly: editingTier.price_monthly,
        enabled: editingTier.enabled,
        sort_order: editingTier.sort_order,
      },
    });
  };

  const handleSaveRule = () => {
    try {
      const ruleObj = JSON.parse(editingRule.rule);
      upsertRuleMutation.mutate({
        domain: editingRule.domain,
        resource: editingRule.resource,
        tier_id: editingRule.tier_id,
        mode: editingRule.mode,
        rule: ruleObj,
      });
    } catch {
      toast({ title: "Invalid JSON", description: "Rule must be valid JSON", variant: "destructive" });
    }
  };

  const handlePreview = () => {
    try {
      const sampleObj = JSON.parse(previewConfig.sample);
      previewMutation.mutate({
        domain: previewConfig.domain,
        resource: previewConfig.resource,
        tier_id: previewConfig.tier_id,
        sample: sampleObj,
      });
    } catch {
      toast({ title: "Invalid JSON", description: "Sample must be valid JSON", variant: "destructive" });
    }
  };

  const openRuleEditor = (rule?: Rule) => {
    if (rule) {
      setEditingRule({
        domain: rule.domain,
        resource: rule.resource,
        tier_id: rule.tier_id,
        mode: rule.mode,
        rule: JSON.stringify(rule.rule, null, 2),
      });
    } else {
      setEditingRule({
        domain: "combat",
        resource: "skills",
        tier_id: "free",
        mode: "allowlist",
        rule: "[]",
      });
    }
    setRuleEditOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Plans & Access</h1>
          <p className="text-muted-foreground">Manage subscription tiers and entitlement rules</p>
        </div>
        <Button variant="outline" onClick={() => setPreviewOpen(true)} data-testid="button-preview">
          <Eye className="w-4 h-4 mr-2" /> Preview Entitlements
        </Button>
      </div>

      <Tabs defaultValue="tiers" className="space-y-4">
        <TabsList>
          <TabsTrigger value="tiers" data-testid="tab-tiers">
            <Crown className="w-4 h-4 mr-2" /> Tiers
          </TabsTrigger>
          <TabsTrigger value="rules" data-testid="tab-rules">
            <Shield className="w-4 h-4 mr-2" /> Rules
          </TabsTrigger>
          <TabsTrigger value="schema" data-testid="tab-schema">
            <Key className="w-4 h-4 mr-2" /> Schema
          </TabsTrigger>
        </TabsList>

        {/* Tiers Tab */}
        <TabsContent value="tiers">
          <Card>
            <CardHeader>
              <CardTitle>Subscription Tiers</CardTitle>
              <CardDescription>Configure available subscription plans and their features</CardDescription>
            </CardHeader>
            <CardContent>
              {tiersLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tier</TableHead>
                      <TableHead>Display Name</TableHead>
                      <TableHead>Price (Monthly)</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Order</TableHead>
                      <TableHead>Updated</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tiersData?.results?.map((tier) => (
                      <TableRow key={tier.tier_id} data-testid={`row-tier-${tier.tier_id}`}>
                        <TableCell className="flex items-center gap-2">
                          <TierIcon tierId={tier.tier_id} />
                          <span className="font-mono text-sm">{tier.tier_id}</span>
                        </TableCell>
                        <TableCell>{tier.display_name}</TableCell>
                        <TableCell>
                          {tier.price_monthly ? `$${tier.price_monthly}/mo` : "Free"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={tier.enabled ? "default" : "secondary"}>
                            {tier.enabled ? "Active" : "Disabled"}
                          </Badge>
                        </TableCell>
                        <TableCell>{tier.sort_order}</TableCell>
                        <TableCell className="text-sm">{formatDate(tier.updated_at)}</TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingTier({ ...tier });
                              setTierEditOpen(true);
                            }}
                            data-testid={`button-edit-tier-${tier.tier_id}`}
                          >
                            <Edit className="w-4 h-4" />
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

        {/* Rules Tab */}
        <TabsContent value="rules">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <div>
                <CardTitle>Entitlement Rules</CardTitle>
                <CardDescription>Define what each tier can access</CardDescription>
              </div>
              <Button onClick={() => openRuleEditor()} data-testid="button-add-rule">
                <Plus className="w-4 h-4 mr-2" /> Add Rule
              </Button>
            </CardHeader>
            <CardContent>
              {rulesLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Domain</TableHead>
                      <TableHead>Resource</TableHead>
                      <TableHead>Tier</TableHead>
                      <TableHead>Mode</TableHead>
                      <TableHead>Rule</TableHead>
                      <TableHead>Updated</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rulesData?.results?.map((rule) => (
                      <TableRow key={rule.id} data-testid={`row-rule-${rule.id}`}>
                        <TableCell>
                          <Badge variant="outline">{rule.domain}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{rule.resource}</Badge>
                        </TableCell>
                        <TableCell className="flex items-center gap-2">
                          <TierIcon tierId={rule.tier_id} />
                          <span className="text-sm">{rule.tier_id}</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{rule.mode}</Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs max-w-xs truncate">
                          {JSON.stringify(rule.rule)}
                        </TableCell>
                        <TableCell className="text-sm">{formatDate(rule.updated_at)}</TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openRuleEditor(rule)}
                            data-testid={`button-edit-rule-${rule.id}`}
                          >
                            <Edit className="w-4 h-4" />
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

        {/* Schema Tab */}
        <TabsContent value="schema">
          <Card>
            <CardHeader>
              <CardTitle>Combat Skill Fields</CardTitle>
              <CardDescription>Available fields for allowlist configuration</CardDescription>
            </CardHeader>
            <CardContent>
              {schemaData?.fields ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Field</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Description</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {schemaData.fields.map((field) => (
                      <TableRow key={field.name} data-testid={`row-field-${field.name}`}>
                        <TableCell className="font-mono text-sm">{field.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{field.type}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {field.description}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-muted-foreground">No schema data available</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Tier Dialog */}
      <Dialog open={tierEditOpen} onOpenChange={setTierEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Tier: {editingTier?.tier_id}</DialogTitle>
            <DialogDescription>Update tier display settings and pricing</DialogDescription>
          </DialogHeader>

          {editingTier && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Display Name</Label>
                <Input
                  value={editingTier.display_name}
                  onChange={(e) => setEditingTier({ ...editingTier, display_name: e.target.value })}
                  data-testid="input-tier-display-name"
                />
              </div>

              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={editingTier.description || ""}
                  onChange={(e) => setEditingTier({ ...editingTier, description: e.target.value })}
                  data-testid="input-tier-description"
                />
              </div>

              <div className="space-y-2">
                <Label>Price (Monthly USD)</Label>
                <Input
                  type="number"
                  value={editingTier.price_monthly || ""}
                  onChange={(e) => setEditingTier({ ...editingTier, price_monthly: e.target.value || null })}
                  placeholder="0.00"
                  data-testid="input-tier-price"
                />
              </div>

              <div className="space-y-2">
                <Label>Sort Order</Label>
                <Input
                  type="number"
                  value={editingTier.sort_order}
                  onChange={(e) => setEditingTier({ ...editingTier, sort_order: parseInt(e.target.value) || 0 })}
                  data-testid="input-tier-sort-order"
                />
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  checked={editingTier.enabled}
                  onCheckedChange={(checked) => setEditingTier({ ...editingTier, enabled: checked })}
                  data-testid="switch-tier-enabled"
                />
                <Label>Enabled</Label>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setTierEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveTier} disabled={updateTierMutation.isPending} data-testid="button-save-tier">
              {updateTierMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Rule Dialog */}
      <Dialog open={ruleEditOpen} onOpenChange={setRuleEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Entitlement Rule</DialogTitle>
            <DialogDescription>Configure access rules for a specific tier</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Domain</Label>
                <Select
                  value={editingRule.domain}
                  onValueChange={(v) => setEditingRule({ ...editingRule, domain: v })}
                >
                  <SelectTrigger data-testid="select-rule-domain">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="combat">combat</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Resource</Label>
                <Select
                  value={editingRule.resource}
                  onValueChange={(v) => setEditingRule({ ...editingRule, resource: v })}
                >
                  <SelectTrigger data-testid="select-rule-resource">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="skills">skills</SelectItem>
                    <SelectItem value="classes">classes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tier</Label>
                <Select
                  value={editingRule.tier_id}
                  onValueChange={(v) => setEditingRule({ ...editingRule, tier_id: v })}
                >
                  <SelectTrigger data-testid="select-rule-tier">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {tiersData?.results?.map((tier) => (
                      <SelectItem key={tier.tier_id} value={tier.tier_id}>
                        {tier.display_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Mode</Label>
                <Select
                  value={editingRule.mode}
                  onValueChange={(v) => setEditingRule({ ...editingRule, mode: v })}
                >
                  <SelectTrigger data-testid="select-rule-mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="allowlist">allowlist</SelectItem>
                    <SelectItem value="flags">flags</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Rule (JSON)</Label>
              <Textarea
                value={editingRule.rule}
                onChange={(e) => setEditingRule({ ...editingRule, rule: e.target.value })}
                className="font-mono text-sm min-h-[120px]"
                placeholder='["field1", "field2"] or {"featureFlag": true}'
                data-testid="input-rule-json"
              />
              <p className="text-xs text-muted-foreground">
                For allowlist mode: array of field names. For flags mode: object with boolean flags.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRuleEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveRule} disabled={upsertRuleMutation.isPending} data-testid="button-save-rule">
              {upsertRuleMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Preview Entitlements</DialogTitle>
            <DialogDescription>Test how entitlements shape data for different tiers</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Domain</Label>
                <Select
                  value={previewConfig.domain}
                  onValueChange={(v) => setPreviewConfig({ ...previewConfig, domain: v })}
                >
                  <SelectTrigger data-testid="select-preview-domain">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="combat">combat</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Resource</Label>
                <Select
                  value={previewConfig.resource}
                  onValueChange={(v) => setPreviewConfig({ ...previewConfig, resource: v })}
                >
                  <SelectTrigger data-testid="select-preview-resource">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="skills">skills</SelectItem>
                    <SelectItem value="classes">classes</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Tier</Label>
                <Select
                  value={previewConfig.tier_id}
                  onValueChange={(v) => setPreviewConfig({ ...previewConfig, tier_id: v })}
                >
                  <SelectTrigger data-testid="select-preview-tier">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {tiersData?.results?.map((tier) => (
                      <SelectItem key={tier.tier_id} value={tier.tier_id}>
                        {tier.display_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Sample Object (JSON)</Label>
              <Textarea
                value={previewConfig.sample}
                onChange={(e) => setPreviewConfig({ ...previewConfig, sample: e.target.value })}
                className="font-mono text-sm min-h-[100px]"
                placeholder='{"id": 1, "name": "Test", "damage": 50}'
                data-testid="input-preview-sample"
              />
            </div>

            <Button onClick={handlePreview} disabled={previewMutation.isPending} data-testid="button-run-preview">
              {previewMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Eye className="w-4 h-4 mr-2" />
              )}
              Preview
            </Button>

            {previewResult && (
              <div className="space-y-4 border-t pt-4">
                <div className="flex items-center gap-2">
                  <TierIcon tierId={previewResult.tier} />
                  <span className="font-medium">Results for {previewResult.tier}</span>
                </div>

                {Object.keys(previewResult.features).length > 0 && (
                  <div className="space-y-2">
                    <Label>Feature Flags</Label>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(previewResult.features).map(([flag, enabled]) => (
                        <Badge key={flag} variant={enabled ? "default" : "secondary"}>
                          {enabled ? <CheckCircle className="w-3 h-3 mr-1" /> : null}
                          {flag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Shaped Result</Label>
                  <pre
                    className="p-3 bg-muted rounded-md text-sm font-mono overflow-auto max-h-[200px]"
                    data-testid="text-preview-result"
                  >
                    {JSON.stringify(previewResult.result, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
