import { createStore } from "solid-js/store"
import { Command, ComposerPill, createKeyed, Plugin } from "@opencode/plugin/gui"
import { Harry, type Findings, type LastUpdate, type Status } from "./rpc"

export default Plugin.define({
  setup(ctx) {
    // the update reloads this window, so the outcome is stored and shown by the next one
    void ctx.client
      .rpc(Harry)
      .lastUpdate({})
      .then((result) => {
        const { message } = result as LastUpdate
        if (!message) return
        ctx.toast.show({
          title: "Harry",
          description: message,
          variant: message.startsWith("Updated") ? "success" : "error",
          duration: 8000,
        })
      })
      .catch(() => {})

    const [findings, setFindings] = createStore<Record<string, Findings["items"]>>({})

    const refresh = async (directory: string) => {
      try {
        const { items } = (await ctx.client.rpc(Harry).findings({})) as Findings
        setFindings(directory, items)
      } catch {
        // server down; keep the last count
      }
    }

    createKeyed(
      () => ctx.sessions.current()?.key,
      () => {
        const session = ctx.sessions.current()
        if (!session) return
        void refresh(session.directory)
        // the listener is removed with this createKeyed run
        session.server.data.on("session.execution.succeeded", () => void refresh(session.directory))
      },
    )

    ctx.add(ComposerPill, {
      id: "findings",
      show: (input) => {
        const items = findings[input.session.directory] ?? []
        if (items.length === 0) return undefined
        return {
          id: "findings",
          icon: "circle-exclamation",
          label: `${items.length}`,
          title: "Prose findings",
          rows: items.slice(0, 8).map((item, index) => ({
            id: `${index}`,
            label: item.message,
            detail: `${item.rule} · line ${item.line}`,
          })),
        }
      },
    })

    ctx.add(Command, () => ({
      id: "status",
      title: "Harry status",
      description: "Show whether harry found the harness",
      group: "Harry",
      slash: { name: "harry-status" },
      run: async () => {
        try {
          const status = (await ctx.client.rpc(Harry).status({})) as Status
          ctx.toast.show(
            status.root
              ? { title: "Harry", description: "Loaded. The rules are in every request.", variant: "success" }
              : {
                  title: "Harry",
                  description: "Harness not found. Set HARRY_HARNESS to the folder holding run.py.",
                  variant: "error",
                  duration: 8000,
                },
          )
        } catch (error) {
          ctx.toast.show({ title: "Harry", description: `Status failed: ${error}`, variant: "error", duration: 8000 })
        }
      },
    }))

    ctx.add(Command, () => ({
      id: "update",
      title: "Update harry",
      description: "Reinstall from the repo and clear the cache",
      group: "Harry",
      slash: { name: "harry-update" },
      run: async () => {
        ctx.toast.show({ title: "Harry", description: "Reinstalling…", variant: "loading", persistent: true })
        try {
          await ctx.client.rpc(Harry).update({})
        } catch (error) {
          ctx.toast.show({ title: "Harry", description: `Update failed: ${error}`, variant: "error", duration: 8000 })
        }
      },
    }))

  },
})
