import { Plugin } from "@opencode/plugin/tui"
import { Harry, type Evaluate, type Findings, type Reload, type Review, type Status } from "./rpc"

const GOLDENS =
  "Build a golden set for this project with Harry. From the Harry checkout, run " +
  "`python3 scripts/generate-goldens.py <this project's absolute path>`. It writes " +
  "`.harry/` inside that project. Prune `.harry/goldens.jsonl` to about five tasks " +
  "that cover different rules. Show me the list when you are done."

// The terminal UI, like the desktop window, calls the server over RPC so a
// command reports its result in a toast instead of spending a model turn.
export default Plugin.define({
  id: "harry-tui",
  setup(context) {
    const harry = context.client.rpc(Harry)

    // Follow the session, not the folder the terminal started in: /cd moves it.
    const currentSession = () => {
      const route = context.ui.router.current()
      const sessionID = route && "sessionID" in route ? route.sessionID : undefined
      return sessionID ? context.data.session.get(sessionID) : undefined
    }
    const directory = () =>
      currentSession()?.location?.directory ?? (context.location ?? context.data.location.default())?.directory

    const toast = (message: string, variant: "success" | "error" | "default" = "default") =>
      context.ui.toast.show({ title: "Harry", message, variant, duration: 8000 })

    context.keymap.layer(() => ({
      mode: "global",
      commands: [
        {
          id: "harry.status",
          title: "Harry status",
          group: "Harry",
          slash: { name: "harry-status" },
          run: async () => {
            const status = (await harry.status({})) as Status
            if (status.root) toast(`Loaded. ${status.rules} lines of rules from ${status.root}`, "success")
            else toast("Not loaded. Set HARRY_HARNESS to the folder holding run.py.", "error")
          },
        },
        {
          id: "harry.open",
          title: "Open harry rules",
          group: "Harry",
          slash: { name: "harry-open" },
          run: async () => {
            const { root } = (await harry.status({})) as Status
            if (!root) return toast("Rules not found. Set HARRY_HARNESS to the folder holding run.py.", "error")
            toast(`${root}/rules/writing_styles.md`)
          },
        },
        {
          id: "harry.check",
          title: "Check prose",
          group: "Harry",
          slash: { name: "harry" },
          run: async () => {
            const { items } = (await harry.findings({ directory: directory() })) as Findings
            if (items.length === 0) toast("No issues in these changes.", "success")
            else toast(`${items.length} issue${items.length === 1 ? "" : "s"}:\n${format(items)}`, "error")
          },
        },
        {
          id: "harry.review",
          title: "Review prose",
          group: "Harry",
          slash: { name: "harry-review" },
          run: async () => {
            const review = (await harry.review({ directory: directory() })) as Review
            toast(review.clean ? "Judged prose is clean." : review.output, review.clean ? "success" : "error")
          },
        },
        {
          id: "harry.commit",
          title: "Commit",
          group: "Harry",
          slash: { name: "commit", arguments: true },
          run: async (input?: string) => {
            const message = input?.trim() ?? ""
            const prepared = await harry.prepare({ directory: directory(), message: message || undefined })
            if (!prepared.staged) return toast("Nothing staged. Stage a change first.")
            if (prepared.findings) return toast(`Prose issues in the staged diff:\n${prepared.findings}`, "error")

            const candidates = message ? [message] : prepared.candidates
            if (candidates.length === 0) return toast("Nothing to commit.")

            const pick =
              candidates.length === 1
                ? candidates[0]
                : await context.ui.dialog.select({
                    title: "Pick a commit message",
                    options: candidates.map((candidate) => ({ title: candidate, value: candidate })),
                  })
            if (!pick) return

            await harry.apply({ directory: directory(), message: pick })
            toast(`Committed: ${pick}`, "success")
          },
        },
        {
          id: "harry.goldens",
          title: "Make goldens",
          group: "Harry",
          slash: { name: "harry-goldens" },
          run: async () => {
            const session = currentSession()
            if (!session) return toast("Open a session first.")
            await context.client.session.prompt({ sessionID: session.id, text: GOLDENS })
          },
        },
        {
          id: "harry.eval",
          title: "Run the goldens",
          group: "Harry",
          slash: { name: "harry-eval" },
          run: async () => {
            const { message } = (await harry.evaluate({ directory: directory() })) as Evaluate
            toast(message, message.includes("failed") ? "error" : "success")
          },
        },
        {
          id: "harry.reload",
          title: "Reload harry rules",
          group: "Harry",
          slash: { name: "harry-reload" },
          run: async () => {
            const { rules } = (await harry.reload({})) as Reload
            toast(rules ? `Reloaded ${rules} lines of rules.` : "No rules found.", rules ? "success" : "error")
          },
        },
        {
          id: "harry.update",
          title: "Update harry",
          group: "Harry",
          slash: { name: "harry-update" },
          run: async () => {
            const { message } = await harry.update({})
            toast(message, message.startsWith("Updated") ? "success" : "default")
          },
        },
      ],
    }))
  },
})

function format(items: Findings["items"]) {
  return items.map((item) => `${item.rule}:${item.line}  ${item.message}`).join("\n")
}
