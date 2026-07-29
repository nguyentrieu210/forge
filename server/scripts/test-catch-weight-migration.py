#!/usr/bin/env python3
"""Diễn tập migration 0024 — sổ kho mang hai con số.

Vì sao script này QUÉT THƯ MỤC thay vì liệt kê tên file:

    `verify-sql.py` liệt kê tay 15 migration và dừng ở 0015. Từ 0016 đến 0024 — CHÍN cái —
    không script nào chạm tới, nhưng `npm run test:sql` vẫn in ra năm dòng PASS. Tín hiệu
    xanh đó không nói gì về những migration mới nhất, mà đó lại chính là những cái vừa viết
    và dễ sai nhất.

    Danh sách gõ tay là thứ luôn tụt lại: người thêm migration không có lý do gì để nhớ sửa
    một danh sách nằm ở file khác. Quét thư mục thì không có gì để quên.
"""
import sqlite3
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
migrations = sorted((root / "migrations/tenant").glob("*.sql"))
if not migrations:
    sys.exit("Không thấy migration nào trong migrations/tenant")

connection = sqlite3.connect(":memory:")
connection.execute("PRAGMA foreign_keys=ON")
for migration in migrations:
    connection.executescript(migration.read_text(encoding="utf-8"))

columns = {row[1] for row in connection.execute("PRAGMA table_info(stock_ledger_entries)")}
assert "actual_weight_micros" in columns, "0024 chưa thêm cột actual_weight_micros"

triggers = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='trigger'")}
assert "stock_weight_sign_guard" in triggers, "0024 chưa tạo stock_weight_sign_guard"

COLUMNS = (
    "tenant_id,voucher_type,voucher_no,voucher_revision,line_key,item_code,warehouse,"
    "actual_qty_micros,actual_weight_micros,valuation_rate_minor,stock_value_difference_minor,"
    "qty_scale,currency_scale,currency,posting_at,allow_negative_stock"
)


def insert(line_key, qty_micros, weight_micros):
    connection.execute(
        f"INSERT INTO stock_ledger_entries({COLUMNS}) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        ("t1", "Purchase Receipt", "PNM-2026-0001", 1, line_key, "NHOM-4.6D", "K36",
         qty_micros, weight_micros, 0, 0, 6, 2, "VND", "2026-07-30T00:00:00.000Z", 1),
    )


def refused(line_key, qty_micros, weight_micros, why):
    try:
        insert(line_key, qty_micros, weight_micros)
    except sqlite3.IntegrityError as error:
        assert "STOCK_WEIGHT_SIGN_MISMATCH" in str(error), f"{why}: sai mã lỗi — {error}"
        return
    sys.exit(f"PHẢI bị từ chối mà lại lọt: {why}")


# Cho phép — mỗi dòng là một nghĩa KHÁC nhau, không được gộp:
insert("L1", 200_000_000, 1_200_000_000)   # nhập 200 cây, cân 1.200 kg — cùng dấu dương
insert("L2", -50_000_000, -300_000_000)    # xuất 50 cây, cân 300 kg — cùng dấu âm
insert("L3", 10_000_000, None)             # không cân theo kiện: NULL, không phải 0
insert("L4", 10_000_000, 0)                # CÓ cân, kết quả 0 (lá vụn) — khác hẳn NULL ở trên

# Từ chối — bút toán tự mâu thuẫn: số lượng nói nhập, khối lượng nói xuất.
refused("X1", 200_000_000, -1_200_000_000, "nhập cây mà cân âm")
refused("X2", -200_000_000, 1_200_000_000, "xuất cây mà cân dương")

null_rows = connection.execute(
    "SELECT COUNT(*) FROM stock_ledger_entries WHERE actual_weight_micros IS NULL"
).fetchone()[0]
zero_rows = connection.execute(
    "SELECT COUNT(*) FROM stock_ledger_entries WHERE actual_weight_micros = 0"
).fetchone()[0]
assert null_rows == 1 and zero_rows == 1, (
    f"NULL và 0 phải đếm riêng được (NULL={null_rows}, 0={zero_rows}) — "
    "gộp hai thứ đó là mất khả năng phân biệt 'chưa cân' với 'cân được 0'"
)

# Dong ket in ASCII: console Windows mac dinh cp1252, in tieng Viet co dau la UnicodeEncodeError
# — test PASS ma exit 1, dung kieu tin hieu do gia.
print(f"CATCH_WEIGHT_MIGRATION_0024_PASS ({len(migrations)} migrations, globbed)")
