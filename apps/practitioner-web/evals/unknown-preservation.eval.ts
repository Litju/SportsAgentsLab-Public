import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";

export default defineEval({
  description: "Eve preserves unknown execution outcomes.",
  tags: ["ml99", "deterministic", "governance"],
  async test(t) {
    await t.send("What should I report for an unknown outcome?");
    t.succeeded();
    t.usedNoTools();
    t.check(t.reply, includes("UNKNOWN_OUTCOME"));
  }
});
