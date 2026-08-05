from pathlib import Path


def replace(path: str, old: str, new: str, count: int = 1) -> None:
    target = Path(path)
    text = target.read_text(encoding="utf-8")
    actual = text.count(old)
    if actual != count:
        raise SystemExit(f"{path}: expected {count} occurrence(s), found {actual}: {old[:120]!r}")
    target.write_text(text.replace(old, new, count), encoding="utf-8")


# BaseController passes normalized document data into event selection. Existing one-argument
# implementations remain valid; Purchase Receipt uses the data to avoid publishing fake PO
# progress for a direct supplier receipt that has no Purchase Order link.
replace(
    "server/packages/clouderp-core/src/controllers.ts",
    "  abstract eventTypes(context: ControllerContext<T>): string[];\n",
    "  abstract eventTypes(context: ControllerContext<T>, data?: T): string[];\n",
)
replace(
    "server/packages/clouderp-core/src/controllers.ts",
    "      events: this.eventTypes(context).map((type) => domainEvent({ type, tenantId: context.command.tenant_id, aggregate: context.command.aggregate, aggregateVersion: context.nextVersion, actor: context.command.actor.user_id, commandId: context.command.command_id, occurredAt: context.now, payload: { action: context.command.action, status } })),\n",
    "      events: this.eventTypes(context, data).map((type) => domainEvent({ type, tenantId: context.command.tenant_id, aggregate: context.command.aggregate, aggregateVersion: context.nextVersion, actor: context.command.actor.user_id, commandId: context.command.command_id, occurredAt: context.now, payload: { action: context.command.action, status } })),\n",
)

# Canonical Purchase Receipt: Purchase Order is optional. If present, keep every existing
# commercial-context and remaining-quantity guard. Unlinked rows simply do not write the
# procurement-allocation projection and do not emit purchase_order.progressed.
replace(
    "server/packages/clouderp-core/src/controllers.ts",
    '    for(const [index,item] of items.entries()) if(!orderOf(item)) throw errors.validation(`Purchase Order is required at row ${index+1} (on the line or on the receipt)`);\n',
    '    // Purchase Order is optional: direct supplier receipts are valid. Linked rows still use the same PO guards below.\n',
)
replace(
    "server/packages/clouderp-core/src/controllers.ts",
    '      for(const item of items){const name=orderOf(item)!;const list=byOrder.get(name);if(list)list.push(item);else byOrder.set(name,[item]);}\n',
    '      for(const item of items){const name=orderOf(item);if(!name)continue;const list=byOrder.get(name);if(list)list.push(item);else byOrder.set(name,[item]);}\n',
)
replace(
    "server/packages/clouderp-core/src/controllers.ts",
    '    const procurement=data.items.map((item,index):ProcurementEntry=>({line_key:`RECEIPT-${item.row_id||index+1}`,purchase_order:(item.purchase_order??data.against_purchase_order)!,kind:"Receipt",item_code:item.item_code,qty_micros:stockQtyMicros(item),posting_at:data.posting_at}));\n',
    '    const procurement=data.items.flatMap((item,index):ProcurementEntry[]=>{const purchaseOrder=item.purchase_order??data.against_purchase_order;return purchaseOrder?[{line_key:`RECEIPT-${item.row_id||index+1}`,purchase_order:purchaseOrder,kind:"Receipt",item_code:item.item_code,qty_micros:stockQtyMicros(item),posting_at:data.posting_at}]:[]});\n',
)
replace(
    "server/packages/clouderp-core/src/controllers.ts",
    '  eventTypes(context:ControllerContext<PurchaseReceiptData>):string[]{return context.command.action==="submit"?["stock.posted","purchase_receipt.submitted","purchase_order.progressed"]:context.command.action==="cancel"?["stock.reversed","purchase_receipt.cancelled","purchase_order.progressed"]:["purchase_receipt.updated"]}\n',
    '  eventTypes(context:ControllerContext<PurchaseReceiptData>,data?:PurchaseReceiptData):string[]{const progressed=Boolean(data?.against_purchase_order||data?.items?.some(item=>item.purchase_order));return context.command.action==="submit"?["stock.posted","purchase_receipt.submitted",...(progressed?["purchase_order.progressed"]:[])]:context.command.action==="cancel"?["stock.reversed","purchase_receipt.cancelled",...(progressed?["purchase_order.progressed"]:[])]:["purchase_receipt.updated"]}\n',
)

# Visible Alumdoor Nhập hàng becomes a direct receipt composer. Old FIFO methods remain
# installed and callable for legacy/operator workflows, but the daily tab does not invoke them.
replace("server/briefs/alumdoor-v2.actions.json", '  "version": "2.2.8",', '  "version": "2.2.9",')
replace(
    "server/briefs/alumdoor-v2.actions.json",
    '  "//": "Màn Mua hàng và Nhập hàng dùng metadata child doctype để render bảng lớn inline; worker/controller giữ authoritative validation, FIFO và ledger.",',
    '  "//": "Màn Mua hàng và Nhập hàng dùng metadata child doctype để render bảng lớn inline; Purchase Receipt canonical giữ authoritative validation và ledger, còn Đơn NCC là tùy chọn.",',
)
replace(
    "server/briefs/alumdoor-v2.actions.json",
    '      "description": "Màn nhập chung cho mọi mặt hàng. Chọn mã hàng để bảng tự áp metadata Purchase Receipt Item; nhôm giữ luồng FIFO theo đơn cũ và các loại hàng khác dùng cùng cấu trúc dòng chứng từ canonical.",',
    '      "description": "Nhập trực tiếp từ nhà cung cấp cho mọi mặt hàng. Không cần chọn Đơn NCC; bảng tự áp metadata Purchase Receipt Item và tạo một Purchase Receipt nháp canonical.",',
)
replace(
    "server/briefs/alumdoor-v2.actions.json",
    '      "preview": "alumdoor.purchase.preview_bulk_fifo_receipt | Xem phân bổ FIFO",',
    '      "preview": "alumdoor.purchase.preview_bulk_direct_receipt | Kiểm tra phiếu nhập",',
)
replace(
    "server/briefs/alumdoor-v2.actions.json",
    '      "commit": "alumdoor.purchase.bulk_fifo_receipt | Tạo phiếu nhập | Tạo một Purchase Receipt nháp duy nhất cho toàn bộ dòng đã kiểm tra?",',
    '      "commit": "alumdoor.purchase.bulk_direct_receipt | Tạo phiếu nhập | Tạo một Purchase Receipt nháp trực tiếp từ các dòng đã nhập?",',
)

replace("server/briefs/alumdoor-v2.navigation.json", '  "version": "2.2.8",', '  "version": "2.2.9",')
replace(
    "server/briefs/alumdoor-v2.navigation.json",
    '  "//": "Mua hàng dùng đúng 5 tab toàn cục: Quy trình do shell cung cấp; bốn tab còn lại do metadata này sở hữu. Nhập hàng trỏ trực tiếp tới action child-grid canonical; FIFO workspace cũ vẫn installed/callable nhưng không còn là tab vận hành.",',
    '  "//": "Mua hàng dùng đúng 5 tab toàn cục: Quy trình do shell cung cấp; bốn tab còn lại do metadata này sở hữu. Nhập hàng là Purchase Receipt trực tiếp không bắt buộc Đơn NCC; FIFO workspace cũ vẫn installed/callable nhưng không còn là tab vận hành.",',
)

replace("server/tests/alumdoor-procurement-navigation-contract.test.mjs", '  assert.equal(brief.version, "2.2.8");', '  assert.equal(brief.version, "2.2.9");')
replace("server/tests/alumdoor-procurement-navigation-contract.test.mjs", '  assert.match(bulk?.preview ?? "", /^alumdoor\\.purchase\\.preview_bulk_fifo_receipt\\s*\\|/);', '  assert.match(bulk?.preview ?? "", /^alumdoor\\.purchase\\.preview_bulk_direct_receipt\\s*\\|/);')
replace("server/tests/alumdoor-procurement-navigation-contract.test.mjs", '  assert.match(bulk?.commit ?? "", /^alumdoor\\.purchase\\.bulk_fifo_receipt\\s*\\|/);', '  assert.match(bulk?.commit ?? "", /^alumdoor\\.purchase\\.bulk_direct_receipt\\s*\\|/);')
replace("server/tests/alumdoor-procurement-navigation-contract.test.mjs", '  assert.equal(pkg.version, "2.2.8");', '  assert.equal(pkg.version, "2.2.9");')

print("DIRECT_RECEIPT_PATCH_APPLIED")
