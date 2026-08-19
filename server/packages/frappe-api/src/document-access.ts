import type { CanonicalDocument } from "./router-platform.js";
import { errors } from "./router-platform.js";
import type { FrappeRouterContext } from "./router.js";

// Hai cách nạp tài liệu, khác nhau ở chỗ TỪ CHỐI ra sao.
//
// Đọc: không có quyền thì báo "không tìm thấy" — nói "bạn không được xem" đã là tiết lộ
// rằng tài liệu tồn tại. Ghi: từ chối thì báo đúng là từ chối, vì người dùng cần biết mình
// thiếu quyền chứ không phải đi tìm một bản ghi họ đang nhìn thấy.
//
// Trước đây hai hàm này nằm trong router.ts và được 17 chỗ dùng, nên bất kỳ module nào cần
// đọc-có-kiểm-quyền đều phải kéo cả router vào.

export async function loadReadable(doctype: string, name: string, context: FrappeRouterContext): Promise<CanonicalDocument> {
  const document = await context.documents.getDocument(context.tenantId, doctype, name);
  if (!document) throw errors.notFound();
  try {
    await context.permissions.assert({
      actor: context.actor, tenantId: context.tenantId, doctype, name,
      owner: document.owner, data: document.data, action: "read",
    });
  } catch {
    throw errors.notFound();
  }
  const meta = await context.metadata.getDocType(context.tenantId, doctype);
  if (!meta) return document;
  const share = await context.access.getShare(context.tenantId, doctype, name, context.actor.user_id);
  return context.permissions.redactDocumentWithPolicies(context.tenantId, meta, document, context.actor, Boolean(share?.read));
}

/** Loads a document the actor may write. A refusal here is reported as a refusal. */
export async function loadWritable(doctype: string, name: string, context: FrappeRouterContext, action: "save" | "delete" = "save"): Promise<CanonicalDocument> {
  const document = await context.documents.getDocument(context.tenantId, doctype, name);
  if (!document) throw errors.notFound();
  await context.permissions.assert({
    actor: context.actor, tenantId: context.tenantId, doctype, name,
    owner: document.owner, data: document.data, action,
  });
  return document;
}
