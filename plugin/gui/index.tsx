import { registerPill } from "./pill"
import { createState } from "./state"
import { registerPanel } from "./panel"
import { registerSettings } from "./settings"
import { registerBadge } from "./badge"
import { registerCommands } from "./commands"
import { Harry, type LastUpdate, type Staged } from "../rpc"
import { commitFlow } from "./commit"
import { createKeyed, Plugin } from "@opencode/plugin/gui"

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

    const state = createState(ctx)
    state.loadSettings()

    createKeyed(
      () => ctx.sessions.current()?.key,
      () => {
        const session = ctx.sessions.current()
        if (!session) return
        void state.refresh(session.directory)
        // the listener is removed with this createKeyed run
        session.server.data.on("session.execution.succeeded", async () => {
          const items = await state.refresh(session.directory, true)
          if (!items || items.length > 0) return

          const { staged } = (await ctx.client.rpc(Harry).staged({ directory: session.directory })) as Staged
          if (!staged) return

          ctx.toast.show({
            title: "Harry",
            description: "No issues. Ready to commit.",
            variant: "success",
            duration: 10000,
            actions: [{ label: "Commit", run: () => void commitFlow(ctx, state) }],
          })
        })
      },
    )

    registerSettings(ctx, state)
    registerBadge(ctx, state)
    registerPanel(ctx, state)
    registerPill(ctx, state)
    registerCommands(ctx, state)
  },
})
