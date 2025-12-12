import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Trophy, 
  Crown, 
  Sparkles, 
  Lock, 
  Unlock, 
  Star,
  Swords,
  Coins,
  Pickaxe,
  Users,
  Calendar,
  TrendingUp,
  Award
} from "lucide-react";

interface ChallengeTier {
  id: number;
  challengeKey: string;
  tierCode: string;
  displayName: string;
  thresholdValue: number;
  isPrestige: boolean;
  sortOrder: number;
}

interface Challenge {
  id: number;
  key: string;
  name: string;
  description: string;
  descriptionLong?: string;
  categoryKey: string;
  challengeType: string;
  tiers: ChallengeTier[];
}

interface ChallengeCategory {
  key: string;
  name: string;
  description: string;
  challenges: Challenge[];
}

interface ChallengesResponse {
  categories: ChallengeCategory[];
  totalChallenges: number;
}

interface ChallengeProgress {
  challengeKey: string;
  currentValue: number;
  highestTierAchieved?: string;
  achievedAt?: string;
  foundersMarkAchieved?: boolean;
  foundersMarkAt?: string;
}

interface ProgressResponse {
  userId: string;
  progress: Record<string, ChallengeProgress>;
}

interface Feat {
  key: string;
  name: string;
  description: string;
  descriptionLong?: string;
  categoryKey: string;
  tiers: ChallengeTier[];
  isUnlocked: boolean;
  unlockedAt?: string;
  currentValue: number;
}

interface FeatsResponse {
  feats: Feat[];
  totalFeats: number;
  unlockedCount: number;
}

const categoryIcons: Record<string, typeof Trophy> = {
  hero_progression: Swords,
  economy_strategy: Coins,
  profession_specialization: Pickaxe,
  ownership_collection: Crown,
  behavior_engagement: Users,
  seasonal_events: Calendar,
  prestige_overall: Star,
  summoning_prestige: Sparkles,
  overall: TrendingUp,
};

const tierColors: Record<string, string> = {
  BASIC: "text-stone-400",
  ADVANCED: "text-blue-400",
  ELITE: "text-purple-400",
  EXALTED: "text-amber-400",
  LEGENDARY: "text-orange-500",
};

const tierBadgeColors: Record<string, string> = {
  BASIC: "bg-stone-500/20 text-stone-300 border-stone-500/30",
  ADVANCED: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  ELITE: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  EXALTED: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  LEGENDARY: "bg-orange-500/20 text-orange-300 border-orange-500/30",
};

function ChallengeCard({ 
  challenge, 
  progress 
}: { 
  challenge: Challenge; 
  progress?: ChallengeProgress;
}) {
  const currentValue = progress?.currentValue || 0;
  const hasFoundersMark = progress?.foundersMarkAchieved;
  
  const sortedTiers = [...challenge.tiers].sort((a, b) => a.sortOrder - b.sortOrder);
  const topTier = sortedTiers.find(t => t.isPrestige) || sortedTiers[sortedTiers.length - 1];
  const currentTier = progress?.highestTierAchieved;
  
  const nextTier = sortedTiers.find(t => t.thresholdValue > currentValue);
  const progressToNext = nextTier 
    ? Math.min(100, (currentValue / nextTier.thresholdValue) * 100)
    : 100;

  return (
    <Card 
      className={`hover-elevate transition-all ${hasFoundersMark ? 'ring-2 ring-amber-500/50 shadow-amber-500/20 shadow-lg' : ''}`}
      data-testid={`challenge-card-${challenge.key}`}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">{challenge.name}</CardTitle>
              {hasFoundersMark && (
                <Crown 
                  className="w-4 h-4 text-amber-500" 
                  data-testid={`founders-mark-${challenge.key}`}
                />
              )}
            </div>
            <CardDescription className="text-xs mt-1">
              {challenge.description}
            </CardDescription>
          </div>
          {currentTier && (
            <Badge 
              variant="outline" 
              className={`text-xs ${tierBadgeColors[currentTier] || ''}`}
              data-testid={`tier-badge-${challenge.key}`}
            >
              {currentTier}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-medium" data-testid={`progress-value-${challenge.key}`}>
              {currentValue.toLocaleString()}
              {nextTier && (
                <span className="text-muted-foreground">
                  {' '}/ {nextTier.thresholdValue.toLocaleString()}
                </span>
              )}
            </span>
          </div>
          <Progress value={progressToNext} className="h-2" />
          
          <div className="flex flex-wrap gap-1 pt-1">
            {sortedTiers.map((tier) => {
              const achieved = currentTier && sortedTiers.findIndex(t => t.tierCode === currentTier) >= sortedTiers.findIndex(t => t.tierCode === tier.tierCode);
              return (
                <Badge 
                  key={tier.tierCode}
                  variant="outline" 
                  className={`text-xs ${achieved ? tierBadgeColors[tier.tierCode] || '' : 'opacity-40'}`}
                  data-testid={`tier-indicator-${challenge.key}-${tier.tierCode}`}
                >
                  {tier.isPrestige && <Crown className="w-3 h-3 mr-1" />}
                  {tier.displayName || tier.tierCode}
                </Badge>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FeatCard({ feat }: { feat: Feat }) {
  return (
    <Card 
      className={`hover-elevate transition-all ${feat.isUnlocked ? 'ring-1 ring-amber-500/30' : 'opacity-60'}`}
      data-testid={`feat-card-${feat.key}`}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            {feat.isUnlocked ? (
              <Unlock className="w-5 h-5 text-amber-500" />
            ) : (
              <Lock className="w-5 h-5 text-muted-foreground" />
            )}
            <div>
              <CardTitle className="text-base">{feat.name}</CardTitle>
              <CardDescription className="text-xs mt-1">
                {feat.description}
              </CardDescription>
            </div>
          </div>
          <Badge 
            variant={feat.isUnlocked ? "default" : "outline"}
            className={feat.isUnlocked ? "bg-amber-500/20 text-amber-300 border-amber-500/30" : ""}
            data-testid={`feat-status-${feat.key}`}
          >
            {feat.isUnlocked ? "Unlocked" : "Locked"}
          </Badge>
        </div>
      </CardHeader>
      {feat.isUnlocked && feat.unlockedAt && (
        <CardContent className="pt-0">
          <p className="text-xs text-muted-foreground">
            Achieved: {new Date(feat.unlockedAt).toLocaleDateString()}
          </p>
        </CardContent>
      )}
    </Card>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-48 mt-2" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-2 w-full" />
              <div className="flex gap-1 mt-3">
                <Skeleton className="h-5 w-16" />
                <Skeleton className="h-5 w-16" />
                <Skeleton className="h-5 w-16" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function ChallengesPage() {
  const [activeTab, setActiveTab] = useState("challenges");
  
  const { data: challengesData, isLoading: loadingChallenges } = useQuery<ChallengesResponse>({
    queryKey: ['/api/challenges', { type: 'challenges' }],
    queryFn: async () => {
      const res = await fetch('/api/challenges?type=challenges');
      if (!res.ok) throw new Error('Failed to fetch challenges');
      return res.json();
    },
  });

  const { data: featsData, isLoading: loadingFeats } = useQuery<FeatsResponse>({
    queryKey: ['/api/feats'],
    queryFn: async () => {
      const res = await fetch('/api/feats');
      if (!res.ok) throw new Error('Failed to fetch feats');
      return res.json();
    },
  });

  const { data: progressData } = useQuery<ProgressResponse>({
    queryKey: ['/api/challenges/progress/demo'],
    queryFn: async () => {
      const res = await fetch('/api/challenges/progress/demo');
      if (!res.ok) throw new Error('Failed to fetch progress');
      return res.json();
    },
    retry: false,
  });

  const isLoading = loadingChallenges || loadingFeats;

  return (
    <div className="p-6 space-y-6 bg-background min-h-screen" data-testid="challenges-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="page-title">
            <Trophy className="w-6 h-6 text-primary" />
            Challenges & Feats
          </h1>
          <p className="text-muted-foreground">
            Track your progress and unlock achievements
          </p>
        </div>
        <div className="flex items-center gap-4">
          {challengesData && (
            <div className="text-right">
              <div className="text-2xl font-bold" data-testid="challenges-count">
                {challengesData.totalChallenges}
              </div>
              <div className="text-xs text-muted-foreground">Challenges</div>
            </div>
          )}
          {featsData && (
            <div className="text-right">
              <div className="text-2xl font-bold" data-testid="feats-count">
                {featsData.unlockedCount}/{featsData.totalFeats}
              </div>
              <div className="text-xs text-muted-foreground">Feats Unlocked</div>
            </div>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="challenges" data-testid="tab-challenges">
            <TrendingUp className="w-4 h-4 mr-2" />
            Challenges
          </TabsTrigger>
          <TabsTrigger value="feats" data-testid="tab-feats">
            <Award className="w-4 h-4 mr-2" />
            Feats
          </TabsTrigger>
        </TabsList>

        <TabsContent value="challenges" className="space-y-6">
          {loadingChallenges ? (
            <LoadingSkeleton />
          ) : (
            challengesData?.categories.map((category) => {
              const IconComponent = categoryIcons[category.key] || Trophy;
              return (
                <div key={category.key} className="space-y-4" data-testid={`category-${category.key}`}>
                  <div className="flex items-center gap-2">
                    <IconComponent className="w-5 h-5 text-primary" />
                    <h2 className="text-lg font-semibold">{category.name}</h2>
                    <Badge variant="secondary" className="text-xs">
                      {category.challenges.length}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{category.description}</p>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {category.challenges.map((challenge) => (
                      <ChallengeCard 
                        key={challenge.key}
                        challenge={challenge}
                        progress={progressData?.progress[challenge.key]}
                      />
                    ))}
                  </div>
                </div>
              );
            })
          )}
          
          {!loadingChallenges && (!challengesData?.categories || challengesData.categories.length === 0) && (
            <Card className="text-center py-12">
              <CardContent>
                <Trophy className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">No Challenges Yet</h3>
                <p className="text-muted-foreground">
                  Challenges will appear here once they're deployed.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="feats" className="space-y-6">
          {loadingFeats ? (
            <LoadingSkeleton />
          ) : (
            <>
              <div className="flex items-center gap-2 mb-4">
                <Award className="w-5 h-5 text-amber-500" />
                <h2 className="text-lg font-semibold">Lifetime Feats</h2>
                <Badge variant="secondary" className="text-xs">
                  {featsData?.unlockedCount || 0}/{featsData?.totalFeats || 0} Unlocked
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Feats are permanent achievements that mark major accomplishments in your journey.
              </p>
              
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {featsData?.feats.map((feat) => (
                  <FeatCard key={feat.key} feat={feat} />
                ))}
              </div>

              {(!featsData?.feats || featsData.feats.length === 0) && (
                <Card className="text-center py-12">
                  <CardContent>
                    <Award className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium">No Feats Available</h3>
                    <p className="text-muted-foreground">
                      Feats will appear here once they're deployed.
                    </p>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>

      <Card className="bg-muted/30">
        <CardContent className="py-4">
          <div className="flex items-center gap-2 text-sm">
            <Crown className="w-4 h-4 text-amber-500" />
            <span className="font-medium">Founder's Mark:</span>
            <span className="text-muted-foreground">
              Challenges with a golden border indicate you've achieved the top tier at some point.
              This is a permanent badge of honor, even if your current progress is lower.
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
