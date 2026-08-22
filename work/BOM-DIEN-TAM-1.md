# Dòng BOM điền tạm số lượng = 1 — cần luật tính theo kích thước

Điền ngày 2026-08-22. **257 dòng trên 88 BOM. Tất cả đều là số giả.**

Những dòng này để trống vì số lượng phụ thuộc kích thước cửa. Điền 1 làm chúng dùng được
ngay, nhưng **sai với mọi cỡ cửa** — phớt lông bán theo mét, lò xo theo cây.

```sql
SELECT name FROM documents WHERE tenant_id='demo' AND doctype='Bill of Materials'
  AND payload_json LIKE '%_tam_dien_1%';
```

## Gom theo cấu kiện — viết luật cho mấy dòng đầu là xong phần lớn

| Loại cửa | Cấu kiện | Số dòng |
|---|---|---|
| Cửa Đức | PKC_RON_DD | 39 |
| Cửa Đức | PKDUC_PHOTLONG4X5 | 32 |
| Cửa tấm liền Úc | PKC_BKAN | 19 |
| Cửa tấm liền Úc | PKC_PULYGAI | 10 |
| Cửa tấm liền Úc | PKC_PULYUC114 | 10 |
| Cửa tấm liền Úc | PKC_PULYUC34 | 9 |
| Cửa tấm liền Úc | PKC_LV_6.5_X_80_X_68V | 9 |
| Cửa tấm liền Úc | PKC_LV_7.0_X_90_X_65V | 9 |
| Cửa tấm liền Úc | PKC_LV_7.0_X_90_X_73V | 9 |
| Cửa tấm liền Úc | PKC_LV_7.0_X_90_X_83V | 9 |
| Cửa tấm liền Úc | PKC_LX_5.5_X_70_X_50V | 7 |
| Cửa tấm liền Úc | PKC_LV_6.5_X_80_X_63V | 6 |
| Cửa Lưới | INOX_8D | 4 |
| Cửa Lưới | RT_RAYINOX_8P_RON | 4 |
| Cửa Lưới | RT_RAYINOX_6P_RON | 4 |
| Cửa Lưới | PKC_LUOISN13X26_INOX | 3 |
| Cửa tấm liền Úc | PKC_LX_5.5_X_70_X_46V | 3 |
| Cửa tấm liền Úc | PKC_LV_6.0_X_70_X_53V | 3 |
| Nan/lá cửa | RT_TR114_1.8 | 3 |
| Nan/lá cửa | RT_RAY_U70_RON | 3 |
| Motor | LKMT_TANKER_ALUMAX_LAC33 | 3 |
| Ray và trục | RT_RNHUA_DR | 3 |
| Ray và trục | RT_RINOX_DR | 3 |
| Cửa Đức | PKC_XOP_N45 | 2 |
| Cửa Đức | RT_TRUC34 | 2 |
| Cửa Đức | PKC_PULYUC34 | 2 |
| Cửa Đức | PKC_LX_5.5_X_70_X_50V | 2 |
| Cửa Đức | PKC_LV_6.5_X_80_X_63V | 2 |
| Cửa Đức | PKC_LV_6.5_X_80_X_68V | 2 |
| Cửa Đức | PKC_LV_7.0_X_90_X_65V | 2 |
| Cửa Đức | PKC_LV_7.0_X_90_X_73V | 2 |
| Cửa Đức | PKC_BKAN | 2 |
| Cửa Lưới | PKC_LUOIMV_INOX | 2 |
| Cửa Lưới | PKC_LUOISNPHI19_INOX | 2 |
| Nan/lá cửa | PKC_V4_STD | 2 |
| Phụ kiện chung | PKC_V5_STD | 2 |
| Ray và trục | RT_PHOTLONG12_5X5X120M | 2 |
| Cửa Đức | PKC_BO_1VIS_AL701LOP | 1 |
| Cửa Đức | PKDUC_BO_1VIS_503N_71_595 | 1 |
| Cửa Lưới | PKC_BAT_MV | 1 |
| Cửa Lưới | PKC_DINHTAN_MV | 1 |
| Cửa Lưới | PKC_CONTAN_MV | 1 |
| Cửa Lưới | CLUOI_LUOI_SN13X26_INOX_TRONBO | 1 |
| Cửa Lưới | CLUOI_LUOI_SNPHI19_INOX_TM | 1 |
| Cửa tấm liền Úc | PKC_VAIHAMXO | 1 |
| Nan/lá cửa | TON_DLM_1LY_K124 | 1 |
| Nan/lá cửa | PKC_RON_DD | 1 |
| Linh kiện motor | LKMT_DAYDIEN_PATCD | 1 |
| Phụ kiện chung | PKC_TIINOX | 1 |
| Phụ kiện chung | RT_RAY_U100_1.4LY_RON | 1 |
| Phụ kiện chung | RT_RNHUA_DR | 1 |
| Phụ kiện chung | RT_RINOX_DR | 1 |
| Phụ kiện CN Đức | PKC_BULON12.12 | 1 |
| Phụ kiện CN Đức | PKC_CONTAN12 | 1 |
| Phụ kiện CN Đức | PKC_BACDAN | 1 |
| Phụ kiện cần sơn tĩnh điện | LA_YEM | 1 |
| Phụ kiện cần sơn tĩnh điện | PKC_DINHTAN_MV | 1 |
| Phụ kiện cần sơn tĩnh điện | PKC_CONTAN_MV | 1 |
| Ray và trục | PKC_RONNHUAVANGCANHAY_RSU100 | 1 |
| Ray và trục | PKC_RONNHUAVANGCANHAY_RSU70 | 1 |
| Ray và trục | RT_TRUC114_2.4LY | 1 |
| Ray và trục | RT_TRUC168_5LY | 1 |
