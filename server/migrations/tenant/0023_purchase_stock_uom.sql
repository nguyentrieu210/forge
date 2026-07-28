-- Hạn mức "không nhận quá số đặt" phải đọc theo ĐƠN VỊ TỒN.
--
-- Trigger cũ so `qty_micros` của phiếu nhập với `qty_micros` của đơn mua. Khi hai chứng từ
-- khai bằng hai đơn vị khác nhau — đặt 20 CÂY, nhận 117 MÉT — phép so đó vô nghĩa: nó từ
-- chối một phiếu nhận đúng đủ, và ngược lại nó cho lọt khi đặt bằng mét mà nhận bằng cây.
--
-- Đây là chốt THẬT của môi trường chạy: `assertPurchaseRemaining` trong nhân từ chối trước,
-- nhưng nếu chỉ sửa nhân thì SQLite vẫn ABORT ở tầng dưới và không ai đọc được vì sao. Cùng
-- một luật viết ở hai nơi thì phải sửa cả hai, cùng lúc.
--
-- `COALESCE(stock_qty_micros, qty_micros)`: dòng không quy đổi thì hai con số bằng nhau, nên
-- mọi đơn mua đang chạy giữ nguyên hành vi.

DROP TRIGGER IF EXISTS purchase_progress_reference_guard;

CREATE TRIGGER purchase_progress_reference_guard
BEFORE INSERT ON purchase_order_progress_entries
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM documents WHERE tenant_id=NEW.tenant_id
        AND doc_key='Purchase Order:' || NEW.purchase_order AND doctype='Purchase Order' AND docstatus=1
    ) THEN RAISE(ABORT,'PURCHASE_REFERENCE_SOURCE_NOT_FOUND')
    WHEN NOT EXISTS (
      SELECT 1 FROM document_children WHERE tenant_id=NEW.tenant_id
        AND parent_key='Purchase Order:' || NEW.purchase_order AND fieldname='items'
        AND json_extract(payload_json,'$.item_code')=NEW.item_code
    ) THEN RAISE(ABORT,'PURCHASE_REFERENCE_ITEM_NOT_FOUND')
    WHEN COALESCE((SELECT SUM(qty_micros) FROM purchase_order_progress_entries
      WHERE tenant_id=NEW.tenant_id AND purchase_order=NEW.purchase_order AND kind=NEW.kind AND item_code=NEW.item_code),0)+NEW.qty_micros < 0
      THEN RAISE(ABORT,'PURCHASE_REFERENCE_QUANTITY_NEGATIVE')
    WHEN COALESCE((SELECT SUM(qty_micros) FROM purchase_order_progress_entries
      WHERE tenant_id=NEW.tenant_id AND purchase_order=NEW.purchase_order AND kind=NEW.kind AND item_code=NEW.item_code),0)+NEW.qty_micros >
      (SELECT COALESCE(SUM(CAST(COALESCE(json_extract(payload_json,'$.stock_qty_micros'),json_extract(payload_json,'$.qty_micros')) AS INTEGER)),0)
       FROM document_children
       WHERE tenant_id=NEW.tenant_id AND parent_key='Purchase Order:' || NEW.purchase_order AND fieldname='items'
       AND json_extract(payload_json,'$.item_code')=NEW.item_code)
      THEN RAISE(ABORT,'PURCHASE_REFERENCE_QUANTITY_EXCEEDED')
  END;
END;
