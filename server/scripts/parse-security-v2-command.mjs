#!/usr/bin/env node
import { appendFileSync } from "node:fs";
import process from "node:process";
import { parseSecurityV2IssueCommand, securityV2GithubOutputLines } from "./lib/security-v2-command.mjs";

const body = process.env.FORGE_SECURITY_V2_COMMAND_BODY ?? "";
const issue = String(process.env.FORGE_SECURITY_V2_COMMAND_ISSUE ?? "");
const author = String(process.env.FORGE_SECURITY_V2_COMMAND_AUTHOR ?? "");
const association = String(process.env.FORGE_SECURITY_V2_COMMAND_ASSOCIATION ?? "");
const owner = String(process.env.FORGE_REPOSITORY_OWNER ?? "");

if (!/^\d+$/.test(issue)) throw new Error("FORGE_SECURITY_V2_COMMAND_ISSUE must be an issue number");
if (!owner || author !== owner || association !== "OWNER") {
  throw new Error("security-v2 bootstrap command must be authored by the repository OWNER");
}

const command = parseSecurityV2IssueCommand(body);
const lines = securityV2GithubOutputLines(command);
const output = process.env.GITHUB_OUTPUT;
if (output) appendFileSync(output, `${lines.join("\n")}\n`, "utf8");
else process.stdout.write(`${JSON.stringify(command, null, 2)}\n`);
