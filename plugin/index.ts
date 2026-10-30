import { harness } from "./lib"
import { draft } from "./draft"
import { fileURLToPath } from "node:url"
import { Plugin } from "@opencode/plugin"
import { createHash } from "node:crypto"
import { read, skillLoader } from "./rules"
import { Harry, type Settings } from "./rpc"

const MAX_NAGS = 3

export default Plugin.define({
  id: "harry",

  async setup(ctx) {
    const directory = ctx.location.directory
    const pluginDir = fileURLToPath(new URL(".", import.meta.url))
    const h = harness(directory, pluginDir)
    const saved = (await ctx.storage.get("settings")) as Partial<Settings> | undefined
    const settings: Settings = {
      injectRules: saved?.injectRules ?? ctx.options.injectRules !== false,
      autoCheck: saved?.autoCheck ?? ctx.options.autoCheck !== false,
    }

    let rules = h.root ? await read(`${h.root}/rules/writing_styles.md`) : ""
    const loadSkill = skillLoader(ctx, h.root)

    if (rules) {
      await ctx.session.hook("context", (event) => {
        if (!settings.injectRules) return
        event.system.push({ type: "text", text: rules })
      })
    }

    await loadSkill()

    // the window may not know its directory yet; fall back to this plugin's location
    const at = (input: unknown) => {
      const { directory } = input as { directory?: string }
      return harness(directory ?? ctx.location.directory, pluginDir)
    }

    await ctx.rpc.register(Harry, {
      status: async () => ({ root: h.root, rules: rules ? rules.split("\n").length : 0 }),
      staged: async (input) => {
        const diff = await at(input).staged()
        return { staged: Boolean(diff.trim()) }
      },
      prepare: async (input) => {
        const { message } = input as { message?: string }
        const scoped = at(input)
        const diff = await scoped.staged()
        if (!diff.trim()) return { staged: false, findings: "", candidates: [] }

        const lint = await scoped.lint(diff)
        if (lint.clean && message) return { staged: true, findings: "", candidates: [message] }

        const fixed = message ? await scoped.suggest(message) : ""
        const candidates = await draft(ctx, diff, fixed || message || "")
        return { staged: true, findings: lint.output, candidates }
      },
      apply: async (input) => {
        const { message } = input as { message: string }
        await at(input).commit(message)
        return { message }
      },
      settings: async () => settings,
      setSettings: async (input) => {
        const patch = input as Partial<Settings>
        if (typeof patch.injectRules === "boolean") settings.injectRules = patch.injectRules
        if (typeof patch.autoCheck === "boolean") settings.autoCheck = patch.autoCheck
        await ctx.storage.set("settings", settings)
        return settings
      },
      reload: async () => {
        rules = h.root ? await read(`${h.root}/rules/writing_styles.md`) : ""
        await loadSkill()
        return { rules: rules ? rules.split("\n").length : 0 }
      },
      findings: async (input) => {
        const scoped = at(input)
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
        if (!settings.autoCheck) continue

        const sessionID = event.data.sessionID
        if ((nags.get(sessionID) ?? 0) >= MAX_NAGS) continue

        // one diff per turn end: hash it, then lint the same text
        const target = await scoped(sessionID)
        const diff = await target.working().catch(() => "")
        const hash = diff.trim() ? createHash("sha1").update(diff).digest("hex") : ""
        if (!hash || atTurnStart.get(sessionID) === hash) continue
        atTurnStart.set(sessionID, hash)

        const checked = await target.lint(diff).catch(() => null)
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
