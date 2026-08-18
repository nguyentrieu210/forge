#!/usr/bin/env node
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import process from "node:process";

const MAGIC = Buffer.from("FORGE-CODESPACE-STATE-V1\0", "utf8");
const SALT_BYTES = 16;
const IV_BYTES = 12;
const TAG_BYTES = 16;

function secret() {
  const value = process.env.FORGE_CODESPACE_SNAPSHOT_KEY ?? "";
  if (value.length < 24) {
    throw new Error("FORGE_CODESPACE_SNAPSHOT_KEY must be at least 24 characters");
  }
  return value;
}

export function encryptFile(inputPath, outputPath) {
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const key = scryptSync(secret(), salt, 32);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = readFileSync(inputPath);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  writeFileSync(outputPath, Buffer.concat([MAGIC, salt, iv, tag, ciphertext]));
}

export function decryptFile(inputPath, outputPath) {
  const payload = readFileSync(inputPath);
  if (!payload.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error("invalid Forge snapshot format");
  }
  let offset = MAGIC.length;
  const salt = payload.subarray(offset, offset += SALT_BYTES);
  const iv = payload.subarray(offset, offset += IV_BYTES);
  const tag = payload.subarray(offset, offset += TAG_BYTES);
  const ciphertext = payload.subarray(offset);
  const key = scryptSync(secret(), salt, 32);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  writeFileSync(outputPath, plaintext);
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}`) {
  const [mode, inputPath, outputPath] = process.argv.slice(2);
  if (!mode || !inputPath || !outputPath || !["encrypt", "decrypt"].includes(mode)) {
    console.error("usage: node state-crypto.mjs <encrypt|decrypt> <input> <output>");
    process.exit(2);
  }
  try {
    if (mode === "encrypt") encryptFile(inputPath, outputPath);
    else decryptFile(inputPath, outputPath);
    console.log(`FORGE_STATE_CRYPTO_OK mode=${mode} output=${outputPath}`);
  } catch (error) {
    console.error(`FORGE_STATE_CRYPTO_FAILED ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
