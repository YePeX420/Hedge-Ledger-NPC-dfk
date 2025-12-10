import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Trophy,
  Swords,
  Coins,
  Pickaxe,
  Crown,
  Users,
  Calendar,
  Star,
  Sparkles,
  Plus,
  Search,
  Eye,
  Edit,
  Trash2,
  Play,
  CheckCircle,
  XCircle,
  AlertCircle,
  FileCheck,
  Rocket,
  Archive,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Challenge {
  id: number;
  code: string;
  name: string;
  category: string;
  type: string;
  state: string;
  descriptionShort: string;
  isVisibleFe: boolean;
  isTestOnly: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

interface ChallengeCategory {
  key: string;
  name: string;
  description: string;
  tierSystem: string;
}

const STATES = ["draft", "validated", "deployed", "deprecated"];
const TYPES = ["tiered", "binary", "milestone"];

const categoryIcons: Record<string, typeof Trophy> = {
  hero_progression: Swords,
  economy_strategy: Coins,
  profession_specialization: Pickaxe,
  ownership_collection: Crown,
  behavior_engagement: Users,
  seasonal_events: Calendar,
  prestige_overall: Star,
  summoning_prestige: Sparkles,
};

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
    <Badge variant="outline" className={`text-xs ${colorClass} gap-1`} data-testid={`badge-state-${state}`}>
      <Icon className="w-3 h-3" />
      {state.toUpperCase()}
    </Badge>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex gap-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-10 w-32" />
      </div>
      <Card>
        <CardContent className="p-0">
          <div className="space-y-2 p-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminChallenges() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [deleteDialog, setDeleteDialog] = useState<Challenge | null>(null);
  const [createDialog, setCreateDialog] = useState(false);

  const buildQueryString = () => {
    const params = new URLSearchParams();
    if (stateFilter) params.append("state", stateFilter);
    if (categoryFilter) params.append("category", categoryFilter);
    if (typeFilter) params.append("type", typeFilter);
    if (search) params.append("search", search);
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  };

  const { data: challenges, isLoading, error } = useQuery<Challenge[]>({
    queryKey: ["/api/admin/challenges", stateFilter, categoryFilter, typeFilter, search],
    queryFn: async () => {
      const res = await fetch(`/api/admin/challenges${buildQueryString()}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch challenges");
      return res.json();
    },
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

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/admin/challenges/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete challenge");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/challenges"] });
      toast({ title: "Challenge deprecated", description: "The challenge has been marked as deprecated." });
      setDeleteDialog(null);
    },
    onError: (err) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const stateCounts = {
    draft: challenges?.filter(c => c.state === "draft").length || 0,
    validated: challenges?.filter(c => c.state === "validated").length || 0,
    deployed: challenges?.filter(c => c.state === "deployed").length || 0,
    deprecated: challenges?.filter(c => c.state === "deprecated").length || 0,
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Challenge Admin</h1>
          <p className="text-muted-foreground">Loading challenges...</p>
        </div>
        <LoadingSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Error Loading Challenges</CardTitle>
            <CardDescription>
              {error instanceof Error ? error.message : "Failed to load challenges"}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Challenge Admin</h1>
          <p className="text-muted-foreground">
            Manage challenge definitions, validation, and deployment
          </p>
        </div>
        <Button onClick={() => setCreateDialog(true)} data-testid="button-create-challenge">
          <Plus className="w-4 h-4 mr-2" />
          New Challenge
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {STATES.map(state => {
          const Icon = stateIcons[state];
          const count = stateCounts[state as keyof typeof stateCounts];
          return (
            <Card
              key={state}
              className={`cursor-pointer hover-elevate ${stateFilter === state ? "ring-2 ring-primary" : ""}`}
              onClick={() => setStateFilter(stateFilter === state ? "" : state)}
              data-testid={`card-state-filter-${state}`}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium capitalize flex items-center gap-2">
                    <Icon className="w-4 h-4" />
                    {state}
                  </CardTitle>
                  <Badge variant="secondary">{count}</Badge>
                </div>
              </CardHeader>
            </Card>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-4 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by code or name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
            data-testid="input-search"
          />
        </div>
        
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[180px]" data-testid="select-category">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Categories</SelectItem>
            {categories?.map(cat => (
              <SelectItem key={cat.key} value={cat.key}>{cat.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[150px]" data-testid="select-type">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Types</SelectItem>
            {TYPES.map(type => (
              <SelectItem key={type} value={type}>{type}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {(stateFilter || categoryFilter || typeFilter || search) && (
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => {
              setStateFilter("");
              setCategoryFilter("");
              setTypeFilter("");
              setSearch("");
            }}
            data-testid="button-clear-filters"
          >
            Clear Filters
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[200px]">Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>State</TableHead>
                <TableHead>Visibility</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {challenges?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    No challenges found. Create your first challenge!
                  </TableCell>
                </TableRow>
              )}
              {challenges?.map((challenge) => {
                const CategoryIcon = categoryIcons[challenge.category] || Trophy;
                return (
                  <TableRow key={challenge.id} data-testid={`row-challenge-${challenge.id}`}>
                    <TableCell className="font-mono text-sm">{challenge.code}</TableCell>
                    <TableCell className="font-medium">{challenge.name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <CategoryIcon className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm">{challenge.category}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{challenge.type}</Badge>
                    </TableCell>
                    <TableCell>
                      <StateBadge state={challenge.state} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {challenge.isVisibleFe ? (
                          <Badge variant="secondary" className="text-xs gap-1">
                            <Eye className="w-3 h-3" /> Visible
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs gap-1 text-muted-foreground">
                            <XCircle className="w-3 h-3" /> Hidden
                          </Badge>
                        )}
                        {challenge.isTestOnly && (
                          <Badge variant="outline" className="text-xs text-amber-500 border-amber-500/30">
                            Test
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => navigate(`/admin/challenges/${challenge.id}`)}
                          data-testid={`button-view-${challenge.id}`}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        {challenge.state !== "deployed" && challenge.state !== "deprecated" && (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => navigate(`/admin/challenges/${challenge.id}/edit`)}
                            data-testid={`button-edit-${challenge.id}`}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                        )}
                        {challenge.state !== "deprecated" && (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setDeleteDialog(challenge)}
                            data-testid={`button-delete-${challenge.id}`}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!deleteDialog} onOpenChange={() => setDeleteDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deprecate Challenge</DialogTitle>
            <DialogDescription>
              Are you sure you want to deprecate "{deleteDialog?.name}"? This will hide it from the frontend and mark it as inactive.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteDialog && deleteMutation.mutate(deleteDialog.id)}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "Deprecating..." : "Deprecate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createDialog} onOpenChange={setCreateDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create New Challenge</DialogTitle>
            <DialogDescription>
              Define a new challenge. It will start in draft state.
            </DialogDescription>
          </DialogHeader>
          <CreateChallengeForm 
            categories={categories || []} 
            onSuccess={() => {
              setCreateDialog(false);
              queryClient.invalidateQueries({ queryKey: ["/api/admin/challenges"] });
            }} 
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CreateChallengeForm({ 
  categories, 
  onSuccess 
}: { 
  categories: ChallengeCategory[]; 
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    code: "",
    name: "",
    category: "hero_progression",
    type: "tiered",
    descriptionShort: "",
    metricType: "integer",
    metricSource: "onchain_heroes",
    metricKey: "",
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await fetch("/api/admin/challenges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to create challenge");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Challenge created", description: "The challenge has been created in draft state." });
      onSuccess();
    },
    onError: (err) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium">Code (unique key)</label>
          <Input
            placeholder="e.g., hero_count_10"
            value={formData.code}
            onChange={(e) => setFormData({ ...formData, code: e.target.value })}
            required
            data-testid="input-code"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Display Name</label>
          <Input
            placeholder="e.g., Hero Collector"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
            data-testid="input-name"
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium">Category</label>
          <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v })}>
            <SelectTrigger data-testid="select-form-category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {categories.map(cat => (
                <SelectItem key={cat.key} value={cat.key}>{cat.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Challenge Type</label>
          <Select value={formData.type} onValueChange={(v) => setFormData({ ...formData, type: v })}>
            <SelectTrigger data-testid="select-form-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tiered">Tiered (multi-level)</SelectItem>
              <SelectItem value="binary">Binary (yes/no)</SelectItem>
              <SelectItem value="milestone">Milestone (one-time)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Short Description</label>
        <Input
          placeholder="Brief description for UI display"
          value={formData.descriptionShort}
          onChange={(e) => setFormData({ ...formData, descriptionShort: e.target.value })}
          data-testid="input-description"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <label className="text-sm font-medium">Metric Type</label>
          <Select value={formData.metricType} onValueChange={(v) => setFormData({ ...formData, metricType: v })}>
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
          <Select value={formData.metricSource} onValueChange={(v) => setFormData({ ...formData, metricSource: v })}>
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
            placeholder="e.g., heroCount"
            value={formData.metricKey}
            onChange={(e) => setFormData({ ...formData, metricKey: e.target.value })}
            required
            data-testid="input-metric-key"
          />
        </div>
      </div>

      <DialogFooter>
        <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-create">
          {createMutation.isPending ? "Creating..." : "Create Challenge"}
        </Button>
      </DialogFooter>
    </form>
  );
}
