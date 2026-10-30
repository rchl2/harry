const MAX_CANDIDATES = 3

/** Commit subjects for a diff: the deterministic seed first, then model suggestions. */
export async function draft(ctx: any, diff: string, seed: string): Promise<string[]> {
  const out = seed ? [seed] : []
  const selected = (await ctx.model.default()).data
  if (!selected) return out

  const { text } = await ctx.experimental.generate.text({
    prompt:
      "Write three commit subjects for this diff. Imperative mood, under " +
      "fifty characters, no trailing period, no 'we'. One per line, no " +
      "numbering, no fences.\n\n" + diff.slice(0, 2000),
    model: { providerID: selected.providerID, id: selected.id },
  })

  for (const line of text.split("\n")) {
    const subject = line.replace(/^\s*[-*\d.]+\)?\s*/, "").trim()
    if (subject && subject.length <= 60 && !out.includes(subject)) out.push(subject)
  }
  return out.slice(0, MAX_CANDIDATES)
}
