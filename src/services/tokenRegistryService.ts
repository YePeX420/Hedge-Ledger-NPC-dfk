import { db } from '../../server/db.js';
import { tokenRegistry, InsertTokenRegistry } from '../../shared/schema.js';
import { eq, sql } from 'drizzle-orm';

const ROUTESCAN_API_BASE = 'https://api.routescan.io/v2/network/mainnet/evm/53935/etherscan/api';
const ROUTESCAN_TOKENS_PAGE = 'https://53935.routescan.io/tokens';

interface TokenInfo {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  holders?: number;
}

async function fetchTokenInfo(contractAddress: string): Promise<TokenInfo | null> {
  try {
    const url = `${ROUTESCAN_API_BASE}?module=token&action=tokeninfo&contractaddress=${contractAddress}`;
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.status === '1' && data.result && data.result.length > 0) {
      const token = data.result[0];
      return {
        address: contractAddress.toLowerCase(),
        symbol: token.symbol || 'UNKNOWN',
        name: token.name || 'Unknown Token',
        decimals: parseInt(token.decimals) || 18,
        holders: token.holdersCount ? parseInt(token.holdersCount) : undefined,
      };
    }
    return null;
  } catch (error) {
    console.error(`[TokenRegistry] Failed to fetch token info for ${contractAddress}:`, error);
    return null;
  }
}

async function fetchTokensFromRouteScan(): Promise<TokenInfo[]> {
  const tokens: TokenInfo[] = [];
  
  try {
    const response = await fetch(ROUTESCAN_TOKENS_PAGE);
    const html = await response.text();
    
    const addressPattern = /href="\/token\/(0x[a-fA-F0-9]{40})"/g;
    const foundAddresses = new Set<string>();
    let match;
    
    while ((match = addressPattern.exec(html)) !== null) {
      foundAddresses.add(match[1].toLowerCase());
    }
    
    console.log(`[TokenRegistry] Found ${foundAddresses.size} token addresses on RouteScan`);
    
    const addressList = Array.from(foundAddresses).slice(0, 100);
    
    for (const address of addressList) {
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const tokenInfo = await fetchTokenInfo(address);
      if (tokenInfo) {
        tokens.push(tokenInfo);
        console.log(`[TokenRegistry] Fetched: ${tokenInfo.symbol} (${tokenInfo.address.slice(0, 10)}...)`);
      }
    }
  } catch (error) {
    console.error('[TokenRegistry] Failed to fetch tokens page:', error);
  }
  
  return tokens;
}

const KNOWN_DFK_TOKENS: TokenInfo[] = [
  { address: '0xccb93dabd71c8dad03fc4ce5559dc3d89f67a260', symbol: 'JEWEL', name: 'Jewels', decimals: 18 },
  { address: '0x04b9da42306b023f3572e106b11d82aad9d32ebb', symbol: 'CRYSTAL', name: 'Crystals', decimals: 18 },
  { address: '0x77f2656d04e158f915bc22f07b779d94c1dc47ff', symbol: 'xJEWEL', name: 'xJEWEL', decimals: 18 },
  { address: '0x6e7185872bcdf3f7a6cbbe81356e50daffb002d2', symbol: 'xCRYSTAL', name: 'xCRYSTAL', decimals: 18 },
  { address: '0xb57b60debdb0b8172bb6316a9164bd3c695f133a', symbol: 'AVAX', name: 'Avalanche', decimals: 18 },
  { address: '0xfa9343c3897324496a05fc75abed6bac29f8a40f', symbol: 'ETH', name: 'Ethereum', decimals: 18 },
  { address: '0x3ad9dfe640e1a9cc1d9b0948620820d975c3803a', symbol: 'USDC', name: 'USD Coin', decimals: 6 },
  { address: '0x471ece3750da237f93b8e339c536989b8978a438', symbol: 'KLAY', name: 'Klaytn', decimals: 18 },
  { address: '0xfe6b19286885a4f7f55adad09c3cd1f906d23296', symbol: 'WJEWEL', name: 'Wrapped Jewel', decimals: 18 },
  { address: '0xca55f9c4e77f7b8524178583b0f7c798de17fd54', symbol: 'cJEWEL', name: 'Locked Jewel', decimals: 18 },
  { address: '0x52285d426120ab91f378b3df4a15a036a62200ae', symbol: 'sJEWEL', name: 'Staked Jewel', decimals: 18 },
  { address: '0x44e23b1f3f4511b2a8fd529d38c6d93c45cf9f8e', symbol: 'BTC.b', name: 'Bitcoin (Bridged)', decimals: 8 },
  { address: '0xdfb83ef3b4f2fb39c0bbb6a7ccf7b7f87b58a2dd', symbol: 'DFKGOLD', name: 'DFK Gold', decimals: 3 },
  { address: '0x75e8d8676d774c9429fbb148b30e304b5542ac3d', symbol: 'DFKTEARS', name: 'Gaia\'s Tears', decimals: 0 },
];

export async function syncTokenRegistry(fullSync: boolean = false): Promise<{ added: number; updated: number; errors: number }> {
  let added = 0;
  let updated = 0;
  let errors = 0;
  
  console.log('[TokenRegistry] Starting sync...');
  
  let tokensToSync: TokenInfo[] = [...KNOWN_DFK_TOKENS];
  
  if (fullSync) {
    console.log('[TokenRegistry] Full sync - fetching from RouteScan...');
    const routeScanTokens = await fetchTokensFromRouteScan();
    
    const existingAddresses = new Set(tokensToSync.map(t => t.address.toLowerCase()));
    for (const token of routeScanTokens) {
      if (!existingAddresses.has(token.address.toLowerCase())) {
        tokensToSync.push(token);
      }
    }
  }
  
  for (const token of tokensToSync) {
    try {
      const existing = await db.select()
        .from(tokenRegistry)
        .where(eq(tokenRegistry.address, token.address.toLowerCase()))
        .limit(1);
      
      if (existing.length > 0) {
        await db.update(tokenRegistry)
          .set({
            symbol: token.symbol,
            name: token.name,
            decimals: token.decimals,
            holders: token.holders,
            lastUpdatedAt: new Date(),
          })
          .where(eq(tokenRegistry.address, token.address.toLowerCase()));
        updated++;
      } else {
        const insertData: InsertTokenRegistry = {
          address: token.address.toLowerCase(),
          symbol: token.symbol,
          name: token.name,
          decimals: token.decimals,
          holders: token.holders,
          chain: 'dfk',
        };
        await db.insert(tokenRegistry).values(insertData);
        added++;
      }
    } catch (error) {
      console.error(`[TokenRegistry] Error syncing ${token.symbol}:`, error);
      errors++;
    }
  }
  
  console.log(`[TokenRegistry] Sync complete: ${added} added, ${updated} updated, ${errors} errors`);
  return { added, updated, errors };
}

export async function getTokenByAddress(address: string): Promise<typeof tokenRegistry.$inferSelect | null> {
  const results = await db.select()
    .from(tokenRegistry)
    .where(eq(tokenRegistry.address, address.toLowerCase()))
    .limit(1);
  
  return results[0] || null;
}

export async function getTokenSymbol(address: string): Promise<string> {
  const token = await getTokenByAddress(address);
  return token?.symbol || 'UNKNOWN';
}

export async function getAllTokens(): Promise<typeof tokenRegistry.$inferSelect[]> {
  return await db.select().from(tokenRegistry).orderBy(tokenRegistry.symbol);
}

export async function getTokenMetadataMap(): Promise<Record<string, { symbol: string; decimals: number }>> {
  const tokens = await getAllTokens();
  const map: Record<string, { symbol: string; decimals: number }> = {};
  for (const token of tokens) {
    map[token.address.toLowerCase()] = {
      symbol: token.symbol,
      decimals: token.decimals ?? 18,
    };
  }
  return map;
}

export async function getTokenAddressMap(): Promise<Record<string, string>> {
  const tokens = await getAllTokens();
  const map: Record<string, string> = {};
  for (const token of tokens) {
    map[token.address.toLowerCase()] = token.symbol;
  }
  return map;
}
