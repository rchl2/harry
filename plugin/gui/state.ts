import { createSignal } from "solid-js"
import { createStore } from "solid-js/store"
import { Harry, type Findings, type Settings } from "../rpc"
import type { Context, MountedSession } from "@opencode/plugin/gui"

export type State = ReturnType<typeof createState>

const asItems = (value: unknown): Findings["items"] | undefined => {
  if (Array.isArray(value)) return value as Findings["items"]
  if (value && typeof value === "object" && Array.isArray((value as Findings).items)) {
    return (value as Findings).items
  }
  return undefined
}

/** The RPC returns an array, but a stringified or wrapped payload must not break the panel. */
export const toItems = (value: unknown): Findings["items"] => {
  const direct = asItems(value)
  if (direct) return direct
  if (typeof value !== "string") return []
  try {
    return asItems(JSON.parse(value)) ?? []
  } catch {
    return []
  }
}

const same = (left: Findings["items"][number], right: Findings["items"][number]) =>
  left.rule === right.rule && left.file === right.file && left.line === right.line

export function createState(ctx: Context) {
  const [findings, setFindings] = createStore<Record<string, Findings["items"]>>({})
  const [fixed, setFixed] = createStore<Record<string, Findings["items"]>>({})
  const [settings, setSettings] = createSignal<Settings>({ injectRules: true, autoCheck: true })

  const open = (session: MountedSession) => ctx.layout.open(`${ctx.id}:findings`, session)

  // the routed session, else the tab on screen; undefined on a draft
  const currentDirectory = () => {
    const routed = ctx.sessions.current()?.directory
    if (routed) return routed
    const active = ctx.tabs.list().find((tab) => tab.active)?.session
    return active?.location?.directory
  }

  const refresh = async (directory: string, notify = false): Promise<Findings["items"] | null> => {
    try {
      const before = toItems(findings[directory])
      const { items } = (await ctx.client.rpc(Harry).findings({ directory })) as Findings
      const now = toItems(items)
      const resolved = before.filter((old) => !now.some((entry) => same(entry, old))).length
      const added = now.filter((entry) => !before.some((old) => same(entry, old))).length

      setFindings(directory, now)

      if (resolved > 0) {
        setFixed(directory, (history = []) => [...before.filter((old) => !now.some((e) => same(e, old))), ...history].slice(0, 20))
        ctx.toast.show({
          title: "Harry",
          description: now.length
            ? `Fixed ${resolved}, ${now.length} issues left.`
            : `Fixed ${resolved} issues. Prose is clean now.`,
          variant: "success",
        })
        return now
      }

      if (notify && added > 0) {
        ctx.toast.show({
          title: "Harry",
          description: `${now.length} issue${now.length === 1 ? "" : "s"}. Open Harry above the chat.`,
          variant: "error",
          duration: 8000,
          actions: [{ label: "Open", run: () => {
            const session = ctx.sessions.current()
            if (session) open(session)
          } }],
        })
      }
      return now
    } catch {
      // server down; keep the last count
      return null
    }
  }

  const loadSettings = () => {
    void ctx.client
      .rpc(Harry)
      .settings({})
      .then((value) => setSettings(value as Settings))
      .catch(() => {})
  }

  const save = async (patch: Partial<Settings>) => {
    setSettings({ ...settings(), ...patch })
    try {
      await ctx.client.rpc(Harry).setSettings(patch)
    } catch {
      // keep the optimistic value; the next load corrects it
    }
  }

  return { findings, fixed, settings, open, currentDirectory, refresh, loadSettings, save }
}
