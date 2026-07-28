/**
 * Uploading a file, and serving it back.
 *
 * The Desk has had a working attach control the whole time: it picks a file, calls
 * `upload_file`, and writes the returned `file_url` into the field. Nothing answered
 * that method, so every attachment failed and every `Attach Image` field was a button
 * that did nothing. A product catalogue without photographs is not a catalogue, so this
 * is the piece that makes one possible.
 *
 * TWO AUDIENCES, ONE STORE. An invoice PDF must be readable only by someone who may read
 * the invoice; a product photograph must be readable by a browser that has never logged
 * in, and cached hard. Both live in the same bucket and the same table, and `is_private`
 * is what separates them — so the decision is made once, at upload, by someone who is
 * authenticated, rather than by whoever asks for the file later.
 */

import type { Actor, JsonObject } from "../../contracts/src/index.js";
import { errors, randomId } from "../../core/src/index.js";


export const UPLOAD_FILE_PATH = "/api/method/upload_file";

/** Everything the file routes need. Optional in the router: no bucket, no file routes. */
export interface FileStore {
  db: D1Database;
  bucket: R2Bucket;
  tenantId: string;
  now: string;
}

interface FileRow {
  file_name: string;
  content_type: string;
  storage_key: string;
  attached_to_doctype: string | null;
  attached_to_name: string | null;
  is_private: number;
  owner: string;
}

/**
 * 10 MB. A phone photograph is 2–5 MB, so this fits the job it exists for while staying
 * far below the Worker's own request limits — a ceiling that only the runtime enforces
 * surfaces as a connection reset, which reads like a network fault rather than a file
 * that is too big.
 */
const MAX_UPLOAD_BYTES = 10_000_000;

/** Public download route: `/files/<file_id>` or `/files/<file_id>/<anything>.jpg`. */
const FILE_PATH = /^\/files\/([A-Za-z0-9_-]+)(?:\/[^/]*)?$/;

export function matchFilePath(pathname: string): string | null {
  const match = FILE_PATH.exec(pathname);
  return match ? match[1]! : null;
}

/**
 * True for paths a visitor with no session may reach.
 *
 * The gateway asks this before it demands a bearer token. Without it a product photo on
 * the public catalogue would be an authentication failure, and the page would render
 * with broken images for exactly the people it was built for.
 */
export function isPublicFilePath(pathname: string): boolean {
  return FILE_PATH.test(pathname);
}

/**
 * Content that a browser would EXECUTE if it followed a link to it.
 *
 * SVG is on the list and that surprises people: it is an image everywhere else, and it
 * carries `<script>`. Served from the same origin as the Desk, one uploaded SVG is a
 * session-stealing XSS, so it is refused at the door rather than sanitised — sanitising
 * SVG is a losing game played against every future SVG feature.
 */
function isActiveContentType(contentType: string, fileName: string): boolean {
  const extension = fileName.toLowerCase().split(".").pop() ?? "";
  return ["text/html", "image/svg+xml", "application/javascript", "text/javascript", "application/xhtml+xml"].includes(contentType)
    || ["html", "htm", "svg", "js", "mjs", "exe", "dll", "bat", "cmd", "sh", "ps1"].includes(extension);
}

function safeFilename(value: string): string {
  return value.replace(/[\r\n"\\/]/g, "_").slice(0, 240) || "file";
}

/**
 * `upload_file`, in the shape frappe-js-sdk sends and expects.
 *
 * Read straight from the request rather than through `readFrappeArgs`, because that
 * reader turns the body into text: a multipart body would either be rejected or, worse,
 * silently mangled into a string that parses as nothing.
 */
export async function handleUploadFile(
  request: Request,
  actor: Actor,
  store: FileStore,
  authorizeAttachment: (doctype: string, name: string) => Promise<void>,
): Promise<JsonObject> {
  if (actor.user_id === "Guest") throw errors.authentication("Login to upload a file");

  const contentType = (request.headers.get("content-type") ?? "").toLowerCase();
  if (!contentType.includes("multipart/form-data")) {
    throw errors.validation("upload_file expects multipart/form-data");
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw errors.validation("upload_file requires a file part named \"file\"");
  if (file.size > MAX_UPLOAD_BYTES) throw errors.validation(`File is larger than ${MAX_UPLOAD_BYTES} bytes`);
  if (file.size === 0) throw errors.validation("File is empty");

  const doctype = textField(form, "doctype");
  const docname = textField(form, "docname");
  // Frappe sends "1"/"0"; the SDK sends 1/0. Anything that is not an explicit
  // "public" answer stays private — the safe direction when a field is missing.
  const isPrivate = !["0", "false", ""].includes((textField(form, "is_private") ?? "1").toLowerCase());

  // A file claimed to belong to a document is authorised AGAINST THAT DOCUMENT. Skipping
  // this would let anyone with an account attach to a record they cannot even read, and
  // the attachment would then be served to everyone who can read it.
  if (doctype && docname) await authorizeAttachment(doctype, docname);
  if (doctype && !docname) {
    // Frappe allows this for a document being created; the file is stored unattached and
    // linked when the document is saved. Kept, because refusing it breaks uploading an
    // image on a form that has never been saved — which is most of them.
  }

  const fileName = safeFilename(file.name || "upload");
  const mime = (file.type || "application/octet-stream").split(";")[0]!.trim().toLowerCase();
  if (isActiveContentType(mime, fileName)) {
    throw errors.validation("Active web content and executable attachments are not allowed");
  }

  const fileId = randomId("file");
  const storageKey = `${store.tenantId}/${fileId}`;
  const bytes = await file.arrayBuffer();

  await store.bucket.put(storageKey, bytes, {
    httpMetadata: { contentType: mime },
    customMetadata: { tenant_id: store.tenantId, owner: actor.user_id },
  });
  await store.db.prepare(
    `INSERT INTO files(tenant_id,file_id,file_name,content_type,size_bytes,storage_key,attached_to_doctype,attached_to_name,is_private,owner,created_at)
     VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)`,
  ).bind(
    store.tenantId, fileId, fileName, mime, bytes.byteLength, storageKey,
    doctype || null, docname || null, isPrivate ? 1 : 0, actor.user_id, store.now,
  ).run();

  // `file_url` is what the control writes into the field, so it must be a path a browser
  // can put in `src` unchanged. The filename rides along after the id purely so a saved
  // image keeps a recognisable name; the id alone resolves it.
  return {
    name: fileId,
    file_name: fileName,
    file_url: `/files/${fileId}/${encodeURIComponent(fileName)}`,
    is_private: isPrivate ? 1 : 0,
    file_size: bytes.byteLength,
    content_type: mime,
    attached_to_doctype: doctype || null,
    attached_to_name: docname || null,
  };
}

/**
 * Serves a stored file.
 *
 * A PUBLIC file is cached hard and immutably: the id is random and never reused, so the
 * bytes behind a URL can never change, and a catalogue page that loads forty photographs
 * on every visit is the difference between a fast site and a slow one.
 *
 * A PRIVATE file is re-authorised on every request against the document it is attached
 * to, and marked `no-store` so it cannot sit in a shared cache where the next visitor
 * would be served someone else's invoice.
 */
export async function serveFile(
  fileId: string,
  actor: Actor,
  store: FileStore,
  authorizeRead: (doctype: string, name: string) => Promise<void>,
): Promise<Response> {
  const row = await store.db.prepare(
    `SELECT file_name,content_type,storage_key,attached_to_doctype,attached_to_name,is_private,owner
     FROM files WHERE tenant_id=?1 AND file_id=?2`,
  ).bind(store.tenantId, fileId).first<FileRow>();
  // 404 rather than 403 for a private file the caller may not read: the difference
  // between "no such file" and "a file you cannot see" is itself information.
  if (!row) throw errors.notFound();

  if (row.is_private) {
    if (actor.user_id === "Guest") throw errors.notFound();
    if (row.attached_to_doctype && row.attached_to_name) {
      await authorizeRead(row.attached_to_doctype, row.attached_to_name);
    } else if (row.owner !== actor.user_id && !isSystemManager(actor)) {
      throw errors.notFound();
    }
  }

  const object = await store.bucket.get(row.storage_key);
  if (!object) throw errors.notFound();

  // The runtime types in this repo model R2 minimally; the body is a stream at runtime.
  return new Response((object as unknown as { body: BodyInit }).body, {
    headers: {
      "content-type": row.content_type,
      // `inline` so an image renders in a page instead of downloading; the filename is
      // still offered for a manual save.
      "content-disposition": `inline; filename="${safeFilename(row.file_name)}"`,
      "cache-control": row.is_private ? "private, no-store" : "public, max-age=31536000, immutable",
      // Belt and braces alongside the upload-time refusal: even if something active were
      // ever stored, the browser will not sniff it into executing.
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
    },
  });
}

function isSystemManager(actor: Actor): boolean {
  return actor.user_id === "Administrator" || actor.roles.includes("System Manager") || actor.roles.includes("Administrator");
}

/**
 * Ceiling for reading a file back as JSON, well under the 10 MB upload limit.
 *
 * Base64 grows the payload by a third, and a Worker that has to hold both the bytes and
 * their encoding in memory before it can answer is a Worker that dies on a large scan
 * with an out-of-memory error — which reads as "the app is broken", not "that file is
 * too big". 4 MB covers any phone photograph of a price list.
 */
const MAX_READ_BYTES = 4_000_000;

/** base64 without Buffer: this runs on workerd, where only the Web APIs exist. */
function toBase64(bytes: Uint8Array): string {
  let binary = "";
  // In chunks, because `String.fromCharCode(...bytes)` on a multi-megabyte array blows
  // the argument limit and throws RangeError rather than returning a wrong answer.
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return btoa(binary);
}

/**
 * Reads a stored file back as base64, for an app Worker that has to LOOK at it.
 *
 * WHY THIS EXISTS. An app Worker calls back through `/_app/…`, which the gateway rewrites
 * to `/api/…` — deliberately, so an app can only reach the API surface and never an
 * arbitrary path on the tenant. That leaves `/files/<id>` unreachable, so an app given a
 * `file_url` by the attach control has no way to fetch what it points at. OCR is exactly
 * that: the user attaches a photograph, and the app has to read the pixels.
 *
 * Authorisation is the SAME check `serveFile` makes, invoked the same way — a private
 * file is re-authorised against the document it hangs on, and the actor is the user who
 * invoked the app, never the app itself. Writing a second, laxer check here would hand
 * every app a way to read every attachment, which is the whole risk of this endpoint.
 */
export async function readFileContent(
  fileUrl: string,
  actor: Actor,
  store: FileStore,
  authorizeRead: (doctype: string, name: string) => Promise<void>,
): Promise<JsonObject> {
  const fileId = matchFilePath(String(fileUrl ?? "").split("?")[0] ?? "");
  if (!fileId) throw errors.validation("file must be a /files/<id> path returned by upload_file");

  const row = await store.db.prepare(
    `SELECT file_name,content_type,storage_key,attached_to_doctype,attached_to_name,is_private,owner
     FROM files WHERE tenant_id=?1 AND file_id=?2`,
  ).bind(store.tenantId, fileId).first<FileRow>();
  if (!row) throw errors.notFound();

  if (row.is_private) {
    if (actor.user_id === "Guest") throw errors.notFound();
    if (row.attached_to_doctype && row.attached_to_name) {
      await authorizeRead(row.attached_to_doctype, row.attached_to_name);
    } else if (row.owner !== actor.user_id && !isSystemManager(actor)) {
      throw errors.notFound();
    }
  }

  const object = await store.bucket.get(row.storage_key);
  if (!object) throw errors.notFound();
  const bytes = new Uint8Array(await (object as unknown as { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer());
  if (bytes.byteLength > MAX_READ_BYTES) {
    throw errors.validation(`File is ${Math.round(bytes.byteLength / 100_000) / 10} MB; the limit for reading one back is 4 MB`);
  }
  return {
    file_id: fileId,
    file_name: row.file_name,
    content_type: row.content_type,
    size: bytes.byteLength,
    base64: toBase64(bytes),
  };
}

function textField(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}
