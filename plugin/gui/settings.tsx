import type { State } from "./state"
import { SettingsPage, type Context } from "@opencode/plugin/gui"

export function registerSettings(ctx: Context, state: State) {
  ctx.add(SettingsPage, {
    id: "harry",
    title: "Harry",
    icon: "check",
    render: () => (
      <box flexDirection="column" gap={1}>
        <ctx.ui.Switch
          label="Harry: inject rules"
          description="Put the rules in every request."
          checked={state.settings().injectRules}
          onChange={(checked) => void state.save({ injectRules: checked })}
        />
        <ctx.ui.Switch
          label="Harry: check automatically"
          description="Lint the diff when a turn changes it."
          checked={state.settings().autoCheck}
          onChange={(checked) => void state.save({ autoCheck: checked })}
        />
      </box>
    ),
  })
}
