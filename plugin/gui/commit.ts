import type { Context } from "@opencode/plugin/gui"
import { Harry, type Apply, type Prepare } from "../rpc"
import type { State } from "./state"

/** Lint the staged diff, offer subjects, and commit the pick. */
export async function commitFlow(ctx: Context, state: State, input?: string) {
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

    const picked = await ctx.dialogs.select({
      title: "Pick a commit message",
      options: prep.candidates.map((candidate) => ({ title: candidate, value: candidate })),
    })
    if (picked) await apply(picked)
  } catch (error) {
    ctx.toast.show({ title: "Harry", description: `Commit failed: ${error}`, variant: "error", duration: 8000 })
  }
}
