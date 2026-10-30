export async function loadFeed(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("http_" + response.status);
  const body = await response.json();
  if (!Array.isArray(body.items)) throw new Error("bad_payload");
  return body.items;
}
