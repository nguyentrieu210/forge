#!/usr/bin/env node
import { appendFileSync } from "node:fs";
import process from "node:process";
import { githubOutputLines, parseDemoIssueCommand } from "./lib/demo-command.mjs";

const body = process.env.FORGE_DEMO_COMMAND_BODY ?? "";
const issue = String(process.env.FORGE_DEMO_COMMAND_ISSUE ?? "");
const author = String(process.env.FORGE_DEMO_COMMAND_AUTHOR ?? "");
const association = String(process.env.FORGE_DEMO_COMMAND_ASSOCIATION ?? "");
const owner = String(process.env.FORGE_REPOSITORY_OWNER ?? "");

if (!/^\d+$/.test(issue)) throw new Error("FORGE_DEMO_COMMAND_ISSUE must be an issue number");
if (!owner || author !== owner || association !== "OWNER") {
  throw new Error("demo command must be authored by the repository OWNER");
}

const command = parseDemoIssueCommand(body);
const lines = githubOutputLines(command);
const output = process.env.GITHUB_OUTPUT;
if (output) appendFileSync(output, `${lines.join("\n")}\n`, "utf8");
else process.stdout.write(`${JSON.stringify(command, null, 2)}\n`);
