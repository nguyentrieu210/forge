# 10 ô công thức hỏng trong `MS LIÊN BS.xlsx` — đã mở từng ô

Soi ngày 22/08/2026 bằng `openpyxl`, đọc cả giá trị đã tính lẫn công thức gốc.
Kết luận: **không ô nào là mất dữ liệu**, và chỉ có **2 lỗi gốc**, cả hai nằm ở sổ bán hàng
chứ không đụng danh mục hay định mức.

File này được làm trên **Google Sheets** rồi tải về `.xlsx`. Excel không có các hàm mảng
động của Google Sheets, nên chúng được xuất thành `__xludf.DUMMYFUNCTION("…")` kèm giá trị
lỗi đã đóng băng. Sáu trong mười ô thuộc loại này hoặc lan từ nó.

## Nhóm A — hàm Google Sheets không chạy được trên Excel (4 ô)

| Ô | Công thức gốc | Là gì |
|---|---|---|
| `ĐM!C1925` | `UNIQUE(FILTER((C34:C382),(B34:B382="")))` | bảng **dẫn xuất** liệt kê phụ kiện cửa Đức |
| `ĐM!C1983` | `UNIQUE(FILTER(C689:C1056,B689:B1056=""))` | như trên, phụ kiện cửa Úc |
| `BCKQKD!M24` | `SUM(FILTER('chi tiết nhập hàng ngày'!X:X, …))` | tổng doanh thu theo nhóm |
| `BCKQKD!M21` | `=sum(M22:M29)` | lan từ `M24` |

**Không mất gì.** Hai ô trong sheet `ĐM` chỉ là bản chiếu lại của dữ liệu đã nằm sẵn ở
dòng 34–382 (cửa Đức) và 689–1056 (cửa Úc). Trước đây tưởng `C1925` làm mất một cấu kiện
của `ĐỨC AL595 - GS` — không phải: khối 1925+ là vùng công thức tràn, không phải vùng nhập
liệu. Tên `ĐỨC AL595 - GS` lặp lại ở cột E các dòng 1925–1931 chỉ vì `VLOOKUP` cạnh đó cũng
hỏng theo.

## Nhóm B — lỗi nhập liệu thật (2 ô gốc + 4 ô lan)

### `chi tiết nhập hàng ngày!S323` — gõ chữ vào ô số

```
I323 = LÁ ĐÀI LOAN STĐ 8D        O323 = 4        P323 = 5,18
R323 = 20,72  (=P323*O323)       S323 = "tính lại"   ← ô ĐƠN GIÁ
T323 = #VALUE! (=S323*R323*Q323)
W323 = 6.630.400   (đã thu)
```

Ai đó gõ ghi chú **"tính lại"** vào ô đơn giá rồi quên quay lại. Suy ngược từ số đã thu:
`6.630.400 ÷ 20,72 m² ≈ 320.000/m²`. `V323` và `X323` lan theo.

### `chi tiết nhập hàng ngày!T491` — ô tự trỏ vào chính nó

```
I491 = RAY SẮT (KHÔNG RON) U70
T491 = "=T491*8%"     ← tham chiếu vòng
W491 = 497.245
```

Nhiều khả năng định gõ `=W491*8%`. `V491` và `X491` lan theo.

## Ảnh hưởng

| | |
|---|---|
| Danh mục, định mức, giá | **không ảnh hưởng** — mọi ô hỏng đều ngoài luồng đó |
| Sổ bán hàng | 2 dòng sai: 323 mất doanh thu, 491 mất khoản 8% |
| Báo cáo `BCKQKD` | `M21` và `M24` không tính được |

## Việc cần làm trong file nguồn

1. `S323`: điền đơn giá thật (≈ 320.000) thay cho chữ "tính lại".
2. `T491`: sửa `=T491*8%` thành tham chiếu đúng ô.
3. Bốn ô nhóm A: nếu vẫn dùng Google Sheets thì mở bằng Google Sheets là chúng chạy lại
   bình thường. Nếu chuyển hẳn sang Excel, phải viết lại bằng hàm Excel tương đương.
