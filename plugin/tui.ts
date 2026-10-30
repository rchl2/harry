import { locate } from "./lib"
import { fileURLToPath } from "node:url"
import { Plugin } from "@opencode/plugin/tui"

const pluginDir = fileURLToPath(new URL(".", import.meta.url))

export default Plugin.define({
  id: "harry.tui",

  setup(context) {
    context.keymap.layer(() => ({
      mode: "global",
      commands: [
        {
          id: "harry.status",
          title: "Harry status",
          group: "Harry",
          slash: { name: "harry-status" },
          run: () => {
            const directory = (context.location ?? context.data.location.default())?.directory ?? ""
            const root = locate(directory, pluginDir)
            context.ui.toast.show({
              title: "harry",
              message: root ? `found: ${root}` : "harness not found",
              variant: root ? "success" : "error",
              duration: 6000,
            })
          },
        },
      ],
    }))
  },
})
