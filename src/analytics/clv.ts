export function closingLineValue(input: { takenOdds: number; closingOdds: number }): number {
  if (input.takenOdds <= 1 || input.closingOdds <= 1) return 0;
  return (input.takenOdds - input.closingOdds) / input.closingOdds;
}
