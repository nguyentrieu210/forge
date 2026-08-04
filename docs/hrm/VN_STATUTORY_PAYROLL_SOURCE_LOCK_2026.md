# VN STATUTORY PAYROLL SOURCE LOCK — 2026

Status: **PIT resident-wage regression parameters clause-locked; insurance production numeric fixture not promoted**  
Owner: WS06 HCM / statutory payroll  
Checked: 2026-08-04

## Purpose

This file is the legal-source boundary for Forge statutory payroll rules in 2026. It deliberately separates:

1. official legal identity/effective dates;
2. deterministic formula schema implemented by Forge;
3. numeric parameters that may only enter an enabled `VN Payroll Rule` after clause-level verification and payroll/legal approval.

A blog, press article, search snippet or legacy fixture is never authoritative payroll configuration.

## Official PIT source chain

| Source | Issued | Effective | Official source | Role |
|---|---:|---:|---|---|
| Nghị quyết `110/2025/UBTVQH15` | 2025-10-17 | 2026-01-01 | https://vanban.chinhphu.vn/?docid=215927&pageid=27160 | Family deductions for tax year 2026: taxpayer 15.5m VND/month; dependent 6.2m VND/month |
| Luật Thuế thu nhập cá nhân `109/2025/QH15` | 2025-12-10 | 2026-07-01; resident employment-income provisions apply from tax year 2026 | https://vanban.chinhphu.vn/?docid=216495&pageid=27160 | Primary PIT law; Articles 8-10 define resident wage taxable base, five progressive bands and family deductions |
| Luật `09/2026/QH16` sửa đổi Luật TNCN và một số luật thuế | 2026-04-24 | 2026-04-24; Article 1 applies from 2026-01-01 | https://vanban.chinhphu.vn/?docid=218095&pageid=27160&typegroupid=3 | Amendment reviewed before fixture derivation; Article 1 amends Article 7 business-income threshold and does not alter Articles 8-10 resident wage PIT parameters |
| Nghị định `253/2026/NĐ-CP` | 2026-06-30 | 2026-07-01 | https://vanban.chinhphu.vn/?docid=218684&pageid=27160&typegroupid=4 | PIT implementation details |
| Thông tư `87/2026/TT-BTC` | 2026-06-30 | 2026-07-01 | https://vanban.chinhphu.vn/?docid=218772&orggroupid=4&pageid=27160 | Detailed PIT guidance |

### PIT clause lock completed in RC4-A5

For **resident employment income only**, the following core numeric parameters are now locked to official primary-source text and encoded only as a regression fixture, not as an automatically enabled production rule:

- taxpayer family deduction: **15,500,000 VND/month**;
- dependent family deduction: **6,200,000 VND/month per dependent**;
- monthly progressive taxable-income bands:
  - up to 10,000,000 VND: **5%**;
  - above 10,000,000 to 30,000,000 VND: **10%**;
  - above 30,000,000 to 60,000,000 VND: **20%**;
  - above 60,000,000 to 100,000,000 VND: **30%**;
  - above 100,000,000 VND: **35%**.

Canonical regression artifact:

- `server/tests/fixtures/vn-pit-resident-wages-2026.json`
- `server/tests/hrm-vn-pit-2026-source-lock.test.mjs`

The fixture deliberately leaves mandatory insurance and other lawful deductions as typed runtime inputs. It does **not** invent BHXH/BHYT/BHTN rates, contribution bases, ceilings, worker categories, medical/education deduction limits or other implementing-detail values.

### PIT activation rule

An enabled production `VN Payroll Rule` for PIT must record the exact legal-document chain relevant to its effective period. Regression source-lock evidence does not itself authorize or seed a production payroll rule; production activation still requires payroll/legal approval metadata and environment-specific effective configuration.

## Official social-insurance / health-insurance / unemployment-insurance source chain

| Source | Issued | Effective | Official source | Role |
|---|---:|---:|---|---|
| Luật Bảo hiểm xã hội `41/2024/QH15` | 2024-06-29 | 2025-07-01 | https://vanban.chinhphu.vn/?classid=1&docid=211199&orggroupid=1&pageid=27160 | Primary social-insurance law |
| Luật sửa đổi Luật Bảo hiểm y tế `51/2024/QH15` | 2024-11-27 | 2025-07-01 | https://vanban.chinhphu.vn/?classid=1&docid=212479&pageid=27160&typegroupid=3 | Health-insurance legal basis |
| Nghị định `188/2025/NĐ-CP` | 2025-07-01 | 2025-08-15 | https://vanban.chinhphu.vn/?classid=1&docid=214515&pageid=27160 | Detailed health-insurance guidance |
| Luật Việc làm `74/2025/QH15` | 2025-06-16 | 2026-01-01 | https://vanban.chinhphu.vn/?docid=214560&pageid=27160 | Primary unemployment-insurance/employment-law basis for 2026 |
| Nghị định `374/2025/NĐ-CP` | 2025-12-31 | 2026-01-01 | https://vanban.chinhphu.vn/?classid=1&docid=216493&orggroupid=2&pageid=27160 | Detailed unemployment-insurance guidance |
| Nghị định `274/2025/NĐ-CP` | 2025-10-16 | 2025-11-30 | https://vanban.chinhphu.vn/?docid=215646&pageid=27160&typegroupid=4 | Late/evaded mandatory social/unemployment contribution controls |

## 2026 insurance ceiling/floor/category warning

Contribution rates, bases, ceilings and floors depend on effective-dated wage/base parameters and worker/legal category. A general public-sector base-salary instrument must not automatically be treated as the private-sector payroll ceiling without verifying the exact statutory clause and worker category.

For that reason RC4-A5 still does **not** hard-code or promote a 2026 BHXH/BHYT/BHTN numeric production fixture. Those values remain typed effective-dated inputs until clause-level extraction covers rate + contribution base + ceiling/floor + category + transition semantics together.

## Forge rule requirements

Every enabled statutory rule must satisfy all of the following:

- `effective_from` / `effective_to` cover the full payroll period;
- legal source identity and official URL are stored;
- formula schema version is explicit;
- currency and fixed-point scale are explicit in the approved configuration/evidence;
- thresholds/rates/caps are data, not TypeScript constants;
- approval actor/time is recorded;
- canonical formula JSON is hashed into Salary Slip trace;
- exact evaluated inputs/outputs are stored in Salary Slip trace;
- used rules and consumed inputs follow the source-freeze/correction contract;
- replacement uses a new effective-dated version, never historical rule mutation;
- regression fixture references the same source version.

## Current promotion decision

- Deterministic evaluator schema: **eligible for RC evidence**.
- Resident employment-income PIT 2026 core numeric regression fixture: **PROMOTED FOR REGRESSION EVIDENCE ONLY**.
- Enabled production PIT rule seed: **NOT PROMOTED**; payroll/legal approval and environment-effective configuration remain required.
- BHXH/BHYT/BHTN numeric 2026 fixture: **NOT PROMOTED** pending clause-level rate/base/cap/category extraction.

This is intentional fail-closed behavior. Forge now has source-locked executable PIT vectors without pretending that the broader Vietnam statutory payroll configuration is complete.
