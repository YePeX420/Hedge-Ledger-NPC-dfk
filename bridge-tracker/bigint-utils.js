import Decimal from 'decimal.js';

Decimal.set({ precision: 50, rounding: Decimal.ROUND_DOWN });

export function hexToDecimalString(hex) {
  if (!hex) return '0';
  try {
    return BigInt(hex).toString();
  } catch {
    return '0';
  }
}

export function formatTokenAmount(rawAmount, decimals = 18) {
  if (!rawAmount) return '0';
  
  try {
    const raw = typeof rawAmount === 'bigint' ? rawAmount.toString() : 
                rawAmount.startsWith?.('0x') ? BigInt(rawAmount).toString() : 
                rawAmount;
    
    const amount = new Decimal(raw);
    const divisor = new Decimal(10).pow(decimals);
    return amount.div(divisor).toString();
  } catch {
    return '0';
  }
}

export function tokenAmountToUsd(rawAmount, decimals, priceUsd) {
  if (!rawAmount || !priceUsd) return null;
  
  try {
    const raw = typeof rawAmount === 'bigint' ? rawAmount.toString() : 
                rawAmount.startsWith?.('0x') ? BigInt(rawAmount).toString() : 
                rawAmount;
    
    const amount = new Decimal(raw);
    const divisor = new Decimal(10).pow(decimals);
    const tokenAmount = amount.div(divisor);
    const usd = tokenAmount.times(new Decimal(priceUsd));
    
    return {
      tokenAmount: tokenAmount.toFixed(8),
      usdValue: usd.toFixed(2),
      rawAmount: raw
    };
  } catch (err) {
    console.error('[BigInt] Error calculating USD value:', err.message);
    return null;
  }
}

export function sumUsdValues(values) {
  return values
    .filter(v => v != null)
    .reduce((sum, v) => {
      const current = new Decimal(sum);
      const add = new Decimal(v);
      return current.plus(add).toString();
    }, '0');
}

export function compareUsd(a, b) {
  const decA = new Decimal(a || '0');
  const decB = new Decimal(b || '0');
  return decA.minus(decB).toNumber();
}

export function subtractUsd(a, b) {
  const decA = new Decimal(a || '0');
  const decB = new Decimal(b || '0');
  return decA.minus(decB).toFixed(2);
}

export function addUsd(a, b) {
  const decA = new Decimal(a || '0');
  const decB = new Decimal(b || '0');
  return decA.plus(decB).toFixed(2);
}

export function parseUsdToNumber(usd) {
  if (!usd) return 0;
  return new Decimal(usd).toNumber();
}
