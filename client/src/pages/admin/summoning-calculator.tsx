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
  Eye,
  Palette,
  Trees,
  Image,
  Target,
  Filter,
  DollarSign,
  TrendingUp,
  ExternalLink
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

import femaleHairstyleTree from "@assets/image_1767989909914.png";
import maleHairstyleTree from "@assets/image_1767989916670.png";
import headAppendageTree from "@assets/image_1767989924709.png";
import backAppendageTree from "@assets/image_1767989933201.png";
import appendageColorTree from "@assets/image_1767989940273.png";
import hairColorTree from "@assets/image_1767989948128.png";

// Visual trait tier mappings - maps gene ID to tier indicator
const GENE_TIERS: Record<number, string> = {
  0: 'B1', 1: 'B2', 2: 'B3', 3: 'B4', 4: 'B5', 5: 'B6', 6: 'B7', 7: 'B8',
  8: 'B9', 9: 'B10', 10: 'B11', 11: 'B12', 12: 'B13', 13: 'B14', 14: 'B15', 15: 'B16',
  16: 'A1', 17: 'A2', 18: 'A3', 19: 'A4', 20: 'A5', 21: 'A6',
  24: 'E1', 25: 'E2', 26: 'E3',
  28: 'X1'
};

// Hair color hex codes by gene ID
const HAIR_COLOR_HEX: Record<number, string> = {
  0: '#ab9159', 1: '#af3853', 2: '#578761', 3: '#068483',  // Sand, Rose, Emerald, Teal
  4: '#48321e', 5: '#66489e', 6: '#ca93a7', 7: '#62a7e6',  // Brown, Amethyst, Pink, Cornflower
  8: '#c34b1e', 9: '#326988', 10: '#513f4f', 11: '#d48b41', // Auburn, Ocean, Plum, Honey
  12: '#dbfbf5', 13: '#8f9bb3', 14: '#c5bfa7', 15: '#d7bc65', // Mint, Silver, Ivory, Wheat
  16: '#d7bc65', 17: '#9b68ab', 18: '#8d6b3a', 19: '#566377', // Wheat, Lavender, Chestnut, Slate
  20: '#dbfbf5', 21: '#8f9bb3', // Mint, Silver (Advanced tier)
  24: '#275435', 25: '#77b23c', 26: '#880016', // Forest, Lime, Crimson
  28: '#353132' // Obsidian
};

// Eye color hex codes by gene ID
const EYE_COLOR_HEX: Record<number, string> = {
  0: '#203997', 2: '#896693', 4: '#bb3f55', 6: '#0d7634',  // Azure, Mirabella, Izmir, Turmalin
  8: '#8d7136', 10: '#613d8a', 12: '#2494a2', 14: '#a41e12' // Hazel, Violet, Aqua, Crimson
};

// Skin color hex codes by gene ID
const SKIN_COLOR_HEX: Record<number, string> = {
  0: '#c58135', 2: '#f1ca9e', 4: '#985e1c', 6: '#57340c',  // Nomad, Ginger, Salmon, Nutmeg
  8: '#e6a861', 10: '#7b4a11', 12: '#e5ac91', 14: '#aa5c38' // Peach, Copper, Rose, Terra
};

// Appendage color hex codes by gene ID
const APPENDAGE_COLOR_HEX: Record<number, string> = {
  0: '#c5bfa7', 1: '#a88b47', 2: '#58381e', 3: '#566f7d',  // Ivory, Saffron, Cacao, Cadet
  4: '#2a386d', 5: '#3f2e40', 6: '#830e18', 7: '#6f3a3c',  // Indigo, Blackberry, Merlot, Bromberry
  8: '#cddef0', 9: '#df7126', 10: '#835138', 11: '#86a637', // Frost, Jacarta, Umber, Fern
  16: '#6b173c', 17: '#a0304d', 18: '#78547c', 19: '#352a51', // Cerise, Coral, Orchid, Plum
  24: '#147256', 25: '#cf7794', 26: '#c29d35', // Birthstone, Petal, Gold
  28: '#211f1f' // Shadow
};

// Hair style names with gene IDs (male styles - shared between genders in probabilities)
const HAIR_STYLE_NAMES: Record<number, string> = {
  0: 'Battle Hawk', 1: 'Wolf Mane', 2: 'Enchanter', 3: 'Wild Growth',
  4: 'Pixel', 5: 'Sunrise', 6: 'Bouffant', 7: 'Agleam Spike',
  8: 'Wayfinder', 9: 'Faded Topknot', 10: 'Side Shave', 11: 'Ronin',
  16: 'Gruff', 17: 'Rogue Locs', 18: 'Stone Cold', 19: "Zinra's Tail",
  20: 'Hedgehog', 21: 'Delinquent',
  24: 'Skegg', 25: 'Shinobi', 26: 'Sanjo',
  28: 'Perfect Form'
};

// Female hair style names (for pairing display)
const FEMALE_HAIR_STYLE_NAMES: Record<number, string> = {
  0: 'Windswept', 1: 'Fauna', 2: 'Enchantress', 3: 'Pineapple Top',
  4: 'Pixie', 5: 'Darkweave Plait', 6: 'Coif', 7: 'Courtly Updo',
  8: 'Cerulean Tuft', 9: 'Lorelei', 10: 'Casual Ponytail', 11: 'Wild Ponytail',
  16: 'Vogue Locs', 17: 'Twilight Locs', 18: 'Ethereal Wisherah', 19: 'Kunoichi',
  20: 'Sweeping Wisherah', 21: 'Chignon',
  24: 'Regal Locks', 25: 'Moonlight Cascade', 26: 'Mystic Coil',
  28: 'Divine Radiance'
};

// Head appendage names with gene IDs
const HEAD_APPENDAGE_NAMES: Record<number, string> = {
  0: 'None', 1: 'Kitsune Ears', 2: 'Satyr Horns', 3: 'Ram Horns',
  4: 'Imp Horns', 5: 'Cat Ears', 6: 'Minotaur Horns', 7: 'Faun Horns',
  8: 'Draconic Horns', 9: 'Fae Circlet', 10: 'Ragfly Antennae', 11: 'Royal Crown',
  16: 'Jagged Horns', 17: 'Spindle Horns', 18: 'Bear Ears', 19: 'Antennae',
  20: 'Fallen Angel Coronet', 21: 'Power Horn',
  24: 'Wood Elf Ears', 25: 'Snow Elf Ears', 26: 'Cranial Wings',
  28: 'Insight Jewel'
};

// Back appendage names with gene IDs
const BACK_APPENDAGE_NAMES: Record<number, string> = {
  0: 'None', 1: 'Monkey Tail', 2: 'Cat Tail', 3: 'Imp Tail',
  4: 'Minotaur Tail', 5: 'Daishō', 6: 'Kitsune Tail', 7: 'Zweihänder',
  8: 'Skeletal Wings', 9: 'Skeletal Tail', 10: 'Afflicted Spikes', 11: "Traveler's Pack",
  16: 'Gryphon Wings', 17: 'Draconic Wings', 18: 'Butterfly Wings', 19: 'Phoenix Wings',
  20: 'Fallen Angel', 21: 'Crystal Wings',
  24: 'Aura of the Inner Grove', 25: 'Ancient Orbs', 26: 'Arachnid Legs',
  28: 'Cecaelia Tentacles'
};

// Hair color names with gene IDs
const HAIR_COLOR_NAMES: Record<number, string> = {
  0: 'Sand', 1: 'Rose', 2: 'Emerald', 3: 'Teal', 4: 'Brown', 5: 'Amethyst',
  6: 'Pink', 7: 'Cornflower', 8: 'Auburn', 9: 'Ocean', 10: 'Plum', 11: 'Honey',
  16: 'Wheat', 17: 'Lavender', 18: 'Chestnut', 19: 'Slate',
  20: 'Forest', 21: 'Lime',
  24: 'Crimson', 25: 'Obsidian', 26: 'Mint',
  28: 'Silver'
};

// Eye color names with gene IDs
const EYE_COLOR_NAMES: Record<number, string> = {
  0: 'Azure', 2: 'Mirabella', 4: 'Izmir', 6: 'Turmalin',
  8: 'Hazel', 10: 'Violet', 12: 'Aqua', 14: 'Crimson'
};

// Skin color names with gene IDs
const SKIN_COLOR_NAMES: Record<number, string> = {
  0: 'Nomad', 2: 'Ginger', 4: 'Salmon', 6: 'Nutmeg',
  8: 'Peach', 10: 'Copper', 12: 'Rose', 14: 'Terra'
};

// Crafting skill names with gene IDs
const CRAFTING_NAMES: Record<number, string> = {
  0: 'Blacksmithing', 2: 'Goldsmithing', 4: 'Armorsmithing', 6: 'Woodworking',
  8: 'Leatherworking', 10: 'Tailoring', 12: 'Enchanting', 14: 'Alchemy'
};

// Visual unknown just show numeric tier
const VISUAL_UNKNOWN_NAMES: Record<number, string> = {
  0: 'Basic1', 1: 'Basic2', 2: 'Basic3', 3: 'Basic4', 4: 'Basic5', 5: 'Basic6', 6: 'Basic7', 7: 'Basic8',
  16: 'Advanced1', 17: 'Advanced2', 18: 'Advanced3', 19: 'Advanced4',
  24: 'Elite1', 25: 'Elite2',
  28: 'Exalted1'
};

// Background names with gene IDs (even numbers only)
const BACKGROUND_NAMES: Record<number, string> = {
  0: 'Desert', 2: 'Forest', 4: 'Plains', 6: 'Island',
  8: 'Swamp', 10: 'Mountains', 12: 'City', 14: 'Arctic'
};


// Helper to check if a trait is a mutation (Advanced or higher tier)
function isMutationTier(tier: string): boolean {
  return tier.startsWith('A') || tier.startsWith('E') || tier.startsWith('X');
}

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
    eyeColor: ProbabilityMap;
    skinColor: ProbabilityMap;
    appendageColor: ProbabilityMap;
    backAppendageColor: ProbabilityMap;
    visualUnknown1: ProbabilityMap;
    visualUnknown2: ProbabilityMap;
    crafting1: ProbabilityMap;
    crafting2: ProbabilityMap;
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
  mutations?: Set<string> | string[] | null | undefined;
}) {
  let mutationSet: Set<string>;
  if (!mutations) {
    mutationSet = new Set<string>();
  } else if (mutations instanceof Set) {
    mutationSet = mutations;
  } else if (Array.isArray(mutations)) {
    mutationSet = new Set(mutations);
  } else {
    console.warn(`[SummoningCalculator] Unexpected mutations format for ${title}:`, typeof mutations, mutations);
    mutationSet = new Set<string>();
  }
  
  if (!probabilities || typeof probabilities !== 'object') return null;
  
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

// Visual trait probability table with tier indicators and color swatches
// Probabilities are keyed by gene ID (as strings), names/colors looked up by gene ID
function VisualProbabilityTable({ 
  title, 
  probabilities, 
  nameMap,
  colorMap,
  showPairNames,
  femaleNameMap
}: { 
  title: string; 
  probabilities: ProbabilityMap; 
  nameMap: Record<number, string>;
  colorMap?: Record<number, string>;
  showPairNames?: boolean;
  femaleNameMap?: Record<number, string>;
}) {
  if (!probabilities || typeof probabilities !== 'object') return null;
  
  const sortedEntries = Object.entries(probabilities)
    .sort((a, b) => b[1] - a[1])
    .filter(([_, prob]) => prob > 0);

  if (sortedEntries.length === 0) return null;

  return (
    <div className="space-y-1">
      <h4 className="font-semibold text-sm">{title}</h4>
      <div className="space-y-0.5">
        {sortedEntries.map(([trait, prob]) => {
          // trait is gene ID as string (e.g., "0", "5", "16")
          const geneId = Number(trait);
          const tier = GENE_TIERS[geneId] || `?${geneId}`;
          const isMutation = isMutationTier(tier);
          const colorHex = colorMap?.[geneId];
          
          // Look up names directly by gene ID
          const maleName = nameMap[geneId] || `Gene ${geneId}`;
          let displayName = maleName;
          
          // Get female name if showing pairs
          if (showPairNames && femaleNameMap) {
            const femaleName = femaleNameMap[geneId];
            if (femaleName && femaleName !== maleName) {
              displayName = `${maleName} / ${femaleName}`;
            }
          }
          
          return (
            <div 
              key={trait} 
              className={`flex items-center justify-between text-xs py-0.5 px-1 rounded gap-1 ${
                isMutation ? "bg-orange-500/20" : ""
              }`}
            >
              <div className="flex items-center gap-1 min-w-0 flex-1">
                {colorHex && (
                  <div 
                    className="w-3 h-3 rounded-sm border border-border/50 flex-shrink-0"
                    style={{ backgroundColor: colorHex }}
                  />
                )}
                <span className={`truncate ${isMutation ? "text-orange-300 font-medium" : ""}`}>
                  ({tier}) {displayName}
                </span>
              </div>
              <span className="font-mono flex-shrink-0">{prob.toFixed(2)}%</span>
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

// Sniper types
interface SniperFilters {
  classes: string[];
  professions: string[];
  realms: string[];
  priceRange: { min: number; max: number };
  rarities: { id: number; name: string }[];
}

interface SniperHero {
  id: string;
  normalizedId: number;
  mainClass: string;
  subClass: string | null;
  profession: string;
  rarity: number;
  level: number;
  generation: number;
  summonsRemaining: number;
  price: number;
  token: string;
}

interface SniperPair {
  hero1: SniperHero;
  hero2: SniperHero;
  realm: string;
  targetProbability: number;
  totalCost: number;
  efficiency: number;
  probabilities: {
    class: ProbabilityMap;
    subClass: ProbabilityMap;
    profession: ProbabilityMap;
  };
}

interface SniperResult {
  ok: boolean;
  pairs: SniperPair[];
  totalHeroes: number;
  totalPairsScored: number;
  searchParams: {
    targetClass: string;
    targetSubClass: string;
    targetProfession: string;
    realms: string[];
    maxPricePerHero: number;
    minSummonsRemaining: number;
  };
}

export default function SummoningCalculator() {
  const [hero1Id, setHero1Id] = useState("");
  const [hero2Id, setHero2Id] = useState("");
  const [result, setResult] = useState<SummoningResult | null>(null);
  const [pageTab, setPageTab] = useState<string>("calculator");
  
  // Sniper state
  const [sniperTargetClass, setSniperTargetClass] = useState("");
  const [sniperTargetProfession, setSniperTargetProfession] = useState("");
  const [sniperRealms, setSniperRealms] = useState<string[]>(["cv", "sd"]);
  const [sniperMaxPrice, setSniperMaxPrice] = useState("500");
  const [sniperMinSummons, setSniperMinSummons] = useState("1");
  const [sniperMinLevel, setSniperMinLevel] = useState("1");
  const [sniperMaxTTS, setSniperMaxTTS] = useState("");
  const [sniperResult, setSniperResult] = useState<SniperResult | null>(null);

  // Fetch sniper filters
  const { data: sniperFilters } = useQuery<{ ok: boolean; filters: SniperFilters }>({
    queryKey: ['/api/admin/sniper/filters']
  });

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

  // Sniper search mutation
  const sniperMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/admin/sniper/search", {
        targetClass: sniperTargetClass || undefined,
        targetProfession: sniperTargetProfession || undefined,
        realms: sniperRealms,
        maxPricePerHero: parseFloat(sniperMaxPrice) || 500,
        minSummonsRemaining: parseInt(sniperMinSummons) || 1,
        minLevel: parseInt(sniperMinLevel) || 1,
        maxTTS: sniperMaxTTS ? parseFloat(sniperMaxTTS) : null,
        limit: 20
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.ok) {
        setSniperResult(data);
      }
    }
  });

  const handleSniperSearch = () => {
    if (!sniperTargetClass && !sniperTargetProfession) return;
    sniperMutation.mutate();
  };

  const toggleRealm = (realm: string) => {
    setSniperRealms(prev => 
      prev.includes(realm) 
        ? prev.filter(r => r !== realm)
        : [...prev, realm]
    );
  };

  const getRarityName = (rarity: number) => 
    ['Common', 'Uncommon', 'Rare', 'Legendary', 'Mythic'][rarity] || 'Unknown';

  const getRarityColor = (rarity: number) => {
    const colors = ['text-gray-400', 'text-green-400', 'text-blue-400', 'text-orange-400', 'text-purple-400'];
    return colors[rarity] || 'text-gray-400';
  };

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Calculator className="h-8 w-8" />
          <div>
            <h1 className="text-2xl font-bold">Summoning Calculator</h1>
            <p className="text-muted-foreground">
              Calculate offspring trait probabilities from two parent heroes
            </p>
          </div>
        </div>
        <Tabs value={pageTab} onValueChange={setPageTab}>
          <TabsList>
            <TabsTrigger value="calculator" data-testid="tab-calculator">
              <Calculator className="h-4 w-4 mr-1" />
              Calculator
            </TabsTrigger>
            <TabsTrigger value="infographics" data-testid="tab-infographics">
              <Image className="h-4 w-4 mr-1" />
              Infographics
            </TabsTrigger>
            <TabsTrigger value="sniper" data-testid="tab-sniper">
              <Target className="h-4 w-4 mr-1" />
              Summon Sniper
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {pageTab === "calculator" && (
        <>
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
            <CardContent className="space-y-6">
              {/* Stat Genes Section */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Swords className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-medium text-muted-foreground">Stat Genes</h3>
                </div>
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

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mt-4">
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
              </div>

              <Separator />

              {/* Visual Genes Section */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Eye className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-medium text-muted-foreground">Visual Genes</h3>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  <VisualProbabilityTable 
                    title="Hair Style" 
                    probabilities={result.probabilities.hairStyle}
                    nameMap={HAIR_STYLE_NAMES}
                    showPairNames={true}
                    femaleNameMap={FEMALE_HAIR_STYLE_NAMES}
                  />
                  <VisualProbabilityTable 
                    title="Hair Color" 
                    probabilities={result.probabilities.hairColor}
                    nameMap={HAIR_COLOR_NAMES}
                    colorMap={HAIR_COLOR_HEX}
                  />
                  <VisualProbabilityTable 
                    title="Head App" 
                    probabilities={result.probabilities.headAppendage}
                    nameMap={HEAD_APPENDAGE_NAMES}
                  />
                  <VisualProbabilityTable 
                    title="Head App Color" 
                    probabilities={result.probabilities.appendageColor}
                    nameMap={HAIR_COLOR_NAMES}
                    colorMap={APPENDAGE_COLOR_HEX}
                  />
                  <VisualProbabilityTable 
                    title="Back App" 
                    probabilities={result.probabilities.backAppendage}
                    nameMap={BACK_APPENDAGE_NAMES}
                  />
                  <VisualProbabilityTable 
                    title="Back App Color" 
                    probabilities={result.probabilities.backAppendageColor}
                    nameMap={HAIR_COLOR_NAMES}
                    colorMap={APPENDAGE_COLOR_HEX}
                  />
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mt-4">
                  <VisualProbabilityTable 
                    title="Eye Color" 
                    probabilities={result.probabilities.eyeColor}
                    nameMap={EYE_COLOR_NAMES}
                    colorMap={EYE_COLOR_HEX}
                  />
                  <VisualProbabilityTable 
                    title="Skin Color" 
                    probabilities={result.probabilities.skinColor}
                    nameMap={SKIN_COLOR_NAMES}
                    colorMap={SKIN_COLOR_HEX}
                  />
                  <VisualProbabilityTable 
                    title="Crafting 1" 
                    probabilities={result.probabilities.crafting1}
                    nameMap={CRAFTING_NAMES}
                  />
                  <VisualProbabilityTable 
                    title="Crafting 2" 
                    probabilities={result.probabilities.crafting2}
                    nameMap={CRAFTING_NAMES}
                  />
                  <VisualProbabilityTable 
                    title="Visual Unknown 1" 
                    probabilities={result.probabilities.visualUnknown1}
                    nameMap={VISUAL_UNKNOWN_NAMES}
                  />
                  <VisualProbabilityTable 
                    title="Visual Unknown 2" 
                    probabilities={result.probabilities.visualUnknown2}
                    nameMap={VISUAL_UNKNOWN_NAMES}
                  />
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mt-4">
                  <ProbabilityTable 
                    title="Gender" 
                    probabilities={result.probabilities.gender}
                    mutations={result.probabilities.mutations?.gender}
                  />
                  <VisualProbabilityTable 
                    title="Background" 
                    probabilities={result.probabilities.background}
                    nameMap={BACKGROUND_NAMES}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
      </>
      )}

      {pageTab === "infographics" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trees className="h-5 w-5" />
              Visual Mutation Trees
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Reference charts showing mutation paths from Basic → Advanced → Elite → Exalted → Transcendent
            </p>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="hairstyle">
              <TabsList className="mb-4 flex-wrap h-auto gap-1">
                <TabsTrigger value="hairstyle" data-testid="tab-infographic-hairstyle">
                  Female Hairstyle
                </TabsTrigger>
                <TabsTrigger value="hairstyle-male" data-testid="tab-infographic-hairstyle-male">
                  Male Hairstyle
                </TabsTrigger>
                <TabsTrigger value="head-app" data-testid="tab-infographic-head-app">
                  Head Appendage
                </TabsTrigger>
                <TabsTrigger value="back-app" data-testid="tab-infographic-back-app">
                  Back Appendage
                </TabsTrigger>
                <TabsTrigger value="app-color" data-testid="tab-infographic-app-color">
                  Appendage Color
                </TabsTrigger>
                <TabsTrigger value="hair-color" data-testid="tab-infographic-hair-color">
                  Hair Color
                </TabsTrigger>
              </TabsList>

              <TabsContent value="hairstyle">
                <div className="overflow-x-auto">
                  <img 
                    src={femaleHairstyleTree} 
                    alt="Female Hairstyle Summoning Tree" 
                    className="max-w-full h-auto rounded-lg border"
                  />
                </div>
              </TabsContent>

              <TabsContent value="hairstyle-male">
                <div className="overflow-x-auto">
                  <img 
                    src={maleHairstyleTree} 
                    alt="Male Hairstyle Summoning Tree" 
                    className="max-w-full h-auto rounded-lg border"
                  />
                </div>
              </TabsContent>

              <TabsContent value="head-app">
                <div className="overflow-x-auto">
                  <img 
                    src={headAppendageTree} 
                    alt="Head Appendage Summoning Tree" 
                    className="max-w-full h-auto rounded-lg border"
                  />
                </div>
              </TabsContent>

              <TabsContent value="back-app">
                <div className="overflow-x-auto">
                  <img 
                    src={backAppendageTree} 
                    alt="Back Appendage Summoning Tree" 
                    className="max-w-full h-auto rounded-lg border"
                  />
                </div>
              </TabsContent>

              <TabsContent value="app-color">
                <div className="overflow-x-auto">
                  <img 
                    src={appendageColorTree} 
                    alt="Appendage Color Summoning Tree" 
                    className="max-w-full h-auto rounded-lg border"
                  />
                </div>
              </TabsContent>

              <TabsContent value="hair-color">
                <div className="overflow-x-auto">
                  <img 
                    src={hairColorTree} 
                    alt="Hair Color Summoning Tree" 
                    className="max-w-full h-auto rounded-lg border"
                  />
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}

      {pageTab === "sniper" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Filter className="h-5 w-5" />
                Search Filters
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Find optimal hero pairs from the tavern that maximize your chance of breeding specific traits
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="targetClass">Target Class</Label>
                  <select
                    id="targetClass"
                    value={sniperTargetClass}
                    onChange={(e) => setSniperTargetClass(e.target.value)}
                    className="w-full h-9 px-3 rounded-md border bg-background text-sm"
                    data-testid="select-target-class"
                  >
                    <option value="">Any Class</option>
                    {sniperFilters?.filters?.classes?.map(cls => (
                      <option key={cls} value={cls}>{cls}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="targetProfession">Target Profession</Label>
                  <select
                    id="targetProfession"
                    value={sniperTargetProfession}
                    onChange={(e) => setSniperTargetProfession(e.target.value)}
                    className="w-full h-9 px-3 rounded-md border bg-background text-sm"
                    data-testid="select-target-profession"
                  >
                    <option value="">Any Profession</option>
                    {sniperFilters?.filters?.professions?.map(prof => (
                      <option key={prof} value={prof}>{prof}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="maxPrice">Max Price (per hero)</Label>
                  <Input
                    id="maxPrice"
                    type="number"
                    value={sniperMaxPrice}
                    onChange={(e) => setSniperMaxPrice(e.target.value)}
                    placeholder="500"
                    data-testid="input-max-price"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="minSummons">Min Summons Remaining</Label>
                  <Input
                    id="minSummons"
                    type="number"
                    value={sniperMinSummons}
                    onChange={(e) => setSniperMinSummons(e.target.value)}
                    placeholder="1"
                    data-testid="input-min-summons"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="minLevel">Min Level</Label>
                  <Input
                    id="minLevel"
                    type="number"
                    value={sniperMinLevel}
                    onChange={(e) => setSniperMinLevel(e.target.value)}
                    placeholder="1"
                    data-testid="input-min-level"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="maxTTS">Max TTS (leave empty for any)</Label>
                  <Input
                    id="maxTTS"
                    type="number"
                    value={sniperMaxTTS}
                    onChange={(e) => setSniperMaxTTS(e.target.value)}
                    placeholder="Any"
                    data-testid="input-max-tts"
                  />
                </div>
              </div>

              <div className="flex items-center gap-4">
                <Label>Realms:</Label>
                <div className="flex gap-2">
                  <Badge
                    variant={sniperRealms.includes("cv") ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => toggleRealm("cv")}
                    data-testid="badge-realm-cv"
                  >
                    Crystalvale
                  </Badge>
                  <Badge
                    variant={sniperRealms.includes("sd") ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => toggleRealm("sd")}
                    data-testid="badge-realm-sd"
                  >
                    Sundered Isles
                  </Badge>
                </div>
              </div>

              <Button
                onClick={handleSniperSearch}
                disabled={(!sniperTargetClass && !sniperTargetProfession) || sniperMutation.isPending}
                data-testid="button-sniper-search"
              >
                {sniperMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Target className="h-4 w-4 mr-2" />
                )}
                Find Best Pairs
              </Button>

              {sniperMutation.isError && (
                <p className="text-destructive text-sm">
                  Error: {(sniperMutation.error as Error)?.message || "Search failed"}
                </p>
              )}
            </CardContent>
          </Card>

          {sniperResult && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Best Hero Pairs
                  <Badge variant="outline" className="ml-2">
                    {sniperResult.pairs.length} pairs from {sniperResult.totalHeroes} heroes
                  </Badge>
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Ranked by efficiency (probability per token spent)
                </p>
              </CardHeader>
              <CardContent>
                {sniperResult.pairs.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    No matching hero pairs found. Try adjusting your filters.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {sniperResult.pairs.map((pair, idx) => (
                      <Card key={idx} className="bg-muted/30">
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-4 flex-wrap">
                            <div className="flex-1 min-w-[200px]">
                              <div className="flex items-center gap-2 mb-2">
                                <Badge variant="secondary">#{idx + 1}</Badge>
                                <Badge variant="outline">{pair.realm === 'cv' ? 'Crystalvale' : 'Sundered Isles'}</Badge>
                              </div>
                              
                              <div className="grid grid-cols-2 gap-4 text-sm">
                                <div className="space-y-1">
                                  <div className="font-medium">Hero 1</div>
                                  <div className={getRarityColor(pair.hero1.rarity)}>
                                    {getRarityName(pair.hero1.rarity)} {pair.hero1.mainClass}
                                  </div>
                                  <div className="text-muted-foreground">
                                    Gen {pair.hero1.generation} | {pair.hero1.summonsRemaining} summons
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <DollarSign className="h-3 w-3" />
                                    {pair.hero1.price.toFixed(2)} {pair.hero1.token}
                                  </div>
                                  <a
                                    href={`https://game.defikingdoms.com/marketplace/heroes/${pair.hero1.id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-blue-400 hover:underline flex items-center gap-1"
                                  >
                                    View in Tavern <ExternalLink className="h-3 w-3" />
                                  </a>
                                </div>

                                <div className="space-y-1">
                                  <div className="font-medium">Hero 2</div>
                                  <div className={getRarityColor(pair.hero2.rarity)}>
                                    {getRarityName(pair.hero2.rarity)} {pair.hero2.mainClass}
                                  </div>
                                  <div className="text-muted-foreground">
                                    Gen {pair.hero2.generation} | {pair.hero2.summonsRemaining} summons
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <DollarSign className="h-3 w-3" />
                                    {pair.hero2.price.toFixed(2)} {pair.hero2.token}
                                  </div>
                                  <a
                                    href={`https://game.defikingdoms.com/marketplace/heroes/${pair.hero2.id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-blue-400 hover:underline flex items-center gap-1"
                                  >
                                    View in Tavern <ExternalLink className="h-3 w-3" />
                                  </a>
                                </div>
                              </div>
                            </div>

                            <div className="text-right space-y-1">
                              <div className="text-lg font-bold text-green-400">
                                {pair.targetProbability.toFixed(1)}% chance
                              </div>
                              <div className="text-sm text-muted-foreground">
                                Total: {pair.totalCost.toFixed(2)} {pair.hero1.token}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                Efficiency: {pair.efficiency.toFixed(4)}
                              </div>
                            </div>
                          </div>

                          {pair.probabilities && (
                            <div className="mt-3 pt-3 border-t grid grid-cols-3 gap-2 text-xs">
                              {pair.probabilities.class && Object.entries(pair.probabilities.class).slice(0, 3).map(([name, prob]) => (
                                <div key={name} className="flex justify-between">
                                  <span className="text-muted-foreground">{name}:</span>
                                  <span>{prob}%</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
