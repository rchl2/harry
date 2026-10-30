import type { Rpc } from "@opencode/schema/rpc"

export type Reload = { rules: number }
export type Apply = { message: string }
export type Update = { message: string }
export type Findings = { items: Finding[] }
export type LastUpdate = { message: string | null }
export type Status = { root: string | null; rules: number }
export type Settings = { injectRules: boolean; autoCheck: boolean }
export type Prepare = { staged: boolean; findings: string; candidates: string[] }
export type Finding = { rule: string; file: string; line: number; message: string }

export const Harry = {
  id: "harry",
  methods: {
    status: {
      input: { type: "object", properties: {}, additionalProperties: false },
      output: {
        type: "object",
        properties: {
          root: { type: ["string", "null"] },
          rules: { type: "number" },
        },
        required: ["root", "rules"],
      },
    },
    findings: {
      input: {
        type: "object",
        properties: { directory: { type: "string" } },
      },
      output: {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                rule: { type: "string" },
                file: { type: "string" },
                line: { type: "number" },
                message: { type: "string" },
              },
              required: ["rule", "file", "line", "message"],
            },
          },
        },
        required: ["items"],
      },
    },
    prepare: {
      input: {
        type: "object",
        properties: { directory: { type: "string" }, message: { type: "string" } },
      },
      output: {
        type: "object",
        properties: {
          staged: { type: "boolean" },
          findings: { type: "string" },
          candidates: { type: "array", items: { type: "string" } },
        },
        required: ["staged", "findings", "candidates"],
      },
    },
    apply: {
      input: {
        type: "object",
        properties: { directory: { type: "string" }, message: { type: "string" } },
        required: ["message"],
      },
      output: {
        type: "object",
        properties: { message: { type: "string" } },
        required: ["message"],
      },
    },
    settings: {
      input: { type: "object", properties: {}, additionalProperties: false },
      output: {
        type: "object",
        properties: { injectRules: { type: "boolean" }, autoCheck: { type: "boolean" } },
        required: ["injectRules", "autoCheck"],
      },
    },
    setSettings: {
      input: {
        type: "object",
        properties: { injectRules: { type: "boolean" }, autoCheck: { type: "boolean" } },
      },
      output: {
        type: "object",
        properties: { injectRules: { type: "boolean" }, autoCheck: { type: "boolean" } },
        required: ["injectRules", "autoCheck"],
      },
    },
    reload: {
      input: { type: "object", properties: {}, additionalProperties: false },
      output: {
        type: "object",
        properties: { rules: { type: "number" } },
        required: ["rules"],
      },
    },
    lastUpdate: {
      input: { type: "object", properties: {}, additionalProperties: false },
      output: {
        type: "object",
        properties: { message: { type: ["string", "null"] } },
        required: ["message"],
      },
    },
    update: {
      input: { type: "object", properties: {}, additionalProperties: false },
      output: {
        type: "object",
        properties: { message: { type: "string" } },
        required: ["message"],
      },
    },
  },
  events: {},
} as unknown as Rpc.PortableDefinition
