import { env, exports } from "cloudflare:workers";
import { expect } from "vitest";
import { commandPayloadHash } from "../../../packages/core/src/index.js";

type Action = "create" | "save" | "submit" | "cancel";

export async function cmd(input: { id:string; doctype:string; name:string; action:Action; version:number|null; document:Record<string,unknown> }) {
  const value = { schema_version:1 as const, command_id:input.id, tenant_id:"demo", aggregate:{doctype:input.doctype,name:input.name}, action:input.action, expected_version:input.version, payload_hash:"", document:input.document };
  value.payload_hash = await commandPayloadHash(value as unknown as Record<string,unknown>);
  return value;
}

export async function post(value: Awaited<ReturnType<typeof cmd>>) {
  return exports.default.fetch(new Request("https://tenant.test/api/v1/commands", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify(value) }));
}

export async function createAndSubmit(doctype:string,name:string,document:Record<string,unknown>) {
  const key=name.toLowerCase().replace(/[^a-z0-9]+/g,"-");
  expect((await post(await cmd({id:`r6-${key}-create`,doctype,name,action:"create",version:null,document}))).status).toBe(200);
  expect((await post(await cmd({id:`r6-${key}-submit`,doctype,name,action:"submit",version:1,document}))).status).toBe(200);
}

export async function seedMaster(recordType:string,name:string,data:Record<string,unknown>={}) {
  await env.DB.prepare(`INSERT INTO master_records(tenant_id,record_type,name,data_json,disabled,modified_at) VALUES('demo',?1,?2,?3,0,'2026-08-04T08:00:00.000Z') ON CONFLICT(tenant_id,record_type,name) DO UPDATE SET data_json=excluded.data_json,disabled=0`).bind(recordType,name,JSON.stringify(data)).run();
}

export async function readDoc(doctype:string,name:string) {
  const row=await env.DB.prepare("SELECT docstatus,status,version,payload_json FROM documents WHERE tenant_id='demo' AND doctype=?1 AND name=?2").bind(doctype,name).first<{docstatus:number;status:string;version:number;payload_json:string}>();
  return row?{...row,data:JSON.parse(row.payload_json) as Record<string,unknown>}:null;
}

export { env };
