-- Catch weight: sổ kho mang HAI con số, không phải một.
--
-- Nhôm ĐẾM bằng cây, TÍNH TIỀN bằng kg, và hai con số đó không quy đổi được bằng hệ số tĩnh:
-- cùng một mã, đo thật ra 6,57 m/cây ở lô này và 8,61 m/cây ở lô kia. Bản cũ chọn một trong
-- hai rồi suy ra cái còn lại — nên bất kỳ câu hỏi nào hỏi bằng đơn vị kia đều trả lời sai.
--
-- `actual_weight_micros` KHÔNG suy ra được từ `actual_qty_micros`. Nó là số cân thật, phải
-- được chở theo từng dòng sổ, nếu không thì cân xong là mất.
--
-- NULL có nghĩa: "dòng này không cân theo kiện". Không phải "cân được 0". Vì vậy cột nullable
-- và KHÔNG có DEFAULT 0 — đặt 0 là bịa ra một phép cân chưa từng xảy ra, và mọi phép cộng
-- sau đó im lặng nhận số bịa đó. Mọi dòng sổ đang có đều trở thành NULL, đúng nghĩa: chúng
-- được ghi từ trước khi hệ thống biết cân.
ALTER TABLE stock_ledger_entries ADD COLUMN actual_weight_micros INTEGER;

-- Cùng dấu với số lượng, hoặc không có gì cả.
--
-- Nhập 200 cây thì cân phải DƯƠNG; xuất 200 cây thì cân phải ÂM. Lệch dấu là bút toán tự mâu
-- thuẫn: số lượng nói nhập, khối lượng nói xuất. Không có ràng buộc này thì sổ vẫn cân theo
-- cây trong khi tổng kg trôi dần — đúng kiểu hỏng im lặng mà cả dự án sinh ra để chống.
--
-- Cân bằng 0 là hợp lệ và KHÁC NULL: có cân, kết quả 0 (lá vụn). Nên chỉ chặn khi hai số
-- ngược dấu thật sự.
CREATE TRIGGER IF NOT EXISTS stock_weight_sign_guard
BEFORE INSERT ON stock_ledger_entries
WHEN NEW.actual_weight_micros IS NOT NULL
 AND ((NEW.actual_qty_micros > 0 AND NEW.actual_weight_micros < 0)
   OR (NEW.actual_qty_micros < 0 AND NEW.actual_weight_micros > 0))
BEGIN
  SELECT RAISE(ABORT, 'STOCK_WEIGHT_SIGN_MISMATCH');
END;

-- Tồn theo KG tra cùng chỗ với tồn theo cây.
--
-- Không có chỉ mục này thì "còn bao nhiêu kg nhôm xám Xinfa trong K36" phải quét toàn sổ.
-- Cùng bộ cột với idx_sle_item_wh_posting để hai câu hỏi dùng chung một lối đi.
CREATE INDEX IF NOT EXISTS idx_sle_weight ON stock_ledger_entries(tenant_id, item_code, warehouse, batch_no)
WHERE actual_weight_micros IS NOT NULL;
