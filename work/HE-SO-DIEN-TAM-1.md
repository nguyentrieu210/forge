# HỆ SỐ QUY ĐỔI ĐIỀN TẠM = 1 — phải thay bằng số cân thực tế

Điền ngày 2026-08-22 theo yêu cầu "dùng được ngay". **71 dòng, tất cả đều là số giả.**

Chừng nào chưa thay: mua theo Kg mà dùng theo Mét sẽ ra tồn kho sai, và **không màn hình nào báo lỗi**.

Lọc lại bằng một câu:

```sql
SELECT name FROM documents WHERE tenant_id='demo' AND doctype='Item'
  AND payload_json LIKE '%_tam_dien_1%';
```

| Mã | Tên | Tồn | Quy đổi sang | **Số đúng** |
|---|---|---|---|---|
| PKC_BULON12.12 | BÙ LON 12x12 | Kg | Con |  |
| PKC_CONTAN12 | CON TÁN 12 | Kg | Con |  |
| LKMT_COT | CỐT | Cây | Cây |  |
| LKMT_COT | CỐT | Cây | Kg |  |
| PKS_CROMATE_3 | CROMATE 3+ | Kg | Cái |  |
| PKS_LUOIMV | LƯỚI MV | Kg | m2 |  |
| PKS_LUOISN13X26 | LƯỚI SN VUÔNG PHI 13X26 | Kg | m2 |  |
| PKS_LUOISNPHI19 | LƯỚI SN TRÒN PHI 19 | Kg | m2 |  |
| PKS_TAY_NHOM | TẨY NHÔM | Kg | Cái |  |
| PKC_BANBUOM_FE | BẮN BƯỚM (SẮT) | m2 | Mét |  |
| PKC_BANBUOM_INOX | BẮN BƯỚM (INOX) | m2 | Mét |  |
| PKC_BANGKT_5P | BĂNG KEO TRONG | Kg | Cuộn |  |
| PKC_BKAN | BÁT KHÓA ÂM NỀN | Kg | Cái |  |
| PKC_BKAN | BÁT KHÓA ÂM NỀN | Kg | Cặp |  |
| PKC_BOLSN | BỌ LUỚI SONG NGANG MÓNG NGỰA SONG  | Kg | Con |  |
| PKC_BOMV | BỌ MẮT VÕNG | Kg | Con |  |
| PKC_BUOMFE_DL | BƯỚM SẮT ĐÀI LOAN | Kg | Con |  |
| PKC_BUOMFE_ST | BƯỚM SẮT SIÊU TRƯỜNG | Kg | Con |  |
| PKC_CHNHUA | VÒNG NHỰA HÃM TRỤC | Kg | Cái |  |
| PKC_CONTAN_MV | CON TÁN | Kg | Con |  |
| PKC_DINHTAN_MV | ĐINH TÁN MẮT VÕNG | Kg | Con |  |
| PKC_GOIGANG | GỐI GANG | Cái | Cặp |  |
| PKC_HOPKEM_1.2LY | HỘP KẼM VUÔNG 30X30X1.2LY | Kg | Mét |  |
| PKC_INOX | INOX KÉO TAY 6mét | Kg | Mét |  |
| PKC_LV_6.0_X_70_X_53V | HH LÒ XO 53V | Kg | Cái |  |
| PKC_LV_6.5_X_80_X_63V | HH LÒ XO 63V | Kg | Cái |  |
| PKC_LV_6.5_X_80_X_68V | HH LÒ XO 68V | Kg | Cái |  |
| PKC_LV_7.0_X_90_X_65V | HH LÒ XO 65V | Kg | Cái |  |
| PKC_LV_7.0_X_90_X_73V | HH LÒ XO 73V | Kg | Cái |  |
| PKC_LV_7.0_X_90_X_83V | HH LÒ XO 83V | Kg | Cái |  |
| PKC_LX_5.5_X_70_X_46V | HH LÒ XO 46V | Kg | Cái |  |
| PKC_LX_5.5_X_70_X_50V | HH LÒ XO 50V | Kg | Cái |  |
| PKC_RONDAYUC | RON ĐÁY ÚC | Kg | Mét |  |
| PKC_RONNHUA_INOX | RON NHỰA + INOX | Kg | Mét |  |
| PKC_V4 | V4 | Kg | Mét |  |
| PKC_V4_INOX | V4 INOX 2ly | Kg | Mét |  |
| PKC_V4_INOX_3LY | V4 INOX 3ly | Kg | Mét |  |
| PKC_V4_STD | V4 STĐ (SƠN TĨNH ĐIỆN) | Kg | Mét |  |
| PKDUC_BO_1VIS_503N_71_595 | BỌ 1VIS 503N-71-595 | Kg | Con |  |
| PKDUC_BO_2VIS_501_552 | BỌ 2VIS 501N-552 | Kg | Con |  |
| PKDUC_BO_2VIS_652_548C | BỌ 2VIS-652-548C | Kg | Con |  |
| PKDUC_BO1VIS_503C | BỌ 1VIS 503C | Kg | Con |  |
| PKDUC_BO2VIS_752_ST700 | BỌ 2VIS 752 ST700 | Kg | Con |  |
| PKC_V4_KEM | V4 KẼM | Kg | Mét |  |
| RT_PHOTLONG12_5X5X120M | RON LÔNG CẠNH RAY | Kg | Mét |  |
| RT_RAYNHOMUC | RAY NHÔM ÚC | Kg | Mét |  |
| RT_TRUC90 | TRỤC PHI 90 | Kg | Mét |  |
| RT_RAYINOX_6P_RON | RAY INOX 6P CÓ RON | Kg | Mét |  |
| RT_RAYINOX_8P_RON | RAY INOX 8P CÓ RON | Kg | Mét |  |
| RT_RAYINOX_7P_KHONGRON | RAY INOX 7P KHÔNG RON | Kg | Mét |  |
| RT_TR140 | TRỤC 140 (2.5 mm) | Kg | Mét |  |
| RT_TR168 | TRỤC 168 (4.0 mm) | Kg | Mét |  |
| PKC_BO_1VIS_AL702LOP | BỌ 1 VIS-AL702LOP | Kg | Con |  |
| PKC_BO_1VIS_AL701LOP | BỌ 1 VIS-AL701LOP | Kg | Con |  |
| PKC_BO_1VIS_AL75 | BỌ 1VIS-AL75 | Kg | Con |  |
| PKC_BO_2VIS_AL50_VIP50_548_ST500 | BỌ 2VIS-AL50-VIP50-AL548-ST500 | Kg | Con |  |
| NHOM_AL595 | AL595 | Cây | Kg |  |
| NHOM_AL71 | AL71 | Cây | Kg |  |
| NHOM_AL503 | AL503 | Cây | Kg |  |
| NHOM_AL548 | AL548 | Cây | Kg |  |
| NHOM_AL501 | AL501 | Cây | Kg |  |
| NHOM_AL652 | AL652 | Cây | Kg |  |
| NHOM_AL552 | AL552 | Cây | Kg |  |
| NHOM_AL752 | AL752 | Cây | Kg |  |
| NHOM_AL50 | AL50 | Cây | Kg |  |
| NHOM_ALVIP50 | ALVIP50 | Cây | Kg |  |
| NHOM_ALVIPST500 | ALVIPST500 | Cây | Kg |  |
| NHOM_ALVIPST700 | ALVIPST700 | Cây | Kg |  |
| NHOM_AL70_2LOP | AL70 ( 2 LỚP) | Cây | Kg |  |
| NHOM_AL70_1LOP | AL70 ( 1 LỚP) | Cây | Kg |  |
| NHOM_AL75 | AL75 | Cây | Kg |  |
