import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export const CLASS_RANKS: Record<string, number> = {
  Warrior: 0, Knight: 0, Thief: 0, Archer: 0, Priest: 0, Wizard: 0, Monk: 0, Pirate: 0,
  Berserker: 1, Seer: 1, Legionnaire: 1, Scholar: 1,
  Paladin: 2, DarkKnight: 2, Summoner: 2, Ninja: 2, Shapeshifter: 2, Bard: 2,
  Dragoon: 3, Sage: 3, SpellBow: 3,
  DreadKnight: 4
};

export const C_BASE: Record<number, number> = {
  0: 150,
  1: 3000,
  2: 9000,
  3: 25000,
  4: 75000
};

export const R_BASE: Record<number, number> = {
  0: 0,
  1: 1000,
  2: 3000,
  3: 8000,
  4: 16000
};

export default function HeroScoreCalculator() {
  const [mainClass, setMainClass] = useState("Warrior");
  const [subClass, setSubClass] = useState("Warrior");
  const [rarity, setRarity] = useState("0");
  const [level, setLevel] = useState(1);
  const [summonsRemaining, setSummonsRemaining] = useState(0);
  const [maxSummons, setMaxSummons] = useState(11);
  const [generation, setGeneration] = useState("1");
  const [dePrice, setDePrice] = useState(0.5);
  const [gdePrice, setGdePrice] = useState(1.5);
  const [marketPrice, setMarketPrice] = useState<number | "">("");

  const mainRank = CLASS_RANKS[mainClass] || 0;
  const subRank = CLASS_RANKS[subClass] || 0;
  
  const classScore = C_BASE[mainRank] + C_BASE[subRank] * 0.25;
  const rarityScore = R_BASE[parseInt(rarity)] * (mainRank + subRank - 1);
  const levelScore = level * 3.25;
  const summonScore = 7500 * (summonsRemaining / maxSummons);
  const genBonus = generation === "0" ? 5000 : 0;
  
  const totalHeroScore = classScore + Math.max(0, rarityScore) + levelScore + summonScore + genBonus;
  const deOutput = totalHeroScore / 15;
  const gdeOutput = totalHeroScore / 240;
  const burnValue = deOutput * dePrice + gdeOutput * gdePrice;
  const profit = marketPrice !== "" ? burnValue - marketPrice : null;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6" data-testid="page-hero-score-calculator">
      <div className="flex flex-col md:flex-row gap-6">
        {/* Left Panel: Inputs */}
        <Card className="flex-1">
          <CardHeader>
            <CardTitle>Hero Configuration</CardTitle>
            <CardDescription>Enter hero details to calculate score</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Main Class</Label>
                <Select value={mainClass} onValueChange={setMainClass}>
                  <SelectTrigger data-testid="select-main-class">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.keys(CLASS_RANKS).map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Sub Class</Label>
                <Select value={subClass} onValueChange={setSubClass}>
                  <SelectTrigger data-testid="select-sub-class">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.keys(CLASS_RANKS).map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Rarity</Label>
                <Select value={rarity} onValueChange={setRarity}>
                  <SelectTrigger data-testid="select-rarity">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Common</SelectItem>
                    <SelectItem value="1">Uncommon</SelectItem>
                    <SelectItem value="2">Rare</SelectItem>
                    <SelectItem value="3">Legendary</SelectItem>
                    <SelectItem value="4">Mythic</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Level</Label>
                <Input 
                  type="number" 
                  value={level} 
                  onChange={e => setLevel(parseInt(e.target.value) || 1)} 
                  min={1} 
                  max={100}
                  data-testid="input-level"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Summons Remaining</Label>
                <Input 
                  type="number" 
                  value={summonsRemaining} 
                  onChange={e => setSummonsRemaining(parseInt(e.target.value) || 0)} 
                  min={0} 
                  max={11}
                  data-testid="input-summons-remaining"
                />
              </div>
              <div className="space-y-2">
                <Label>Max Summons</Label>
                <Select value={maxSummons.toString()} onValueChange={v => setMaxSummons(parseInt(v))}>
                  <SelectTrigger data-testid="select-max-summons">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="4">4</SelectItem>
                    <SelectItem value="7">7</SelectItem>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="11">11</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Generation</Label>
              <Select value={generation} onValueChange={setGeneration}>
                <SelectTrigger data-testid="select-generation">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Gen 0</SelectItem>
                  <SelectItem value="1">Gen 1+</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-3 gap-4 border-t pt-4 mt-4">
              <div className="space-y-2">
                <Label>DE Price (JEWEL)</Label>
                <Input 
                  type="number" 
                  value={dePrice} 
                  onChange={e => setDePrice(parseFloat(e.target.value) || 0)}
                  step={0.1}
                  data-testid="input-de-price"
                />
              </div>
              <div className="space-y-2">
                <Label>GDE Price (JEWEL)</Label>
                <Input 
                  type="number" 
                  value={gdePrice} 
                  onChange={e => setGdePrice(parseFloat(e.target.value) || 0)}
                  step={0.1}
                  data-testid="input-gde-price"
                />
              </div>
              <div className="space-y-2">
                <Label>Market Price (JEWEL)</Label>
                <Input 
                  type="number" 
                  value={marketPrice} 
                  onChange={e => setMarketPrice(e.target.value === "" ? "" : parseFloat(e.target.value))}
                  placeholder="Optional"
                  data-testid="input-market-price"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Right Panel: Results */}
        <div className="flex-1 space-y-6">
          <Card className="bg-primary/5 border-primary/20">
            <CardHeader>
              <CardTitle className="text-center">Total Hero Score</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-5xl font-bold text-center text-primary" data-testid="text-total-hero-score">
                {totalHeroScore.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-muted-foreground">Est. DE Output</div>
                <div className="text-2xl font-bold" data-testid="text-de-output">
                  {deOutput.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-muted-foreground">Est. GDE Output</div>
                <div className="text-2xl font-bold" data-testid="text-gde-output">
                  {gdeOutput.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Burn Value</span>
                <span className="text-xl font-bold" data-testid="text-burn-value">{burnValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} JEWEL</span>
              </div>
              {profit !== null && (
                <div className="flex justify-between items-center pt-2 border-t">
                  <span className="text-muted-foreground">Burn Profit/Loss</span>
                  <span className={`text-xl font-bold ${profit >= 0 ? 'text-green-500' : 'text-red-500'}`} data-testid="text-burn-profit">
                    {profit >= 0 ? '+' : ''}{profit.toLocaleString(undefined, { maximumFractionDigits: 2 })} JEWEL
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <div className="flex justify-between">
                <span>Class Score ({mainClass}/{subClass})</span>
                <span data-testid="text-breakdown-class">{classScore.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span className="pl-4">Main Base (Rank {mainRank})</span>
                <span>{C_BASE[mainRank].toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span className="pl-4">Sub Base (Rank {subRank} * 0.25)</span>
                <span>{(C_BASE[subRank] * 0.25).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Rarity Score</span>
                <span data-testid="text-breakdown-rarity">{Math.max(0, rarityScore).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Level Score</span>
                <span data-testid="text-breakdown-level">{levelScore.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Summon Score</span>
                <span data-testid="text-breakdown-summon">{summonScore.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Generation Bonus</span>
                <span data-testid="text-breakdown-gen">{genBonus.toLocaleString()}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Accordion type="single" collapsible>
        <AccordionItem value="formula">
          <AccordionTrigger>Formula Details</AccordionTrigger>
          <AccordionContent className="space-y-4 text-sm text-muted-foreground p-4 bg-muted/30 rounded-md">
            <p><strong>Total Hero Score</strong> = Class Score + Rarity Score + Level Score + Summon Score + Generation Bonus</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Class Score:</strong> Main Base + (Sub Base × 0.25). Bases depend on class rank (Basic=150 to Transcendent=75000).</li>
              <li><strong>Rarity Score:</strong> Rarity Base × (Main Rank + Sub Rank - 1). Bases range from Common=0 to Mythic=16000.</li>
              <li><strong>Level Score:</strong> Hero Level × 3.25.</li>
              <li><strong>Summon Score:</strong> 7500 × (Summons Remaining / Max Summons).</li>
              <li><strong>Generation Bonus:</strong> Gen 0 heroes receive a flat +5000 bonus.</li>
              <li><strong>DE Output:</strong> Total Score / 15.</li>
              <li><strong>GDE Output:</strong> Total Score / 240.</li>
            </ul>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
