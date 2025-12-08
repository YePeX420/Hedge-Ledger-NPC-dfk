import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
} from "lucide-react";

interface ChallengeTier {
  tierCode: string;
  displayName: string;
  thresholdValue: number;
  sortOrder: number;
}

interface Challenge {
  key: string;
  name: string;
  description: string;
  metricType: string;
  metricSource: string;
  metricKey: string;
  isActive: boolean;
  sortOrder: number;
  tiers: ChallengeTier[];
}

interface ChallengeCategory {
  key: string;
  name: string;
  description: string;
  tierSystem: string;
  sortOrder: number;
  challenges: Challenge[];
}

interface ChallengesResponse {
  categories: ChallengeCategory[];
  totalChallenges: number;
  totalTiers: number;
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
};

const tierColors: Record<string, string> = {
  COMMON: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  UNCOMMON: "bg-green-500/20 text-green-400 border-green-500/30",
  RARE: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  LEGENDARY: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  MYTHIC: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  BASIC: "bg-slate-500/20 text-slate-400 border-slate-500/30",
  ADVANCED: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  ELITE: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  EXALTED: "bg-rose-500/20 text-rose-400 border-rose-500/30",
};

const tierSystemLabels: Record<string, string> = {
  RARITY: "Volume-based",
  GENE: "Skill-based",
  MIXED: "Hybrid",
  PRESTIGE: "Ultra-rare",
};

function TierBadge({ tierCode }: { tierCode: string }) {
  const colorClass = tierColors[tierCode] || "bg-muted text-muted-foreground";
  return (
    <Badge
      variant="outline"
      className={`text-xs ${colorClass}`}
      data-testid={`badge-tier-${tierCode.toLowerCase()}`}
    >
      {tierCode}
    </Badge>
  );
}

function ChallengeCard({ challenge }: { challenge: Challenge }) {
  const sortedTiers = [...challenge.tiers].sort(
    (a, b) => a.sortOrder - b.sortOrder
  );

  return (
    <Card className="hover-elevate" data-testid={`card-challenge-${challenge.key}`}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-sm font-medium">
              {challenge.name}
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              {challenge.description}
            </CardDescription>
          </div>
          {!challenge.isActive && (
            <Badge variant="secondary" className="text-xs shrink-0">
              Inactive
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Metric: {challenge.metricType}</span>
            <span className="text-muted-foreground/50">|</span>
            <span>{challenge.metricSource}.{challenge.metricKey}</span>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground mb-2">Tier Thresholds:</p>
            <div className="flex flex-wrap gap-2">
              {sortedTiers.map((tier) => (
                <div
                  key={tier.tierCode}
                  className="flex items-center gap-1"
                  data-testid={`tier-threshold-${tier.tierCode.toLowerCase()}`}
                >
                  <TierBadge tierCode={tier.tierCode} />
                  <span className="text-xs text-muted-foreground">
                    {tier.thresholdValue.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CategorySection({ category }: { category: ChallengeCategory }) {
  const Icon = categoryIcons[category.key] || Trophy;
  const sortedChallenges = [...category.challenges].sort(
    (a, b) => a.sortOrder - b.sortOrder
  );

  return (
    <AccordionItem value={category.key} data-testid={`accordion-category-${category.key}`}>
      <AccordionTrigger className="hover:no-underline">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
            <Icon className="w-4 h-4 text-primary" />
          </div>
          <div className="text-left">
            <div className="font-medium">{category.name}</div>
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <span>{category.description}</span>
              <Badge variant="outline" className="text-xs">
                {tierSystemLabels[category.tierSystem] || category.tierSystem}
              </Badge>
              <span className="text-muted-foreground/50">|</span>
              <span>{category.challenges.length} challenges</span>
            </div>
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent>
        <div className="grid gap-3 pt-2 md:grid-cols-2 lg:grid-cols-3">
          {sortedChallenges.map((challenge) => (
            <ChallengeCard key={challenge.key} challenge={challenge} />
          ))}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <Card key={i}>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-72 mt-2" />
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((j) => (
                <Skeleton key={j} className="h-32" />
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function AdminChallenges() {
  const { data, isLoading, error } = useQuery<ChallengesResponse>({
    queryKey: ["/api/challenges"],
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">
            Challenges
          </h1>
          <p className="text-muted-foreground">
            Loading challenge catalog...
          </p>
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

  const categories = data?.categories || [];
  const sortedCategories = [...categories].sort(
    (a, b) => a.sortOrder - b.sortOrder
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">
            Challenges
          </h1>
          <p className="text-muted-foreground">
            Gamified progression system with {data?.totalChallenges || 0} challenges
            across {categories.length} categories
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-2xl font-bold text-primary" data-testid="text-total-challenges">
              {data?.totalChallenges || 0}
            </div>
            <div className="text-xs text-muted-foreground">Total Challenges</div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-primary" data-testid="text-total-tiers">
              {data?.totalTiers || 0}
            </div>
            <div className="text-xs text-muted-foreground">Achievement Tiers</div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card data-testid="card-rarity-system">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Trophy className="w-4 h-4 text-primary" />
              RARITY System
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1">
              {["COMMON", "UNCOMMON", "RARE", "LEGENDARY", "MYTHIC"].map((tier) => (
                <TierBadge key={tier} tierCode={tier} />
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">Volume-based progression</p>
          </CardContent>
        </Card>

        <Card data-testid="card-gene-system">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              GENE System
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1">
              {["BASIC", "ADVANCED", "ELITE", "EXALTED"].map((tier) => (
                <TierBadge key={tier} tierCode={tier} />
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">Skill-based progression</p>
          </CardContent>
        </Card>

        <Card className="md:col-span-2" data-testid="card-categories-overview">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Categories Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              {sortedCategories.map((cat) => {
                const Icon = categoryIcons[cat.key] || Trophy;
                return (
                  <div key={cat.key} className="flex items-center gap-2 text-xs">
                    <Icon className="w-3 h-3 text-muted-foreground" />
                    <span className="truncate">{cat.name}</span>
                    <Badge variant="secondary" className="text-xs ml-auto">
                      {cat.challenges.length}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      <Accordion
        type="multiple"
        defaultValue={sortedCategories.map((c) => c.key)}
        className="space-y-4"
      >
        {sortedCategories.map((category) => (
          <CategorySection key={category.key} category={category} />
        ))}
      </Accordion>
    </div>
  );
}
