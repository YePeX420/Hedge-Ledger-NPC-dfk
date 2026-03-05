import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Swords, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  HeroStats, 
  computeHeroCombatProfile, 
  computeAttack, 
  computeAccuracy,
  STARTER_WEAPONS,
  STARTER_ARMORS,
  Weapon
} from '@/lib/dfk-combat-formulas';

interface HeroInputState {
  stats: HeroStats;
  level: number;
  armor: string;
  weaponType: 'Physical' | 'Magical';
}

export default function AdminPVPMatchup() {
  const [heroA, setHeroA] = useState<HeroInputState>({
    stats: { STR: 10, DEX: 10, AGI: 10, INT: 10, WIS: 10, VIT: 10, END: 10, LCK: 10 },
    level: 1,
    armor: "Tattered Tunic",
    weaponType: 'Physical'
  });

  const [heroB, setHeroB] = useState<HeroInputState>({
    stats: { STR: 10, DEX: 10, AGI: 10, INT: 10, WIS: 10, VIT: 10, END: 10, LCK: 10 },
    level: 1,
    armor: "Tattered Tunic",
    weaponType: 'Physical'
  });

  const avgPartyLevel = useMemo(() => (heroA.level + heroB.level) / 2, [heroA.level, heroB.level]);

  const profileA = useMemo(() => computeHeroCombatProfile(heroA.stats, avgPartyLevel), [heroA.stats, avgPartyLevel]);
  const profileB = useMemo(() => computeHeroCombatProfile(heroB.stats, avgPartyLevel), [heroB.stats, avgPartyLevel]);

  const initA = useMemo(() => ({
    min: 2 * (heroA.stats.AGI - heroA.stats.LCK / 2),
    max: 2 * (heroA.stats.AGI + heroA.stats.LCK / 2),
    expected: 2 * heroA.stats.AGI
  }), [heroA.stats]);

  const initB = useMemo(() => ({
    min: 2 * (heroB.stats.AGI - heroB.stats.LCK / 2),
    max: 2 * (heroB.stats.AGI + heroB.stats.LCK / 2),
    expected: 2 * heroB.stats.AGI
  }), [heroB.stats]);

  const pFirstA = useMemo(() => {
    const minA = initA.min;
    const maxA = initA.max;
    const minB = initB.min;
    const maxB = initB.max;

    if (minA >= maxB) return 1;
    if (maxA <= minB) return 0;

    // Simulation for better accuracy in edge cases
    let wins = 0;
    const iterations = 10000;
    for (let i = 0; i < iterations; i++) {
      const valA = minA + Math.random() * (maxA - minA);
      const valB = minB + Math.random() * (maxB - minB);
      if (valA > valB) wins++;
    }
    return wins / iterations;
  }, [initA, initB]);

  const selectedArmorA = STARTER_ARMORS.find(a => a.name === heroA.armor) || STARTER_ARMORS[0];
  const selectedArmorB = STARTER_ARMORS.find(a => a.name === heroB.armor) || STARTER_ARMORS[0];

  const defA = {
    pdef: Math.min(heroA.stats.END * selectedArmorA.pdefScalar, selectedArmorA.pdefMaxBonus),
    mdef: Math.min(heroA.stats.WIS * selectedArmorA.mdefScalar, selectedArmorA.mdefMaxBonus)
  };
  const defB = {
    pdef: Math.min(heroB.stats.END * selectedArmorB.pdefScalar, selectedArmorB.pdefMaxBonus),
    mdef: Math.min(heroB.stats.WIS * selectedArmorB.mdefScalar, selectedArmorB.mdefMaxBonus)
  };

  const getBestWeapon = (hero: HeroInputState) => {
    const weapons = STARTER_WEAPONS.filter(w => w.type === hero.weaponType);
    let bestWeapon = weapons[0];
    let maxAtk = -1;

    weapons.forEach(w => {
      const scalars = w.scalars.map(s => ({
        heroStatVal: hero.stats[s.stat],
        sv: s.sv,
        smb: s.smb
      }));
      const atk = computeAttack(w.baseAtk, scalars);
      if (atk > maxAtk) {
        maxAtk = atk;
        bestWeapon = w;
      }
    });
    return { weapon: bestWeapon, attack: maxAtk };
  };

  const bestA = getBestWeapon(heroA);
  const bestB = getBestWeapon(heroB);

  const accA = computeAccuracy(
    heroA.weaponType === 'Physical' ? heroA.stats.DEX : profileA.Focus,
    bestA.weapon.statReq,
    bestA.weapon.AaR,
    bestA.weapon.curveMod
  );
  const accB = computeAccuracy(
    heroB.weaponType === 'Physical' ? heroB.stats.DEX : profileB.Focus,
    bestB.weapon.statReq,
    bestB.weapon.AaR,
    bestB.weapon.curveMod
  );

  const drA = (heroA.weaponType === 'Physical' ? defA.pdef : defA.mdef) / (50 * avgPartyLevel);
  const drB = (heroB.weaponType === 'Physical' ? defB.pdef : defB.mdef) / (50 * avgPartyLevel);

  const expectedDmgA = bestA.attack * accA * (1 - drB);
  const expectedDmgB = bestB.attack * accB * (1 - drA);

  const renderHeroInputs = (hero: HeroInputState, setHero: React.Dispatch<React.SetStateAction<HeroInputState>>, label: string) => (
    <Card className="flex-1">
      <CardHeader>
        <CardTitle>{label}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Level</Label>
            <Input 
              type="number" 
              value={hero.level} 
              onChange={e => setHero(prev => ({ ...prev, level: parseInt(e.target.value) || 1 }))}
              min={1} max={100}
            />
          </div>
          <div className="space-y-2">
            <Label>Armor</Label>
            <Select value={hero.armor} onValueChange={v => setHero(prev => ({ ...prev, armor: v }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STARTER_ARMORS.map(a => <SelectItem key={a.name} value={a.name}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Weapon Type</Label>
            <Select value={hero.weaponType} onValueChange={v => setHero(prev => ({ ...prev, weaponType: v as any }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Physical">Physical</SelectItem>
                <SelectItem value="Magical">Magical</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {Object.keys(hero.stats).map(stat => (
            <div key={stat} className="space-y-1">
              <Label className="text-[10px] uppercase">{stat}</Label>
              <Input 
                type="number" 
                value={hero.stats[stat as keyof HeroStats]} 
                onChange={e => setHero(prev => ({ 
                  ...prev, 
                  stats: { ...prev.stats, [stat]: parseInt(e.target.value) || 0 } 
                }))}
                className="h-8 px-2"
                min={1} max={100}
              />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto" data-testid="page-pvp-matchup">
      <div className="flex flex-col md:flex-row gap-6">
        {renderHeroInputs(heroA, setHeroA, "Hero A")}
        {renderHeroInputs(heroB, setHeroB, "Hero B")}
      </div>

      <Card>
        <CardHeader className="text-center">
          <CardTitle>Initiative Advantage</CardTitle>
          <CardDescription>Probability of winning the initiative roll</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col items-center gap-2">
            <div className={`text-4xl font-bold ${pFirstA > 0.6 ? 'text-green-500' : pFirstA < 0.4 ? 'text-red-500' : 'text-yellow-500'}`}>
              {(pFirstA * 100).toFixed(1)}%
            </div>
            <p className="text-sm text-muted-foreground">Chance for Hero A to go first</p>
          </div>

          <div className="space-y-4">
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span>Hero A: {initA.min.toFixed(1)} - {initA.max.toFixed(1)}</span>
                <span>Expected: {initA.expected.toFixed(1)}</span>
              </div>
              <div className="h-4 bg-accent rounded-full relative overflow-hidden">
                <div 
                  className="absolute h-full bg-primary/40"
                  style={{ 
                    left: `${Math.max(0, initA.min / 3)}%`, 
                    width: `${(initA.max - initA.min) / 3}%` 
                  }}
                />
                <div 
                  className="absolute h-full w-1 bg-primary"
                  style={{ left: `${initA.expected / 3}%` }}
                />
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span>Hero B: {initB.min.toFixed(1)} - {initB.max.toFixed(1)}</span>
                <span>Expected: {initB.expected.toFixed(1)}</span>
              </div>
              <div className="h-4 bg-accent rounded-full relative overflow-hidden">
                <div 
                  className="absolute h-full bg-secondary/40"
                  style={{ 
                    left: `${Math.max(0, initB.min / 3)}%`, 
                    width: `${(initB.max - initB.min) / 3}%` 
                  }}
                />
                <div 
                  className="absolute h-full w-1 bg-secondary"
                  style={{ left: `${initB.expected / 3}%` }}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Combat Comparison</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Metric</TableHead>
                <TableHead className="text-center">Hero A</TableHead>
                <TableHead className="text-center">Hero B</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium">Weapon</TableCell>
                <TableCell className="text-center">{bestA.weapon.name}</TableCell>
                <TableCell className="text-center">{bestB.weapon.name}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">ATTACK / SPELL</TableCell>
                <TableCell className={`text-center font-bold ${bestA.attack > bestB.attack ? 'text-green-500' : ''}`}>
                  {bestA.attack.toFixed(1)}
                </TableCell>
                <TableCell className={`text-center font-bold ${bestB.attack > bestA.attack ? 'text-green-500' : ''}`}>
                  {bestB.attack.toFixed(1)}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Accuracy</TableCell>
                <TableCell className={`text-center ${accA > 0.85 ? 'text-green-500' : accA < 0.5 ? 'text-red-500' : 'text-yellow-500'}`}>
                  {(accA * 100).toFixed(1)}%
                </TableCell>
                <TableCell className={`text-center ${accB > 0.85 ? 'text-green-500' : accB < 0.5 ? 'text-red-500' : 'text-yellow-500'}`}>
                  {(accB * 100).toFixed(1)}%
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Opponent DR</TableCell>
                <TableCell className="text-center">{(drB * 100).toFixed(1)}%</TableCell>
                <TableCell className="text-center">{(drA * 100).toFixed(1)}%</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Expected DPS</TableCell>
                <TableCell className={`text-center font-bold text-lg ${expectedDmgA > expectedDmgB ? 'text-green-500' : ''}`}>
                  {expectedDmgA.toFixed(2)}
                </TableCell>
                <TableCell className={`text-center font-bold text-lg ${expectedDmgB > expectedDmgA ? 'text-green-500' : ''}`}>
                  {expectedDmgB.toFixed(2)}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell colSpan={3} className="bg-muted/30 font-semibold py-2">Defensive Stats</TableCell>
              </TableRow>
              {[
                { label: 'EVA', key: 'EVA' },
                { label: 'Block', key: 'Block' },
                { label: 'SER', key: 'SER' },
                { label: 'Recovery', key: 'Recovery' }
              ].map(stat => (
                <TableRow key={stat.key}>
                  <TableCell className="font-medium">{stat.label}</TableCell>
                  <TableCell className={`text-center ${profileA[stat.key as keyof typeof profileA] > profileB[stat.key as keyof typeof profileB] ? 'text-green-500' : ''}`}>
                    {(profileA[stat.key as keyof typeof profileA] as number * 100).toFixed(2)}%
                  </TableCell>
                  <TableCell className={`text-center ${profileB[stat.key as keyof typeof profileB] > profileA[stat.key as keyof typeof profileA] ? 'text-green-500' : ''}`}>
                    {(profileB[stat.key as keyof typeof profileB] as number * 100).toFixed(2)}%
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="mt-8 p-4 bg-primary/10 rounded-lg border border-primary/20 text-center font-semibold">
            Verdict: {expectedDmgA > expectedDmgB 
              ? `Hero A has ${((expectedDmgA/expectedDmgB - 1)*100).toFixed(1)}% higher expected DPS.`
              : `Hero B has ${((expectedDmgB/expectedDmgA - 1)*100).toFixed(1)}% higher expected DPS.`}
            {Math.abs(pFirstA - 0.5) > 0.1 && (
              <span> {pFirstA > 0.5 ? 'Hero A' : 'Hero B'} has a significant initiative advantage.</span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
