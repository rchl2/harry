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

    // the RPC returns an array, but a stringified payload must not break the panel
    const toItems = (value: unknown): Findings["items"] => {
      if (Array.isArray(value)) return value as Findings["items"]
      if (typeof value !== "string") return []
      try {
        const parsed = JSON.parse(value)
        return Array.isArray(parsed) ? parsed : []
      } catch {
        return []
      }
    }

    const [findings, setFindings] = createStore<Record<string, Findings["items"]>>({})
    const [fixed, setFixed] = createStore<Record<string, Findings["items"]>>({})

    const refresh = async (directory: string) => {
      try {
        const before = findings[directory] ?? []
        const { items } = (await ctx.client.rpc(Harry).findings({ directory })) as Findings
        const fixed = before.filter(
          (old) => !items.some((now) => now.rule === old.rule && now.file === old.file && now.line === old.line),
        ).length
        setFindings(directory, items)
        if (fixed > 0) {
          ctx.toast.show({
            title: "Harry",
            description: items.length
              ? `Fixed ${fixed}, ${items.length} issues left.`
              : `Fixed ${fixed} issues. Prose is clean now.`,
            variant: "success",
          })
        }
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

    // the routed session, else the tab on screen; undefined on a draft
    const currentDirectory = () => {
      const routed = ctx.sessions.current()?.directory
      if (routed) return routed
      const active = ctx.tabs.list().find((tab) => tab.active)?.session
      return active?.location?.directory
    }

    const Row = (props: { item: Findings["items"][number] | string; directory: string }) => {
      const item = props.item
      if (typeof item === "string") return <text>{item}</text>
      return (
        <box
          flexDirection="column"
          onMouseDown={() => ctx.system.openExternal(`file://${props.directory}/${item.file}#L${item.line}`)}
        >
          <text>{item.rule}</text>
          <text>{item.message}</text>
          <text>
            {item.file}:{item.line}
          </text>
        </box>
      )
    }

    const Findings = (props: { session: MountedSession }) => {
      const open = toItems(findings[props.session.directory])
      const done = toItems(fixed[props.session.directory])

      return (
        <box flexDirection="column" gap={1}>
          <text>{open.length ? `${open.length} in these changes` : "No issues in these changes."}</text>
          {open.length > 0 && <text>Fixed on the next turn, or ask the agent now.</text>}
          <For each={open}>{(item) => <Row item={item} directory={props.session.directory} />}</For>
          {done.length > 0 && <text>{`Fixed (${done.length})`}</text>}
          <For each={done}>{(item) => <Row item={item} directory={props.session.directory} />}</For>
        </box>
      )
    }

    ctx.add(Panel, {
      id: "findings",
      region: "side",
      list: (): PanelTab[] => [{ id: "findings", title: "Harry", closable: "compact" }],
      render: (props) => <Findings session={props.session} />,
    })

    ctx.add(ComposerPill, {
      id: "findings",
      show: (input) => {
        const items = toItems(findings[input.session.directory])
        if (items.length === 0) return undefined
        return {
          id: "findings",
          icon: "circle-exclamation",
          label: `Harry found ${items.length} issue${items.length === 1 ? "" : "s"}`,
          title: `${items.length} issue${items.length === 1 ? "" : "s"} in these changes. Open for details.`,
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
        const directory = currentDirectory()
        try {
          const { items } = (await ctx.client.rpc(Harry).findings({ directory })) as Findings
          if (directory) setFindings(directory, items)
          ctx.toast.show({
            title: "Harry",
            description:
              items.length === 0
                ? `No issues in these changes.${directory ? "" : " (no directory)"}`
                : `${items.length} issue${items.length === 1 ? "" : "s"}. Open Harry above the chat to see them. Fixed on the next turn, or ask the agent now.`,
            variant: items.length === 0 ? "success" : "error",
            duration: 8000,
            actions:
              items.length && directory
                ? [
                    {
                      label: "Open",
                      run: () => {
                        const session = ctx.sessions.current()
                        if (session) open(session)
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
        const directory = currentDirectory()
        ctx.toast.show({ title: "Harry", description: "Reading the staged diff…", variant: "loading", persistent: true })

        const apply = async (message: string) => {
          try {
            await ctx.client.rpc(Harry).apply({ directory, message })
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

  },
})
