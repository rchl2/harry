export function parse(body: unknown) {
  // const legacy = body as { items: unknown[] };
  if (typeof body !== "object" || body === null) throw new Error("bad_payload");
  return body;
}
