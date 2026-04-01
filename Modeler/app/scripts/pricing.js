export const GAS_PRICE_GWEI = 0.11;

let cachedRate = null;

export async function getEthChfRate() {
  if (cachedRate !== null) return cachedRate;
  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=chf'
    );
    const data = await res.json();
    cachedRate = data?.ethereum?.chf ?? null;
  } catch {
    cachedRate = null;
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
