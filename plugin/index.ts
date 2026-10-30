import { harness } from "./lib"
import { createHash } from "node:crypto"
import { fileURLToPath } from "node:url"
import { readFile } from "node:fs/promises"
import { Plugin, Skill } from "@opencode/plugin"

const MAX_CANDIDATES = 3
const MAX_NAGS = 3

export default Plugin.define({
  id: "harry",

  async setup(ctx) {
    const directory = ctx.location.directory
    const pluginDir = fileURLToPath(new URL(".", import.meta.url))
    const h = harness(directory, pluginDir)
    const inject = ctx.options.injectRules !== false

    const read = (path: string) => readFile(path, "utf8").catch(() => "")
    const rules = h.root ? await read(`${h.root}/rules/writing_styles.md`) : ""

    if (rules && inject) {
      await ctx.session.hook("context", (event) => {
        event.system.push({ type: "text", text: rules })
      })
    }

    const skill = h.root ? await read(`${h.root}/SKILL.md`) : ""
    if (skill) {
      await ctx.skill.transform((editor) => {
        editor.add({
          id: Skill.ID.make("harry"),
          name: Skill.Name.make("harry"),
          description: "Rules and a checker for the prose you ship with code",
          path: Skill.Info.fields.path.make(`${h.root}/SKILL.md`),
          content: skill,
        })
      })
    }

    async function draft(diff: string, seed: string): Promise<string[]> {
      const out = seed ? [seed] : []
      const selected = (await ctx.model.default()).data
      if (!selected) return out

      const { text } = await ctx.generate.text({
        prompt:
          "Write three commit subjects for this diff. Imperative mood, under " +
          "fifty characters, no trailing period, no 'we'. One per line, no " +
          "numbering, no fences.\n\n" + diff.slice(0, 6000),
        model: { providerID: selected.providerID, id: selected.id },
      })

      for (const line of text.split("\n")) {
        const subject = line.replace(/^\s*[-*\d.]+\)?\s*/, "").trim()
        if (subject && subject.length <= 60 && !out.includes(subject)) out.push(subject)
      }
      return out.slice(0, MAX_CANDIDATES)
    }

    await ctx.command.transform((editor) => {
      editor.add({
        name: "harry-status",
        description: "Show whether harry is loaded and where it points",
        execute: async ({ sessionID }) => {
          const lines = [
            `plugin: harry`,
            `harness: ${h.root ?? "(not found)"}`,
            `found: ${h.root ? "yes" : "no"}`,
            `rules injected: ${rules && inject ? "yes" : "no"}`,
          ]
          await ctx.session.synthetic({ sessionID, text: lines.join("\n") })
        },
      })

      editor.add({
        name: "harry",
        description: "Lint the working diff for prose problems",
        execute: async ({ sessionID }) => {
          const diff = await h.working()
          const result = await h.lint(diff)
          await ctx.session.synthetic({
            sessionID,
            text: result.clean ? "Prose clean." : result.output,
          })
        },
      })

      editor.add({
        name: "commit",
        description: "Lint, suggest a message, and commit. `/commit 2` takes suggestion 2",
        execute: async ({ sessionID, prompt }) => {
          const arg = prompt.text.trim()
          const key = `commit:${sessionID}`

          if (/^\d+$/.test(arg)) {
            const stored = (await ctx.storage.get(key)) as string[] | undefined
            const chosen = stored?.[Number(arg) - 1]
            if (!chosen) {
              await ctx.session.synthetic({ sessionID, text: "No suggestion with that number. Run /commit again." })
              return
            }
            await h.commit(chosen)
            await ctx.storage.remove(key)
            await ctx.session.synthetic({ sessionID, text: `Committed: ${chosen}` })
            return
          }

          const diff = await h.staged()
          if (!diff.trim()) {
            await ctx.session.synthetic({ sessionID, text: "Nothing staged." })
            return
          }

          const result = await h.lint(diff)
          if (result.clean && arg) {
            await h.commit(arg)
            await ctx.session.synthetic({ sessionID, text: `Committed: ${arg}` })
            return
          }

          const fixed = arg ? await h.suggest(arg) : ""
          const candidates = await draft(diff, fixed || arg)

          if (result.clean && candidates[0]) {
            await h.commit(candidates[0])
            await ctx.session.synthetic({ sessionID, text: `Committed: ${candidates[0]}` })
            return
          }

          await ctx.storage.set(key, candidates)
          const list = candidates.map((c, i) => `${i + 1}. ${c}`).join("\n")
          await ctx.session.synthetic({
            sessionID,
            text: `${result.output}\n\nPick one with /commit <n>:\n${list}`,
          })
        },
      })
    })

    await ctx.tool.transform((editor) => {
      editor.add({
        name: "harry_check",
        description: "Lint the working diff for prose problems before handing work over",
        input: { type: "object", properties: {}, additionalProperties: false },
        execute: async () => {
          const diff = await h.working()
          const result = await h.lint(diff)
          return { content: result.clean ? "Prose clean." : result.output }
        },
      })
    })

    if (ctx.options.autoCheck === false) return

    const checked = new Map<string, string>()
    const nags = new Map<string, number>()
    const controller = new AbortController()

    void (async () => {
      for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
        if (event.type === "session.inbox.delivered") {
          nags.delete(event.data.sessionID)
          continue
        }
        if (event.type !== "session.execution.succeeded") continue
        const sessionID = event.data.sessionID
        if ((nags.get(sessionID) ?? 0) >= MAX_NAGS) continue

        const diff = await h.working().catch(() => "")
        if (!diff.trim()) continue

        const hash = createHash("sha1").update(diff).digest("hex")
        if (checked.get(sessionID) === hash) continue
        checked.set(sessionID, hash)

        const result = await h.lint(diff).catch(() => null)
        if (!result || result.clean) continue

        nags.set(sessionID, (nags.get(sessionID) ?? 0) + 1)
        await ctx.session
          .synthetic({ sessionID, text: `Prose check:\n${result.output}` })
          .catch(() => {})
      }
    })()

    return () => controller.abort()
  },
})
