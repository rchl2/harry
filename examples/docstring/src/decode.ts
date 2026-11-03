/** Returns the result. */
export function decode(body: unknown) {
  return JSON.parse(String(body));
}
