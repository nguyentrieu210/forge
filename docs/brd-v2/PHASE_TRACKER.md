# THEO DÕI PHA — ALUMDOOR V2

> Cập nhật: 2026-07-30 · nhánh `feat/alumdoor-v2-kho`

| Pha | Trạng thái | Bằng chứng |
|---|---|---|
| 1 — Research | ✅ Qua cổng | `docs/ALUMDOOR-V2-PHA1-RESEARCH.md` |
| 2 — BRD | ✅ Qua cổng, giữ đúng 2 cảnh báo đã công khai | `BRD.md` §11: 8 ✅ + 2 ⚠️ |
| 3 — Thiết kế kỹ thuật | ✅ 10/10 sau khi đóng D1–D6 | `TECHNICAL_DESIGN.md` §9 |
| 4 — Brief/cổng biên dịch | ✅ | `server/briefs/alumdoor-v2.json`; `forge-app --dry-run` → `DRY_RUN_PASS`, 69 doctypes, 56 fixtures, 63 nav |
| 5 — Build | 🔄 Đang làm | M1–M5 đã gộp; các lát cắt bên dưới |
| 6 — Verify/QA | ⬜ Chưa qua cổng | Chưa có browser QA và bộ bằng chứng production V2 |
| 7 — Release | ⬜ Chưa làm | Production vẫn là Alumdoor 1.27.0 theo `ALUMDOOR-HANDOFF.md` |

## Pha 5 — lát cắt đã hoàn tất

- [x] M1 — `actual_weight_micros` đi xuyên migration, contract, D1 store, in-memory store và tracking.
- [x] M2 — đơn giá khai `rate_uom`; giá đ/kg nhân kg thực cân rồi chia lại theo số cây/lá.
- [x] M3–M5 — định giá thu hẹp theo lô, từ chối phương pháp giá vốn lạ, hết tràn số VND.
- [x] Q8 — Phiếu xuất không bán (`Xuất mẫu`, `Đổi bảo hành`, `Xuất nội bộ`, `Xuất gia công`) không cần Đơn bán/Khách hàng; không sinh fulfillment giả.
- [x] Phiếu nhập theo lô ghi cùng một dòng sổ: số cây/lá + kg + giá trị; retry idempotent; huỷ đảo đủ ba số.
- [x] Phiếu xuất và Phiếu kho mang `weight_kg` vào sổ; mặt hàng catch-weight thiếu kg bị từ chối khi submit.
- [x] `reverseStock` đảo cả `actual_weight_micros`.
- [x] Huỷ Phiếu xuất/Phiếu kho đọc đúng bút toán gốc theo `(voucher_type, voucher_no, voucher_revision)` rồi đảo nguyên trạng; test hai lô khác giá chứng minh không chia lại theo bình quân.
- [x] Trạng thái Phiếu xuất không bán được giữ là `Submitted` ở cả lúc ghi và lúc đọc lại; không bị suy diễn thành `To Bill`.
- [x] Brief Phiếu nhập nói đúng hành vi mới: kg thực cân là số lượng tồn thứ hai, bắt buộc với nhôm catch-weight và được đảo khi huỷ.

## Pha 5 — việc kế tiếp

- [ ] Nối action/validator `Cut Order` với khuôn `Stock Entry`: tính `kg_consumed`, cân thật thắng, kerf và đầu thừa.
- [ ] Sinh lô đầu thừa + bundle Inward ở kho Đầu thừa; hoàn cắt đảo đúng lô con.
- [ ] Hoàn thiện `Stock Reconciliation` hai đơn vị và chênh lệch kg.
- [x] Chạy test đầy đủ + worker typecheck cho lát cắt hiện tại.
- [ ] Chưa deploy, chưa pilot production khi chưa backup và diễn tập migration hai lần.

## Bằng chứng kiểm thử gần nhất

- Targeted: 48/48 PASS (`batch-valuation`, `catch-weight-valuation`, `o2c`, `erpnext-core`).
- Full server sau lát cắt: 501/501 unit PASS + toàn bộ SQL PASS.
- Worker typecheck: PASS.
- Brief V2 tái sinh từ script và `DRY_RUN_PASS`.
