import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Loader2, 
  Search, 
  Calculator, 
  Sparkles,
  Dna,
  Swords,
  Eye
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface HeroData {
  id: string;
  normalizedId: number;
  mainClass: string;
  subClass: string;
  profession: string;
  rarity: number;
  rarityName: string;
  level: number;
  generation: number;
  summons: number;
  maxSummons: number;
  summonsRemaining: number;
  strength: number;
  agility: number;
  intelligence: number;
  wisdom: number;
  luck: number;
  dexterity: number;
  vitality: number;
  endurance: number;
  hp: number;
  mp: number;
  owner: string;
}

interface GeneSlot {
  dominant: string;
  R1: string;
  R2: string;
  R3: string;
}

interface Genetics {
  id: string;
  normalizedId: number;
  mainClass: GeneSlot;
  subClass: GeneSlot;
  profession: GeneSlot;
  passive1: GeneSlot;
  passive2: GeneSlot;
  active1: GeneSlot;
  active2: GeneSlot;
  statBoost1: GeneSlot;
  statBoost2: GeneSlot;
  element: GeneSlot;
  visual?: {
    gender: GeneSlot;
    headAppendage: GeneSlot;
    backAppendage: GeneSlot;
    background: GeneSlot;
    hairStyle: GeneSlot;
    hairColor: GeneSlot;
    eyeColor: GeneSlot;
    skinColor: GeneSlot;
    appendageColor: GeneSlot;
    backAppendageColor: GeneSlot;
  };
}

interface ProbabilityMap {
  [key: string]: number;
}

interface MutationSet {
  [key: string]: Set<string> | string[];
}

interface SummoningResult {
  ok: boolean;
  parent1: HeroData;
  parent2: HeroData;
  genetics1: Genetics;
  genetics2: Genetics;
  probabilities: {
    class: ProbabilityMap;
    subClass: ProbabilityMap;
    profession: ProbabilityMap;
    passive1: ProbabilityMap;
    passive2: ProbabilityMap;
    active1: ProbabilityMap;
    active2: ProbabilityMap;
    statBoost1: ProbabilityMap;
    statBoost2: ProbabilityMap;
    element: ProbabilityMap;
    rarity: ProbabilityMap;
    gender: ProbabilityMap;
    headAppendage: ProbabilityMap;
    backAppendage: ProbabilityMap;
    background: ProbabilityMap;
    hairStyle: ProbabilityMap;
    hairColor: ProbabilityMap;
    mutations: MutationSet;
  };
  offspringGeneration: number;
}

const RARITY_COLORS: Record<number, string> = {
  0: "bg-gray-500",
  1: "bg-green-500",
  2: "bg-blue-500",
  3: "bg-purple-500",
  4: "bg-orange-500"
};

const RARITY_NAMES = ["Common", "Uncommon", "Rare", "Legendary", "Mythic"];

function ProbabilityTable({ 
  title, 
  probabilities, 
  mutations 
}: { 
  title: string; 
  probabilities: ProbabilityMap; 
  mutations?: Set<string> | string[];
}) {
  const mutationSet = mutations instanceof Set ? mutations : new Set(mutations || []);
  const sortedEntries = Object.entries(probabilities)
    .sort((a, b) => b[1] - a[1])
    .filter(([_, prob]) => prob > 0);

  if (sortedEntries.length === 0) return null;

  return (
    <div className="space-y-1">
      <h4 className="font-semibold text-sm">{title}</h4>
      <div className="space-y-0.5">
        {sortedEntries.map(([trait, prob]) => {
          const isMutation = mutationSet.has(trait);
          return (
            <div 
              key={trait} 
              className={`flex justify-between text-xs py-0.5 px-1 rounded ${
                isMutation ? "bg-orange-500/20 text-orange-300" : ""
              }`}
              title={isMutation ? "Mutation (not in parent dominant genes)" : undefined}
            >
              <span className={isMutation ? "font-medium" : ""}>{trait}</span>
              <span className="font-mono">{prob.toFixed(2)}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GeneticsTable({ genetics, title }: { genetics: Genetics; title: string }) {
  const statTraits = [
    { name: "Class", value: genetics.mainClass },
    { name: "SubClass", value: genetics.subClass },
    { name: "Profession", value: genetics.profession },
    { name: "Stat Boost 1", value: genetics.statBoost1 },
    { name: "Stat Boost 2", value: genetics.statBoost2 },
    { name: "Active 1", value: genetics.active1 },
    { name: "Active 2", value: genetics.active2 },
    { name: "Passive 1", value: genetics.passive1 },
    { name: "Passive 2", value: genetics.passive2 },
    { name: "Element", value: genetics.element },
  ];

  return (
    <div className="space-y-2">
      <h4 className="font-semibold text-sm">{title}</h4>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b">
              <th className="text-left py-1 px-1">Trait</th>
              <th className="text-left py-1 px-1">Dominant</th>
              <th className="text-left py-1 px-1">R1</th>
              <th className="text-left py-1 px-1">R2</th>
              <th className="text-left py-1 px-1">R3</th>
            </tr>
          </thead>
          <tbody>
            {statTraits.map(({ name, value }) => (
              <tr key={name} className="border-b border-border/50">
                <td className="py-1 px-1 font-medium">{name}</td>
                <td className="py-1 px-1">{value?.dominant || "-"}</td>
                <td className="py-1 px-1 text-muted-foreground">{value?.R1 || "-"}</td>
                <td className="py-1 px-1 text-muted-foreground">{value?.R2 || "-"}</td>
                <td className="py-1 px-1 text-muted-foreground">{value?.R3 || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HeroCard({ hero, genetics }: { hero: HeroData; genetics?: Genetics }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-lg">Hero #{hero.normalizedId}</CardTitle>
          <Badge className={RARITY_COLORS[hero.rarity]}>
            {hero.rarityName}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div><span className="text-muted-foreground">Class:</span> {hero.mainClass}</div>
          <div><span className="text-muted-foreground">SubClass:</span> {hero.subClass}</div>
          <div><span className="text-muted-foreground">Profession:</span> {hero.profession}</div>
          <div><span className="text-muted-foreground">Level:</span> {hero.level}</div>
          <div><span className="text-muted-foreground">Gen:</span> {hero.generation}</div>
          <div><span className="text-muted-foreground">Summons:</span> {hero.summonsRemaining}/{hero.maxSummons}</div>
        </div>

        <Separator />

        <div className="grid grid-cols-4 gap-2 text-xs">
          <div><span className="text-muted-foreground">STR:</span> {hero.strength}</div>
          <div><span className="text-muted-foreground">AGI:</span> {hero.agility}</div>
          <div><span className="text-muted-foreground">INT:</span> {hero.intelligence}</div>
          <div><span className="text-muted-foreground">WIS:</span> {hero.wisdom}</div>
          <div><span className="text-muted-foreground">LCK:</span> {hero.luck}</div>
          <div><span className="text-muted-foreground">DEX:</span> {hero.dexterity}</div>
          <div><span className="text-muted-foreground">VIT:</span> {hero.vitality}</div>
          <div><span className="text-muted-foreground">END:</span> {hero.endurance}</div>
        </div>

        {genetics && (
          <>
            <Separator />
            <GeneticsTable genetics={genetics} title="Stat Genetics" />
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function SummoningCalculator() {
  const [hero1Id, setHero1Id] = useState("");
  const [hero2Id, setHero2Id] = useState("");
  const [result, setResult] = useState<SummoningResult | null>(null);

  const calculateMutation = useMutation({
    mutationFn: async ({ hero1Id, hero2Id }: { hero1Id: string; hero2Id: string }) => {
      const response = await apiRequest("POST", "/api/admin/summoning/calculate", {
        hero1Id,
        hero2Id
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.ok) {
        setResult(data);
      }
    }
  });

  const handleCalculate = () => {
    if (!hero1Id || !hero2Id) return;
    calculateMutation.mutate({ hero1Id, hero2Id });
  };

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex items-center gap-3">
        <Calculator className="h-8 w-8" />
        <div>
          <h1 className="text-2xl font-bold">Summoning Calculator</h1>
          <p className="text-muted-foreground">
            Calculate offspring trait probabilities from two parent heroes
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Enter Parent Heroes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="flex-1 space-y-2">
              <Label htmlFor="hero1">Hero 1 ID</Label>
              <Input
                id="hero1"
                placeholder="e.g. 62"
                value={hero1Id}
                onChange={(e) => setHero1Id(e.target.value)}
                data-testid="input-hero1-id"
              />
            </div>
            <div className="flex-1 space-y-2">
              <Label htmlFor="hero2">Hero 2 ID</Label>
              <Input
                id="hero2"
                placeholder="e.g. 569"
                value={hero2Id}
                onChange={(e) => setHero2Id(e.target.value)}
                data-testid="input-hero2-id"
              />
            </div>
            <Button 
              onClick={handleCalculate}
              disabled={!hero1Id || !hero2Id || calculateMutation.isPending}
              data-testid="button-calculate"
            >
              {calculateMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 mr-2" />
              )}
              Calculate
            </Button>
          </div>
          {calculateMutation.isError && (
            <p className="text-destructive text-sm mt-2">
              Error: {(calculateMutation.error as Error)?.message || "Failed to calculate"}
            </p>
          )}
        </CardContent>
      </Card>

      {result && (
        <>
          <div className="grid md:grid-cols-2 gap-4">
            <HeroCard hero={result.parent1} genetics={result.genetics1} />
            <HeroCard hero={result.parent2} genetics={result.genetics2} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Dna className="h-5 w-5" />
                Summoning Chances
                <Badge variant="outline" className="ml-2">
                  Offspring Gen {result.offspringGeneration}
                </Badge>
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                <span className="text-orange-400">Orange</span> = Mutation (trait not in either parent's dominant gene)
              </p>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="stats">
                <TabsList className="mb-4">
                  <TabsTrigger value="stats" data-testid="tab-stats">
                    <Swords className="h-4 w-4 mr-1" />
                    Stat Genes
                  </TabsTrigger>
                  <TabsTrigger value="visual" data-testid="tab-visual">
                    <Eye className="h-4 w-4 mr-1" />
                    Visual Genes
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="stats">
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                    <ProbabilityTable 
                      title="Class" 
                      probabilities={result.probabilities.class}
                      mutations={result.probabilities.mutations?.class}
                    />
                    <ProbabilityTable 
                      title="Sub Class" 
                      probabilities={result.probabilities.subClass}
                      mutations={result.probabilities.mutations?.subClass}
                    />
                    <ProbabilityTable 
                      title="Profession" 
                      probabilities={result.probabilities.profession}
                      mutations={result.probabilities.mutations?.profession}
                    />
                    <ProbabilityTable 
                      title="Rarity" 
                      probabilities={result.probabilities.rarity}
                    />
                    <ProbabilityTable 
                      title="Stat Boost 1" 
                      probabilities={result.probabilities.statBoost1}
                      mutations={result.probabilities.mutations?.statBoost1}
                    />
                    <ProbabilityTable 
                      title="Stat Boost 2" 
                      probabilities={result.probabilities.statBoost2}
                      mutations={result.probabilities.mutations?.statBoost2}
                    />
                  </div>

                  <Separator className="my-4" />

                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                    <ProbabilityTable 
                      title="Active 1" 
                      probabilities={result.probabilities.active1}
                      mutations={result.probabilities.mutations?.active1}
                    />
                    <ProbabilityTable 
                      title="Active 2" 
                      probabilities={result.probabilities.active2}
                      mutations={result.probabilities.mutations?.active2}
                    />
                    <ProbabilityTable 
                      title="Passive 1" 
                      probabilities={result.probabilities.passive1}
                      mutations={result.probabilities.mutations?.passive1}
                    />
                    <ProbabilityTable 
                      title="Passive 2" 
                      probabilities={result.probabilities.passive2}
                      mutations={result.probabilities.mutations?.passive2}
                    />
                    <ProbabilityTable 
                      title="Element" 
                      probabilities={result.probabilities.element}
                      mutations={result.probabilities.mutations?.element}
                    />
                  </div>
                </TabsContent>

                <TabsContent value="visual">
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                    <ProbabilityTable 
                      title="Gender" 
                      probabilities={result.probabilities.gender}
                      mutations={result.probabilities.mutations?.gender}
                    />
                    <ProbabilityTable 
                      title="Background" 
                      probabilities={result.probabilities.background}
                      mutations={result.probabilities.mutations?.background}
                    />
                    <ProbabilityTable 
                      title="Hair Style" 
                      probabilities={result.probabilities.hairStyle}
                      mutations={result.probabilities.mutations?.hairStyle}
                    />
                    <ProbabilityTable 
                      title="Hair Color" 
                      probabilities={result.probabilities.hairColor}
                      mutations={result.probabilities.mutations?.hairColor}
                    />
                    <ProbabilityTable 
                      title="Head Appendage" 
                      probabilities={result.probabilities.headAppendage}
                      mutations={result.probabilities.mutations?.headAppendage}
                    />
                    <ProbabilityTable 
                      title="Back Appendage" 
                      probabilities={result.probabilities.backAppendage}
                      mutations={result.probabilities.mutations?.backAppendage}
                    />
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
