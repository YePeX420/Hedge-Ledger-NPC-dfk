import * as cheerio from "cheerio";
import pLimit from "p-limit";
import { db } from "../../server/db";
import { combatSources, combatKeywords, combatClassMeta, combatSkills, syncRuns, syncRunItems } from "@shared/schema";
import { eq, sql } from "drizzle-orm";

type RunStatus = "running" | "success" | "failed";
type ItemStatus = "success" | "skipped" | "failed";

const COMBAT_OVERVIEW_URL = "https://docs.defikingdoms.com/gameplay/combat";
const UA = process.env.HEDGE_BOT_UA || "HedgeLedgerBot/1.0 (combat-codex-ingestor)";

function norm(s: string) {
  return (s || "").replace(/\s+/g, " ").trim();
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      "Accept": "text/html,application/xhtml+xml",
    },
  });
  if (!res.ok) throw new Error(`Fetch failed ${res.status} for ${url}`);
  return await res.text();
}

function findTableByHeaders($: cheerio.CheerioAPI, required: string[]) {
  const tables = $("table");
  for (let i = 0; i < tables.length; i++) {
    const t = tables.eq(i);
    const headers = t.find("thead tr th").toArray().map(th => norm($(th).text()).toLowerCase());
    const ok = required.every(h => headers.includes(h.toLowerCase()));
    if (ok) return t;
  }
  return null;
}

function extractLastUpdateNote($: cheerio.CheerioAPI) {
  const text = norm($("body").text());
  const idx = text.toLowerCase().indexOf("last update");
  if (idx === -1) return null;
  return text.slice(Math.max(0, idx - 40), Math.min(text.length, idx + 220));
}

function classifyMaturity($: cheerio.CheerioAPI) {
  const t = $("body").text().toLowerCase();
  if (t.includes("pre-alpha")) return "pre_alpha";
  if (t.includes("beyond tier 5") && t.includes("not yet been revised")) return "revised_through_tier_5";
  return "unknown";
}

function parseNumberLoose(s: string) {
  const c = (s || "").replace(/[,]/g, "").trim();
  if (!c) return null;
  const n = Number(c);
  return Number.isFinite(n) ? n : null;
}

function parseKeywordTable($: cheerio.CheerioAPI, table: cheerio.Cheerio<any>) {
  const out: { keyword: string; definition: string }[] = [];
  table.find("tbody tr").each((_, tr) => {
    const cells = $(tr).find("td").toArray().map(td => norm($(td).text()));
    if (cells.length < 2) return;
    const keyword = cells[0];
    const definition = cells.slice(1).join(" | ");
    if (!keyword || !definition) return;
    out.push({ keyword, definition });
  });
  return out;
}

function parseCombatKeywords(html: string) {
  const $ = cheerio.load(html);
  const table =
    findTableByHeaders($, ["Keyword", "Definition"]) ||
    $("table").filter((_, el) => {
      const headers = $(el).find("thead tr th").toArray().map(th => norm($(th).text()).toLowerCase());
      return headers.some(h => h.includes("keyword")) && headers.some(h => h.includes("definition"));
    }).first();

  if (!table || table.length === 0) return [];
  return parseKeywordTable($, table);
}

function parseClassNameFromUrl(url: string) {
  const last = url.split("/").filter(Boolean).pop() || url;
  return last.charAt(0).toUpperCase() + last.slice(1);
}

function discoverClassUrlsFromCombatIndex(html: string) {
  const $ = cheerio.load(html);
  const urls = new Set<string>();

  $("a[href]").each((_, a) => {
    const href = (($(a).attr("href") || "").trim());
    if (!href) return;

    let u: URL;
    try {
      u = href.startsWith("http") ? new URL(href) : new URL(href, COMBAT_OVERVIEW_URL);
    } catch {
      return;
    }

    if (u.hostname !== "docs.defikingdoms.com") return;

    const path = u.pathname.replace(/\/+$/, "");
    if (!path.startsWith("/gameplay/combat/")) return;
    if (path === "/gameplay/combat") return;

    urls.add(`https://docs.defikingdoms.com${path}`);
  });

  return [...urls].sort();
}

function parseSkillsTable($: cheerio.CheerioAPI, table: cheerio.Cheerio<any>) {
  const headers = table.find("thead tr th").toArray().map(th => norm($(th).text()));
  const idx = new Map<string, number>();
  headers.forEach((h, i) => idx.set(h.toLowerCase(), i));

  const findIdx = (cands: string[]) => {
    for (const c of cands) {
      const k = c.toLowerCase();
      if (idx.has(k)) return idx.get(k)!;
    }
    for (const [k, v] of idx.entries()) {
      for (const c of cands) if (k.includes(c.toLowerCase())) return v;
    }
    return null;
  };

  const iSkillPoints = findIdx(["skill points", "points"]);
  const iDiscipline  = findIdx(["discipline"]);
  const iAbility     = findIdx(["ability", "skill"]);
  const iDesc        = findIdx(["description", "effect"]);
  const iRange       = findIdx(["range"]);
  const iMana        = findIdx(["mana cost/growth", "mana cost / growth", "mana cost", "mana"]);
  const iDod         = findIdx(["dod", "degree of difficulty"]);

  const rows: any[] = [];

  table.find("tbody tr").each((_, tr) => {
    const cells = $(tr).find("td").toArray().map(td => norm($(td).text()));
    if (!cells.length) return;

    const ability = (iAbility !== null ? cells[iAbility] : "") || "";
    if (!ability) return;

    const discipline = iDiscipline !== null ? cells[iDiscipline] : null;
    const description_raw = iDesc !== null ? cells[iDesc] : null;
    const skill_points = iSkillPoints !== null ? parseNumberLoose(cells[iSkillPoints]) : null;
    const range = iRange !== null ? parseNumberLoose(cells[iRange]) : null;
    const dod = iDod !== null ? parseNumberLoose(cells[iDod]) : null;

    let mana_cost: number | null = null;
    let mana_growth: number | null = null;
    if (iMana !== null && cells[iMana]) {
      const parts = cells[iMana].split("/").map(p => p.trim());
      mana_cost = parts[0] ? parseNumberLoose(parts[0]) : null;
      mana_growth = parts[1] ? parseNumberLoose(parts[1]) : null;
    }

    rows.push({
      skill_points,
      discipline,
      ability,
      description_raw,
      range,
      mana_cost,
      mana_growth,
      dod,
    });
  });

  return rows;
}

function tryFindSkillsTable($: cheerio.CheerioAPI) {
  return (
    findTableByHeaders($, ["Skill Points", "Discipline", "Ability", "Description"]) ||
    findTableByHeaders($, ["Skill Points", "Discipline", "Ability", "Description", "Range"]) ||
    null
  );
}

export async function ingestCombatCodex(opts?: { discover?: boolean; concurrency?: number }) {
  const discover = opts?.discover ?? true;
  const concurrency = opts?.concurrency ?? 3;

  const [run] = await db.insert(syncRuns).values({
    domain: "combat_codex",
    status: "running",
    startedAt: new Date(),
  }).returning();
  
  const runId = run.id;

  const updateRun = async (patch: Partial<{
    status: RunStatus;
    discoveredUrls: number;
    keywordsUpserted: number;
    classesAttempted: number;
    classesIngested: number;
    skillsUpserted: number;
    ragDocsUpserted: number;
    error: string | null;
    log: any;
  }>) => {
    const updates: any = { ...patch };
    if (patch.status === "success" || patch.status === "failed") {
      updates.finishedAt = new Date();
    }
    await db.update(syncRuns).set(updates).where(eq(syncRuns.id, runId));
  };

  const upsertItem = async (item: { itemType: string; itemKey: string; status: ItemStatus; detail?: string | null; skillsCount?: number | null }) => {
    await db.insert(syncRunItems).values({
      syncRunId: runId,
      itemType: item.itemType,
      itemKey: item.itemKey,
      status: item.status,
      detail: item.detail ?? null,
      skillsCount: item.skillsCount ?? null,
      updatedAt: new Date(),
    });
  };

  try {
    const combatIndexHtml = await fetchHtml(COMBAT_OVERVIEW_URL);

    let discoveredUrls: string[] = [];
    if (discover) {
      discoveredUrls = discoverClassUrlsFromCombatIndex(combatIndexHtml);

      await db.insert(combatSources).values({
        url: COMBAT_OVERVIEW_URL,
        kind: "combat_overview",
        enabled: true,
        discoveredFrom: "auto_discovery",
        lastSeenAt: new Date(),
        createdAt: new Date(),
      }).onConflictDoUpdate({
        target: combatSources.url,
        set: { lastSeenAt: new Date() }
      });

      for (const url of discoveredUrls) {
        await db.insert(combatSources).values({
          url,
          kind: "combat_class",
          enabled: true,
          discoveredFrom: COMBAT_OVERVIEW_URL,
          lastSeenAt: new Date(),
          createdAt: new Date(),
        }).onConflictDoUpdate({
          target: combatSources.url,
          set: { lastSeenAt: new Date(), discoveredFrom: COMBAT_OVERVIEW_URL }
        });
      }

      await updateRun({ discoveredUrls: discoveredUrls.length });
    }

    const keywords = parseCombatKeywords(combatIndexHtml);
    for (const k of keywords) {
      await db.insert(combatKeywords).values({
        keyword: k.keyword,
        definition: k.definition,
        sourceUrl: COMBAT_OVERVIEW_URL,
        lastSeenAt: new Date(),
      }).onConflictDoUpdate({
        target: combatKeywords.keyword,
        set: { definition: k.definition, sourceUrl: COMBAT_OVERVIEW_URL, lastSeenAt: new Date() }
      });
    }
    await upsertItem({ itemType: "keywords", itemKey: COMBAT_OVERVIEW_URL, status: "success", detail: `Upserted ${keywords.length} keywords` });
    await updateRun({ keywordsUpserted: keywords.length });

    const classUrlsResult = await db.select({ url: combatSources.url })
      .from(combatSources)
      .where(eq(combatSources.kind, "combat_class"));
    const classUrls: string[] = classUrlsResult.filter((r: { url: string }) => r.url).map((r: { url: string }) => r.url);

    await updateRun({ classesAttempted: classUrls.length });

    const limit = pLimit(concurrency);
    let classesIngested = 0;
    let skillsUpserted = 0;

    await Promise.all(
      classUrls.map((url) =>
        limit(async () => {
          try {
            const html = await fetchHtml(url);
            const $ = cheerio.load(html);

            const className = parseClassNameFromUrl(url);
            const maturity = classifyMaturity($);
            const lastUpdateNote = extractLastUpdateNote($);
            const summary = norm(($("main").text() || $("body").text()).slice(0, 320));

            const table = tryFindSkillsTable($);
            if (!table) {
              await upsertItem({ itemType: "class_url", itemKey: url, status: "skipped", detail: "No skills table found", skillsCount: 0 });
              return;
            }

            const skillRows = parseSkillsTable($, table);
            if (!skillRows.length) {
              await upsertItem({ itemType: "class_url", itemKey: url, status: "skipped", detail: "Skills table empty", skillsCount: 0 });
              return;
            }

            await db.insert(combatClassMeta).values({
              class: className,
              sourceUrl: url,
              lastUpdateNote,
              maturity,
              disciplines: [],
              summary,
              lastSeenAt: new Date(),
            }).onConflictDoUpdate({
              target: combatClassMeta.class,
              set: {
                sourceUrl: url,
                lastUpdateNote,
                maturity,
                disciplines: [],
                summary,
                lastSeenAt: new Date(),
              }
            });

            let localUpserts = 0;
            for (const s of skillRows) {
              const tier = 0;

              await db.insert(combatSkills).values({
                class: className,
                tier,
                skillPoints: s.skill_points,
                discipline: s.discipline,
                ability: s.ability,
                descriptionRaw: s.description_raw,
                range: s.range,
                manaCost: s.mana_cost?.toString(),
                manaGrowth: s.mana_growth?.toString(),
                dod: s.dod?.toString(),
                tags: [],
                sourceUrl: url,
                lastSeenAt: new Date(),
              });
              localUpserts++;
            }

            classesIngested++;
            skillsUpserted += localUpserts;

            await upsertItem({ itemType: "class_url", itemKey: url, status: "success", detail: `Upserted ${localUpserts} skills`, skillsCount: localUpserts });
          } catch (e: any) {
            await upsertItem({ itemType: "class_url", itemKey: url, status: "failed", detail: e?.message ?? String(e) });
          }
        })
      )
    );

    await updateRun({
      classesIngested,
      skillsUpserted,
      status: "success",
      log: { note: "Combat codex ingest completed" },
    });

    return { ok: true, runId, discoveredUrls: discoveredUrls.length, keywords: keywords.length, classesAttempted: classUrls.length, classesIngested, skillsUpserted };
  } catch (e: any) {
    await updateRun({ status: "failed", error: e?.message ?? String(e) });
    throw e;
  }
}
