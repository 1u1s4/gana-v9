export function compactData<T extends object>(data: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(data as Record<string, unknown>).filter(([, value]) => value !== undefined));
}

export function takeArg(take?: number): Record<string, number> {
  return take === undefined ? {} : { take };
}
