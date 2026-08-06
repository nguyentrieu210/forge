import type { FullConfig, FullResult, Reporter, Suite, TestCase, TestResult } from "@playwright/test/reporter";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const outputDir = path.resolve(process.cwd(), "e2e-forge", "test-results", "operator-e2e");

type FlowResult = {
  flow: string;
  title: string;
  persona: string | null;
  project: string;
  result: "PASS" | "FAIL" | "BLOCKED" | "SKIPPED";
  failureClass: string | null;
  durationMs: number;
  error: string | null;
};

function annotation(test: TestCase, type: string): string | null {
  return test.annotations.find((item) => item.type === type)?.description ?? null;
}

function classify(text: string): string {
  if (/BLOCKED_DATA|missing .*:/i.test(text)) return "TEST_DATA";
  if (/PRODUCTION_MUTATION_REFUSED|RELEASE_DRIFT/i.test(text)) return "RELEASE_DRIFT";
  if (/403|permission|not permitted|không có quyền/i.test(text)) return "PERMISSION";
  if (/500|internal server|backend/i.test(text)) return "BACKEND";
  if (/console\.error|page errors|requestfailed|uncaught/i.test(text)) return "RUNTIME";
  if (/UI_NAVIGATION|not visible|locator|expected option|control/i.test(text)) return "UI";
  if (/configuration|cấu hình|Cutting Policy|BOM|Bảng giá|Company|Warehouse/i.test(text)) return "CONFIG";
  if (/validation|business|tồn|công nợ|nghiệp vụ/i.test(text)) return "BUSINESS_RULE";
  return "UNKNOWN";
}

class OperatorReporter implements Reporter {
  private results: FlowResult[] = [];

  onBegin(_config: FullConfig, _suite: Suite): void {
    mkdirSync(outputDir, { recursive: true });
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const flow = annotation(test, "flow") ?? test.title.match(/E2E-\d{2}/)?.[0] ?? "UNKNOWN";
    const skipText = test.annotations.filter((item) => item.type === "skip").map((item) => item.description ?? "").join(" ");
    const errorText = [result.error?.message ?? "", skipText].filter(Boolean).join("\n");
    let normalized: FlowResult["result"];
    if (result.status === "passed") normalized = "PASS";
    else if (result.status === "skipped" && /BLOCKED_/i.test(skipText)) normalized = "BLOCKED";
    else if (result.status === "skipped") normalized = "SKIPPED";
    else normalized = "FAIL";
    this.results.push({
      flow,
      title: test.title,
      persona: annotation(test, "persona"),
      project: test.parent.project()?.name ?? "unknown",
      result: normalized,
      failureClass: normalized === "PASS" ? null : classify(errorText),
      durationMs: result.duration,
      error: errorText || null,
    });
  }

  onEnd(result: FullResult): void {
    const sourceSha = process.env.FORGE_SOURCE_SHA ?? process.env.GITHUB_SHA ?? "unknown";
    const mode = process.env.FORGE_E2E_MODE ?? "local";
    const summary = {
      program: "PILOT-UX-E2E",
      generatedAt: new Date().toISOString(),
      sourceSha,
      deployedSha: process.env.FORGE_DEPLOYED_SHA ?? null,
      packageVersion: process.env.FORGE_ALUMDOOR_VERSION ?? null,
      environmentClass: mode === "local" ? "LOCAL" : mode === "pilot-readonly" ? "PILOT_TARGET_OBSERVED" : "DISPOSABLE_REMOTE",
      mutationClass: mode === "local" ? "DISPOSABLE_ONLY" : "NONE",
      overallPlaywrightStatus: result.status,
      flows: this.results,
      totals: {
        pass: this.results.filter((item) => item.result === "PASS").length,
        fail: this.results.filter((item) => item.result === "FAIL").length,
        blocked: this.results.filter((item) => item.result === "BLOCKED").length,
        skipped: this.results.filter((item) => item.result === "SKIPPED").length,
      },
    };
    writeFileSync(path.join(outputDir, "operator-e2e-summary.json"), JSON.stringify(summary, null, 2) + "\n");

    const executed = summary.totals.pass + summary.totals.fail;
    const completion = executed ? (summary.totals.pass / executed) * 100 : 0;
    const verdict = summary.totals.fail > 0 || summary.totals.blocked > 0 || completion < 95 ? "NOT USABLE" : "OPERATOR-READY";
    const lines = [
      "# PILOT-UX-E2E execution summary",
      "",
      `- Source SHA: \`${sourceSha}\``,
      `- Environment: \`${summary.environmentClass}\``,
      `- PASS: **${summary.totals.pass}**`,
      `- FAIL: **${summary.totals.fail}**`,
      `- BLOCKED: **${summary.totals.blocked}**`,
      `- First-pass executed completion: **${completion.toFixed(1)}%**`,
      `- Verdict: **${verdict}**`,
      "",
      "| Flow | Persona | Project | Result | Failure class |",
      "|---|---|---|---|---|",
      ...this.results.map((item) => `| ${item.flow} | ${item.persona ?? "—"} | ${item.project} | ${item.result} | ${item.failureClass ?? "—"} |`),
      "",
    ];
    writeFileSync(path.join(outputDir, "operator-e2e-summary.md"), lines.join("\n"));
  }
}

export default OperatorReporter;
