#!/usr/bin/env node
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { decryptFile } from "./state-crypto.mjs";

const repositoryRoot = path.resolve(import.meta.dirname, "..", "..");
const repository = process.env.GITHUB_REPOSITORY ?? "nguyentrieu210/forge";
const token = process.env.GITHUB_TOKEN ?? "";
const artifactName = "forge-local-state-encrypted";
const markerPath = path.join(repositoryRoot, ".codespace-local-state.json");

function fail(message) {
  console.error(`FORGE_STATE_RESTORE_FAILED ${message}`);
  process.exit(1);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.status !== 0) fail(`${command} exited with ${result.status}`);
}

async function api(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2026-03-10",
      "User-Agent": "forge-codespace-state-restore",
    },
    redirect: "follow",
  });
  if (!response.ok) fail(`GitHub API ${response.status} ${response.statusText}`);
  return response;
}

if (!process.env.CODESPACES) fail("this restore command is Codespaces-only");
if (!token) fail("GITHUB_TOKEN is missing");
if ((process.env.FORGE_CODESPACE_SNAPSHOT_KEY ?? "").length < 24) {
  fail("FORGE_CODESPACE_SNAPSHOT_KEY is missing or too short");
}

const listUrl = `${process.env.GITHUB_API_URL ?? "https://api.github.com"}/repos/${repository}/actions/artifacts?name=${encodeURIComponent(artifactName)}&per_page=100`;
const list = await (await api(listUrl)).json();
const artifacts = (list.artifacts ?? [])
  .filter((item) => !item.expired)
  .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
if (!artifacts.length) fail(`no non-expired '${artifactName}' artifact exists; run the snapshot workflow first`);
const artifact = artifacts[0];

const work = mkdtempSync(path.join(tmpdir(), "forge-state-restore-"));
const artifactZip = path.join(work, "artifact.zip");
const artifactDir = path.join(work, "artifact");
const tarGz = path.join(work, "forge-local-state.tar.gz");
const extracted = path.join(work, "state");

try {
  const archive = await api(artifact.archive_download_url);
  writeFileSync(artifactZip, Buffer.from(await archive.arrayBuffer()));

  run("unzip", ["-qq", artifactZip, "-d", artifactDir]);
  const encrypted = readdirSync(artifactDir)
    .map((name) => path.join(artifactDir, name))
    .find((item) => item.endsWith(".enc"));
  if (!encrypted) fail("artifact does not contain an encrypted snapshot");

  decryptFile(encrypted, tarGz);
  run("mkdir", ["-p", extracted]);
  run("tar", ["-xzf", tarGz, "-C", extracted]);

  const manifestPath = path.join(extracted, "manifest.json");
  if (!existsSync(manifestPath)) fail("snapshot manifest.json is missing");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.format !== "forge-local-state-backup/v1") fail(`unsupported manifest format '${manifest.format}'`);

  const existingState = (manifest.sources ?? []).some((source) => existsSync(path.join(repositoryRoot, source.path)));
  if (existingState) {
    run(process.execPath, [path.join(repositoryRoot, "server", "scripts", "backup-local-state.mjs")], { cwd: repositoryRoot });
  }

  for (const source of manifest.sources ?? []) {
    const from = path.join(extracted, source.path);
    const to = path.join(repositoryRoot, source.path);
    if (!existsSync(from)) continue;
    rmSync(to, { recursive: true, force: true });
    cpSync(from, to, { recursive: true, force: true });
  }

  writeFileSync(markerPath, `${JSON.stringify({
    artifact_id: artifact.id,
    artifact_created_at: artifact.created_at,
    restored_at: new Date().toISOString(),
    source_git_head: manifest.git_head,
    sources: manifest.sources,
  }, null, 2)}\n`);

  console.log(`FORGE_STATE_RESTORE_OK artifact=${artifact.id} created_at=${artifact.created_at} source_sha=${manifest.git_head}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
