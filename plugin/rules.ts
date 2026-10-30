import { Skill } from "@opencode/plugin"
import { readFile } from "node:fs/promises"

export const read = (path: string) => readFile(path, "utf8").catch(() => "")

/** Registers the skill and returns a loader that can re-read it after an edit. */
export function skillLoader(ctx: any, root: string | null) {
  let registration: { dispose: () => Promise<void> } | undefined

  return async () => {
    await registration?.dispose()
    registration = undefined
    if (!root) return

    const content = await read(`${root}/SKILL.md`)
    if (!content) return

    registration = await ctx.skill.transform((editor: any) => {
      editor.add({
        id: Skill.ID.make("harry"),
        name: Skill.Name.make("harry"),
        description: "Rules and a checker for the prose you ship with code",
        path: Skill.Info.fields.path.make(`${root}/SKILL.md`),
        content,
      })
    })
  }
}
