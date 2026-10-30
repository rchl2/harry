const MAX_REDIRECTS = 4;

export async function safeFetch(url: string) {
  let current = url;
  for (let hop = 0; hop < MAX_REDIRECTS; hop += 1) {
    const response = await fetch(current, { redirect: "manual" });
    if (response.status < 300 || response.status >= 400) return response;
    const next = response.headers.get("location");
    if (!next) throw new Error("redirect_without_location");
    current = new URL(next, current).toString();
  }
  throw new Error("too_many_redirects");
}
