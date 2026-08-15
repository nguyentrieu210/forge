#!/usr/bin/env python3
"""Trích TOÀN BỘ 4 file nguồn của xưởng ra một chỗ, để không ai phải nhớ.

    python tools/trich-nguon.py [--downloads C:/Users/Admin/Downloads] [--out docs/nguon]

Vì sao có file này: 4 file · 41 sheet · 21 ảnh nhúng. Đọc từng mảnh rồi trả lời từ trí nhớ là
cách chắc chắn để hỏi lại thứ đã có sẵn — đã xảy ra bốn lần trong một buổi (bản lá lá phụ,
ranh giới bậc giá, luật giá bộ, cửa Úc dùng Cao PB). Bản trích này là thứ tra được.

Sinh ra:
    docs/nguon/00-MUC-LUC.md        bản đồ 41 sheet + 21 ảnh, kèm số dòng thật
    docs/nguon/<file>/<sheet>.md    mỗi sheet một file: tiêu đề + toàn bộ dòng có dữ liệu
    docs/nguon/anh/                 21 ảnh tách ra, đặt tên theo nội dung

KHÔNG đọc được bằng máy: nội dung BÊN TRONG ảnh. Bảng bản lá 19 mã và 4 bảng giá đều là ảnh —
đã chép tay sang docs/nguon/ANH-DA-CHEP.md, và đó là nguồn thắng khi mâu thuẫn.
"""
import argparse, os, re, shutil, sys, zipfile

try:
    import openpyxl
except ImportError:
    sys.exit("Thiếu openpyxl: pip install openpyxl")

FILES = {
    "ms-lien": "MS LIÊN BS.xlsx",
    "ton-nhom": "TỒN NHÔM 2026 NEW (1).xlsx",
    "quy-cach": "QUY CÁCH  (3).xlsx",
    # Sổ điều độ đơn hàng → xuất kho, chia theo tháng. 14 sheet, ~8.000 dòng.
    # Bỏ sót file này một lần rồi: BRD từng ghi "Lệnh sản xuất chưa có trong Excel" — sai,
    # nó nằm ở đây với đủ cột LỆNH SX, LỆNH XUẤT KHO, DS BẢO HÀNH, LỊCH SẢN XUẤT.
    "don-hang-xuat-hang": "2026 ĐƠN HÀNG - XUẤT HÀNG.xlsx",
    # Kết xuất từ chính app đang chạy — đối chiếu được app đã có gì.
    "app-vat-tu": "Hàng hoá _ Vật tư-20260728-2018 (1).xlsx",
    "app-khach-hang": "Khách hàng-20260813-1219.xlsx",
}
DOCX = "25.7 QUY TRÌNH (2).docx"

# PDF chép sẵn nội dung — máy đọc được chữ, tin hơn đọc ảnh.
PDF_QUAN_TRONG = {
    "25.07.26 DDH - CÔNG THỨC CHIA LÁ.pdf":
        "BẢNG BẢN LÁ 19 MÃ — bản PDF của cùng bảng trong image2.png, đọc được chữ nên "
        "chính xác hơn. Đây là nguồn TỐT NHẤT cho bản lá và luật trừ-một-lá.",
    "MẪU ĐƠN ĐẶT HÀNG.pdf": "Mẫu đơn đặt hàng xưởng dùng.",
}

# Ảnh nào là gì — tra bằng mắt một lần, ghi lại vĩnh viễn.
ANH = {
    "25.7 QUY TRÌNH (2).docx": {
        "image2.png": "BANG-BAN-LA-19-MA__CONG-THUC-TINH-SO-LA-CUA-DUC",
        "image16.png": "CHI-TIET-SON__ban-la-tung-loai-la",
        "image5.png": "CHI-TIET-SON__ban-sao",
        "image11.png": "SAN-XUAT-LAY-KHO__vi-du-chieu-dai-cat-tung-la",
        "image4.png": "VI-DU-AL70__42-la",
        "image8.png": "VI-DU-AL70__1-cong-41",
        "image3.png": "VI-DU-AL70__38-cong-4",
        "image6.png": "MAU-BANG-DON-SX__so-la-ton-1.7-co-dinh",
        "image10.png": "SHEET-NHAP-HANG",
        "image15.png": "LICH-SAN-XUAT__dinh-muc-cong-viec",
        "image14.png": "DANH-SACH-LOI",
        "image7.png": "TON-NHOM__man-cat-nhom",
        "image17.png": "TON-NHOM__sheet-AL75",
        "image1.png": "APP__man-tao-don-AL70-2-lop-1-lop",
        "image9.png": "APP__chon-nhom-SP",
        "image12.png": "APP__ray-hop-hoac-ray-don-TD-U76",
        "image13.png": "APP__ray-sat-U70-khong-ron",
    },
    "2026 ĐƠN HÀNG - XUẤT HÀNG.xlsx": {
        "image1.png": "LOGO-ALUMDOOR",
    },
    "QUY CÁCH  (3).xlsx": {
        "image4.png": "BANG-GIA-DAI-LOAN-BANG-75-TRON-BO__8-bac-x-7-cot",
        "image3.png": "GIA-LA-DAI-LOAN__va-11-phu-kien-cua-cuon",
        "image1.png": "GIA-CUA-LUOI__3-loai-x-2-chat-lieu",
        "image2.png": "PHU-THU-VA-GIA-TRON-GOI__duoi-7m2-va-duoi-4m2",
    },
}


def slug(text):
    text = re.sub(r"[^\w\s-]", "", str(text), flags=re.UNICODE).strip()
    return re.sub(r"[\s]+", "-", text) or "khong-ten"


def viet_sheet(ws, path, ten_sheet):
    rows = [r for r in ws.iter_rows(values_only=True)
            if r and any(v is not None and str(v).strip() for v in r)]
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(f"# {ten_sheet}\n\n{len(rows)} dòng có dữ liệu.\n\n")
        if not rows:
            fh.write("_Sheet rỗng._\n")
            return 0
        # Ghi dạng "dòng | [cột] giá trị" — giữ được chỉ số cột, thứ tôi hay đọc nhầm.
        for i, r in enumerate(rows, 1):
            cells = [f"[{j}] {str(v).strip()}"
                     for j, v in enumerate(r) if v is not None and str(v).strip()]
            if cells:
                fh.write(f"{i:>5} | " + "  ·  ".join(cells) + "\n")
    return len(rows)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--downloads", default="C:/Users/Admin/Downloads")
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "..", "docs", "nguon"))
    args = ap.parse_args()
    out = os.path.abspath(args.out)
    os.makedirs(os.path.join(out, "anh"), exist_ok=True)

    muc_luc = ["# Mục lục nguồn Alumdoor",
               "",
               "Sinh bằng `tools/trich-nguon.py`. **Đừng trả lời từ trí nhớ — tra ở đây.**",
               ""]
    tong_dong = 0

    for key, fname in FILES.items():
        src = os.path.join(args.downloads, fname)
        if not os.path.exists(src):
            muc_luc.append(f"- ⚠️ **{fname}** — không tìm thấy")
            continue
        d = os.path.join(out, key)
        os.makedirs(d, exist_ok=True)
        wb = openpyxl.load_workbook(src, data_only=True)
        muc_luc.append(f"## {fname}\n\n| Sheet | Dòng | File |\n|---|---|---|")
        for s in wb.sheetnames:
            n = viet_sheet(wb[s], os.path.join(d, f"{slug(s)}.md"), s)
            tong_dong += n
            muc_luc.append(f"| {s} | {n} | `{key}/{slug(s)}.md` |")
        muc_luc.append("")

        with zipfile.ZipFile(src) as z:
            for n in z.namelist():
                if "/media/" not in n:
                    continue
                base = os.path.basename(n)
                ten = ANH.get(fname, {}).get(base) or f"CHUA-TRA__{os.path.splitext(base)[0]}"
                with z.open(n) as fh, open(os.path.join(out, "anh", f"{ten}.png"), "wb") as w:
                    shutil.copyfileobj(fh, w)

    docx = os.path.join(args.downloads, DOCX)
    if os.path.exists(docx):
        with zipfile.ZipFile(docx) as z:
            xml = z.read("word/document.xml").decode("utf-8")
            txt = re.sub(r"<[^>]+>", "\n", xml)
            lines = [l.strip() for l in txt.split("\n") if l.strip()]
            with open(os.path.join(out, "quy-trinh-van-ban.md"), "w", encoding="utf-8") as fh:
                fh.write(f"# {DOCX} — phần CHỮ\n\n"
                         f"{len(lines)} đoạn. **Phần quan trọng nhất nằm trong ẢNH, không ở đây** "
                         f"— xem `anh/` và `ANH-DA-CHEP.md`.\n\n")
                fh.write("\n".join(lines))
            for n in z.namelist():
                if "/media/" not in n:
                    continue
                base = os.path.basename(n)
                ten = ANH.get(DOCX, {}).get(base) or f"CHUA-TRA__{os.path.splitext(base)[0]}"
                with z.open(n) as fh, open(os.path.join(out, "anh", f"{ten}.png"), "wb") as w:
                    shutil.copyfileobj(fh, w)
        muc_luc.append(f"## {DOCX}\n\n- Phần chữ: `quy-trinh-van-ban.md` ({len(lines)} đoạn)")

    muc_luc += ["", "## PDF rời — đọc được chữ, tin hơn ảnh", ""]
    for ten, mo_ta in PDF_QUAN_TRONG.items():
        co = "✅" if os.path.exists(os.path.join(args.downloads, ten)) else "⚠️ không thấy"
        muc_luc.append(f"- {co} **`{ten}`** — {mo_ta}")

    anh = sorted(os.listdir(os.path.join(out, "anh")))
    muc_luc += ["", f"## {len(anh)} ảnh nhúng", "",
                "Máy không đọc được nội dung bên trong. Bản chép tay: `ANH-DA-CHEP.md`.", ""]
    muc_luc += [f"- `anh/{a}`" for a in anh]

    with open(os.path.join(out, "00-MUC-LUC.md"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(muc_luc) + "\n")

    print(f"Đã ghi {out}")
    print(f"  {tong_dong} dòng dữ liệu · {len(anh)} ảnh")
    chua = [a for a in anh if a.startswith("CHUA-TRA")]
    if chua:
        print(f"  ⚠️ {len(chua)} ảnh chưa tra nội dung: {', '.join(chua)}")


if __name__ == "__main__":
    main()
