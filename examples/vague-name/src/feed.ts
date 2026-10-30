export async function firstTitle(url: string) {
  const data = await fetch(url).then((response) => response.json());
  return data.items[0].title;
}
