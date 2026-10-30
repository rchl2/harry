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
    let rules = h.root ? await read(`${h.root}/rules/writing_styles.md`) : ""
    let skillReg: { dispose: () => Promise<void> } | undefined

    if (rules && inject) {
      await ctx.session.hook("context", (event) => {
        event.system.push({ type: "text", text: rules })
      })
    }

    async function loadSkill() {
      await skillReg?.dispose()
      skillReg = undefined
      const skill = h.root ? await read(`${h.root}/SKILL.md`) : ""
      if (!skill) return
      skillReg = await ctx.skill.transform((editor) => {
        editor.add({
          id: Skill.ID.make("harry"),
          name: Skill.Name.make("harry"),
          description: "Rules and a checker for the prose you ship with code",
          path: Skill.Info.fields.path.make(`${h.root}/SKILL.md`),
          content: skill,
        })
      })
    }

    await loadSkill()

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
        name: "harry-reload",
        description: "Re-read the rules and skill from disk after editing them",
        execute: async ({ sessionID }) => {
          rules = h.root ? await read(`${h.root}/rules/writing_styles.md`) : ""
          await loadSkill()
          await ctx.session.prompt({
            sessionID,
            text: rules ? `Reloaded ${rules.split("\n").length} lines of rules.` : "No rules found.",
          })
        },
      })

      editor.add({
        name: "harry",
        description: "Lint the working diff for prose problems",
        execute: async ({ sessionID }) => {
          const diff = await h.working()
          if (!diff.trim()) {
            await ctx.session.prompt({ sessionID, text: "Nothing to check." })
            return
          }
          await ctx.session.synthetic({ sessionID, text: "Checking…" })
          const result = await h.lint(diff)
          await ctx.session.prompt({
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
              await ctx.session.prompt({ sessionID, text: "No suggestion with that number. Run /commit again." })
              return
            }
            await h.commit(chosen)
            await ctx.storage.remove(key)
            await ctx.session.prompt({ sessionID, text: `Committed: ${chosen}` })
            return
          }

          const diff = await h.staged()
          if (!diff.trim()) {
            await ctx.session.prompt({ sessionID, text: "Nothing staged." })
            return
          }

          const result = await h.lint(diff)
          if (result.clean && arg) {
            await h.commit(arg)
            await ctx.session.prompt({ sessionID, text: `Committed: ${arg}` })
            return
          }

          const fixed = arg ? await h.suggest(arg) : ""
          const before = await ctx.session.get({ sessionID }).catch(() => null)
          const candidates = await draft(diff, fixed || arg)
          const after = await ctx.session.get({ sessionID }).catch(() => null)

          const spent = before && after ? after.cost - before.cost : 0
          const tokens = before && after
            ? after.tokens.input + after.tokens.output - before.tokens.input - before.tokens.output
            : 0
          const meter = tokens > 0 ? `\n\n${tokens} tokens, $${spent.toFixed(4)}` : ""

          if (result.clean && candidates[0]) {
            await h.commit(candidates[0])
            await ctx.session.prompt({ sessionID, text: `Committed: ${candidates[0]}${meter}` })
            return
          }

          await ctx.storage.set(key, candidates)
          const list = candidates.map((c, i) => `${i + 1}. ${c}`).join("\n")
          await ctx.session.prompt({
            sessionID,
            text: `${result.output}\n\nPick one with /commit <n>:\n${list}${meter}`,
          })
        },
      })
    })

    await ctx.tool.transform((editor) => {
      editor.add({
        name: "harry_check",
        description: "Lint the working diff for prose problems before handing work over",
        input: { type: "object", properties: {}, additionalProperties: false },
        execute: async (_input, context) => {
          const diff = await h.working()
          if (!diff.trim()) return { content: "Nothing to check." }
          await context.progress({ status: "checking prose" })
          const result = await h.lint(diff)
          return { content: result.clean ? "Prose clean." : result.output }
        },
      })
    })

    if (ctx.options.autoCheck === false) return

    const atTurnStart = new Map<string, string>()
    const nags = new Map<string, number>()
    const controller = new AbortController()

    const hashOf = async () => {
      const diff = await h.working().catch(() => "")
      return diff.trim() ? createHash("sha1").update(diff).digest("hex") : ""
    }

    void (async () => {
      for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
        if (event.type === "session.inbox.delivered") {
          const sessionID = event.data.sessionID
          nags.delete(sessionID)
          atTurnStart.set(sessionID, await hashOf())
          continue
        }
        if (event.type !== "session.execution.succeeded") continue

        const sessionID = event.data.sessionID
        if ((nags.get(sessionID) ?? 0) >= MAX_NAGS) continue

        // only check when this turn changed the diff
        const hash = await hashOf()
        if (!hash || atTurnStart.get(sessionID) === hash) continue
        atTurnStart.set(sessionID, hash)

        const result = await h.lint(await h.working().catch(() => "")).catch(() => null)
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
