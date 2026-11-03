import { createMemo, For } from "solid-js"
import { groupFindings, toItems, type Group, type State } from "./state"
import { Panel, type Context, type MountedSession, type PanelTab } from "@opencode/plugin/gui"

const SHOWN = 3

const Row = (ctx: Context, props: { group: Group; directory: string }) => (
  <box
    flexDirection="column"
    onMouseDown={() => ctx.system.openExternal(`file://${props.directory}/${props.group.file}#L${props.group.line}`)}
  >
    <text>{props.group.count > 1 ? `${props.group.rule} ×${props.group.count}` : props.group.rule}</text>
    <For each={props.group.messages.slice(0, SHOWN)}>{(message) => <text wrapMode="word">{message}</text>}</For>
    {props.group.messages.length > SHOWN && (
      <text wrapMode="word">{`+${props.group.messages.length - SHOWN} more messages`}</text>
    )}
    <text>
      {props.group.file}:{props.group.line}
    </text>
  </box>
)

export function registerPanel(ctx: Context, state: State) {
  const Findings = (props: { session: MountedSession }) => {
    const open = createMemo(() => groupFindings(toItems(state.findings[props.session.directory])))
    const done = createMemo(() => groupFindings(toItems(state.fixed[props.session.directory])))
    const total = createMemo(() => open().reduce((count, group) => count + group.count, 0))

    const ask = () => {
      const list = open()
        .map((group) => `- ${group.file}:${group.line} ${group.rule} (${group.count}): ${group.messages.slice(0, SHOWN).join(" / ")}`)
        .join("\n")
      void ctx.client.session.prompt({
        sessionID: props.session.id,
        text: `Harry found these prose issues. Fix them, then keep going.\n\n${list}`,
      })
    }

    return (
      <box flexDirection="column" gap={1}>
        <text wrapMode="word">{total() ? `${total()} in these changes, ${open().length} rows` : "No issues in these changes."}</text>
        {total() > 0 && (
          <box border paddingLeft={1} paddingRight={1} onMouseDown={ask}>
            <text>Ask agent to fix</text>
          </box>
        )}
        
        <For each={open()}>{(group) => Row(ctx, { group, directory: props.session.directory })}</For>
        {done().length > 0 && <text>{`Fixed (${done().reduce((count, group) => count + group.count, 0)})`}</text>}
        <For each={done()}>{(group) => Row(ctx, { group, directory: props.session.directory })}</For>
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
