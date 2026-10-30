import { For } from "solid-js"
import { createStore } from "solid-js/store"
import { Harry, type Apply, type Findings, type LastUpdate, type Prepare, type Reload, type Status } from "./rpc"
import { Command, ComposerPill, createKeyed, Panel, Plugin, type MountedSession, type PanelTab } from "@opencode/plugin/gui"

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
        const { items } = (await ctx.client.rpc(Harry).findings({ directory })) as Findings
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

    const open = (session: MountedSession) => ctx.layout.open(`${ctx.id}:findings`, session)

    const Findings = (props: { session: MountedSession }) => (
      <box flexDirection="column" gap={1}>
        <For each={findings[props.session.directory] ?? []}>
          {(item) => (
            <box
              flexDirection="column"
              onMouseDown={() =>
                ctx.system.openExternal(`file://${props.session.directory}/${item.file}#L${item.line}`)
              }
            >
              <text>{item.rule}</text>
              <text>{item.message}</text>
              <text>
                {item.file}:{item.line}
              </text>
            </box>
          )}
        </For>
      </box>
    )

    ctx.add(Panel, {
      id: "findings",
      region: "side",
      list: (): PanelTab[] => [{ id: "findings", title: "Harry", closable: "compact" }],
      render: (props) => <Findings session={props.session} />,
    })

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
            detail: `${item.rule} · ${item.file}:${item.line}`,
            run: () => open(input.session),
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
      id: "check",
      title: "Check prose",
      description: "Lint the working diff now",
      group: "Harry",
      slash: { name: "harry" },
      run: async () => {
        const session = ctx.sessions.current()
        if (!session) return
        try {
          const { items } = (await ctx.client.rpc(Harry).findings({ directory: session.directory })) as Findings
          setFindings(session.directory, items)
          ctx.toast.show({
            title: "Harry",
            description: items.length === 0 ? "Prose clean." : `${items.length} finding${items.length === 1 ? "" : "s"}`,
            variant: items.length === 0 ? "success" : "error",
            duration: 6000,
          })
        } catch (error) {
          ctx.toast.show({ title: "Harry", description: `Check failed: ${error}`, variant: "error", duration: 8000 })
        }
      },
    }))

    ctx.add(Command, (): Command => ({
      id: "commit",
      title: "Commit",
      description: "Lint, suggest a message, and commit",
      group: "Harry",
      slash: { name: "commit", arguments: true },
      run: async (input) => {
        const session = ctx.sessions.current()
        if (!session) return

        const apply = async (message: string) => {
          try {
            await ctx.client.rpc(Harry).apply({ directory: session.directory, message })
            ctx.toast.show({ title: "Harry", description: `Committed: ${message}`, variant: "success" })
          } catch (error) {
            ctx.toast.show({ title: "Harry", description: `Commit failed: ${error}`, variant: "error", duration: 8000 })
          }
        }

        try {
          const prep = (await ctx.client.rpc(Harry).prepare({
            directory: session.directory,
            message: input,
          })) as Prepare

          if (!prep.staged) {
            ctx.toast.show({ title: "Harry", description: "Nothing staged.", variant: "default" })
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
            title: "Commit message",
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
      description: "Re-read the rules and skill from disk",
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
