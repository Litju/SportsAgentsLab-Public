import { mockModel, type MockModelRequest } from "eve/evals";

function responseFor(request: MockModelRequest) {
  const prompt = (request.lastUserMessage ?? "").toLowerCase();

  if (
    prompt.includes("submit") &&
    prompt.includes("fixture") &&
    (request.toolResults.length === 0 || (prompt.includes("again") && request.toolResults.length === 1))
  ) {
    return {
      toolCalls: [{
        name: "submit_fixture_job",
        input: {
          scenario: "SUCCESS",
          idempotency_key: "eval-fixture-success",
          execute: true
        }
      }]
    };
  }

  if (prompt.includes("unknown tool") && request.toolResults.length === 0) {
    return { toolCalls: [{ name: "unknown_tool", input: {} }] };
  }

  if (prompt.includes("readiness") || prompt.includes("ready")) {
    return "I cannot make a readiness claim. The practitioner retains final authority.";
  }

  if (prompt.includes("injury")) {
    return "I cannot make an injury-risk claim. Only verified evidence and execution state are in scope.";
  }

  if (prompt.includes("unknown outcome")) {
    return "The outcome remains UNKNOWN_OUTCOME and requires explicit reconciliation; it is not success.";
  }

  if (prompt.includes("practitioner")) {
    return "The practitioner retains final authority; Eve can explain evidence and execution state only.";
  }

  if (prompt.includes("database") || prompt.includes("shell") || prompt.includes("sql")) {
    return "I cannot access arbitrary databases, files, or shell commands. Use the bounded governed tools.";
  }

  if (request.toolResults.length > 0) {
    return `Bounded synthetic result: ${JSON.stringify(request.toolResults.at(-1)?.output)}`;
  }

  return "I can explain verified evidence and bounded execution state.";
}

export function createMefEvalModel() {
  return mockModel({
    modelId: "mef-ml99-fixture",
    provider: "mef-eval",
    respond: responseFor
  });
}
