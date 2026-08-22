# Alumdoor — Kế toán, gói `ledger`/`money` (đợt 2, sâu hơn MFG-ACC K1-K4 21/08) — Khoảng trống danh mục (21/08/2026, vòng 3)

## 0. Phạm vi & phương pháp — ⚠ CHỈ CÓ LANE SERVER

**Lưu ý quan trọng:** vòng workflow này bị dừng sớm theo yêu cầu người dùng — agent lane SCREEN cho module Kế toán **chưa từng chạy**. Agent lane server tự nhận định: 2 gói `ledger`/`money` là thư viện tính toán thuần, không map trực tiếp tới DocType/field nào trong `server/briefs/alumdoor-v2.json`, nên tiêu chí "khoảng trống UI" khó áp dụng trực tiếp cho chính 2 gói này — nhưng vẫn cần một lượt lane-screen riêng cho các *report/màn hình kế toán* (Sổ cái, đối soát) ở vòng sau để đối chiếu chéo với 2 finding P0 vừa tìm được ở module Công nợ (§ file riêng — cùng gốc `FinanceQueryCompiler` wiring).

Lần MFG-ACC gốc (21/08) đã tìm K1-K4. Lượt này đào sâu riêng 2 package `ledger`/`money` (chưa ai audit).

**Tổng kết nhanh: 1 P1 + 1 P2, 0 P0.**

## 1. Lane SERVER (2 phát hiện)

### S1 — P1 — `assertNonNegativeMinor` (money) — luật ngủ hoàn toàn, không nơi nào gọi, không có luật thay thế
- **Luật ngủ:** có
- **Bằng chứng:** `server/packages/money/src/index.ts:74-76` (`export function assertNonNegativeMinor(value: number, field: string): void { if (!Number.isSafeInteger(value) || value < 0) throw errors.validation(...) }`)
- **Mô tả:** Hàm được export như "guard" chặn số tiền âm (đơn vị minor-integer), nhưng grep toàn bộ `server/apps-src` + `server/packages` (tất cả gói nghiệp vụ: clouderp-selling, clouderp-erpnext, clouderp-core, clouderp-stock, clouderp-pricing, document-kernel, app-registry...) chỉ ra đúng 1 lần xuất hiện — chính dòng định nghĩa. Đã liệt kê toàn bộ ~90 dòng import từ `money/src/index.js` trên toàn server, không dòng nào import `assertNonNegativeMinor`. Không có luật kiểm tra âm tương đương nào được cài thủ công cho các field tổng tiền quan trọng (grep `grand_total_minor < 0`, `net_total_minor < 0`, `amount_minor < 0` = 0 kết quả). **Rủi ro:** nếu `net_total_minor`/`grand_total_minor` tính sai thành số âm do lỗi logic chiết khấu/thuế, không hàm nào ở tầng money chặn lại — số đó chảy tiếp vào `controllers.ts`, nơi mẫu code kiểu `debit_minor: value<0?-value:0` tự động lật dấu, khiến một hoá đơn bị âm do bug được ghi sổ thành bút toán đối ứng ngược mà không có exception nào được ném ra, thay vì bị chặn ngay tại nguồn. Hàm tồn tại từ commit gộp monorepo ban đầu (git blame: `1ba55dee4`) nhưng chưa từng được nối dây.

### S2 — P2 — `compareDecimal` (money) — hàm so sánh decimal xuất khẩu nhưng không nơi nào dùng
- **Luật ngủ:** có
- **Bằng chứng:** `server/packages/money/src/index.ts:78-80`; grep `\bcompareDecimal\b` toàn `server/apps-src` + `server/packages` ra 4 kết quả: 1 là định nghĩa, 3 còn lại là hàm CÙNG TÊN nhưng ĐỘC LẬP tự định nghĩa cục bộ trong `server/packages/app-registry/src/bpm-rule.ts:168` (nhận JsonValue, không liên quan money)
- **Mô tả:** `compareDecimal` của money package có 0 nơi gọi thực sự; grep client cũng 0. Không có đoạn code nào tái triển khai logic tương đương thủ công ở nơi khác — đơn thuần là hàm chưa từng dùng, không phải bị thay thế bởi bản sao chép tay. Rủi ro thấp vì chỉ là tiện ích so sánh, không phải guard chặn lỗi.

**0 ứng viên P0 tìm thấy.** Gói `ledger` (`assertBalancedGl`, `reverseGl`, `reverseStock`, `reversePayment` — 4/4 export) đều có nơi gọi rất dày đặc (`assertBalancedGl` gọi ở `document-kernel/src/kernel.ts:157`; 3 hàm reverse được gọi ở hàng chục controller trong clouderp-selling/clouderp-stock/clouderp-erpnext/clouderp-core) — 0 ứng viên luật ngủ. Trong `money`, 6/8 export (`toScaledInt`, `fromScaledInt`, `multiplyScaled`, `percentOfMinor`, `addMinor`, `negateMinor`) đều có nơi gọi rõ ràng (7 đến hơn 400 lần). Không phát hiện hàm bút toán/ghi sổ nào bị gọi sai/mất số tiền trực tiếp hay chặn hẳn nghiệp vụ chính — các hàm lõi ghi sổ GL/kho/thanh toán đều nối dây đầy đủ và có kiểm tra cân bằng debit=credit chặt ở `assertBalancedGl`.

## 2. Lane SCREEN — CHƯA CHẠY (việc treo cho vòng sau)

Chưa có agent nào audit khoảng trống UI riêng cho module Kế toán trong vòng 3. **Khuyến nghị mạnh cho vòng sau:** đối chiếu trực tiếp với 2 finding P0 vừa tìm ở `ALUMDOOR-CONG-NO-DANH-MUC-GAP-20260821.md` (`FinanceClosureQueryCompiler`/`AccountsPayableQueryCompiler` không nằm trên đường chạy report mà client gọi được) — cả hai đều thuộc phạm vi "kế toán/đối soát", chỉ được lane Công nợ phát hiện vì agent đó được giao đúng file `finance-closure.ts`/`ap-reconciliation.ts`. Vòng sau nên kiểm xem còn compiler kế toán nào khác (ngoài `query/src/*.ts`) rơi vào cùng mẫu lỗi "kế thừa N bậc nhưng compiler thực chạy chỉ new đúng 1 bậc cha" hay không.

## 3. Sổ đăng ký luật ngủ mới (để cộng vào README)

| Ca | Nguồn | Lệnh xác nhận nhanh |
|---|---|---|
| `assertNonNegativeMinor` chết | `money/src/index.ts:74-76` | `grep -rn "assertNonNegativeMinor" server client` → kỳ vọng 1 (chỉ định nghĩa) |
| `compareDecimal` (money) chết | `money/src/index.ts:78-80` | `grep -rn "\bcompareDecimal\b" server client` → kỳ vọng 4 (1 định nghĩa money + 3 là bản độc lập ở `bpm-rule.ts:168`, không tính) |

## 4. Tổng kết

| Hạng | Server (Screen: chưa chạy) | Tổng |
|---|:--:|:--:|
| P0 | 0 | **0** |
| P1 | 1 | **1** |
| P2 | 1 | **1** |
| **Tổng** | 2 | **2** |
