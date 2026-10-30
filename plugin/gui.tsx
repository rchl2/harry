import { Command, Plugin } from "@opencode/plugin/gui"
import { Harry, type Status, type Update } from "./rpc"

export default Plugin.define({
  setup(ctx) {
    ctx.add(Command, () => ({
      id: "status",
      title: "Harry status",
      description: "Show whether harry found the harness",
      group: "Harry",
      slash: { name: "harry-status" },
      run: async () => {
        try {
          const status = (await ctx.client.rpc(Harry).status({})) as Status
          ctx.toast.show({
            title: "harry",
            description: status.root ? "harness found" : "harness not found",
            variant: status.root ? "success" : "error",
            duration: 6000,
          })
        } catch (error) {
          ctx.toast.show({ title: "harry", description: String(error), variant: "error", duration: 8000 })
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
        ctx.toast.show({ title: "harry", description: "Updating…", variant: "loading", persistent: true })
        try {
          const { message } = (await ctx.client.rpc(Harry).update({})) as Update
          ctx.toast.show({
            title: "harry",
            description: message,
            variant: message.startsWith("Updated") ? "success" : "error",
            duration: 8000,
          })
        } catch (error) {
          ctx.toast.show({ title: "harry", description: String(error), variant: "error", duration: 8000 })
        }
      },
    }))
  },
})
