import { toItems, type State } from "./state"
import { ComposerPill, type Context } from "@opencode/plugin/gui"

export function registerPill(ctx: Context, state: State) {
  ctx.add(ComposerPill, {
    id: "findings",
    show: (input) => {
      const items = toItems(state.findings[input.session.directory])
      if (items.length === 0) return undefined
      return {
        id: "findings",
        icon: "circle-exclamation",
        label: `Harry found ${items.length} prose issue${items.length === 1 ? "" : "s"} with your changes`,
        title: `${items.length} issue${items.length === 1 ? "" : "s"} in these changes. Open for details.`,
        rows: items.slice(0, 8).map((item, index) => ({
          id: `${index}`,
          label: item.message,
          detail: `${item.rule} · ${item.file}:${item.line}`,
          run: () => state.open(input.session),
        })),
      }
    },
  })
}
