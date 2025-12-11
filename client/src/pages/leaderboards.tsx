import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Trophy, Medal, Award, Crown, Sparkles, Sword, Flame, Coins, Calendar, TrendingUp, Users, ChevronRight } from "lucide-react";

interface LeaderboardDef {
  key: string;
  name: string;
  description: string;
  categoryKey: string;
  timeWindow: string;
}

interface LeaderboardEntry {
  rank: number;
  clusterId: string;
  displayName: string | null;
  walletPreview: string | null;
  score: number;
  flags: string[];
}

interface LeaderboardData {
  key: string;
  name: string;
  description: string;
  timeWindow: string;
  runId?: number;
  generatedAt?: string;
  entries: LeaderboardEntry[];
}

const categoryIcons: Record<string, typeof Trophy> = {
  heroes: Users,
  hunting: Sword,
  pvp: Flame,
  summoning: Sparkles,
  defi: Coins,
  season: Calendar,
  overall: TrendingUp,
};

const categoryLabels: Record<string, string> = {
  heroes: "Hero Progression",
  hunting: "Hunting & PvE",
  pvp: "PvP Competition",
  summoning: "Summoning Prestige",
  defi: "DeFi Participation",
  season: "Seasonal",
  overall: "Overall",
};

const flagLabels: Record<string, { label: string; color: string }> = {
  summoner_of_legends: { label: "Legendary Summoner", color: "bg-purple-500/20 text-purple-300 border-purple-500/30" },
  mythmaker: { label: "Mythmaker", color: "bg-amber-500/20 text-amber-300 border-amber-500/30" },
  clucker_miracle: { label: "Miracle Hunter", color: "bg-red-500/20 text-red-300 border-red-500/30" },
  arena_victor: { label: "Arena Victor", color: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
  lp_whale: { label: "LP Whale", color: "bg-green-500/20 text-green-300 border-green-500/30" },
};

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <div className="flex items-center gap-1" data-testid={`rank-badge-${rank}`}>
        <Crown className="h-5 w-5 text-yellow-400" />
        <span className="font-bold text-yellow-400">1st</span>
      </div>
    );
  }
  if (rank === 2) {
    return (
      <div className="flex items-center gap-1" data-testid={`rank-badge-${rank}`}>
        <Medal className="h-5 w-5 text-gray-300" />
        <span className="font-bold text-gray-300">2nd</span>
      </div>
    );
  }
  if (rank === 3) {
    return (
      <div className="flex items-center gap-1" data-testid={`rank-badge-${rank}`}>
        <Award className="h-5 w-5 text-orange-400" />
        <span className="font-bold text-orange-400">3rd</span>
      </div>
    );
  }
  return <span className="text-muted-foreground" data-testid={`rank-badge-${rank}`}>#{rank}</span>;
}

function LeaderboardSidebar({ 
  leaderboards, 
  selectedKey, 
  onSelect 
}: { 
  leaderboards: LeaderboardDef[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
}) {
  const grouped = leaderboards.reduce((acc, lb) => {
    if (!acc[lb.categoryKey]) acc[lb.categoryKey] = [];
    acc[lb.categoryKey].push(lb);
    return acc;
  }, {} as Record<string, LeaderboardDef[]>);

  return (
    <div className="w-64 border-r bg-card/50 min-h-screen" data-testid="leaderboard-sidebar">
      <div className="p-4 border-b">
        <div className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-primary" />
          <h2 className="font-semibold text-lg">Leaderboards</h2>
        </div>
      </div>
      <ScrollArea className="h-[calc(100vh-80px)]">
        <div className="p-2">
          {Object.entries(grouped).map(([category, items]) => {
            const IconComponent = categoryIcons[category] || Trophy;
            return (
              <div key={category} className="mb-4">
                <div className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  <IconComponent className="h-3 w-3" />
                  {categoryLabels[category] || category}
                </div>
                {items.map((lb) => (
                  <Button
                    key={lb.key}
                    variant={selectedKey === lb.key ? "secondary" : "ghost"}
                    className="w-full justify-start text-left h-auto py-2 px-3"
                    onClick={() => onSelect(lb.key)}
                    data-testid={`button-select-leaderboard-${lb.key}`}
                  >
                    <div className="flex flex-col items-start gap-0.5">
                      <span className="text-sm font-medium">{lb.name}</span>
                      <span className="text-xs text-muted-foreground">{lb.timeWindow.replace('_', ' ')}</span>
                    </div>
                    <ChevronRight className="h-4 w-4 ml-auto opacity-50" />
                  </Button>
                ))}
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

function LeaderboardTable({ data, isLoading }: { data: LeaderboardData | null; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(10)].map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
        <Trophy className="h-12 w-12 mb-4 opacity-50" />
        <p>Select a leaderboard to view rankings</p>
      </div>
    );
  }

  if (data.entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
        <Trophy className="h-12 w-12 mb-4 opacity-50" />
        <p>No entries yet</p>
        <p className="text-sm">Rankings will appear after the next leaderboard run</p>
      </div>
    );
  }

  return (
    <Table data-testid="leaderboard-table">
      <TableHeader>
        <TableRow>
          <TableHead className="w-20">Rank</TableHead>
          <TableHead>Player</TableHead>
          <TableHead className="text-right">Score</TableHead>
          <TableHead>Badges</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.entries.map((entry) => (
          <TableRow key={entry.clusterId} data-testid={`leaderboard-row-${entry.rank}`}>
            <TableCell>
              <RankBadge rank={entry.rank} />
            </TableCell>
            <TableCell>
              <div className="flex flex-col">
                <span className="font-medium" data-testid={`player-name-${entry.rank}`}>
                  {entry.displayName || entry.walletPreview || 'Anonymous'}
                </span>
                {entry.walletPreview && entry.displayName && (
                  <span className="text-xs text-muted-foreground">{entry.walletPreview}</span>
                )}
              </div>
            </TableCell>
            <TableCell className="text-right">
              <span className="font-bold text-lg" data-testid={`score-${entry.rank}`}>
                {entry.score.toLocaleString()}
              </span>
            </TableCell>
            <TableCell>
              <div className="flex flex-wrap gap-1">
                {entry.flags.map((flag) => {
                  const flagInfo = flagLabels[flag];
                  return flagInfo ? (
                    <Badge 
                      key={flag} 
                      variant="outline" 
                      className={`text-xs ${flagInfo.color}`}
                      data-testid={`badge-${flag}-${entry.rank}`}
                    >
                      {flagInfo.label}
                    </Badge>
                  ) : null;
                })}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default function LeaderboardsPage() {
  const [match, params] = useRoute("/leaderboards/:key");
  const [, setLocation] = useLocation();
  
  const keyFromUrl = params?.key || null;
  const [selectedKey, setSelectedKey] = useState<string | null>(keyFromUrl);

  const { data: leaderboards, isLoading: loadingList } = useQuery<LeaderboardDef[]>({
    queryKey: ['/api/leaderboards'],
  });

  const { data: leaderboardData, isLoading: loadingData } = useQuery<LeaderboardData>({
    queryKey: ['/api/leaderboards', selectedKey],
    enabled: !!selectedKey,
  });

  useEffect(() => {
    if (keyFromUrl && keyFromUrl !== selectedKey) {
      setSelectedKey(keyFromUrl);
    }
  }, [keyFromUrl, selectedKey]);

  useEffect(() => {
    if (leaderboards && leaderboards.length > 0 && !selectedKey) {
      const firstKey = leaderboards[0].key;
      setSelectedKey(firstKey);
      setLocation(`/leaderboards/${firstKey}`, { replace: true });
    }
  }, [leaderboards, selectedKey, setLocation]);

  const handleSelect = (key: string) => {
    setSelectedKey(key);
    setLocation(`/leaderboards/${key}`);
  };

  if (loadingList) {
    return (
      <div className="flex h-screen">
        <div className="w-64 border-r p-4">
          <Skeleton className="h-8 w-32 mb-4" />
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-10 w-full mb-2" />
          ))}
        </div>
        <div className="flex-1 p-6">
          <Skeleton className="h-8 w-48 mb-4" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background" data-testid="leaderboards-page">
      <LeaderboardSidebar
        leaderboards={leaderboards || []}
        selectedKey={selectedKey}
        onSelect={handleSelect}
      />
      
      <div className="flex-1 overflow-auto">
        <div className="p-6">
          {leaderboardData && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <h1 className="text-2xl font-bold" data-testid="leaderboard-title">{leaderboardData.name}</h1>
                <Badge variant="outline" data-testid="time-window-badge">
                  {leaderboardData.timeWindow.replace('_', ' ')}
                </Badge>
              </div>
              <p className="text-muted-foreground" data-testid="leaderboard-description">
                {leaderboardData.description}
              </p>
              {leaderboardData.generatedAt && (
                <p className="text-xs text-muted-foreground mt-2" data-testid="generated-at">
                  Last updated: {new Date(leaderboardData.generatedAt).toLocaleString()}
                </p>
              )}
            </div>
          )}
          
          <Card>
            <CardContent className="p-0">
              <LeaderboardTable data={leaderboardData || null} isLoading={loadingData} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
