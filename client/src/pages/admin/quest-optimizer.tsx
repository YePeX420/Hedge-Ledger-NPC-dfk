import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Search, Pickaxe, Sprout, Fish, Trees, Dumbbell, Zap, TrendingUp, Target } from 'lucide-react';

interface TrainingOption {
  stat: string;
  value: number;
  quest: string;
  successRate: string;
  xpPerStamina: string;
  allTrainable: string;
}

interface OptimizedHero {
  id: string;
  class: string;
  subClass: string;
  profession: string;
  level: number;
  rarity: number;
  generation: number;
  bestQuestType: 'training' | 'profession';
  bestQuest: string;
  xpPerStamina: string;
  professionQuest: string;
  professionScore: number;
  professionXpPerStamina: string;
  hasProfessionGene: boolean;
  professionStaminaCost: number;
  trainingOption: TrainingOption | null;
  canTrain: boolean;
  stats: Record<string, number>;
}

interface QuestOptimizerResponse {
  wallet: string;
  totalHeroes: number;
  optimizedHeroes: OptimizedHero[];
  summary: {
    byProfession: Record<string, number>;
    byClass: Record<string, number>;
    byBestQuest: Record<string, number>;
  };
}

const RARITY_COLORS = ['text-muted-foreground', 'text-green-500', 'text-blue-500', 'text-orange-500', 'text-purple-500'];

const QUEST_ICONS: Record<string, typeof Pickaxe> = {
  Mining: Pickaxe,
  Gardening: Sprout,
  Fishing: Fish,
  Foraging: Trees,
  'Arm Wrestling': Dumbbell,
  'Darts': Target,
  'Game of Ball': Dumbbell,
  'Dancing': Dumbbell,
  'Helping the Farm': Sprout,
  'Alchemist Assistance': Zap,
  'Puzzle Solving': Zap,
  'Card Game': Target
};

export default function QuestOptimizer() {
  const [walletInput, setWalletInput] = useState('');
  const [searchWallet, setSearchWallet] = useState('');
  const [questFilter, setQuestFilter] = useState<string>('all');

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

  const filteredHeroes = useMemo(() => {
    if (!data?.optimizedHeroes) return [];
    if (questFilter === 'all') return data.optimizedHeroes;
    if (questFilter === 'training') return data.optimizedHeroes.filter(h => h.bestQuestType === 'training');
    if (questFilter === 'profession') return data.optimizedHeroes.filter(h => h.bestQuestType === 'profession');
    return data.optimizedHeroes.filter(h => h.bestQuest.toLowerCase() === questFilter.toLowerCase());
  }, [data?.optimizedHeroes, questFilter]);

  const trainingCount = data?.optimizedHeroes.filter(h => h.bestQuestType === 'training').length || 0;
  const professionCount = data?.optimizedHeroes.filter(h => h.bestQuestType === 'profession').length || 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">Quest Optimizer</h1>
        <p className="text-muted-foreground">
          Single unified list showing the BEST quest for each hero based on XP efficiency
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Wallet Analysis
          </CardTitle>
          <CardDescription>
            Enter a wallet address to find optimal quest assignments for all heroes
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
                <div className="text-2xl font-bold text-blue-500" data-testid="text-training-recommended">
                  {trainingCount}
                </div>
                <div className="text-sm text-muted-foreground">Training Recommended</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-green-500" data-testid="text-profession-recommended">
                  {professionCount}
                </div>
                <div className="text-sm text-muted-foreground">Profession Recommended</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-orange-500">
                  {Object.keys(data.summary.byBestQuest).length}
                </div>
                <div className="text-sm text-muted-foreground">Quest Types Used</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Quest Distribution</CardTitle>
              <CardDescription>Click a badge to filter the list below</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {Object.entries(data.summary.byBestQuest)
                  .sort((a, b) => b[1] - a[1])
                  .map(([quest, count]) => {
                    const Icon = QUEST_ICONS[quest] || Dumbbell;
                    const isTraining = ['Arm Wrestling', 'Darts', 'Game of Ball', 'Dancing', 'Helping the Farm', 'Alchemist Assistance', 'Puzzle Solving', 'Card Game'].includes(quest);
                    return (
                      <Badge 
                        key={quest} 
                        variant={questFilter === quest.toLowerCase() ? 'default' : 'secondary'}
                        className={`text-sm cursor-pointer ${isTraining ? 'border-blue-500' : 'border-green-500'}`}
                        onClick={() => setQuestFilter(questFilter === quest.toLowerCase() ? 'all' : quest.toLowerCase())}
                      >
                        <Icon className="h-3 w-3 mr-1" />
                        {quest}: {count}
                      </Badge>
                    );
                  })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-green-500" />
                  Optimal Quest Assignments
                </CardTitle>
                <CardDescription>
                  Each hero's best quest for maximum XP/stamina. Training quests only for stats 40-50.
                </CardDescription>
              </div>
              <Select value={questFilter} onValueChange={setQuestFilter}>
                <SelectTrigger className="w-[180px]" data-testid="select-quest-filter">
                  <SelectValue placeholder="Filter by quest" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Quests</SelectItem>
                  <SelectItem value="training">Training Only</SelectItem>
                  <SelectItem value="profession">Profession Only</SelectItem>
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-auto max-h-[600px]">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead>Hero ID</TableHead>
                      <TableHead>Class</TableHead>
                      <TableHead>Level</TableHead>
                      <TableHead>Best Quest</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>XP/Stamina</TableHead>
                      <TableHead>Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredHeroes.slice(0, 200).map((hero) => {
                      const Icon = QUEST_ICONS[hero.bestQuest] || Dumbbell;
                      const isTraining = hero.bestQuestType === 'training';
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
                              {hero.bestQuest}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge 
                              variant={isTraining ? 'default' : 'secondary'}
                              className={isTraining ? 'bg-blue-500' : 'bg-green-500'}
                            >
                              {isTraining ? 'Training' : 'Profession'}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-bold text-lg">{hero.xpPerStamina}</TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[200px]">
                            {isTraining && hero.trainingOption ? (
                              <span>
                                {hero.trainingOption.stat}:{hero.trainingOption.value} ({hero.trainingOption.successRate})
                                {hero.trainingOption.allTrainable && hero.trainingOption.allTrainable !== `${hero.trainingOption.stat}:${hero.trainingOption.value}` && (
                                  <span className="block opacity-70">Also: {hero.trainingOption.allTrainable}</span>
                                )}
                              </span>
                            ) : (
                              <span>
                                {hero.professionQuest} (score:{hero.professionScore})
                                {hero.hasProfessionGene && <Badge variant="outline" className="ml-1 text-xs">Gene</Badge>}
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              {filteredHeroes.length > 200 && (
                <p className="text-sm text-muted-foreground mt-2">
                  Showing top 200 of {filteredHeroes.length} heroes
                </p>
              )}
              {filteredHeroes.length === 0 && (
                <p className="text-center text-muted-foreground py-8">
                  No heroes match the selected filter
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {!data && !isLoading && !error && (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            <Dumbbell className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Enter a wallet address above to find the optimal quest for each hero</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
