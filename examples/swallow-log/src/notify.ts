export async function notify(payload: unknown) {
  try {
    await fetch("https://example.test/notify", { method: "POST", body: JSON.stringify(payload) });
  } catch (error) {
    console.log(error);
  }
}
