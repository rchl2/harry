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
          const { message } = (await ctx.client.rpc(Harry).update({})) as Update
          ctx.toast.show({
            title: "Harry",
            description: message,
            variant: message.startsWith("Updated") ? "success" : "error",
            duration: 8000,
          })
        } catch (error) {
          ctx.toast.show({ title: "Harry", description: `Update failed: ${error}`, variant: "error", duration: 8000 })
        }
      },
    }))
  },
})
