export const MAX_ITEMS = 20;

export function trim<T>(items: T[]) {
  return items.slice(0, MAX_ITEMS);
}
