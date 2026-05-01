import { CURRENCIES } from "@/config/currencies";

export function formatCurrency(amount: number | string, currencyCode: string = "USD"): string {
  const num = Number(amount);
  if (isNaN(num)) return amount.toString();
  
  const currency = CURRENCIES.find(c => c.code === currencyCode) || CURRENCIES[0];
  
  const formattedAmount = new Intl.NumberFormat('en-US').format(num);
  
  if (currency.code === "USD") {
    return `${currency.symbol}${formattedAmount}`;
  }
  
  return `${formattedAmount} ${currency.symbol}`;
}
