#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { d1BindingOf, d1Query, fail, quote, serverRoot } from "./wrangler-cli.mjs";

const args = process.argv.slice(2);
const argOf = (name) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};
const configArg = argOf("config");
if (!configArg) fail("--config <wrangler config> is required");

const tenant = "preview";
const user = "preview@alumdoor.test";
const role = "System Manager";
const passwordHash = "pbkdf2-sha256$210000$frfWGw1ErN0FtaFWZFQz8A==$rnFOAFi5e2F+VCWxQvtPU6KxzTohMuX+tXYVXhplbUQ=";
const database = d1BindingOf(path.resolve(serverRoot, configArg));
const now = new Date().toISOString();

d1Query(database, `INSERT INTO roles(tenant_id,role,is_standard,modified_at)
  VALUES('${quote(tenant)}','${quote(role)}',1,'${now}')
  ON CONFLICT(tenant_id,role) DO NOTHING`);
d1Query(database, `INSERT INTO users(tenant_id,user_id,full_name,email,password_hash,language,time_zone,created_at,modified_at)
  VALUES('${quote(tenant)}','${quote(user)}','Preview Administrator','${quote(user)}','${quote(passwordHash)}','vi','Asia/Ho_Chi_Minh','${now}','${now}')
  ON CONFLICT(tenant_id,user_id) DO UPDATE SET
    password_hash=excluded.password_hash,enabled=1,modified_at=excluded.modified_at`);
d1Query(database, `INSERT INTO user_roles(tenant_id,user_id,role)
  VALUES('${quote(tenant)}','${quote(user)}','${quote(role)}') ON CONFLICT DO NOTHING`);

const rows = d1Query(database, `SELECT enabled,LENGTH(password_hash) AS hash_length FROM users
  WHERE tenant_id='${quote(tenant)}' AND user_id='${quote(user)}'`);
if (rows.length !== 1 || rows[0].enabled !== 1 || rows[0].hash_length < 40) fail("preview admin seed verification failed");
console.log(`ALUMDOOR_PREVIEW_ADMIN_READY user=${user} tenant=${tenant}`);
