# SOÁT HỆ SỐ QUY ĐỔI ĐVT — 52 mã đang để hệ số = 0 trong D1

Nguồn: sheet `ĐM` của `MS LIÊN BS.xlsx` (cột ĐVT dạng `KG/CON`, `KG/CẶP`… và chữ `x,xkg/CÁI` trong cột I).

Đây là **hệ số cân**: mua theo Kg, dùng/bán theo đơn vị kia.


> ⚠ CHƯA ghi gì vào D1. Đây là đề xuất chờ duyệt.


---

## 1. CHỐT ĐƯỢC NGAY — 17 mã (nguồn rõ, 1 giá trị duy nhất)

| Mã D1 | Tên hàng | Quy đổi | Nguồn trong file | Duyệt? |
|---|---|---|---|---|
| `PKC_BULON12.12` | BÙ LON 12x12 | **1 Con = 0.096 Kg** | ĐVT KG/CON | ⬜ |
| `PKC_CONTAN12` | CON TÁN 12 | **1 Con = 0.00011 Kg** | ĐVT KG/CON | ⬜ |
| `PKS_LUOIMV` | LƯỚI MV | **1 m2 = 0.35 Kg** | ĐVT KG/M2 | ⬜ |
| `PKC_BKAN` | BÁT KHÓA ÂM NỀN | **1 Cặp = 0.1925 Kg** | ĐVT KG/CẶP | ⬜ |
| `PKC_CONTAN_MV` | CON TÁN | **1 Con = 0.0008 Kg** | cột I | ⬜ |
| `PKC_DINHTAN_MV` | ĐINH TÁN MẮT VÕNG | **1 Con = 0.0015 Kg** | cột I | ⬜ |
| `PKC_DINHTAN_SN` | ĐINH TÁN SONG NGANG | **1 Con = 0.0015 Kg** | cột I | ⬜ |
| `PKC_LV_6.0_X_70_X_53V` | HH LÒ XO 53V | **1 Cái = 2.4 Kg** | cột I | ⬜ |
| `PKC_LV_6.5_X_80_X_63V` | HH LÒ XO 63V | **1 Cái = 3.8 Kg** | cột I | ⬜ |
| `PKC_LV_6.5_X_80_X_68V` | HH LÒ XO 68V | **1 Cái = 4.2 Kg** | cột I | ⬜ |
| `PKC_LV_7.0_X_90_X_65V` | HH LÒ XO 65V | **1 Cái = 5.1 Kg** | cột I | ⬜ |
| `PKC_LV_7.0_X_90_X_73V` | HH LÒ XO 73V | **1 Cái = 5.8 Kg** | cột I | ⬜ |
| `PKC_LV_7.0_X_90_X_83V` | HH LÒ XO 83V | **1 Cái = 6.7 Kg** | cột I | ⬜ |
| `PKC_LX_5.5_X_70_X_46V` | HH LÒ XO 46V | **1 Cái = 1.7 Kg** | cột I | ⬜ |
| `PKC_LX_5.5_X_70_X_50V` | HH LÒ XO 50V | **1 Cái = 1.9 Kg** | cột I | ⬜ |
| `PKC_RONDAYUC` | RON ĐÁY ÚC | **1 Mét = 0.0077 Kg** | ĐVT KG/M NGANG | ⬜ |
| `PKDUC_BO_1VIS_503N_71_595` | BỌ 1VIS 503N-71-595 | **1 Con = 0.1179 Kg** | ĐVT KG/CON | ⬜ |

## 2. NHIỀU GIÁ TRỊ — 2 mã (bạn chốt 1)

| Mã D1 | Tên hàng | Các giá trị trong file | Chọn | 
|---|---|---|---|
| `PKC_V4` | V4 | 1 Mét = [1.312, 1.464] Kg | ⬜ 1.312  /  ⬜ 1.464 |
| `PKC_V4_KEM` | V4 KẼM | 1 Mét = [1.312, 1.464] Kg | ⬜ 1.312  /  ⬜ 1.464 |

## 3. KHÔNG CÓ TRONG SHEET ĐM — 33 mã (cần bạn cho số)

| Mã D1 | Tên hàng | Cần hệ số | Điền |
|---|---|---|---|
| `LKMT_COT` | CỐT | 1 Cây = ? Cây | ____________ |
| `PKS_CROMATE_3` | CROMATE 3+ | 1 Cái = ? Kg | ____________ |
| `PKS_LUOISN13X26` | LƯỚI SN VUÔNG PHI 13X26 | 1 m2 = ? Kg | ____________ |
| `PKS_LUOISNPHI19` | LƯỚI SN TRÒN PHI 19 | 1 m2 = ? Kg | ____________ |
| `PKS_TAY_NHOM` | TẨY NHÔM | 1 Cái = ? Kg | ____________ |
| `PKC_BANGKT_5P` | BĂNG KEO TRONG | 1 Cuộn = ? Kg | ____________ |
| `PKC_BKAN` | BÁT KHÓA ÂM NỀN | 1 Cái = ? Kg | ____________ |
| `PKC_BOLSN` | BỌ LUỚI SONG NGANG MÓNG NGỰA SONG NGANG | 1 Con = ? Kg | ____________ |
| `PKC_BOMV` | BỌ MẮT VÕNG | 1 Con = ? Kg | ____________ |
| `PKC_BUOMFE_DL` | BƯỚM SẮT ĐÀI LOAN | 1 Con = ? Kg | ____________ |
| `PKC_BUOMFE_ST` | BƯỚM SẮT SIÊU TRƯỜNG | 1 Con = ? Kg | ____________ |
| `PKC_CHNHUA` | VÒNG NHỰA HÃM TRỤC | 1 Cái = ? Kg | ____________ |
| `PKC_GOIGANG` | GỐI GANG | 1 Cặp = ? Cái | ____________ |
| `PKC_HOPKEM_1.2LY` | HỘP KẼM VUÔNG 30X30X1.2LY | 1 Mét = ? Kg | ____________ |
| `PKC_INOX` | INOX KÉO TAY 6mét | 1 Mét = ? Kg | ____________ |
| `PKC_RONNHUA_INOX` | RON NHỰA + INOX | 1 Mét = ? Kg | ____________ |
| `PKC_V4_INOX` | V4 INOX 2ly | 1 Mét = ? Kg | ____________ |
| `PKC_V4_INOX_3LY` | V4 INOX 3ly | 1 Mét = ? Kg | ____________ |
| `PKC_V4_STD` | V4 STĐ (SƠN TĨNH ĐIỆN) | 1 Mét = ? Kg | ____________ |
| `PKDUC_BO_2VIS_501_552` | BỌ 2VIS 501N-552 | 1 Con = ? Kg | ____________ |
| `PKDUC_BO_2VIS_652_548C` | BỌ 2VIS-652-548C | 1 Con = ? Kg | ____________ |
| `PKDUC_BO1VIS_503C` | BỌ 1VIS 503C | 1 Con = ? Kg | ____________ |
| `PKDUC_BO2VIS_752_ST700` | BỌ 2VIS 752 ST700 | 1 Con = ? Kg | ____________ |
| `RT_PHOTLONG12_5X5X120M` | RON LÔNG CẠNH RAY | 1 Mét = ? Kg | ____________ |
| `RT_RAYNHOMUC` | RAY NHÔM ÚC | 1 Mét = ? Kg | ____________ |
| `RT_TRUC90` | TRỤC PHI 90 | 1 Mét = ? Kg | ____________ |
| `RT_TRUC140` | TRỤC 140 | 1 Mét = ? Kg | ____________ |
| `RT_TRUC168` | TRỤC 168 | 1 Mét = ? Kg | ____________ |
| `RT_RAYINOX_6P_RON` | RAY INOX 6P CÓ RON | 1 Mét = ? Kg | ____________ |
| `RT_RAYINOX_8P_RON` | RAY INOX 8P CÓ RON | 1 Mét = ? Kg | ____________ |
| `RT_RAYINOX_7P_KHONGRON` | RAY INOX 7P KHÔNG RON | 1 Mét = ? Kg | ____________ |
| `RT_TR140` | TRỤC 140 (2.5 mm) | 1 Mét = ? Kg | ____________ |
| `RT_TR168` | TRỤC 168 (4.0 mm) | 1 Mét = ? Kg | ____________ |