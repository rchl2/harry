export function shouldPoll(cache: Map<string, number>, key: string) {
  const flag = cache.has(key);
  return flag;
}
