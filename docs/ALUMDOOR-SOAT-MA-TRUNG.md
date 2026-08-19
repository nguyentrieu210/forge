# Alumdoor — soát mặt hàng trùng tên

25 nhóm, 62 mã. Mỗi nhóm là các mã **cùng tên hàng trong cùng nhóm hàng**.

Câu hỏi cho mỗi nhóm: **hai mã này có phải cùng một món không?** Đánh dấu vào cột cuối rồi gửi lại.

- `GỘP` — cùng một món, giữ mã đầu tiên
- `GIỮ` — hai món khác nhau, cần đổi tên cho phân biệt
- `?` — chưa chắc, cần xem hàng thật

| # | Tên hàng | Nhóm hàng | Mã | Đơn giá | ĐM | Đã dùng | Máy đoán | Quyết |
|---:|---|---|---|---|---:|---:|---|---|
| 1 | RON NHỰA ĐÁY RAY | Ray và trục | `RNHUA-DR` | 20000 | — | — | GIÁ KHÁC NHAU — xem kỹ, có thể là hai món |  |
|  |  |  | `NVL-RNHUA-DR` | — | — | 9 |  |  |
| 2 | RON INOX ĐÁY RAY | Ray và trục | `RAY-RNINOX-DR` | 15000 | — | — | GIÁ KHÁC NHAU — xem kỹ, có thể là hai món |  |
|  |  |  | `RAY-RINOX-DR` | — | — | 9 |  |  |
| 3 | BỌ 1VIS 503N-71-595 | Phụ kiện CN Đức | `PK-BO-1VIS-503N-71-595` | 1500 | 1 | 2 | GIÁ KHÁC NHAU — xem kỹ, có thể là hai món |  |
|  |  |  | `PK-BO1VIS-503N-71-595` | — | — | 5 |  |  |
| 4 | RON ĐÁY ÚC | Phụ kiện chung | `RONDAYUC` | 10000 | 1 | 1 | GIÁ KHÁC NHAU — xem kỹ, có thể là hai món |  |
|  |  |  | `NVL-RONDAYUC` | — | — | 42 |  |  |
| 5 | RAY SẮT U70 (CÓ RON) | Ray và trục | `RAY-RS7P-CO-RON` | 75000 | 1 | 3 | GIÁ KHÁC NHAU — xem kỹ, có thể là hai món |  |
|  |  |  | `RAY-TOLE1.2X190-RON` | — | — | 183 |  |  |
| 6 | CỬA LƯỚI SN PHI 19 STD - TÁCH MÓN | Cửa Lưới | `LUOI-SN-TM` | 490000 | 1 | 9 | GIÁ KHÁC NHAU — xem kỹ, có thể là hai món |  |
|  |  |  | `LUOI-SNPHI19-INOX-TM` | 1290000 | 1 | 1 |  |  |
| 7 | LÁ ĐÀI LOAN STĐ MSK 1.2LY_TRỌN BỘ 3-4m² | Cửa Đài Loan | `TP-TOLEKEM124_1LY_TRONBO_3-4m²_MSK` | 690000 | 1 | 5 | GIÁ KHÁC NHAU — xem kỹ, có thể là hai món |  |
|  |  |  | `NVL-TOLEKEM124_1LY_MSK` | — | 1 | 21 |  |  |
| 8 | AL595 | Nan/lá cửa | `NVL-AL595-GS` | — | — | 2 | giá giống nhau nhưng đã dùng trong chứng từ — gộp phải dời lịch sử |  |
|  |  |  | `NVL-AL595-VK` | — | — | 2 |  |  |
|  |  |  | `NVL-AL595-THO` | — | — | 2 |  |  |
| 9 | AL71 | Nan/lá cửa | `NVL-AL71-GS` | — | — | 2 | giá giống nhau nhưng đã dùng trong chứng từ — gộp phải dời lịch sử |  |
|  |  |  | `NVL-AL71-VK` | — | — | 2 |  |  |
|  |  |  | `NVL-AL71-THO` | — | — | 2 |  |  |
| 10 | AL503 | Nan/lá cửa | `NVL-AL503-GS` | — | — | 2 | giá giống nhau nhưng đã dùng trong chứng từ — gộp phải dời lịch sử |  |
|  |  |  | `NVL-AL503-VK` | — | — | 2 |  |  |
|  |  |  | `NVL-AL503-THO` | — | — | 2 |  |  |
| 11 | AL548 | Nan/lá cửa | `NVL-AL548-GS` | — | — | 2 | giá giống nhau nhưng đã dùng trong chứng từ — gộp phải dời lịch sử |  |
|  |  |  | `NVL-AL548-VK` | — | — | 2 |  |  |
|  |  |  | `NVL-AL548-THO` | — | — | 2 |  |  |
| 12 | AL501 | Nan/lá cửa | `NVL-AL501-GS` | — | — | 2 | giá giống nhau nhưng đã dùng trong chứng từ — gộp phải dời lịch sử |  |
|  |  |  | `NVL-AL501-VK` | — | — | 2 |  |  |
|  |  |  | `NVL-AL501-THO` | — | — | 2 |  |  |
| 13 | AL652 | Nan/lá cửa | `NVL-AL652-GS` | — | — | 2 | giá giống nhau nhưng đã dùng trong chứng từ — gộp phải dời lịch sử |  |
|  |  |  | `NVL-AL652-VK` | — | — | 2 |  |  |
|  |  |  | `NVL-AL652-THO` | — | — | 2 |  |  |
| 14 | AL552 | Nan/lá cửa | `NVL-AL552-GS` | — | — | 2 | giá giống nhau nhưng đã dùng trong chứng từ — gộp phải dời lịch sử |  |
|  |  |  | `NVL-AL552-VK` | — | — | 2 |  |  |
|  |  |  | `NVL-AL552-THO` | — | — | 2 |  |  |
| 15 | AL752 | Nan/lá cửa | `NVL-AL752-GS` | — | — | 2 | giá giống nhau nhưng đã dùng trong chứng từ — gộp phải dời lịch sử |  |
|  |  |  | `NVL-AL752-VK` | — | — | 2 |  |  |
|  |  |  | `NVL-AL752-THO` | — | — | 2 |  |  |
| 16 | AL50 | Nan/lá cửa | `NVL-AL50-GS` | — | — | 2 | giá giống nhau nhưng đã dùng trong chứng từ — gộp phải dời lịch sử |  |
|  |  |  | `NVL-AL50-VK` | — | — | 2 |  |  |
|  |  |  | `NVL-AL50-THO` | — | — | 2 |  |  |
| 17 | ALVIP50 | Nan/lá cửa | `NVL-ALVIP50-GS` | — | — | 2 | giá giống nhau nhưng đã dùng trong chứng từ — gộp phải dời lịch sử |  |
|  |  |  | `NVL-ALVIP50-VK` | — | — | — |  |  |
|  |  |  | `NVL-ALVIP50-THO` | — | — | 2 |  |  |
| 18 | AL70 ( 2 LỚP) | Nan/lá cửa | `NVL-AL70(2LOP)-GS` | — | — | 2 | giá giống nhau nhưng đã dùng trong chứng từ — gộp phải dời lịch sử |  |
|  |  |  | `NVL-AL70(2LOP)-VK` | — | — | 2 |  |  |
|  |  |  | `NVL-AL70(2LOP)-THO` | — | — | 4 |  |  |
| 19 | AL75 | Nan/lá cửa | `NVL-AL75-GS` | — | — | 2 | giá giống nhau nhưng đã dùng trong chứng từ — gộp phải dời lịch sử |  |
|  |  |  | `NVL-AL75-VK` | — | — | 2 |  |  |
|  |  |  | `NVL-AL75-THO` | — | — | 2 |  |  |
| 20 | ĐỨC AL548N - MSK | Cửa CN Đức | `TP-ALD-548N-GS` | 1390000 | 1 | 7 | giá giống nhau nhưng đã dùng trong chứng từ — gộp phải dời lịch sử |  |
|  |  |  | `TP-ALD-548N-THO` | 1390000 | 1 | 7 |  |  |
| 21 | CỬA ĐL6D XN-XLC_TRỌN BỘ_5-6m² | Cửa Đài Loan | `TP-CUADL6D-XN-XLC_TRONBO_5-6m²` | 430000 | 1 | 5 | giá giống nhau nhưng đã dùng trong chứng từ — gộp phải dời lịch sử |  |
|  |  |  | `TP-CUADL6D-XN-VK_TRONBO_5-6m²` | 430000 | 1 | 6 |  |  |
| 22 | CỬA ĐL7D XN-XLC_TRỌN BỘ_5-6m² | Cửa Đài Loan | `TP-CUADL7D-XN-XLC_TRONBO_5-6m²` | 460000 | 1 | 4 | giá giống nhau nhưng đã dùng trong chứng từ — gộp phải dời lịch sử |  |
|  |  |  | `TP-CUADL7D-XN-VK_TRONBO_5-6m²` | 460000 | 1 | 4 |  |  |
| 23 | CỬA ĐL8D XN-XLC_TRỌN BỘ_5-6m² | Cửa Đài Loan | `TP-CUADL8D-XN-XLC_TRONBO_5-6m²` | 490000 | 1 | 4 | giá giống nhau nhưng đã dùng trong chứng từ — gộp phải dời lịch sử |  |
|  |  |  | `TP-CUADL8D-XN-VK_TRONBO_5-6m²` | 490000 | 1 | 4 |  |  |
| 24 | CỬA ĐL1LY XN-XLC_TRỌN BỘ_5-6m² | Cửa Đài Loan | `TP-CUADL1LY-XN-XLC_TRONBO_5-6m²` | 570000 | 1 | 4 | giá giống nhau nhưng đã dùng trong chứng từ — gộp phải dời lịch sử |  |
|  |  |  | `TP-CUADL1LY-XN-VK_TRONBO_5-6m²` | 570000 | 1 | 5 |  |  |
| 25 | BÁT (DÙNG BẮT VÀO LÁ YẾM) | Nan/lá cửa | `NHOM-BAT-MV` | — | — | 5 | giá giống nhau nhưng đã dùng trong chứng từ — gộp phải dời lịch sử |  |
|  |  |  | `NHOM-BAT-SN` | — | — | 5 |  |  |
