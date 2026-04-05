export const GAS_PRICE_GWEI = 0.11;
export const DEFAULT_ETH_CHF_RATE = 3000; // static fallback if API and localStorage both unavailable

const CACHE_KEY = 'ethChfRate';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

let cachedRate = null;

export async function getEthChfRate() {
  if (cachedRate !== null) return cachedRate;

  // Use last known rate from localStorage while fetching
  try {
    const stored = JSON.parse(localStorage.getItem(CACHE_KEY));
    if (stored && Date.now() - stored.ts < CACHE_TTL_MS) {
      cachedRate = stored.rate;
      return cachedRate;
    }
  } catch { /* ignore parse errors */ }

  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=chf'
    );
    const data = await res.json();
    const rate = data?.ethereum?.chf ?? null;
    if (rate !== null) {
      cachedRate = rate;
      localStorage.setItem(CACHE_KEY, JSON.stringify({ rate, ts: Date.now() }));
    } else {
      // API responded but no rate — fall back to last persisted value, then static default
      const stored = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      cachedRate = stored?.rate ?? DEFAULT_ETH_CHF_RATE;
    }
  } catch {
    // Network/parse error — fall back to last persisted value, then static default
    try {
      const stored = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      cachedRate = stored?.rate ?? DEFAULT_ETH_CHF_RATE;
    } catch { cachedRate = DEFAULT_ETH_CHF_RATE; }
  }
  return cachedRate;
}

export function gasToCHF(gasUnits, ethChfRate) {
  if (!ethChfRate || !gasUnits) return null;
  const ethCost = (Number(gasUnits) * GAS_PRICE_GWEI) / 1e9;
  return ethCost * ethChfRate;
}

export function formatCHF(amount) {
  if (amount === null || amount === undefined) return null;
  return amount < 0.01 ? '< CHF 0.01' : `CHF ${amount.toFixed(4)}`;
}
