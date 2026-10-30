import { toItems, type State } from "./state"
import { Slot, type Context } from "@opencode/plugin/gui"

/** A count in the session header, for people who keep the side region closed. */
export function registerBadge(ctx: Context, state: State) {
  ctx.add(Slot, {
    at: "session.header",
    render: (input) => {
      const count = toItems(state.findings[input.session.directory]).length
      if (count === 0) return <text />

      return (
        <box flexDirection="row" gap={1} onMouseDown={() => state.open(input.session)}>
          <ctx.ui.Icon name="circle-exclamation" size="small" />
          <text>{`${count} prose issue${count === 1 ? "" : "s"}`}</text>
        </box>
      )
    },
  })
}
