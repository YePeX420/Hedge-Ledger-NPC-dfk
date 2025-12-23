import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Swords,
  Shield,
  Zap,
  Search,
  ExternalLink,
  ChevronDown,
  CheckCircle,
} from "lucide-react";
import { Link } from "wouter";

interface CombatSkill {
  class: string;
  tier: number;
  ability: string;
  discipline: string | null;
  descriptionRaw: string | null;
  range: number | null;
  manaCost: string | null;
  tags: string[];
}

interface CombatClass {
  class: string;
  sourceUrl: string;
  lastUpdateNote: string | null;
  maturity: string;
  disciplines: string[];
  summary: string | null;
  validated: boolean;
  lastSeenAt: string;
  skillCount: number;
  skills: CombatSkill[];
}

interface ClassesSummaryResponse {
  ok: boolean;
  classes: CombatClass[];
}

function MaturityBadge({ maturity }: { maturity: string }) {
  switch (maturity) {
    case "revised_through_tier_5":
      return (
        <Badge variant="default" className="bg-green-600" data-testid="badge-maturity-revised">
          Revised T1-5
        </Badge>
      );
    case "pre_alpha":
      return (
        <Badge variant="secondary" data-testid="badge-maturity-prealpha">
          Pre-Alpha
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" data-testid="badge-maturity-other">
          {maturity}
        </Badge>
      );
  }
}

function TierBadge({ tier }: { tier: number }) {
  const colors = [
    "bg-gray-500",
    "bg-green-600",
    "bg-blue-600",
    "bg-purple-600",
    "bg-orange-600",
    "bg-red-600",
  ];
  return (
    <Badge className={colors[Math.min(tier, 5)]} data-testid={`badge-tier-${tier}`}>
      T{tier}
    </Badge>
  );
}

function SkillsTable({ skills, className }: { skills: CombatSkill[]; className: string }) {
  const [tierFilter, setTierFilter] = useState<number | null>(null);
  
  const tiers = Array.from(new Set(skills.map(s => s.tier))).sort((a, b) => a - b);
  const disciplines = Array.from(new Set(skills.map(s => s.discipline).filter(Boolean)));
  
  const filteredSkills = tierFilter !== null 
    ? skills.filter(s => s.tier === tierFilter)
    : skills;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-sm text-muted-foreground">Filter by tier:</span>
        <Button
          variant={tierFilter === null ? "default" : "outline"}
          size="sm"
          onClick={() => setTierFilter(null)}
          data-testid={`button-filter-all-${className}`}
        >
          All ({skills.length})
        </Button>
        {tiers.map(tier => (
          <Button
            key={tier}
            variant={tierFilter === tier ? "default" : "outline"}
            size="sm"
            onClick={() => setTierFilter(tier)}
            data-testid={`button-filter-tier-${tier}-${className}`}
          >
            T{tier} ({skills.filter(s => s.tier === tier).length})
          </Button>
        ))}
      </div>
      
      {disciplines.length > 0 && (
        <div className="flex flex-wrap gap-1">
          <span className="text-sm text-muted-foreground mr-2">Disciplines:</span>
          {disciplines.map(d => (
            <Badge key={d} variant="outline" className="text-xs" data-testid={`badge-discipline-${d}`}>
              {d}
            </Badge>
          ))}
        </div>
      )}
      
      <div className="rounded-md border max-h-[400px] overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[60px]">Tier</TableHead>
              <TableHead>Ability</TableHead>
              <TableHead>Discipline</TableHead>
              <TableHead className="w-[60px]">Range</TableHead>
              <TableHead className="w-[60px]">Mana</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredSkills.map((skill, idx) => (
              <TableRow key={`${skill.ability}-${idx}`} data-testid={`row-skill-${skill.ability}`}>
                <TableCell>
                  <TierBadge tier={skill.tier} />
                </TableCell>
                <TableCell className="font-medium">{skill.ability}</TableCell>
                <TableCell className="text-muted-foreground">{skill.discipline || "-"}</TableCell>
                <TableCell>{skill.range ?? "-"}</TableCell>
                <TableCell>{skill.manaCost ? parseFloat(skill.manaCost).toFixed(0) : "-"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export default function CombatClassesPage() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");

  const { data, isLoading, error } = useQuery<ClassesSummaryResponse>({
    queryKey: ["/api/admin/hedge/combat/classes-summary"],
  });

  const validateMutation = useMutation({
    mutationFn: async ({ className, validated }: { className: string; validated: boolean }) => {
      const res = await apiRequest("PATCH", `/api/admin/hedge/combat/classes/${encodeURIComponent(className)}/validate`, { validated });
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/hedge/combat/classes-summary"] });
      toast({ 
        title: variables.validated ? "Class validated" : "Validation removed",
        description: `${variables.className} is now ${variables.validated ? "available" : "hidden"} to Hedge NPC`
      });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update validation", description: error.message, variant: "destructive" });
    },
  });

  const classes = data?.classes || [];
  
  const filteredClasses = searchQuery
    ? classes.filter(c => 
        c.class.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.skills.some(s => s.ability.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : classes;

  const totalSkills = classes.reduce((sum, c) => sum + c.skillCount, 0);
  const validatedCount = classes.filter(c => c.validated).length;

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2" data-testid="text-page-title">
            <Swords className="w-8 h-8" />
            Combat Class Summary
          </h1>
          <p className="text-muted-foreground mt-1">
            Overview of all hero classes and their combat skills
          </p>
        </div>
        <Link href="/admin/hedge/combat-sync">
          <Button variant="outline" data-testid="button-back-to-sync">
            Back to Combat Sync
          </Button>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card data-testid="card-total-classes">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">Total Classes</CardTitle>
            <Shield className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{isLoading ? <Skeleton className="h-8 w-16" /> : classes.length}</div>
          </CardContent>
        </Card>
        
        <Card data-testid="card-total-skills">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">Total Skills</CardTitle>
            <Zap className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{isLoading ? <Skeleton className="h-8 w-16" /> : totalSkills}</div>
          </CardContent>
        </Card>
        
        <Card data-testid="card-revised-classes">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">Revised Classes</CardTitle>
            <Swords className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoading ? <Skeleton className="h-8 w-16" /> : classes.filter(c => c.maturity === "revised_through_tier_5").length}
            </div>
          </CardContent>
        </Card>
        
        <Card data-testid="card-validated-classes">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">Validated for Hedge</CardTitle>
            <CheckCircle className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoading ? <Skeleton className="h-8 w-16" /> : (
                <span className={validatedCount > 0 ? "text-green-600" : ""}>{validatedCount}</span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-2">
        <Search className="w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search classes or skills..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-sm"
          data-testid="input-search"
        />
      </div>

      {isLoading && (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-4 w-48" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-24 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive">Failed to load combat classes: {(error as Error).message}</p>
          </CardContent>
        </Card>
      )}

      {!isLoading && !error && (
        <Accordion type="multiple" className="space-y-4">
          {filteredClasses.map((combatClass) => (
            <AccordionItem 
              key={combatClass.class} 
              value={combatClass.class}
              className="border rounded-lg px-4"
              data-testid={`accordion-class-${combatClass.class}`}
            >
              <AccordionTrigger className="hover:no-underline py-4">
                <div className="flex flex-wrap items-center gap-3 text-left">
                  <span className="font-bold text-lg">{combatClass.class}</span>
                  <MaturityBadge maturity={combatClass.maturity} />
                  {combatClass.validated && (
                    <Badge variant="default" className="bg-green-600" data-testid={`badge-validated-${combatClass.class}`}>
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Validated
                    </Badge>
                  )}
                  <Badge variant="outline" data-testid={`badge-skill-count-${combatClass.class}`}>
                    {combatClass.skillCount} skills
                  </Badge>
                  {combatClass.disciplines.length > 0 && combatClass.disciplines.map(d => (
                    <Badge key={d} variant="secondary" className="text-xs">
                      {d}
                    </Badge>
                  ))}
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-4">
                <div className="space-y-4">
                  <div className="flex items-center justify-between flex-wrap gap-4">
                    <div className="flex items-center gap-2">
                      <a 
                        href={combatClass.sourceUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-sm text-blue-500 hover:underline flex items-center gap-1"
                        data-testid={`link-source-${combatClass.class}`}
                      >
                        <ExternalLink className="w-3 h-3" />
                        View Official Documentation
                      </a>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Switch
                        id={`validate-${combatClass.class}`}
                        checked={combatClass.validated}
                        onCheckedChange={(checked) => 
                          validateMutation.mutate({ className: combatClass.class, validated: checked })
                        }
                        disabled={validateMutation.isPending}
                        data-testid={`switch-validate-${combatClass.class}`}
                      />
                      <Label htmlFor={`validate-${combatClass.class}`} className="text-sm">
                        {combatClass.validated ? "Validated for Hedge NPC" : "Mark as validated"}
                      </Label>
                    </div>
                  </div>
                  
                  {combatClass.lastUpdateNote && (
                    <p className="text-sm text-muted-foreground border-l-2 pl-3">
                      {combatClass.lastUpdateNote.substring(0, 200)}...
                    </p>
                  )}
                  
                  <SkillsTable skills={combatClass.skills} className={combatClass.class} />
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </div>
  );
}
