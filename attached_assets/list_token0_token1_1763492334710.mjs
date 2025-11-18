// list_pool_tokens_4col.mjs
// Crystalvale / DFK Chain — list pid, pool name, token0, token1 for all LP-Staking V2 pools.
// Node ≥ 18 → npm i ethers
// Run: node list_pool_tokens_4col.mjs

import { ethers } from "ethers";
import { promises as fs } from "fs";

/* ===== CONFIG ===== */
const RPC     = "https://subnets.avax.network/defi-kingdoms/dfk-chain/rpc";
const DIAMOND = "0xB04e8D6aED037904B77A9F0b08002592925833b7"; // LP-Staking V2 (DFK)
const SAVE_CSV = true; // set to false if you only want console output

/* ===== ABIs ===== */
const STAKING_ABI = [
  "function getPoolLength() view returns (uint256)",
  "function getPoolInfo(uint256) view returns (address lpToken,uint256 allocPoint,uint256 lastRewardBlock,uint256 accRewardPerShare,uint256 totalStaked)"
];
const PAIR_ABI = [
  "function token0() view returns (address)",
  "function token1() view returns (address)"
];
const ERC20_ABI = [ "function symbol() view returns (string)" ];

/* ===== Helpers ===== */
const provider = new ethers.JsonRpcProvider(RPC);
async function safeSym(addr) {
  try { return await new ethers.Contract(addr, ERC20_ABI, provider).symbol(); }
  catch { return "unknown"; }
}

(async () => {
  const code = await provider.getCode(DIAMOND);
  if (!code || code === "0x") throw new Error(`No contract code found at ${DIAMOND}`);

  const staking = new ethers.Contract(DIAMOND, STAKING_ABI, provider);
  const poolLen = Number(await staking.getPoolLength());

  const results = [];

  console.log(`DFK V2 Pools found: ${poolLen}\n`);
  console.log("pid | Pool (token0–token1)   | token0           | token1");
  console.log("----|-------------------------|------------------|----------------");

  for (let pid = 0; pid < poolLen; pid++) {
    try {
      const info = await staking.getPoolInfo(pid);
      const lp   = String(info.lpToken).toLowerCase();
      const pair = new ethers.Contract(lp, PAIR_ABI, provider);
      const [t0, t1] = await Promise.all([pair.token0(), pair.token1()]);
      const [s0, s1] = await Promise.all([safeSym(t0), safeSym(t1)]);
      const poolName = `${s0}-${s1}`;
      console.log(
        String(pid).padStart(3), " |",
        poolName.padEnd(24), "|",
        s0.padEnd(16), "|",
        s1.padEnd(16)
      );
      results.push({ pid, pool: poolName, token0: s0, token1: s1 });
    } catch (e) {
      console.log(String(pid).padStart(3), "| (error reading pool)");
    }
  }

  if (SAVE_CSV) {
    const csv = ["pid,pool,token0,token1", ...results.map(r => `${r.pid},${r.pool},${r.token0},${r.token1}`)].join("\n");
    await fs.writeFile("pool_tokens.csv", csv);
    console.log("\nSaved: pool_tokens.csv");
  }

  console.log("\nEach row shows the staking pool id (pid), full pool name, and token0/token1 symbols.");
})();
