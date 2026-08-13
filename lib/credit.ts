/**
 * Utilization as a 0-100 percentage, for a credit card's progress bar.
 * Only actual debt (a negative balance) fills the bar - a credit card
 * sitting at zero or in the user's favor shows an empty bar, not a
 * negative one.
 */
export function utilizationPercent(balance: bigint, creditLimit: bigint): number {
  if (creditLimit <= 0n) return 0;
  const owed = balance < 0n ? -balance : 0n;
  const ratio = Number(owed) / Number(creditLimit);
  return Math.min(Math.max(ratio, 0), 1) * 100;
}
