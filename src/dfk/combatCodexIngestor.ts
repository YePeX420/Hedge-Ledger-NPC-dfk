import * as cheerio from "cheerio";
import pLimit from "p-limit";
import puppeteer, { Browser } from "puppeteer";
import { db } from "../../server/db";
import { combatSources, combatKeywords, combatClassMeta, combatSkills, syncRuns, syncRunItems } from "@shared/schema";
import { eq, sql } from "drizzle-orm";

type RunStatus = "running" | "success" | "failed";
type ItemStatus = "success" | "skipped" | "failed";

const COMBAT_OVERVIEW_URL = "https://docs.defikingdoms.com/gameplay/combat";
const UA = process.env.HEDGE_BOT_UA || "HedgeLedgerBot/1.0 (combat-codex-ingestor)";
// v2: GitBook div-table parser with sibling row detection

let browserInstance: Browser | null = null;
let browserLaunchPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (browserInstance && browserInstance.connected) {
    return browserInstance;
  }
  
  if (browserLaunchPromise) {
    return browserLaunchPromise;
  }
  
  console.log("[CombatCodex] Launching Puppeteer browser...");
  browserLaunchPromise = puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--single-process',
    ],
  });
  
  browserInstance = await browserLaunchPromise;
  browserLaunchPromise = null;
  return browserInstance;
}

async function closeBrowser(): Promise<void> {
  if (browserInstance && browserInstance.connected) {
    await browserInstance.close();
    browserInstance = null;
  }
}

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

interface ExtractedSkill {
  skill_points: number | null;
  discipline: string | null;
  ability: string;
  description_raw: string | null;
  range: number | null;
  mana_cost: number | null;
  mana_growth: number | null;
  dod: number | null;
}

// Browser extraction script as a raw string to avoid esbuild/tsx transpilation issues
const EXTRACT_SKILLS_SCRIPT = `
(function() {
  function norm(s) {
    return (s || "").replace(/\\s+/g, " ").trim();
  }
  
  function parseNum(s) {
    var c = (s || "").replace(/[,]/g, "").trim();
    if (!c) return null;
    var n = Number(c);
    return Number.isFinite(n) ? n : null;
  }
  
  var skills = [];
  var debug = [];
  
  // Try GitBook div-tables first
  var rowGroups = document.querySelectorAll('div[class*="table_rowGroup__"]');
  debug.push("Found " + rowGroups.length + " rowGroups");
  
  if (rowGroups.length > 0) {
    for (var rgIdx = 0; rgIdx < rowGroups.length; rgIdx++) {
      var rowGroup = rowGroups[rgIdx];
      var headerCells = rowGroup.querySelectorAll(':scope > div');
      var headerTexts = [];
      for (var hc = 0; hc < headerCells.length; hc++) {
        headerTexts.push(norm(headerCells[hc].textContent || '').toLowerCase());
      }
      debug.push("RowGroup " + rgIdx + ": " + headerCells.length + " cells, headers=[" + headerTexts.slice(0,4).join(', ') + "]");
      
      // GitBook concatenates all headers into one div - check for ability/skill keywords
      // Headers look like: "skill pointsdisciplineabilitydescription..." when concatenated
      var combinedHeaders = headerTexts.join(' ');
      // Need both "ability" (or standalone "skill" that's not "skill points") AND "skill points" or "points"
      var hasAbility = combinedHeaders.indexOf('ability') >= 0 || combinedHeaders.indexOf('skill name') >= 0;
      var hasSkillPoints = combinedHeaders.indexOf('skill points') >= 0 || combinedHeaders.indexOf('points') >= 0;
      // Also match tables that have "skill" as a separate column (followed by something else like "description")
      if (!hasAbility && combinedHeaders.match(/skill[^p]/)) {
        hasAbility = true;
      }
      
      if (!hasAbility || !hasSkillPoints) {
        debug.push("  Skipping: hasAbility=" + hasAbility + ", hasSkillPoints=" + hasSkillPoints);
        continue;
      }
      
      debug.push("  Found skills table header!");
      
      var parent = rowGroup.parentElement;
      if (!parent) {
        debug.push("  No parent element");
        continue;
      }
      
      var siblings = parent.children;
      debug.push("  Parent has " + siblings.length + " children");
      var dataContainer = null;
      
      for (var i = 0; i < siblings.length; i++) {
        var sibling = siblings[i];
        if (sibling !== rowGroup && sibling.tagName.toLowerCase() === 'div') {
          debug.push("    Sibling " + i + ": " + sibling.children.length + " children");
          if (sibling.children.length > 2) {
            dataContainer = sibling;
            debug.push("    Using sibling " + i + " as data container");
            break;
          }
        }
      }
      
      if (!dataContainer) {
        debug.push("  No data container found");
        continue;
      }
      
      var dataRows = dataContainer.children;
      for (var ri = 0; ri < dataRows.length; ri++) {
        var row = dataRows[ri];
        var cells = row.querySelectorAll(':scope > div');
        var cellTexts = [];
        for (var ci = 0; ci < cells.length; ci++) {
          cellTexts.push(norm(cells[ci].textContent || ''));
        }
        
        if (cellTexts.length < 3) continue;
        
        var skill_points = parseNum(cellTexts[0] || "");
        var discipline = cellTexts[1] || null;
        var ability = cellTexts[2] || "";
        var description_raw = cellTexts[3] || null;
        var range = cellTexts[4] ? parseNum(cellTexts[4]) : null;
        
        var mana_cost = null;
        var mana_growth = null;
        if (cellTexts[5] && cellTexts[5].toLowerCase() !== 'passive') {
          var parts = cellTexts[5].split("/");
          for (var pi = 0; pi < parts.length; pi++) parts[pi] = parts[pi].trim();
          mana_cost = parts[0] ? parseNum(parts[0]) : null;
          mana_growth = parts[1] ? parseNum(parts[1]) : null;
        }
        
        var dod = cellTexts[6] ? parseNum(cellTexts[6]) : null;
        
        if (!ability) continue;
        
        skills.push({
          skill_points: skill_points,
          discipline: discipline,
          ability: ability,
          description_raw: description_raw,
          range: range,
          mana_cost: mana_cost,
          mana_growth: mana_growth,
          dod: dod
        });
      }
    }
  }
  
  // If no GitBook skills found, try standard HTML tables
  if (skills.length === 0) {
    var tables = document.querySelectorAll('table');
    for (var ti = 0; ti < tables.length; ti++) {
      var table = tables[ti];
      var headerEls = table.querySelectorAll('thead tr th');
      var headers = [];
      for (var hi = 0; hi < headerEls.length; hi++) {
        headers.push(norm(headerEls[hi].textContent || '').toLowerCase());
      }
      
      var combinedHeaders2 = headers.join(' ');
      var hasAbility2 = combinedHeaders2.indexOf('ability') >= 0 || combinedHeaders2.indexOf('skill name') >= 0;
      var hasPoints = combinedHeaders2.indexOf('skill points') >= 0 || combinedHeaders2.indexOf('points') >= 0;
      if (!hasAbility2 && combinedHeaders2.match(/skill[^p]/)) {
        hasAbility2 = true;
      }
      
      if (!hasAbility2 || !hasPoints) continue;
      
      var rows = table.querySelectorAll('tbody tr');
      for (var ri2 = 0; ri2 < rows.length; ri2++) {
        var row2 = rows[ri2];
        var tds = row2.querySelectorAll('td');
        var cells2 = [];
        for (var tdi = 0; tdi < tds.length; tdi++) {
          cells2.push(norm(tds[tdi].textContent || ''));
        }
        if (cells2.length < 3) continue;
        
        var skill_points2 = parseNum(cells2[0] || "");
        var discipline2 = cells2[1] || null;
        var ability2 = cells2[2] || "";
        var description_raw2 = cells2[3] || null;
        var range2 = cells2[4] ? parseNum(cells2[4]) : null;
        
        var mana_cost2 = null;
        var mana_growth2 = null;
        if (cells2[5] && cells2[5].toLowerCase() !== 'passive') {
          var parts2 = cells2[5].split("/");
          for (var pi2 = 0; pi2 < parts2.length; pi2++) parts2[pi2] = parts2[pi2].trim();
          mana_cost2 = parts2[0] ? parseNum(parts2[0]) : null;
          mana_growth2 = parts2[1] ? parseNum(parts2[1]) : null;
        }
        
        var dod2 = cells2[6] ? parseNum(cells2[6]) : null;
        
        if (!ability2) continue;
        
        skills.push({
          skill_points: skill_points2,
          discipline: discipline2,
          ability: ability2,
          description_raw: description_raw2,
          range: range2,
          mana_cost: mana_cost2,
          mana_growth: mana_growth2,
          dod: dod2
        });
      }
    }
  }
  
  // Detect maturity level
  var bodyText = (document.body.textContent || '').toLowerCase();
  var maturity = 'unknown';
  if (bodyText.indexOf('pre-alpha') >= 0) {
    maturity = 'pre_alpha';
  } else if (bodyText.indexOf('beyond tier 5') >= 0 && bodyText.indexOf('not yet been revised') >= 0) {
    maturity = 'revised_through_tier_5';
  }
  
  return { skills: skills, maturity: maturity, debug: debug };
})()
`;

async function extractSkillsFromPage(url: string): Promise<{html: string, skills: ExtractedSkill[], maturity: string}> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  
  try {
    await page.setUserAgent(UA);
    console.log(`[CombatCodex] Navigating to ${url}`);
    await page.goto(url, { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });
    console.log(`[CombatCodex] Page loaded for ${url}`);
    
    // Wait for content to load
    await page.waitForSelector('div[class*="table_rowGroup__"], table', { timeout: 10000 }).catch(() => {
      console.log(`[CombatCodex] No table found on ${url}, continuing anyway`);
    });
    
    console.log(`[CombatCodex] Starting page.evaluate for ${url}`);
    // Extract skills using raw JS string to avoid tsx transpilation issues
    let result: { skills: any[]; maturity: string; debug: string[] };
    try {
      result = await page.evaluate(EXTRACT_SKILLS_SCRIPT) as any;
    } catch (evalError: any) {
      console.error(`[CombatCodex] page.evaluate FAILED for ${url}: ${evalError?.message || evalError}`);
      result = { skills: [], maturity: 'error', debug: [`Error: ${evalError?.message}`] };
    }
    console.log(`[CombatCodex] page.evaluate completed for ${url}, skills=${result.skills.length}`);
    
    const html = await page.content();
    console.log(`[CombatCodex] Extracted ${result.skills.length} skills via page.evaluate from ${url}`);
    if (result.debug && result.debug.length > 0) {
      console.log(`[CombatCodex] Debug: ${result.debug.join(' | ')}`);
    }
    
    return {
      html,
      skills: result.skills as ExtractedSkill[],
      maturity: result.maturity,
    };
  } finally {
    await page.close();
  }
}

async function fetchRenderedHtml(url: string): Promise<string> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  
  try {
    await page.setUserAgent(UA);
    await page.goto(url, { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });
    
    await page.waitForSelector('table', { timeout: 10000 }).catch(() => {
      console.log(`[CombatCodex] No table found on ${url}, continuing anyway`);
    });
    
    const html = await page.content();
    return html;
  } finally {
    await page.close();
  }
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

function tryFindSkillsTable($: cheerio.CheerioAPI, debugUrl?: string) {
  // First try standard HTML tables
  const tables = $("table");
  console.log(`[CombatCodex] Found ${tables.length} HTML tables on ${debugUrl || 'page'}`);
  
  if (tables.length > 0) {
    tables.each((i, t) => {
      const headers = $(t).find("thead tr th").toArray().map(th => norm($(th).text()));
      console.log(`[CombatCodex]   Table ${i} headers: [${headers.join(", ")}]`);
    });
    
    const htmlTable = 
      findTableByHeaders($, ["Skill Points", "Discipline", "Ability", "Description"]) ||
      findTableByHeaders($, ["Skill Points", "Discipline", "Ability", "Description", "Range"]) ||
      findTableByHeaders($, ["Skill Points", "Ability", "Description"]) ||
      findTableByHeaders($, ["Points", "Ability", "Description"]);
    
    if (htmlTable) return htmlTable;
  }
  
  // GitBook uses div-based tables with class like "table_rowGroup__" or "table_tableWrapper__"
  const tableWrapper = $('div[class*="table_tableWrapper__"]').first();
  if (tableWrapper.length > 0) {
    console.log(`[CombatCodex] Found GitBook table wrapper`);
    return tableWrapper;
  }
  
  // Try to find table_rowGroup and return its parent
  const rowGroup = $('div[class*="table_rowGroup__"]').first();
  if (rowGroup.length > 0) {
    const parent = rowGroup.parent();
    console.log(`[CombatCodex] Found GitBook rowGroup, returning parent container`);
    return parent;
  }
  
  console.log(`[CombatCodex] No GitBook table structure found on ${debugUrl || 'page'}`);
  return null;
}

function parseGitBookSkillsTable($: cheerio.CheerioAPI, container: cheerio.Cheerio<any>) {
  const rows: any[] = [];
  
  // GitBook uses a specific structure:
  // - Parent contains: table_rowGroup (header) + sibling div (data rows)
  // Find the table_rowGroup and get its sibling containing data rows
  const rowGroup = container.find('[class*="table_rowGroup__"]').first();
  let dataContainer: cheerio.Cheerio<any>;
  
  if (rowGroup.length > 0) {
    // Data rows are in the next sibling of rowGroup's parent
    const parent = rowGroup.parent();
    const siblings = parent.children('div');
    console.log(`[CombatCodex] Found ${siblings.length} sibling containers`);
    
    // Usually: index 0 = header (table_rowGroup), index 1 = data rows
    if (siblings.length > 1) {
      dataContainer = siblings.eq(1);
    } else {
      dataContainer = rowGroup;
    }
  } else {
    // Fallback: container itself might have the rows
    dataContainer = container;
  }
  
  // Parse each row in the data container
  const dataRows = dataContainer.children('div');
  console.log(`[CombatCodex] Data container has ${dataRows.length} rows`);
  
  dataRows.each((_, rowEl) => {
    // Each row has cells as nested divs
    const cells = $(rowEl).children('div').toArray().map(cell => norm($(cell).text()));
    
    // Need at least: SkillPoints, Discipline, Ability
    if (cells.length < 3) {
      return; // Skip malformed rows
    }
    
    // Expected order: SkillPoints, Discipline, Ability, Description, Range, ManaCost/Growth, DoD
    const skill_points = parseNumberLoose(cells[0] || "");
    const discipline = cells[1] || null;
    const ability = cells[2] || "";
    const description_raw = cells[3] || null;
    const range = cells[4] ? parseNumberLoose(cells[4]) : null;
    
    // Mana Cost / Growth is often in format "1.25 / 0.75" or "Passive"
    let mana_cost: number | null = null;
    let mana_growth: number | null = null;
    if (cells[5] && cells[5].toLowerCase() !== 'passive') {
      const parts = cells[5].split("/").map(p => p.trim());
      mana_cost = parts[0] ? parseNumberLoose(parts[0]) : null;
      mana_growth = parts[1] ? parseNumberLoose(parts[1]) : null;
    }
    
    const dod = cells[6] ? parseNumberLoose(cells[6]) : null;
    
    if (!ability) return;
    
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
            console.log(`[CombatCodex] Extracting skills from ${url}`);
            
            // Use new page.evaluate approach for direct DOM extraction
            const { html, skills: skillRows, maturity } = await extractSkillsFromPage(url);
            const $ = cheerio.load(html);
            
            const className = parseClassNameFromUrl(url);
            const lastUpdateNote = extractLastUpdateNote($);
            const summary = norm(($("main").text() || $("body").text()).slice(0, 320));

            if (!skillRows.length) {
              await upsertItem({ itemType: "class_url", itemKey: url, status: "skipped", detail: "No skills found", skillsCount: 0 });
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

    // Close browser after processing all classes
    await closeBrowser();
    console.log("[CombatCodex] Browser closed, ingestion complete");

    return { ok: true, runId, discoveredUrls: discoveredUrls.length, keywords: keywords.length, classesAttempted: classUrls.length, classesIngested, skillsUpserted };
  } catch (e: any) {
    await closeBrowser();
    await updateRun({ status: "failed", error: e?.message ?? String(e) });
    throw e;
  }
}
