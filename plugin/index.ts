import { Harry } from "./rpc"
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

      const { text } = await ctx.experimental.generate.text({
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

    await ctx.rpc.register(Harry, {
      status: async () => ({ root: h.root, rules: rules ? rules.split("\n").length : 0 }),
      prepare: async (input) => {
        const { directory, message } = input as { directory?: string; message?: string }
        const scoped = harness(directory ?? ctx.location.directory, pluginDir)
        const diff = await scoped.staged()
        if (!diff.trim()) return { staged: false, findings: "", candidates: [] }

        const lint = await scoped.lint(diff)
        if (lint.clean && message) return { staged: true, findings: "", candidates: [message] }

        const fixed = message ? await scoped.suggest(message) : ""
        const candidates = await draft(diff, fixed || message || "")
        return { staged: true, findings: lint.output, candidates }
      },
      apply: async (input) => {
        const { directory, message } = input as { directory?: string; message: string }
        await harness(directory ?? ctx.location.directory, pluginDir).commit(message)
        return { message }
      },
      reload: async () => {
        rules = h.root ? await read(`${h.root}/rules/writing_styles.md`) : ""
        await loadSkill()
        return { rules: rules ? rules.split("\n").length : 0 }
      },
      findings: async (input) => {
        const { directory } = input as { directory?: string }
        const scoped = harness(directory ?? ctx.location.directory, pluginDir)
        const found = await scoped.findings(await scoped.working())
        return { items: found.map(({ rule, file, line, message }) => ({ rule, file, line, message })) }
      },
      lastUpdate: async () => {
        const stored = (await ctx.storage.get("update-result")) as { message: string } | undefined
        await ctx.storage.remove("update-result")
        return { message: stored?.message ?? null }
      },
      update: async () => {
        const message = await h.update()
        await ctx.storage.set("update-result", { message })
        return { message }
      },
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
          return { content: result.clean ? "Prose is clean." : result.output }
        },
      })
    })

    if (ctx.options.autoCheck === false) return

    const atTurnStart = new Map<string, string>()
    const nags = new Map<string, number>()
    const controller = new AbortController()

    // a global install is bound to the home directory, so scope every check to the session
    const scoped = async (sessionID: string) => {
      const session = await ctx.session.get({ sessionID }).catch(() => null)
      return harness(session?.location.directory ?? directory, pluginDir)
    }

    const hashOf = async (sessionID: string) => {
      const diff = await (await scoped(sessionID)).working().catch(() => "")
      return diff.trim() ? createHash("sha1").update(diff).digest("hex") : ""
    }

    void (async () => {
      for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
        if (event.type === "session.inbox.delivered") {
          const sessionID = event.data.sessionID
          nags.delete(sessionID)
          atTurnStart.set(sessionID, await hashOf(sessionID))
          continue
        }
        if (event.type !== "session.execution.succeeded") continue

        const sessionID = event.data.sessionID
        if ((nags.get(sessionID) ?? 0) >= MAX_NAGS) continue

        // only check when this turn changed the diff
        const hash = await hashOf(sessionID)
        if (!hash || atTurnStart.get(sessionID) === hash) continue
        atTurnStart.set(sessionID, hash)

        const target = await scoped(sessionID)
        const checked = await target.lint(await target.working().catch(() => "")).catch(() => null)
        if (!checked || checked.clean) continue

        nags.set(sessionID, (nags.get(sessionID) ?? 0) + 1)
        await ctx.session
          .synthetic({ sessionID, text: `Prose check:\n${checked.output}` })
          .catch(() => {})
      }
    })()

    return () => controller.abort()
  },
})
