import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Loader2, TrendingUp, TrendingDown, DollarSign, Plus, Target, Percent, AlertTriangle, CheckCircle, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-500',
  summoned: 'bg-blue-500',
  listed: 'bg-purple-500',
  sold: 'bg-green-500',
  failed: 'bg-red-500'
};

const STATUS_ICONS: Record<string, typeof CheckCircle> = {
  pending: AlertTriangle,
  summoned: Target,
  listed: DollarSign,
  sold: CheckCircle,
  failed: XCircle
};

interface SummonSession {
  id: number;
  realm: string;
  wallet_address: string;
  parent1_hero_id: string;
  parent2_hero_id: string;
  total_cost_native: string | null;
  native_token: string;
  expected_profit_native: string | null;
  offspring_hero_id: string | null;
  status: string;
  created_at: string;
  summoned_at: string | null;
}

interface ConversionMetric {
  id: number;
  realm: string;
  main_class: string;
  sub_class?: string;
  rarity?: number;
  conversion_rate: string;
  avg_profit_native: string | null;
  avg_loss_native: string | null;
  risk_adjusted_profit_native: string | null;
  sample_size: number;
  confidence_level: string;
}

interface ROISummary {
  total_sessions: string;
  sold_count: string;
  total_invested: string | null;
  total_revenue: string | null;
  total_profit: string | null;
}

export default function ProfitTrackerPage() {
  const { toast } = useToast();
  const [selectedRealm, setSelectedRealm] = useState<string>("all");
  const [isNewSessionOpen, setIsNewSessionOpen] = useState(false);
  const [newSession, setNewSession] = useState({
    realm: 'cv',
    walletAddress: '',
    parent1HeroId: '',
    parent2HeroId: '',
    parent1CostNative: '',
    parent2CostNative: '',
    summonFeeNative: '',
    enhancementStonesUsed: 0,
    enhancementStoneCostNative: '',
    nativeToken: 'CRYSTAL'
  });

  const sessionsQuery = useQuery<{ ok: boolean; sessions: SummonSession[]; count: number }>({
    queryKey: ['/api/admin/profit-tracker/sessions'],
    refetchInterval: 30000
  });

  const conversionQuery = useQuery<{ ok: boolean; metrics: ConversionMetric[]; count: number }>({
    queryKey: ['/api/admin/profit-tracker/conversion-metrics', selectedRealm],
    queryFn: async () => {
      const url = selectedRealm === 'all'
        ? '/api/admin/profit-tracker/conversion-metrics'
        : `/api/admin/profit-tracker/conversion-metrics?realm=${selectedRealm}`;
      const res = await fetch(url, { credentials: 'include' });
      return res.json();
    }
  });

  const roiQuery = useQuery<{ ok: boolean; summary: ROISummary }>({
    queryKey: ['/api/admin/profit-tracker/roi-summary']
  });

  const invalidateAllProfitTracker = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/admin/profit-tracker/sessions'] });
    queryClient.invalidateQueries({ queryKey: ['/api/admin/profit-tracker/conversion-metrics'] });
    queryClient.invalidateQueries({ queryKey: ['/api/admin/profit-tracker/roi-summary'] });
  };

  const createSessionMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/admin/profit-tracker/sessions', newSession);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Session created", description: "Summon session added to tracker" });
      setIsNewSessionOpen(false);
      setNewSession({
        realm: 'cv',
        walletAddress: '',
        parent1HeroId: '',
        parent2HeroId: '',
        parent1CostNative: '',
        parent2CostNative: '',
        summonFeeNative: '',
        enhancementStonesUsed: 0,
        enhancementStoneCostNative: '',
        nativeToken: 'CRYSTAL'
      });
      invalidateAllProfitTracker();
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create session", description: err.message, variant: "destructive" });
    }
  });

  const sessions = sessionsQuery.data?.sessions || [];
  const conversions = conversionQuery.data?.metrics || [];
  const roi = roiQuery.data?.summary;

  const formatPrice = (price: string | null | undefined) => {
    if (!price) return '-';
    const num = parseFloat(price);
    if (isNaN(num)) return '-';
    if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
    return num.toFixed(2);
  };

  const formatPercent = (rate: string | null | undefined) => {
    if (!rate) return '-';
    const num = parseFloat(rate);
    if (isNaN(num)) return '-';
    return `${(num * 100).toFixed(1)}%`;
  };

  const totalInvested = parseFloat(roi?.total_invested || '0');
  const totalProfit = parseFloat(roi?.total_profit || '0');
  const roiPercent = totalInvested > 0 ? ((totalProfit / totalInvested) * 100).toFixed(1) : '0';

  return (
    <div className="space-y-6" data-testid="page-profit-tracker">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Summon Profit Tracker</h1>
          <p className="text-muted-foreground">Track summoning costs, outcomes, and ROI</p>
        </div>
        
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={selectedRealm} onValueChange={setSelectedRealm}>
            <SelectTrigger className="w-[140px]" data-testid="select-realm">
              <SelectValue placeholder="All Realms" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Realms</SelectItem>
              <SelectItem value="cv">Crystalvale</SelectItem>
              <SelectItem value="sd">Sundered Isles</SelectItem>
            </SelectContent>
          </Select>
          
          <Dialog open={isNewSessionOpen} onOpenChange={setIsNewSessionOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-new-session">
                <Plus className="h-4 w-4 mr-2" />
                New Session
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Summon Session</DialogTitle>
                <DialogDescription>Track a new summoning attempt</DialogDescription>
              </DialogHeader>
              
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Realm</Label>
                    <Select 
                      value={newSession.realm} 
                      onValueChange={(v) => setNewSession(s => ({ ...s, realm: v, nativeToken: v === 'cv' ? 'CRYSTAL' : 'JEWEL' }))}
                    >
                      <SelectTrigger data-testid="input-realm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cv">Crystalvale</SelectItem>
                        <SelectItem value="sd">Sundered Isles</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Token</Label>
                    <Input value={newSession.nativeToken} disabled data-testid="input-token" />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label>Wallet Address</Label>
                  <Input 
                    placeholder="0x..." 
                    value={newSession.walletAddress}
                    onChange={(e) => setNewSession(s => ({ ...s, walletAddress: e.target.value }))}
                    data-testid="input-wallet"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Parent 1 Hero ID</Label>
                    <Input 
                      placeholder="Hero ID"
                      value={newSession.parent1HeroId}
                      onChange={(e) => setNewSession(s => ({ ...s, parent1HeroId: e.target.value }))}
                      data-testid="input-parent1"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Parent 2 Hero ID</Label>
                    <Input 
                      placeholder="Hero ID"
                      value={newSession.parent2HeroId}
                      onChange={(e) => setNewSession(s => ({ ...s, parent2HeroId: e.target.value }))}
                      data-testid="input-parent2"
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Parent 1 Cost</Label>
                    <Input 
                      type="number"
                      placeholder="0"
                      value={newSession.parent1CostNative}
                      onChange={(e) => setNewSession(s => ({ ...s, parent1CostNative: e.target.value }))}
                      data-testid="input-parent1-cost"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Parent 2 Cost</Label>
                    <Input 
                      type="number"
                      placeholder="0"
                      value={newSession.parent2CostNative}
                      onChange={(e) => setNewSession(s => ({ ...s, parent2CostNative: e.target.value }))}
                      data-testid="input-parent2-cost"
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Summon Fee</Label>
                    <Input 
                      type="number"
                      placeholder="0"
                      value={newSession.summonFeeNative}
                      onChange={(e) => setNewSession(s => ({ ...s, summonFeeNative: e.target.value }))}
                      data-testid="input-summon-fee"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Enhancement Stones</Label>
                    <Input 
                      type="number"
                      placeholder="0"
                      value={newSession.enhancementStonesUsed}
                      onChange={(e) => setNewSession(s => ({ ...s, enhancementStonesUsed: parseInt(e.target.value) || 0 }))}
                      data-testid="input-stones"
                    />
                  </div>
                </div>
              </div>
              
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsNewSessionOpen(false)}>Cancel</Button>
                <Button 
                  onClick={() => createSessionMutation.mutate()}
                  disabled={createSessionMutation.isPending || !newSession.walletAddress || !newSession.parent1HeroId || !newSession.parent2HeroId}
                  data-testid="button-create-session"
                >
                  {createSessionMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Create Session
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Sessions</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-sessions">
              {roi?.total_sessions || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Sold: {roi?.sold_count || 0}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Invested</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-invested">
              {formatPrice(roi?.total_invested)}
            </div>
            <p className="text-xs text-muted-foreground">
              Revenue: {formatPrice(roi?.total_revenue)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Profit</CardTitle>
            {totalProfit >= 0 ? (
              <TrendingUp className="h-4 w-4 text-green-500" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-500" />
            )}
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}`} data-testid="text-total-profit">
              {totalProfit >= 0 ? '+' : ''}{formatPrice(roi?.total_profit)}
            </div>
            <p className="text-xs text-muted-foreground">
              Net profit/loss
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">ROI</CardTitle>
            <Percent className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${parseFloat(roiPercent) >= 0 ? 'text-green-600' : 'text-red-600'}`} data-testid="text-roi">
              {parseFloat(roiPercent) >= 0 ? '+' : ''}{roiPercent}%
            </div>
            <p className="text-xs text-muted-foreground">
              Return on investment
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent Sessions</CardTitle>
            <CardDescription>Your tracked summoning attempts</CardDescription>
          </CardHeader>
          <CardContent>
            {sessionsQuery.isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : sessions.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No sessions yet. Create one to start tracking.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Parents</TableHead>
                    <TableHead>Cost</TableHead>
                    <TableHead>When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessions.slice(0, 10).map((session) => {
                    const StatusIcon = STATUS_ICONS[session.status] || AlertTriangle;
                    return (
                      <TableRow key={session.id} data-testid={`row-session-${session.id}`}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <StatusIcon className={`h-4 w-4 ${session.status === 'sold' ? 'text-green-500' : session.status === 'failed' ? 'text-red-500' : 'text-muted-foreground'}`} />
                            <Badge className={STATUS_COLORS[session.status]}>
                              {session.status}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-xs font-mono">
                            <div>{session.parent1_hero_id.substring(0, 8)}...</div>
                            <div>{session.parent2_hero_id.substring(0, 8)}...</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {formatPrice(session.total_cost_native)} {session.native_token}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(session.created_at).toLocaleDateString()}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Conversion Metrics</CardTitle>
            <CardDescription>Historical conversion rates by class</CardDescription>
          </CardHeader>
          <CardContent>
            {conversionQuery.isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : conversions.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No conversion data yet. More sales data needed.</p>
            ) : (
              <div className="space-y-2">
                {conversions.slice(0, 10).map((metric) => (
                  <div 
                    key={metric.id} 
                    className="flex items-center justify-between p-2 rounded-md bg-muted/50"
                    data-testid={`row-conversion-${metric.id}`}
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {metric.realm.toUpperCase()}
                      </Badge>
                      <span className="font-medium">{metric.main_class}</span>
                      <Badge 
                        variant={metric.confidence_level === 'high' ? 'default' : 'secondary'}
                        className="text-xs"
                      >
                        {metric.confidence_level}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-sm font-medium">{formatPercent(metric.conversion_rate)}</div>
                        <div className="text-xs text-muted-foreground">{metric.sample_size} samples</div>
                      </div>
                      <div className="text-right">
                        <div className={`text-sm font-medium ${parseFloat(metric.risk_adjusted_profit_native || '0') >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatPrice(metric.risk_adjusted_profit_native)}
                        </div>
                        <div className="text-xs text-muted-foreground">risk-adj profit</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
