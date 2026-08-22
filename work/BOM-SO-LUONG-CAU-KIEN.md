# BOM — cột SL đã đưa về số cấu kiện

Sửa ngày 2026-08-22. 13 dòng trên 8 BOM.

Trước: cột SL chứa **số quy đổi đơn vị** (11,64 m² tôn, 0,066 kg vis) và `qty_basis` mang
giá trị `"Theo kích thước"` — giá trị KHÔNG có trong danh sách Select của DocType.

Sau: cột SL là **số cấu kiện**, `qty_basis` nói trục nào chi phối chiều dài.
Chiều dài mỗi cái do Quy tắc BOM tính lúc có đơn.

| BOM | Loại cửa | Cấu kiện | SL | ĐVT | Nhân theo | Chiều dài mỗi cái |
|---|---|---|---|---|---|---|
| DM-2026-0001 | Cửa Đài Loan | TON_DLM_1LY_K124 | 1 | Lá | Theo diện tích | PB_CAO × (PB_RAY_RONG - 0,03) |
| DM-2026-0002 | Cửa Đài Loan | TON_DLM_1LY_K124 | 1 | Lá | Theo diện tích | PB_CAO × (PB_RAY_RONG - 0,03) |
| DM-2026-0003 | Cửa Đài Loan | TON_DLM_6D_K124 | 1 | Lá | Theo diện tích | PB_CAO × (PB_RAY_RONG - 0,03) |
| DM-2026-0004 | Cửa Đài Loan | TON_DLM_6D_K124 | 1 | Lá | Theo diện tích | PB_CAO × (PB_RAY_RONG - 0,03) |
| DM-2026-0005 | Cửa Đài Loan | TON_DLM_7D_K124 | 1 | Lá | Theo diện tích | PB_CAO × (PB_RAY_RONG - 0,03) |
| DM-2026-0006 | Cửa Đài Loan | TON_DLM_7D_K124 | 1 | Lá | Theo diện tích | PB_CAO × (PB_RAY_RONG - 0,03) |
| DM-2026-0022 | Cửa tấm liền Úc | PKC_RON_DD | 1 | Cái | Theo chiều rộng | CAT_LA_RONG |
| DM-2026-0022 | Cửa tấm liền Úc | PKC_BO_1VIS_AL701LOP | 1 | Cái | Theo chiều rộng | CAT_LA_RONG |
| DM-2026-0022 | Cửa tấm liền Úc | PKC_XOP_N45 | 1 | Cái | Theo số lá | CEIL(PB_RAY_RONG ÷ 0,45 × 2) |
| DM-2026-0022 | Cửa tấm liền Úc | RT_TRUC34 | 1 | Cây | Theo chiều rộng | PB_RAY_RONG + 0,4 |
| DM-2026-0023 | Cửa tấm liền Úc | PKC_RON_DD | 1 | Cái | Theo chiều rộng | CAT_LA_RONG |
| DM-2026-0023 | Cửa tấm liền Úc | PKC_XOP_N45 | 1 | Cái | Theo số lá | CEIL(PB_RAY_RONG ÷ 0,45 × 2) |
| DM-2026-0023 | Cửa tấm liền Úc | RT_TRUC34 | 1 | Cây | Theo chiều rộng | PB_RAY_RONG + 0,4 |
