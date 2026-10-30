import { tmpdir } from "node:os"
import { existsSync } from "node:fs"
import { join, resolve } from "node:path"
import { spawn } from "node:child_process"
import { rm, writeFile } from "node:fs/promises"

export type Lint = { clean: boolean; output: string }
export type Finding = { rule: string; file: string; line: number; message: string; excerpt: string }

function exec(command: string, args: string[], cwd: string, stdin?: string) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(command, args, { cwd })
    let stdout = ""
    let stderr = ""

    child.stdout.on("data", (chunk) => (stdout += chunk))
    child.stderr.on("data", (chunk) => (stderr += chunk))
    child.on("error", (error) => resolve({ code: -1, stdout, stderr: String(error) }))
    child.on("close", (code) => resolve({ code: code ?? -1, stdout, stderr }))

    if (stdin !== undefined) child.stdin.end(stdin)
    else child.stdin.end()
  })
}

export function locate(directory: string, pluginDir: string): string | null {
  const candidates = [
    process.env.HARRY_HARNESS,
    `${directory}/.harry`,
    `${pluginDir}/..`,
  ].filter((path): path is string => Boolean(path))

  for (const path of candidates) {
    const root = resolve(path)
    if (existsSync(`${root}/run.py`)) return root
  }
  return null
}

export function harness(directory: string, pluginDir: string) {
  const root = locate(directory, pluginDir)
  const script = root ? `${root}/run.py` : `${directory}/.harry/run.py`

  return {
    root,

    async lint(diff: string): Promise<Lint> {
      if (! root) {
        return { clean: false, output: "Harry not found. Set HARRY_HARNESS or vendor it." }
      }

      const { stdout } = await exec("python3", [script, "--diff", "-"], directory, diff)
      const output = stdout.trim()
      return { clean: output === "clean", output }
    },

    async findings(diff: string): Promise<Finding[]> {
      if (!root) return []
      const { stdout } = await exec("python3", [script, "--diff", "-", "--json"], directory, diff)
      try {
        return JSON.parse(stdout) as Finding[]
      } catch {
        return []
      }
    },

    async suggest(message: string): Promise<string> {
      const file = join(tmpdir(), `harry-${process.pid}.msg`)
      await writeFile(file, message)
      try {
        const { stdout } = await exec(
          "python3",
          [script, "--commit-msg", file, "--suggest"],
          directory,
        )
        return stdout.match(/^suggested: (.+)$/m)?.[1]?.trim() ?? ""
      } finally {
        await rm(file, { force: true })
      }
    },

    async commit(message: string) {
      const { code, stderr } = await exec("git", ["commit", "-m", message], directory)
      if (code !== 0) throw new Error(stderr.trim() || "commit failed")
    },

    async staged(): Promise<string> {
      const { stdout } = await exec("git", ["diff", "--cached"], directory)
      return stdout
    },

    async update(): Promise<string> {
      const steps = [
        "opencode plugin remove 'github:rchl2/harry'",
        'rm -rf "$HOME/.cache/opencode/npm/git-harry-"*',
        "npm_config_allow_git=all opencode plugin add 'github:rchl2/harry'",
      ].join(" && ")
      const { code, stdout, stderr } = await exec("sh", ["-c", steps], directory)
      return code === 0 ? "Updated. Restart opencode." : (stderr || stdout).trim()
    },

    async working(): Promise<string> {
      const head = await exec("git", ["diff", "HEAD"], directory)
      if (head.code === 0) return head.stdout
      const cached = await exec("git", ["diff", "--cached"], directory)
      return cached.stdout
    },
  }
}
