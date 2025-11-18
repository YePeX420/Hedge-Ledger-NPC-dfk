// pool_token_prices_progress.mjs
// Crystalvale / DFK Chain — compute live token prices for all LP-Staking V2 pools
// with progress bars + ETA for (1) pool reads and (2) price propagation.
// Saves absolute path to pool_token_prices.csv when finished.
//
// Node ≥ 18  →  npm i ethers
// Run        →  node pool_token_prices_progress.mjs
// Optional   →  node pool_token_prices_progress.mjs --base JEWEL

import { ethers } from "ethers";
import { promises as fs } from "fs";
import path from "path";
import { setTimeout as sleep } from "timers/promises";

/* ===== CONFIG ===== */
const RPC     = "https://subnets.avax.network/defi-kingdoms/dfk-chain/rpc";
const DIAMOND = "0xB04e8D6aED037904B77A9F0b08002592925833b7"; // LP-Staking V2 (DFK)
const PROGRESS_UPDATE_MS = 800; // refresh rate for progress bars

/* ===== ABIs ===== */
const STAKING_ABI = [
  "function getPoolLength() view returns (uint256)",
  "function getPoolInfo(uint256) view returns (address lpToken,uint256 allocPoint,uint256 lastRewardBlock,uint256 accRewardPerShare,uint256 totalStaked)"
];
const PAIR_ABI = [
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function getReserves() view returns (uint112 reserve0,uint112 reserve1,uint32 blockTimestampLast)"
];
const ERC20_ABI = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)"
];

/* ===== Helpers ===== */
const provider = new ethers.JsonRpcProvider(RPC);
const b = (x)=> BigInt(x.toString());
const toNum = (bi, dec)=> Number(bi) / 10**dec;

function progressWithETA(done, total, startMs, label, width=26) {
  const now = Date.now();
  const r = total>0 ? Math.min(Math.max(done/total,0),1) : 0;
  const full = Math.floor(r*width);
  const elapsed = Math.max((now - startMs)/1000, 0.001);
  const rate = done/elapsed;
  const remaining = Math.max(total - done, 0);
  const eta = rate>0 ? remaining / rate : 0;
  const m = Math.floor(eta/60);
  const s = Math.floor(eta%60);
  const bar = `[${"#".repeat(full)}${"-".repeat(width-full)}] ${(r*100).toFixed(1)}%`;
  process.stdout.write(`\r${label} ${bar} ETA ${m}m ${s}s`);
}

async function readSymDec(addr){
  const c = new ethers.Contract(addr, ERC20_ABI, provider);
  const [sym, dec] = await Promise.all([c.symbol().catch(()=>addr), c.decimals().catch(()=>18)]);
  return { sym: String(sym).toUpperCase(), dec: Number(dec) };
}

/* ===== MAIN ===== */
(async () => {
  const code = await provider.getCode(DIAMOND);
  if (!code || code === "0x") throw new Error(`No contract at diamond ${DIAMOND}`);

  const staking = new ethers.Contract(DIAMOND, STAKING_ABI, provider);
  const poolLen = Number(await staking.getPoolLength());

  // Token metadata and price graph
  const tokenMeta = new Map(); // addr -> {sym, dec}
  const graph = new Map();     // sym -> [{to, rate}]
  const addEdge = (aSym, bSym, rate)=>{
    if (!isFinite(rate) || rate <= 0) return;
    if (!graph.has(aSym)) graph.set(aSym, []);
    graph.get(aSym).push({ to: bSym, rate });
  };

  console.log(`Building price graph from ${poolLen} pools …`);
  const startPools = Date.now();
  let lastPrint = 0;

  for (let pid=0; pid<poolLen; pid++){
    try{
      const info = await staking.getPoolInfo(pid);
      const lp   = info.lpToken;
      const pair = new ethers.Contract(lp, PAIR_ABI, provider);
      const [t0, t1, rs] = await Promise.all([pair.token0(), pair.token1(), pair.getReserves()]);
      if (!tokenMeta.has(t0)) tokenMeta.set(t0, await readSymDec(t0));
      if (!tokenMeta.has(t1)) tokenMeta.set(t1, await readSymDec(t1));
      const m0 = tokenMeta.get(t0), m1 = tokenMeta.get(t1);
      const r0 = b(rs.reserve0), r1 = b(rs.reserve1);
      const p1per0 = toNum(r0, m0.dec) / toNum(r1, m1.dec);
      const p0per1 = toNum(r1, m1.dec) / toNum(r0, m0.dec);
      addEdge(m0.sym, m1.sym, p1per0);
      addEdge(m1.sym, m0.sym, p0per1);
    }catch{/* keep going */}
    const now = Date.now();
    if (now - lastPrint > PROGRESS_UPDATE_MS) {
      progressWithETA(pid+1, poolLen, startPools, "Pools processed");
      lastPrint = now;
    }
  }
  progressWithETA(poolLen, poolLen, startPools, "Pools processed");
  process.stdout.write("\n");

  // Determine base token
  const argBaseIdx = process.argv.indexOf("--base");
  const allSyms = new Set([...tokenMeta.values()].map(v=>v.sym));
  let baseSym = (argBaseIdx> -1 && process.argv[argBaseIdx+1]) ? process.argv[argBaseIdx+1].toUpperCase() : null;
  if (!baseSym || !allSyms.has(baseSym))
    baseSym = allSyms.has("USDC") ? "USDC" : (allSyms.has("CRYSTAL") ? "CRYSTAL" : [...allSyms][0]);

  // Propagate prices (BFS) with per-token progress
  console.log(`\nPropagating prices from base: ${baseSym} …`);
  const price = new Map(); // sym -> price in base
  price.set(baseSym, 1);
  const queue = [baseSym];
  const visited = new Set([baseSym]);
  const toVisitCount = allSyms.size;
  const startProp = Date.now();
  let processed = 0;
  lastPrint = 0;

  while (queue.length){
    const u = queue.shift();
    processed += 1;
    const now = Date.now();
    if (now - lastPrint > PROGRESS_UPDATE_MS) {
      progressWithETA(processed, toVisitCount, startProp, "Propagate ");
      lastPrint = now;
    }
    const edges = graph.get(u) || [];
    for (const {to, rate} of edges){
      const cand = (price.get(u) || 0) * rate;
      if (!price.has(to) || Math.abs(cand - price.get(to)) / Math.max(price.get(to) || 1, 1) > 0.0001){
        price.set(to, cand);
        if (!visited.has(to)) { visited.add(to); queue.push(to); }
      }
    }
    // avoid tight loop in degenerate graphs
    if (queue.length === 0 && processed < toVisitCount){
      // try to push any remaining tokens that have a priced neighbor
      for (const sym of allSyms){
        if (!visited.has(sym) && (graph.get(sym) || []).some(e => price.has(e.to))) {
          visited.add(sym); queue.push(sym);
        }
      }
    }
  }
  progressWithETA(toVisitCount, toVisitCount, startProp, "Propagate ");
  process.stdout.write("\n");

  // Output to console + CSV
  console.log(`\nBase token: ${baseSym}\n`);
  console.log("token".padEnd(12), `price_in_${baseSym}`.padStart(20), "reachable".padStart(12));
  console.log("-".repeat(46));
  const rows = [["token",`price_in_${baseSym}`,"reachable"]];
  const sorted = [...allSyms].sort();
  for (const sym of sorted){
    const p = price.get(sym);
    console.log(sym.padEnd(12), (p ? p.toFixed(8) : "N/A").padStart(20), String(!!p).padStart(12));
    rows.push([sym, p ? p.toString() : "N/A", p ? "true" : "false"]);
  }

  const outPath = path.resolve("pool_token_prices.csv");
  await fs.writeFile(outPath, rows.map(r=>r.join(",")).join("\n"));
  console.log(`\nSaved: ${outPath}`);

  const unreachable = sorted.filter(s=>!price.has(s));
  if (unreachable.length)
    console.log("\n⚠️  No price path to", baseSym, "for:", unreachable.join(", "));
})();

