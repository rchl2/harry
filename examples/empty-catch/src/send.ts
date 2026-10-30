export async function send(payload: unknown) {
  try {
    await fetch("https://example.test/ingest", { method: "POST", body: JSON.stringify(payload) });
  } catch (error) {}
}
