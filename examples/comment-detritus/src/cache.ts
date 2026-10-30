export function cacheKey(url: string) {
  // changed from a hash of the body because it was slow
  return `feed:${url}`;
}
