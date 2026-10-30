import { For } from "solid-js"
import type { Findings } from "../rpc"
import { toItems, type State } from "./state"
import { Panel, type Context, type MountedSession, type PanelTab } from "@opencode/plugin/gui"

const Row = (ctx: Context, props: { item: Findings["items"][number] | string; directory: string }) => {
  const item = props.item
  if (typeof item === "string") return <text>{item}</text>
  return (
    <box
      flexDirection="column"
      onMouseDown={() => ctx.system.openExternal(`file://${props.directory}/${item.file}#L${item.line}`)}
    >
      <text>{item.rule}</text>
      <text wrapMode="word">{item.message}</text>
      <text>
        {item.file}:{item.line}
      </text>
    </box>
  )
}

export function registerPanel(ctx: Context, state: State) {
  const Findings = (props: { session: MountedSession }) => {
    const open = toItems(state.findings[props.session.directory])
    const done = toItems(state.fixed[props.session.directory])

    const ask = () => {
      const list = open
        .map((item) => `- ${item.file}:${item.line} ${item.rule}: ${item.message}`)
        .join("\n")
      void ctx.client.session.prompt({
        sessionID: props.session.id,
        text: `Harry found these prose issues. Fix them, then keep going.\n\n${list}`,
      })
    }

    return (
      <box flexDirection="column" gap={1}>
        <box flexDirection="row" justifyContent="space-between">
          <text wrapMode="word">{open.length ? `${open.length} in these changes` : "No issues in these changes."}</text>
          {open.length > 0 && (
            <ctx.ui.Button variant="ghost" size="small" icon="prompt" onClick={ask}>
              Ask agent to fix
            </ctx.ui.Button>
          )}
        </box>
        {open.length > 0 && <text wrapMode="word">Fixed on the next turn, or use the button.</text>}
        <For each={open}>{(item) => Row(ctx, { item, directory: props.session.directory })}</For>
        {done.length > 0 && <text>{`Fixed (${done.length})`}</text>}
        <For each={done}>{(item) => Row(ctx, { item, directory: props.session.directory })}</For>
      </box>
    )
  }

  ctx.add(Panel, {
    id: "findings",
    region: "side",
    list: (): PanelTab[] => [{ id: "findings", title: "Harry", closable: "compact" }],
    render: (props) => <Findings session={props.session} />,
  })
}
