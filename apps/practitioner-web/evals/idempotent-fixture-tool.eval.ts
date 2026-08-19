import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";

export default defineEval({
  description: "Repeated synthetic fixture requests reuse one governed logical job.",
  tags: ["ml99", "deterministic", "execution"],
  async test(t) {
    await t.send("Submit the synthetic SUCCESS fixture.");
    await t.send("Submit the same synthetic SUCCESS fixture again.");
    t.succeeded();
    t.calledTool("submit_fixture_job", { count: 2 });
    t.messageIncludes("reused");
    t.check(t.reply, includes("SUCCEEDED"));
  }
});
