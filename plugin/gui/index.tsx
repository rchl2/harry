import { registerPill } from "./pill"
import { createState } from "./state"
import { registerPanel } from "./panel"
import { registerSettings } from "./settings"
import { registerCommands } from "./commands"
import { Harry, type LastUpdate } from "../rpc"
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
        session.server.data.on("session.execution.succeeded", () => void state.refresh(session.directory, true))
      },
    )

    registerSettings(ctx, state)
    registerPanel(ctx, state)
    registerPill(ctx, state)
    registerCommands(ctx, state)
  },
})
