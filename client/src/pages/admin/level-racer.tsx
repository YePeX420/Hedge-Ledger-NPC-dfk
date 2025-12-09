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
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Zap,
  Trophy,
  Users,
  Coins,
  Clock,
  Swords,
  Play,
} from "lucide-react";

interface ActivePool {
  id: number;
  heroClassSlug: string;
  heroClassName: string;
  state: string;
  entryCount: number;
  maxEntries: number;
  totalFeesCollected: number;
  prizeAwarded: boolean;
}

interface PoolEntry {
  id: number;
  heroId: string;
  walletAddress: string;
  heroLevel: number;
  heroRarity: string;
  heroCurrentXp: number;
  heroReadyToLevel: boolean;
  isWinner: boolean;
}

interface RaceEvent {
  id: number;
  eventType: string;
  commentary: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

interface PoolDetailsResponse {
  pool: ActivePool;
  entries: PoolEntry[];
}

interface EventsResponse {
  events: RaceEvent[];
}

interface HeroClass {
  id: number;
  slug: string;
  displayName: string;
  isEnabled: boolean;
}

const stateColors: Record<string, string> = {
  OPEN: "bg-green-500/20 text-green-400 border-green-500/30",
  FILLING: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  RACING: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  FINISHED: "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

function StateBadge({ state }: { state: string }) {
  const colorClass = stateColors[state] || "bg-muted text-muted-foreground";
  return (
    <Badge variant="outline" className={`text-xs ${colorClass}`} data-testid={`badge-state-${state.toLowerCase()}`}>
      {state}
    </Badge>
  );
}

function PoolCard({ pool, onSelect }: { pool: ActivePool; onSelect: (id: number) => void }) {
  return (
    <Card 
      className="hover-elevate cursor-pointer" 
      onClick={() => onSelect(pool.id)}
      data-testid={`card-pool-${pool.id}`}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <Swords className="w-4 h-4" />
              {pool.heroClassName} Arena
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              Pool #{pool.id}
            </CardDescription>
          </div>
          <StateBadge state={pool.state} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Users className="w-3 h-3" />
            <span>Heroes</span>
          </div>
          <span className="font-medium">{pool.entryCount}/{pool.maxEntries}</span>
        </div>
        <Progress value={(pool.entryCount / pool.maxEntries) * 100} className="h-2" />
        
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Coins className="w-3 h-3" />
            <span>Fees Collected</span>
          </div>
          <span className="font-medium">{pool.totalFeesCollected} JEWEL</span>
        </div>
        
        {pool.prizeAwarded && (
          <div className="flex items-center gap-1 text-yellow-500 text-xs">
            <Trophy className="w-3 h-3" />
            <span>Prize Awarded!</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PoolDetailsView({ poolId, onBack }: { poolId: number; onBack: () => void }) {
  const { toast } = useToast();
  
  const { data: poolData, isLoading: poolLoading } = useQuery<PoolDetailsResponse>({
    queryKey: ['/api/level-racer/pools', poolId],
  });

  const { data: eventsData, isLoading: eventsLoading } = useQuery<EventsResponse>({
    queryKey: ['/api/level-racer/pools', poolId, 'events'],
  });

  const simulateMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/level-racer/dev/pools/${poolId}/simulate-tick`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/level-racer/pools', poolId] });
      queryClient.invalidateQueries({ queryKey: ['/api/level-racer/pools', poolId, 'events'] });
      queryClient.invalidateQueries({ queryKey: ['/api/level-racer/pools/active'] });
      toast({ title: "XP Tick Simulated", description: "Heroes gained experience!" });
    },
    onError: (error: Error) => {
      toast({ title: "Simulation Failed", description: error.message, variant: "destructive" });
    },
  });

  if (poolLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!poolData) {
    return <div className="text-muted-foreground">Pool not found</div>;
  }

  const { pool, entries } = poolData;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack} data-testid="button-back">
          Back to Pools
        </Button>
        {pool.state === 'RACING' && (
          <Button 
            onClick={() => simulateMutation.mutate()} 
            disabled={simulateMutation.isPending}
            data-testid="button-simulate"
          >
            <Zap className="w-4 h-4 mr-2" />
            {simulateMutation.isPending ? 'Simulating...' : 'Simulate XP Tick'}
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Swords className="w-5 h-5" />
                {pool.heroClassName} Arena - Pool #{pool.id}
              </CardTitle>
              <CardDescription>
                {pool.entryCount}/{pool.maxEntries} heroes | {pool.totalFeesCollected} JEWEL collected
              </CardDescription>
            </div>
            <StateBadge state={pool.state} />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <h4 className="font-medium text-sm">Entries</h4>
            <div className="grid gap-2">
              {entries.map((entry) => (
                <div 
                  key={entry.id} 
                  className={`flex items-center justify-between p-3 rounded-md border ${
                    entry.isWinner ? 'bg-yellow-500/10 border-yellow-500/30' : 'bg-muted/50'
                  }`}
                  data-testid={`entry-${entry.id}`}
                >
                  <div className="flex items-center gap-3">
                    {entry.isWinner && <Trophy className="w-4 h-4 text-yellow-500" />}
                    <div>
                      <div className="font-medium text-sm">Hero #{entry.heroId}</div>
                      <div className="text-xs text-muted-foreground">
                        {entry.walletAddress.slice(0, 6)}...{entry.walletAddress.slice(-4)}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium">{entry.heroCurrentXp} XP</div>
                    {entry.heroReadyToLevel && (
                      <Badge variant="secondary" className="text-xs">Ready to Level!</Badge>
                    )}
                  </div>
                </div>
              ))}
              {entries.length === 0 && (
                <div className="text-sm text-muted-foreground text-center py-4">
                  No entries yet
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="w-4 h-4" />
            Race Events
          </CardTitle>
        </CardHeader>
        <CardContent>
          {eventsLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <ScrollArea className="h-64">
              <div className="space-y-3">
                {eventsData?.events.map((event) => (
                  <div key={event.id} className="border-l-2 border-primary/30 pl-3 py-1">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline" className="text-xs">{event.eventType}</Badge>
                      <span>{new Date(event.createdAt).toLocaleTimeString()}</span>
                    </div>
                    <p className="text-sm mt-1 italic">{event.commentary}</p>
                  </div>
                ))}
                {(!eventsData?.events || eventsData.events.length === 0) && (
                  <div className="text-sm text-muted-foreground text-center py-4">
                    No events yet
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminLevelRacer() {
  const [selectedPoolId, setSelectedPoolId] = useState<number | null>(null);

  const { data: pools, isLoading: poolsLoading } = useQuery<ActivePool[]>({
    queryKey: ['/api/level-racer/pools/active'],
  });

  const { data: classes } = useQuery<HeroClass[]>({
    queryKey: ['/api/level-racer/classes'],
  });

  if (selectedPoolId !== null) {
    return (
      <div className="p-6">
        <PoolDetailsView poolId={selectedPoolId} onBack={() => setSelectedPoolId(null)} />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="level-racer-page">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Zap className="w-6 h-6" />
          Level Racer
        </h1>
        <p className="text-muted-foreground mt-1">
          Competitive hero leveling races - first to be ready to level wins!
        </p>
      </div>

      <Separator />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Pools</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-active-pools">
              {pools?.filter(p => p.state !== 'FINISHED').length || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Hero Classes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-classes">
              {classes?.filter(c => c.isEnabled).length || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Prize Pool</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-500" data-testid="stat-prize">
              200 JEWEL
            </div>
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-4">Active Pools</h2>
        {poolsLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-48 w-full" />
            ))}
          </div>
        ) : pools && pools.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {pools.map((pool) => (
              <PoolCard key={pool.id} pool={pool} onSelect={setSelectedPoolId} />
            ))}
          </div>
        ) : (
          <Card className="p-8 text-center">
            <Play className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-medium">No Active Pools</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Pools are created when heroes join a class arena. Check back later!
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
