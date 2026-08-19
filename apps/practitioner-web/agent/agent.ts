import { defineAgent } from "eve";
import { createMefEvalModel } from "./eval-model.ts";
import { createOpenCodeGoModel } from "../src/server/open-code-model.ts";

export default defineAgent({
  model: process.env.MEF_EVAL_MODE === "true" ? createMefEvalModel() : createOpenCodeGoModel(),
  modelContextWindowTokens: 262_144,
  reasoning: "medium",
  limits: {
    maxInputTokensPerSession: 120_000,
    maxOutputTokensPerSession: 30_000,
    sessionTimeoutMs: 7 * 24 * 60 * 60 * 1000
  }
});
