import { useState } from 'react';
import { useLocation } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  HeroStats, 
  computeHeroCombatProfile, 
  STARTER_WEAPONS, 
  Weapon,
  computeAccuracy,
  computeAttack
} from "@/lib/dfk-combat-formulas";
import { Swords, Target, Lightbulb, Info } from 'lucide-react';

const STATS_LIST: (keyof HeroStats)[] = ['STR', 'DEX', 'AGI', 'INT', 'WIS', 'VIT', 'END', 'LCK'];

const ROLE_WEIGHTS = {
  'Physical DPS': { STR: 3, DEX: 3, AGI: 2, LCK: 2, INT: 0, WIS: 0, VIT: 0, END: 0 },
  'Magical DPS': { INT: 3, WIS: 2, AGI: 2, LCK: 2, STR: 0, DEX: 0, VIT: 0, END: 0 },
  'Tank': { VIT: 3, END: 3, STR: 2, DEX: 0, AGI: 0, INT: 0, WIS: 0, LCK: 0 },
  'Support': { WIS: 3, VIT: 2, LCK: 2, STR: 0, DEX: 0, AGI: 0, INT: 0, END: 0 }
};

export default function AdminCombatToolkit() {
  const [stats, setStats] = useState<HeroStats>({
    STR: 10, DEX: 10, AGI: 10, INT: 10, WIS: 10, VIT: 10, END: 10, LCK: 10
  });
  const [level, setLevel] = useState(1);
  const [avgPartyLevel, setAvgPartyLevel] = useState(1);
  const [role, setRole] = useState<keyof typeof ROLE_WEIGHTS>('Physical DPS');

  const handleStatChange = (stat: keyof HeroStats, value: string) => {
    const val = Math.max(1, Math.min(100, parseInt(value) || 1));
    setStats(prev => ({ ...prev, [stat]: val }));
  };

  const profile = computeHeroCombatProfile(stats, avgPartyLevel);

  const getAccuracyColor = (acc: number) => {
    if (acc < 0.5) return "text-destructive";
    if (acc < 0.85) return "text-yellow-500";
    return "text-green-500";
  };

  const getFitRating = (acc: number) => {
    if (acc >= 0.95) return "Excellent";
    if (acc >= 0.85) return "Good";
    if (acc >= 0.7) return "Fair";
    return "Poor";
  };

  const calculateWeightedScore = (currentStats: HeroStats) => {
    const p = computeHeroCombatProfile(currentStats, avgPartyLevel);
    const weights = ROLE_WEIGHTS[role];
    let score = 0;
    // We sum up the derived stats based on role preference
    // This is a simplified heuristic for the "Stat Advisor"
    if (role === 'Physical DPS') {
      score = p.STR * 10 + p.DEX * 10 + p.AGI * 5 + p.Crit * 5 + p.Speed * 2;
    } else if (role === 'Magical DPS') {
      score = p.INT * 10 + p.WIS * 10 + p.AGI * 5 + p.Crit * 5 + p.Speed * 2;
    } else if (role === 'Tank') {
      score = p.VIT * 10 + p.END * 10 + p.STR * 5 + p.Block * 5 + p.SER * 5;
    } else if (role === 'Support') {
      score = p.WIS * 10 + p.VIT * 8 + p.LCK * 5 + p.Recovery * 10 + p.SpellBlock * 5;
    }
    return score;
  };

  const statImprovements = STATS_LIST.map(s => {
    const currentScore = calculateWeightedScore(stats);
    const improvedStats = { ...stats, [s]: stats[s] + 1 };
    const improvedScore = calculateWeightedScore(improvedStats);
    return {
      stat: s,
      improvement: improvedScore - currentScore
    };
  }).sort((a, b) => b.improvement - a.improvement);

  const maxImprovement = Math.max(...statImprovements.map(i => i.improvement), 0.001);

  const bestPhysical = [...STARTER_WEAPONS]
    .filter(w => w.type === 'Physical')
    .map(w => ({ 
      weapon: w, 
      atk: computeAttack(w.baseAtk, w.scalars.map(s => ({ heroStatVal: stats[s.stat], sv: s.sv, smb: s.smb }))) 
    }))
    .sort((a, b) => b.atk - a.atk)[0]?.weapon;

  const bestMagical = [...STARTER_WEAPONS]
    .filter(w => w.type === 'Magical')
    .map(w => ({ 
      weapon: w, 
      atk: computeAttack(w.baseAtk, w.scalars.map(s => ({ heroStatVal: stats[s.stat], sv: s.sv, smb: s.smb }))) 
    }))
    .sort((a, b) => b.atk - a.atk)[0]?.weapon;

  return (
    <div className="p-6 space-y-6" data-testid="combat-toolkit-page">
      <div>
        <h1 className="text-3xl font-bold">Hero Combat Toolkit</h1>
        <p className="text-muted-foreground">Analyze combat performance, weapon fit, and stat optimization.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Hero Inputs</CardTitle>
          <CardDescription>Enter hero stats and level details to see derived combat potential.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
            <div className="space-y-2">
              <Label htmlFor="level">Hero Level</Label>
              <Input 
                id="level" 
                type="number" 
                value={level} 
                onChange={(e) => setLevel(Math.max(1, parseInt(e.target.value) || 1))}
                data-testid="input-level"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="avgPartyLevel">Avg Party Level</Label>
              <Input 
                id="avgPartyLevel" 
                type="number" 
                value={avgPartyLevel} 
                onChange={(e) => setAvgPartyLevel(Math.max(1, parseInt(e.target.value) || 1))}
                data-testid="input-avg-party-level"
              />
            </div>
            <div className="space-y-2">
              <Label>Focus (WIS/DEX)</Label>
              <Input value={profile.Focus.toFixed(1)} readOnly className="bg-muted" data-testid="text-focus" />
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4 mt-6">
            {STATS_LIST.map(stat => (
              <div key={stat} className="space-y-2">
                <Label htmlFor={`stat-${stat}`}>{stat}</Label>
                <Input 
                  id={`stat-${stat}`}
                  type="number"
                  value={stats[stat]}
                  onChange={(e) => handleStatChange(stat, e.target.value)}
                  data-testid={`input-stat-${stat.toLowerCase()}`}
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="stats" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="stats" data-testid="tab-combat-stats">
            <Swords className="w-4 h-4 mr-2" />
            Combat Stats
          </TabsTrigger>
          <TabsTrigger value="weapons" data-testid="tab-weapon-fit">
            <Target className="w-4 h-4 mr-2" />
            Weapon Fit
          </TabsTrigger>
          <TabsTrigger value="advisor" data-testid="tab-stat-advisor">
            <Lightbulb className="w-4 h-4 mr-2" />
            Stat Advisor
          </TabsTrigger>
        </TabsList>

        <TabsContent value="stats" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(profile).filter(([k]) => k !== 'Focus').map(([key, value]) => (
              <Card key={key} className="hover-elevate">
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-sm font-medium">{key}</CardTitle>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          <Info className="w-3 h-3 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Derived {key} based on stats and level.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <span className="text-sm font-bold" data-testid={`text-stat-value-${key.toLowerCase()}`}>
                    {(value as number).toFixed(3)}
                  </span>
                </CardHeader>
                <CardContent>
                  <Progress 
                    value={Math.min(100, (value as number) * (key === 'Speed' ? 0.05 : 500))} 
                    className="h-2"
                  />
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="weapons" className="mt-6">
          <div className="grid gap-4">
            {STARTER_WEAPONS.map((weapon, idx) => {
              const atk = computeAttack(weapon.baseAtk, weapon.scalars.map(s => ({ heroStatVal: stats[s.stat], sv: s.sv, smb: s.smb })));
              const acc = computeAccuracy(weapon.type === 'Physical' ? stats.DEX : profile.Focus, weapon.statReq, weapon.AaR, weapon.curveMod);
              const isBest = weapon === bestPhysical || weapon === bestMagical;

              return (
                <Card key={idx} className={`hover-elevate ${isBest ? 'border-primary' : ''}`}>
                  <CardContent className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-lg">{weapon.name}</h3>
                        {weapon === bestPhysical && <Badge variant="default">Best Physical</Badge>}
                        {weapon === bestMagical && <Badge variant="default">Best Magical</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground">{weapon.type} • Base Atk: {weapon.baseAtk}</p>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-6 text-center shrink-0">
                      <div>
                        <p className="text-xs text-muted-foreground uppercase font-semibold">Attack</p>
                        <p className="text-xl font-bold" data-testid={`text-weapon-atk-${idx}`}>{atk.toFixed(1)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground uppercase font-semibold">Accuracy</p>
                        <p className={`text-xl font-bold ${getAccuracyColor(acc)}`} data-testid={`text-weapon-acc-${idx}`}>
                          {(acc * 100).toFixed(1)}%
                        </p>
                      </div>
                      <div className="hidden md:block">
                        <p className="text-xs text-muted-foreground uppercase font-semibold">Fit</p>
                        <Badge variant="outline" className="mt-1">{getFitRating(acc)}</Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="advisor" className="mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Training Advisor</CardTitle>
                <CardDescription>Select a role to see which stats provide the most value for that archetype.</CardDescription>
              </div>
              <Select value={role} onValueChange={(v) => setRole(v as any)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  {Object.keys(ROLE_WEIGHTS).map(r => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                {statImprovements.map((item, idx) => (
                  <div key={item.stat} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{item.stat}</span>
                      <span className="text-muted-foreground">+{item.improvement.toFixed(2)} score benefit</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <Progress value={(item.improvement / maxImprovement) * 100} className="h-2 flex-1" />
                      {idx === 0 && <Badge variant="default" className="bg-green-500 hover:bg-green-600">Priority</Badge>}
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="bg-accent/50 p-4 rounded-md">
                <p className="text-sm font-medium">Why these stats?</p>
                <p className="text-xs text-muted-foreground mt-1">
                  The advisor calculates the marginal benefit of adding +1 to each stat based on the combat profile of a {role}. 
                  It weights derived stats like Accuracy, Crit, Evasion, and Defense differently depending on the chosen archetype.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
