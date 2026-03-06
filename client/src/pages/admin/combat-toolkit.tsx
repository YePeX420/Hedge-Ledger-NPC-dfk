import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { 
  HeroStats, 
  computeHeroCombatProfile, 
  STARTER_WEAPONS, 
  Weapon,
  computeAccuracy,
  computeAttack
} from "@/lib/dfk-combat-formulas";
import { decodeEquipmentBonus, formatBonusLabel, EQUIPMENT_BONUS } from "@/lib/equipment-lookup";
import { Swords, Target, Lightbulb, Info, FlaskConical } from 'lucide-react';

const STATS_LIST: (keyof HeroStats)[] = ['STR', 'DEX', 'AGI', 'INT', 'WIS', 'VIT', 'END', 'LCK'];

const ROLE_WEIGHTS = {
  'Physical DPS': { STR: 3, DEX: 3, AGI: 2, LCK: 2, INT: 0, WIS: 0, VIT: 0, END: 0 },
  'Magical DPS': { INT: 3, WIS: 2, AGI: 2, LCK: 2, STR: 0, DEX: 0, VIT: 0, END: 0 },
  'Tank': { VIT: 3, END: 3, STR: 2, DEX: 0, AGI: 0, INT: 0, WIS: 0, LCK: 0 },
  'Support': { WIS: 3, VIT: 2, LCK: 2, STR: 0, DEX: 0, AGI: 0, INT: 0, END: 0 }
};

interface ScalarRow {
  enabled: boolean;
  stat: keyof HeroStats;
  sv: number;
  smb: number;
}

interface BonusRow {
  id: number;
  scalar: number;
}

const DEFAULT_SCALARS: ScalarRow[] = [
  { enabled: false, stat: 'STR', sv: 0.5, smb: 20 },
  { enabled: false, stat: 'DEX', sv: 0.3, smb: 15 },
  { enabled: false, stat: 'INT', sv: 0.5, smb: 20 },
];

const DEFAULT_BONUSES: BonusRow[] = [
  { id: 0, scalar: 0 },
  { id: 0, scalar: 0 },
  { id: 0, scalar: 0 },
  { id: 0, scalar: 0 },
];

function weaponToSimulator(w: Weapon) {
  const scalars: ScalarRow[] = [
    { enabled: true, stat: w.scalars[0]?.stat ?? 'STR', sv: w.scalars[0]?.sv ?? 0, smb: w.scalars[0]?.smb ?? 0 },
    w.scalars[1] ? { enabled: true, stat: w.scalars[1].stat, sv: w.scalars[1].sv, smb: w.scalars[1].smb } : { enabled: false, stat: 'DEX', sv: 0.3, smb: 15 },
    w.scalars[2] ? { enabled: true, stat: w.scalars[2].stat, sv: w.scalars[2].sv, smb: w.scalars[2].smb } : { enabled: false, stat: 'INT', sv: 0.5, smb: 20 },
  ];
  return {
    name: w.name,
    weaponType: w.type,
    baseDamage: w.baseAtk,
    accuracyReq: w.statReq,
    aar: w.AaR * 100,
    curveMod: w.curveMod,
    speedMod: 0,
    scalars,
    bonuses: DEFAULT_BONUSES.map(b => ({ ...b })),
    targetEvasion: 0,
  };
}

export default function AdminCombatToolkit() {
  const [stats, setStats] = useState<HeroStats>({
    STR: 10, DEX: 10, AGI: 10, INT: 10, WIS: 10, VIT: 10, END: 10, LCK: 10
  });
  const [level, setLevel] = useState(1);
  const [avgPartyLevel, setAvgPartyLevel] = useState(1);
  const [role, setRole] = useState<keyof typeof ROLE_WEIGHTS>('Physical DPS');

  const [simName, setSimName] = useState("");
  const [simType, setSimType] = useState<'Physical' | 'Magical'>('Physical');
  const [simBaseDamage, setSimBaseDamage] = useState(10);
  const [simAccuracyReq, setSimAccuracyReq] = useState(12);
  const [simAar, setSimAar] = useState(88);
  const [simCurveMod, setSimCurveMod] = useState(140);
  const [simSpeedMod, setSimSpeedMod] = useState(0);
  const [simScalars, setSimScalars] = useState<ScalarRow[]>(DEFAULT_SCALARS.map(s => ({ ...s })));
  const [simBonuses, setSimBonuses] = useState<BonusRow[]>(DEFAULT_BONUSES.map(b => ({ ...b })));
  const [simTargetEvasion, setSimTargetEvasion] = useState(0);

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
    let score = 0;
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
    return { stat: s, improvement: improvedScore - currentScore };
  }).sort((a, b) => b.improvement - a.improvement);

  const maxImprovement = statImprovements[0]?.improvement || 1;

  const bestPhysical = [...STARTER_WEAPONS]
    .filter(w => w.type === 'Physical')
    .map(w => ({ weapon: w, atk: computeAttack(w.baseAtk, w.scalars.map(s => ({ heroStatVal: stats[s.stat], sv: s.sv, smb: s.smb }))) }))
    .sort((a, b) => b.atk - a.atk)[0]?.weapon;

  const bestMagical = [...STARTER_WEAPONS]
    .filter(w => w.type === 'Magical')
    .map(w => ({ weapon: w, atk: computeAttack(w.baseAtk, w.scalars.map(s => ({ heroStatVal: stats[s.stat], sv: s.sv, smb: s.smb }))) }))
    .sort((a, b) => b.atk - a.atk)[0]?.weapon;

  const simHeroStat = simType === 'Physical' ? stats.DEX : (0.6 * stats.WIS + 0.4 * stats.DEX);
  const simRawAccuracy = computeAccuracy(simHeroStat, simAccuracyReq, simAar / 100, simCurveMod);
  const simEffectiveAccuracy = Math.max(0, simRawAccuracy - simTargetEvasion / 100);

  const enabledScalars = simScalars.filter(s => s.enabled);
  const simCurrentDamage = computeAttack(
    simBaseDamage,
    enabledScalars.map(s => ({ heroStatVal: stats[s.stat], sv: s.sv, smb: s.smb }))
  );
  const simMaxDamage = simBaseDamage + enabledScalars.reduce((sum, s) => sum + s.smb, 0);

  const decodedBonuses = useMemo(() => {
    return simBonuses
      .filter(b => b.id > 0)
      .map(b => decodeEquipmentBonus('weapon', b.id, b.scalar));
  }, [simBonuses]);

  const loadStarterWeapon = (name: string) => {
    const w = STARTER_WEAPONS.find(sw => sw.name === name);
    if (!w) return;
    const sim = weaponToSimulator(w);
    setSimName(sim.name);
    setSimType(sim.weaponType);
    setSimBaseDamage(sim.baseDamage);
    setSimAccuracyReq(sim.accuracyReq);
    setSimAar(sim.aar);
    setSimCurveMod(sim.curveMod);
    setSimSpeedMod(sim.speedMod);
    setSimScalars(sim.scalars);
    setSimBonuses(sim.bonuses);
    setSimTargetEvasion(sim.targetEvasion);
  };

  const updateScalar = (idx: number, field: keyof ScalarRow, value: any) => {
    setSimScalars(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  };

  const updateBonus = (idx: number, field: keyof BonusRow, value: number) => {
    setSimBonuses(prev => prev.map((b, i) => i === idx ? { ...b, [field]: value } : b));
  };

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
        <TabsList className="grid w-full grid-cols-4">
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
          <TabsTrigger value="simulator" data-testid="tab-weapon-simulator">
            <FlaskConical className="w-4 h-4 mr-2" />
            Weapon Simulator
          </TabsTrigger>
        </TabsList>

        <TabsContent value="stats" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(profile).filter(([k]) => k !== 'Focus').map(([key, value]) => (
              <Card key={key} className="hover-elevate">
                <CardHeader className="pb-2 flex flex-row items-center justify-between gap-1">
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
                      <div className="flex items-center gap-2 flex-wrap">
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
            <CardHeader className="flex flex-row items-center justify-between gap-1 flex-wrap">
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

        <TabsContent value="simulator" className="mt-6">
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Left panel: inputs */}
            <div className="flex-1 space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <CardTitle>Weapon Inputs</CardTitle>
                      <CardDescription>Enter weapon stats manually or load a starter weapon.</CardDescription>
                    </div>
                    <Select onValueChange={loadStarterWeapon}>
                      <SelectTrigger className="w-[180px]" data-testid="select-load-starter">
                        <SelectValue placeholder="Load starter..." />
                      </SelectTrigger>
                      <SelectContent>
                        {STARTER_WEAPONS.map(w => (
                          <SelectItem key={w.name} value={w.name}>{w.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Weapon Name (optional)</Label>
                      <Input
                        value={simName}
                        onChange={e => setSimName(e.target.value)}
                        placeholder="e.g. Iron Sword"
                        data-testid="input-sim-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Type</Label>
                      <Select value={simType} onValueChange={v => setSimType(v as any)}>
                        <SelectTrigger data-testid="select-sim-type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Physical">Physical</SelectItem>
                          <SelectItem value="Magical">Magical</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Base Damage</Label>
                      <Input
                        type="number"
                        value={simBaseDamage}
                        onChange={e => setSimBaseDamage(parseFloat(e.target.value) || 0)}
                        data-testid="input-sim-base-damage"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Speed Modifier</Label>
                      <Input
                        type="number"
                        value={simSpeedMod}
                        onChange={e => setSimSpeedMod(parseFloat(e.target.value) || 0)}
                        placeholder="Positive = faster"
                        data-testid="input-sim-speed-mod"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Accuracy Requirement</Label>
                      <Input
                        type="number"
                        value={simAccuracyReq}
                        onChange={e => setSimAccuracyReq(parseFloat(e.target.value) || 0)}
                        data-testid="input-sim-accuracy-req"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Accuracy at Req (%)</Label>
                      <Input
                        type="number"
                        value={simAar}
                        min={0}
                        max={100}
                        onChange={e => setSimAar(parseFloat(e.target.value) || 0)}
                        data-testid="input-sim-aar"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Curve Modifier</Label>
                      <Input
                        type="number"
                        value={simCurveMod}
                        onChange={e => setSimCurveMod(parseFloat(e.target.value) || 1)}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Damage Scalars</CardTitle>
                  <CardDescription className="text-xs">Enable up to 3 stat scalars. Uses hero stats from above.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {simScalars.map((s, idx) => (
                    <div key={idx} className="flex items-center gap-3">
                      <Checkbox
                        checked={s.enabled}
                        onCheckedChange={checked => updateScalar(idx, 'enabled', !!checked)}
                        data-testid={`checkbox-scalar-${idx}`}
                      />
                      <Select
                        value={s.stat}
                        onValueChange={v => updateScalar(idx, 'stat', v)}
                        disabled={!s.enabled}
                      >
                        <SelectTrigger className="w-[90px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATS_LIST.map(st => (
                            <SelectItem key={st} value={st}>{st}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex-1 space-y-1">
                        <Label className="text-xs text-muted-foreground">Scalar Value</Label>
                        <Input
                          type="number"
                          value={s.sv}
                          step={0.05}
                          onChange={e => updateScalar(idx, 'sv', parseFloat(e.target.value) || 0)}
                          disabled={!s.enabled}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="flex-1 space-y-1">
                        <Label className="text-xs text-muted-foreground">Max Bonus</Label>
                        <Input
                          type="number"
                          value={s.smb}
                          onChange={e => updateScalar(idx, 'smb', parseFloat(e.target.value) || 0)}
                          disabled={!s.enabled}
                          className="h-8 text-sm"
                        />
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Weapon Bonuses</CardTitle>
                  <CardDescription className="text-xs">Enter bonus IDs from the weapon's on-chain data. Decoded using DFK bonus tables.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {simBonuses.map((b, idx) => (
                    <div key={idx} className="flex items-center gap-3">
                      <div className="w-[70px] space-y-1">
                        <Label className="text-xs text-muted-foreground">Bonus ID</Label>
                        <Input
                          type="number"
                          value={b.id}
                          min={0}
                          onChange={e => updateBonus(idx, 'id', parseInt(e.target.value) || 0)}
                          className="h-8 text-sm"
                          data-testid={`input-bonus-id-${idx}`}
                        />
                      </div>
                      <div className="flex-1 space-y-1">
                        <Label className="text-xs text-muted-foreground">Scalar</Label>
                        <Input
                          type="number"
                          value={b.scalar}
                          onChange={e => updateBonus(idx, 'scalar', parseInt(e.target.value) || 0)}
                          disabled={b.id === 0}
                          className="h-8 text-sm"
                          data-testid={`input-bonus-scalar-${idx}`}
                        />
                      </div>
                      <div className="flex-1 pt-5">
                        {b.id > 0 ? (
                          <Badge variant="secondary" className="text-xs truncate max-w-full">
                            {(EQUIPMENT_BONUS.weapon as any)[b.id] ?? `ID ${b.id} (unknown)`}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Target Defender</CardTitle>
                  <CardDescription className="text-xs">Armor evasion reduces your effective hit chance.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <Label>Target Evasion (%)</Label>
                    <Input
                      type="number"
                      value={simTargetEvasion}
                      min={0}
                      max={100}
                      step={0.1}
                      onChange={e => setSimTargetEvasion(parseFloat(e.target.value) || 0)}
                      data-testid="input-sim-target-evasion"
                    />
                    <p className="text-xs text-muted-foreground">
                      Evasion is read from the defender's ArmorCore struct. Subtract from raw accuracy to get true hit chance.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right panel: results */}
            <div className="lg:w-[340px] space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">{simName || "Weapon"} Results</CardTitle>
                  <CardDescription className="text-xs">{simType} weapon — live simulation using hero stats above</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="text-xs text-muted-foreground uppercase font-semibold mb-1">
                      Effective Accuracy
                      {simTargetEvasion > 0 && (
                        <span className="ml-1 normal-case font-normal">(raw {(simRawAccuracy * 100).toFixed(1)}% − {simTargetEvasion}% evasion)</span>
                      )}
                    </div>
                    <div
                      className={`text-3xl font-bold ${getAccuracyColor(simEffectiveAccuracy)}`}
                      data-testid="text-sim-effective-accuracy"
                    >
                      {(simEffectiveAccuracy * 100).toFixed(1)}%
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {getFitRating(simEffectiveAccuracy)} fit •{" "}
                      {simType === 'Physical' ? `DEX ${stats.DEX}` : `Focus ${simHeroStat.toFixed(1)}`} vs req {simAccuracyReq}
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <div className="text-xs text-muted-foreground uppercase font-semibold mb-1">Damage Range</div>
                    <div className="text-2xl font-bold" data-testid="text-sim-damage-range">
                      {simBaseDamage} – {simMaxDamage.toFixed(1)}
                    </div>
                    <div className="text-xs text-muted-foreground">base – max (all scalars at cap)</div>
                  </div>

                  <div className="border-t pt-4">
                    <div className="text-xs text-muted-foreground uppercase font-semibold mb-1">Current Hero Damage</div>
                    <div className="text-2xl font-bold text-primary" data-testid="text-sim-current-damage">
                      {simCurrentDamage.toFixed(1)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {enabledScalars.length > 0
                        ? `With ${enabledScalars.map(s => s.stat).join(', ')} scalars`
                        : 'No scalars active'}
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <div className="text-xs text-muted-foreground uppercase font-semibold mb-1">Speed Modifier</div>
                    <div className={`text-xl font-bold ${simSpeedMod > 0 ? 'text-green-500' : simSpeedMod < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                      {simSpeedMod > 0 ? `+${simSpeedMod}` : simSpeedMod === 0 ? 'Neutral' : simSpeedMod}
                    </div>
                    <div className="text-xs text-muted-foreground">{simSpeedMod > 0 ? 'Faster initiative' : simSpeedMod < 0 ? 'Slower initiative' : 'No initiative bonus'}</div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Decoded Bonuses</CardTitle>
                  <CardDescription className="text-xs">DFK weapon bonus table — enter IDs in the left panel</CardDescription>
                </CardHeader>
                <CardContent data-testid="container-sim-bonuses">
                  {decodedBonuses.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No bonuses entered. Enter bonus IDs (1–41) in the left panel to see decoded effects.</p>
                  ) : (
                    <div className="space-y-2">
                      {decodedBonuses.map((d, idx) => (
                        <div key={idx} className="flex flex-col gap-0.5 p-2 bg-muted/30 rounded-md">
                          <span className="text-sm font-medium">{d.label}</span>
                          {d.abilityInfo && (
                            <span className="text-xs text-muted-foreground">
                              Active: {d.abilityInfo.active ?? '—'} / Passive: {d.abilityInfo.passive ?? '—'}
                            </span>
                          )}
                          {d.note && (
                            <span className="text-xs text-muted-foreground italic">{d.note}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
