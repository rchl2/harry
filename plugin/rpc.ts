import { Rpc } from "@opencode/plugin/rpc"

export type Status = { root: string | null; rules: number }
export type Update = { message: string }

export const Harry = Rpc.define({
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
}) as unknown as Rpc.PortableDefinition
