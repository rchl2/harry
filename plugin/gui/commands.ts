import { toItems, type State } from "./state"
import { Command, type Context } from "@opencode/plugin/gui"
import { Harry, type Apply, type Findings, type Prepare, type Reload, type Status } from "../rpc"

export function registerCommands(ctx: Context, state: State) {
  ctx.add(Command, () => ({
    id: "status",
    title: "Harry status",
    description: "Show whether harry is loaded in this window.",
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
                description: "Not loaded. Set HARRY_HARNESS to the folder holding run.py.",
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
    id: "check",
    title: "Check prose",
    description: "Lint now, without waiting for a turn",
    group: "Harry",
    slash: { name: "harry" },
    run: async () => {
      const directory = state.currentDirectory()
      try {
        const { items } = (await ctx.client.rpc(Harry).findings({ directory })) as Findings
        const now = toItems(items)
        if (directory) state.findings[directory] = now
        ctx.toast.show({
          title: "Harry",
          description:
            now.length === 0
              ? `No issues in these changes.${directory ? "" : " (no directory)"}`
              : `${now.length} issue${now.length === 1 ? "" : "s"}. Open Harry above the chat to see them. Fixed on the next turn, or ask the agent now.`,
          variant: now.length === 0 ? "success" : "error",
          duration: 8000,
          actions:
            now.length && directory
              ? [
                  {
                    label: "Open",
                    run: () => {
                      const session = ctx.sessions.current()
                      if (session) state.open(session)
                    },
                  },
                ]
              : undefined,
        })
      } catch (error) {
        ctx.toast.show({ title: "Harry", description: `Check failed: ${error}`, variant: "error", duration: 8000 })
      }
    },
  }))

  ctx.add(Command, (): Command => ({
    id: "commit",
    title: "Commit",
    description: "Lint the staged diff, suggest a message, and commit",
    group: "Harry",
    slash: { name: "commit", arguments: true },
    run: async (input) => {
      const directory = state.currentDirectory()
      ctx.toast.show({ title: "Harry", description: "Reading the staged diff…", variant: "loading", persistent: true })

      const apply = async (message: string) => {
        try {
          await ctx.client.rpc(Harry).apply({ directory, message } as Apply & { directory?: string })
          ctx.toast.show({ title: "Harry", description: `Committed: ${message}`, variant: "success" })
        } catch (error) {
          ctx.toast.show({ title: "Harry", description: `Commit failed: ${error}`, variant: "error", duration: 8000 })
        }
      }

      try {
        const prep = (await ctx.client.rpc(Harry).prepare({ directory, message: input })) as Prepare

        if (!prep.staged) {
          ctx.toast.show({ title: "Harry", description: "Nothing staged. Stage a change first.", variant: "default" })
          return
        }
        if (prep.candidates.length === 0) {
          ctx.toast.show({ title: "Harry", description: "Nothing to commit.", variant: "default" })
          return
        }
        if (!prep.findings && input) {
          await apply(input)
          return
        }
        if (prep.findings) {
          ctx.toast.show({ title: "Harry", description: prep.findings, variant: "error", duration: 8000 })
        }

        const picked = await ctx.dialogs.select({
          title: "Pick a commit message",
          options: prep.candidates.map((candidate) => ({ title: candidate, value: candidate })),
        })
        if (picked) await apply(picked)
      } catch (error) {
        ctx.toast.show({ title: "Harry", description: `Commit failed: ${error}`, variant: "error", duration: 8000 })
      }
    },
  }))

  ctx.add(Command, () => ({
    id: "reload",
    title: "Reload harry rules",
    description: "Re-read the rules after editing them",
    group: "Harry",
    slash: { name: "harry-reload" },
    run: async () => {
      try {
        const { rules } = (await ctx.client.rpc(Harry).reload({})) as Reload
        ctx.toast.show({
          title: "Harry",
          description: rules ? `Reloaded ${rules} lines of rules.` : "No rules found.",
          variant: rules ? "success" : "error",
        })
      } catch (error) {
        ctx.toast.show({ title: "Harry", description: `Reload failed: ${error}`, variant: "error", duration: 8000 })
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
      ctx.toast.show({ title: "Harry", description: "Reinstalling Harry…", variant: "loading", persistent: true })
      try {
        await ctx.client.rpc(Harry).update({})
      } catch (error) {
        ctx.toast.show({ title: "Harry", description: `Update failed: ${error}`, variant: "error", duration: 8000 })
      }
    },
  }))
}
