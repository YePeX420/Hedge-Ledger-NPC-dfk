import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Search, Pickaxe, Sprout, Fish, Trees, Dumbbell, Zap, TrendingUp } from 'lucide-react';

interface HeroData {
  id: string;
  class: string;
  subClass: string;
  profession: string;
  level: number;
  rarity: number;
  generation: number;
  stats: {
    str: number;
    int: number;
    wis: number;
    vit: number;
    end: number;
    mining: number;
    gardening: number;
    foraging: number;
    fishing: number;
  };
  bestProfessionQuest: string;
  professionScore: number;
  hasProfessionGene: boolean;
  staminaCost: number;
  bestTrainingStat?: string;
  trainingStatValue?: number;
  trainableStats?: string;
  successRate?: string;
  xpPerStamina?: string;
  isAlsoProfessionQuester?: boolean;
}

interface QuestOptimizerResponse {
  wallet: string;
  totalHeroes: number;
  averageStats: Record<string, number>;
  professionQuesters: HeroData[];
  trainingQuesters: HeroData[];
  summary: {
    byProfession: Record<string, number>;
    byClass: Record<string, number>;
  };
}

const RARITY_LABELS = ['Common', 'Uncommon', 'Rare', 'Legendary', 'Mythic'];
const RARITY_COLORS = ['text-muted-foreground', 'text-green-500', 'text-blue-500', 'text-orange-500', 'text-purple-500'];

const PROFESSION_ICONS: Record<string, typeof Pickaxe> = {
  mining: Pickaxe,
  gardening: Sprout,
  fishing: Fish,
  foraging: Trees
};

export default function QuestOptimizer() {
  const [walletInput, setWalletInput] = useState('');
  const [searchWallet, setSearchWallet] = useState('');
  const [activeTab, setActiveTab] = useState('profession');
  const [professionFilter, setProfessionFilter] = useState<string | null>(null);

  const queryUrl = useMemo(() => 
    searchWallet ? `/api/admin/quest-optimizer?wallet=${searchWallet}` : null
  , [searchWallet]);

  const { data, isLoading, error } = useQuery<QuestOptimizerResponse>({
    queryKey: [queryUrl],
    enabled: !!queryUrl,
    staleTime: 5 * 60 * 1000
  });

  const handleSearch = () => {
    if (walletInput && /^0x[a-fA-F0-9]{40}$/.test(walletInput)) {
      setSearchWallet(walletInput);
    }
  };

  const filteredProfessionQuesters = useMemo(() => {
    if (!data?.professionQuesters) return [];
    if (!professionFilter) return data.professionQuesters;
    return data.professionQuesters.filter(h => h.bestProfessionQuest === professionFilter);
  }, [data?.professionQuesters, professionFilter]);

  return (
    <div className="p-6 space-y-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold">Quest Optimizer</h1>
          <p className="text-muted-foreground">
            Analyze your heroes to find the best quest assignments for XP efficiency
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Wallet Analysis
            </CardTitle>
            <CardDescription>
              Enter a wallet address to analyze all heroes for optimal quest assignments
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                data-testid="input-wallet-address"
                placeholder="0x..."
                value={walletInput}
                onChange={(e) => setWalletInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="font-mono"
              />
              <Button 
                data-testid="button-analyze-wallet"
                onClick={handleSearch}
                disabled={isLoading || !walletInput}
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Analyze'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {error && (
          <Card className="border-destructive">
            <CardContent className="pt-6">
              <p className="text-destructive">Error: {(error as Error).message}</p>
            </CardContent>
          </Card>
        )}

        {data && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold" data-testid="text-total-heroes">{data.totalHeroes}</div>
                  <div className="text-sm text-muted-foreground">Total Heroes</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold text-green-500" data-testid="text-profession-questers">
                    {data.professionQuesters.length}
                  </div>
                  <div className="text-sm text-muted-foreground">Profession Questers</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold text-blue-500" data-testid="text-training-questers">
                    {data.trainingQuesters.length}
                  </div>
                  <div className="text-sm text-muted-foreground">Training Questers</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold text-orange-500">
                    {Object.keys(data.summary.byClass).length}
                  </div>
                  <div className="text-sm text-muted-foreground">Class Types</div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Profession Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(data.summary.byProfession)
                    .sort((a, b) => b[1] - a[1])
                    .map(([prof, count]) => {
                      const Icon = PROFESSION_ICONS[prof.toLowerCase()] || Dumbbell;
                      return (
                        <Badge 
                          key={prof} 
                          variant="secondary" 
                          className="text-sm cursor-pointer"
                          onClick={() => setProfessionFilter(professionFilter === prof.toLowerCase() ? null : prof.toLowerCase())}
                        >
                          <Icon className="h-3 w-3 mr-1" />
                          {prof}: {count}
                        </Badge>
                      );
                    })}
                </div>
              </CardContent>
            </Card>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger value="profession" data-testid="tab-profession">
                  <Sprout className="h-4 w-4 mr-2" />
                  Profession Questers ({filteredProfessionQuesters.length})
                </TabsTrigger>
                <TabsTrigger value="training" data-testid="tab-training">
                  <Dumbbell className="h-4 w-4 mr-2" />
                  Training Questers ({data.trainingQuesters.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="profession" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <TrendingUp className="h-5 w-5 text-green-500" />
                      Best Profession Questers
                    </CardTitle>
                    <CardDescription>
                      Heroes with high 2-stat combos for profession quests. Sorted by effectiveness.
                    </CardDescription>
                    {professionFilter && (
                      <Badge 
                        variant="outline" 
                        className="w-fit cursor-pointer"
                        onClick={() => setProfessionFilter(null)}
                      >
                        Filtered: {professionFilter} (click to clear)
                      </Badge>
                    )}
                  </CardHeader>
                  <CardContent>
                    <div className="rounded-md border overflow-auto max-h-[600px]">
                      <Table>
                        <TableHeader className="sticky top-0 bg-background">
                          <TableRow>
                            <TableHead>Hero ID</TableHead>
                            <TableHead>Class</TableHead>
                            <TableHead>Level</TableHead>
                            <TableHead>Best Quest</TableHead>
                            <TableHead>Score</TableHead>
                            <TableHead>Gene Match</TableHead>
                            <TableHead>Stamina/Attempt</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredProfessionQuesters.slice(0, 100).map((hero) => {
                            const Icon = PROFESSION_ICONS[hero.bestProfessionQuest] || Dumbbell;
                            return (
                              <TableRow key={hero.id} data-testid={`row-hero-${hero.id}`}>
                                <TableCell className="font-mono">{hero.id}</TableCell>
                                <TableCell>
                                  <span className={RARITY_COLORS[hero.rarity]}>
                                    {hero.class}
                                  </span>
                                </TableCell>
                                <TableCell>{hero.level}</TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-1">
                                    <Icon className="h-4 w-4" />
                                    {hero.bestProfessionQuest}
                                  </div>
                                </TableCell>
                                <TableCell className="font-bold">{hero.professionScore}</TableCell>
                                <TableCell>
                                  {hero.hasProfessionGene ? (
                                    <Badge className="bg-green-500">Yes</Badge>
                                  ) : (
                                    <Badge variant="outline">No</Badge>
                                  )}
                                </TableCell>
                                <TableCell>{hero.staminaCost}</TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                    {filteredProfessionQuesters.length > 100 && (
                      <p className="text-sm text-muted-foreground mt-2">
                        Showing top 100 of {filteredProfessionQuesters.length} heroes
                      </p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="training" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Zap className="h-5 w-5 text-blue-500" />
                      Best Training Questers
                    </CardTitle>
                    <CardDescription>
                      Heroes with stats between 40-50 (trainable range). Stats above 50 cannot do training quests.
                      Success rates: 40=53%, 45=60%, 50=68%. Sorted by XP efficiency.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="rounded-md border overflow-auto max-h-[600px]">
                      <Table>
                        <TableHeader className="sticky top-0 bg-background">
                          <TableRow>
                            <TableHead>Hero ID</TableHead>
                            <TableHead>Class</TableHead>
                            <TableHead>Level</TableHead>
                            <TableHead>Best Stat</TableHead>
                            <TableHead>Value</TableHead>
                            <TableHead>All Trainable Stats</TableHead>
                            <TableHead>Success Rate</TableHead>
                            <TableHead>XP/Stamina</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.trainingQuesters.slice(0, 100).map((hero) => (
                            <TableRow key={hero.id} data-testid={`row-training-hero-${hero.id}`}>
                              <TableCell className="font-mono">{hero.id}</TableCell>
                              <TableCell>
                                <span className={RARITY_COLORS[hero.rarity]}>
                                  {hero.class}
                                </span>
                                {hero.isAlsoProfessionQuester && (
                                  <Badge variant="outline" className="ml-1 text-xs">Prof</Badge>
                                )}
                              </TableCell>
                              <TableCell>{hero.level}</TableCell>
                              <TableCell>
                                <Badge variant="secondary">{hero.bestTrainingStat}</Badge>
                              </TableCell>
                              <TableCell className="font-bold">{hero.trainingStatValue}</TableCell>
                              <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate">
                                {hero.trainableStats || '-'}
                              </TableCell>
                              <TableCell className="text-green-500">{hero.successRate}</TableCell>
                              <TableCell className="font-bold text-blue-500">{hero.xpPerStamina}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    {data.trainingQuesters.length > 100 && (
                      <p className="text-sm text-muted-foreground mt-2">
                        Showing top 100 of {data.trainingQuesters.length} heroes
                      </p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}

        {!data && !isLoading && !error && (
          <Card>
            <CardContent className="pt-6 text-center text-muted-foreground">
              <Dumbbell className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Enter a wallet address above to analyze heroes for optimal quest assignments</p>
            </CardContent>
          </Card>
        )}
    </div>
  );
}
