// debug_dfk_lp_staking_fix.mjs
// DFK Chain (Crystalvale) — LP Staking (V2) diagnostics with checksum-safe address
// Node ≥ 18  ->  npm i ethers

import { ethers } from "ethers";

const RPC = "https://subnets.avax.network/defi-kingdoms/dfk-chain/rpc";

// ✅ Diamond (LP Staking V2) address on DFK Chain — LOWERCASE to bypass checksum enforcement
const LP_STAKING = "0xB04e8D6aED037904B77A9F0b08002592925833b7";

const provider = new ethers.JsonRpcProvider(RPC);

const SELECTORS = {
  getPoolLength: ethers.id("getPoolLength()").slice(0,10),     // 0x1a6865f9
  poolLength:    ethers.id("poolLength()").slice(0,10),        // 0x081e3eda
  getPoolInfo:   ethers.id("getPoolInfo(uint256)").slice(0,10),// 0x2d7c0b83
  poolInfo:      ethers.id("poolInfo(uint256)").slice(0,10),   // 0x8f2aead2
  getTotalAlloc: ethers.id("getTotalAllocPoint()").slice(0,10),// 0x01035ce0
  totalAllocOld: ethers.id("totalAllocPoint()").slice(0,10),   // 0x17caf6f1
};

async function safeCallRaw(addr, dataHex) {
  try {
    const raw = await provider.call({ to: addr, data: dataHex });
    return { ok: true, raw };
  } catch (e) {
    return { ok: false, error: e };
  }
}

function decodeU256(raw) {
  if (!raw || raw === "0x") return null;
  try {
    const [v] = ethers.AbiCoder.defaultAbiCoder().decode(["uint256"], raw);
    return v;
  } catch { return null; }
}

function decodePoolInfoNew(raw) {
  if (!raw || raw === "0x") return null;
  try {
    const [lpToken, allocPoint, lastRewardBlock, accRewardPerShare, totalStaked] =
      ethers.AbiCoder.defaultAbiCoder().decode(
        ["address","uint256","uint256","uint256","uint256"], raw
      );
    return { lpToken, allocPoint, lastRewardBlock, accRewardPerShare, totalStaked };
  } catch { return null; }
}

function decodePoolInfoOld(raw) {
  if (!raw || raw === "0x") return null;
  try {
    const [lpToken, allocPoint, lastRewardBlock, accGovTokenPerShare] =
      ethers.AbiCoder.defaultAbiCoder().decode(
        ["address","uint256","uint256","uint256"], raw
      );
    return { lpToken, allocPoint, lastRewardBlock, accGovTokenPerShare };
  } catch { return null; }
}

function u256Arg(n) {
  const hex = BigInt(n).toString(16).padStart(64, "0");
  return "0x" + hex;
}

async function main() {
  console.log("RPC:", RPC);
  const net = await provider.getNetwork().catch(()=>({}));
  const tip = await provider.getBlockNumber().catch(()=>0);
  console.log("chainId:", net?.chainId?.toString?.() ?? "?", " latestBlock:", tip);

  // 1) Code check
  const code = await provider.getCode(LP_STAKING);
  const size = (code?.length || 0)/2 - 1;
  console.log(`LP_STAKING: ${LP_STAKING}  codeSize=${size} bytes`);
  if (!code || code === "0x") {
    console.error("❌ No contract code at LP_STAKING. Double-check address / RPC.");
    return;
  }
  console.log("✅ Contract code present.\n");

  // 2) pool length probes
  console.log("== pool length probes ==");
  for (const [label, sel] of Object.entries({
    getPoolLength: SELECTORS.getPoolLength,
    poolLength:    SELECTORS.poolLength,
    getTotalAlloc: SELECTORS.getTotalAlloc,
    totalAllocOld: SELECTORS.totalAllocOld
  })) {
    const { ok, raw, error } = await safeCallRaw(LP_STAKING, sel);
    if (!ok) {
      console.log(`  ${label}(${sel}) error: ${error?.message || error}`);
      continue;
    }
    const decoded = decodeU256(raw);
    console.log(`  ${label}(${sel}) raw=${raw} decoded=${decoded ? decoded.toString() : "(undecodable)"}`);
  }

  // 3) poolInfo probes for pid 0..5 with both encodings
  console.log("\n== poolInfo probes (pid 0..5) ==");
  for (let pid = 0; pid <= 5; pid++) {
    const arg = u256Arg(pid).slice(2); // 32-byte hex (without 0x)
    const selNew = SELECTORS.getPoolInfo + arg;
    const selOld = SELECTORS.poolInfo    + arg;

    const { ok: okNew, raw: rawNew } = await safeCallRaw(LP_STAKING, selNew);
    const parsedNew = okNew ? decodePoolInfoNew(rawNew) : null;

    const { ok: okOld, raw: rawOld } = await safeCallRaw(LP_STAKING, selOld);
    const parsedOld = okOld ? decodePoolInfoOld(rawOld) : null;

    console.log(`  pid=${pid} getPoolInfo -> ${okNew ? rawNew : "ERR"} parsedNew=${parsedNew ? "OK" : "no"}`);
    console.log(`        poolInfo    -> ${okOld ? rawOld : "ERR"} parsedOld=${parsedOld ? "OK" : "no"}`);

    if (parsedNew) {
      console.log(`     new.lp=${parsedNew.lpToken} alloc=${parsedNew.allocPoint} totalStaked=${parsedNew.totalStaked}`);
    } else if (parsedOld) {
      console.log(`     old.lp=${parsedOld.lpToken} alloc=${parsedOld.allocPoint} accGovShare=${parsedOld.accGovTokenPerShare}`);
    }
  }

  // 4) Diamond Loupe (if present)
  console.log("\n== diamond loupe ==");
  const loupeAbi = [
    "function facetAddresses() view returns (address[])",
    "function facetFunctionSelectors(address) view returns (bytes4[])",
    "function facets() view returns (tuple(address facet, bytes4[] selectors)[])"
  ];
  const loupe = new ethers.Contract(LP_STAKING, loupeAbi, provider);

  try {
    const addrs = await loupe.facetAddresses();
    console.log(`  facetAddresses(): ${addrs.length}`);
    addrs.forEach((a,i)=> console.log(`    [${i}] ${a}`));

    for (let i=0;i<Math.min( addrs.length, 3 ); i++){
      const sels = await loupe.facetFunctionSelectors(addrs[i]);
      const list = (sels || []).map(s => s.toString());
      console.log(`    selectors[${i}] first20: ${list.slice(0,20).join(",")}${list.length>20?" …":""}`);
    }
  } catch (e) {
    console.log("  Loupe not available or facet calls reverted:", e?.message || e);
  }

  console.log("\nDiagnostics complete.");
}

main().catch((e)=>{ console.error("FATAL:", e); process.exit(1); });
