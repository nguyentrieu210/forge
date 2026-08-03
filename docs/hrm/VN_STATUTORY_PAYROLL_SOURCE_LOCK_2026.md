# VN STATUTORY PAYROLL SOURCE LOCK — 2026

Status: **source inventory locked; production numeric fixture not promoted**  
Owner: WS06 HCM / statutory payroll  
Checked: 2026-08-03

## Purpose

This file is the legal-source boundary for Forge statutory payroll rules in 2026. It deliberately separates:

1. official legal identity/effective dates;
2. deterministic formula schema implemented by Forge;
3. numeric parameters that may only enter an enabled `VN Payroll Rule` after clause-level verification and payroll/legal approval.

A blog, press article, search snippet or legacy fixture is never authoritative payroll configuration.

## Official PIT source chain

| Source | Issued | Effective | Official source | Role |
|---|---:|---:|---|---|
| Luật Thuế thu nhập cá nhân `109/2025/QH15` | 2025-12-10 | 2026-07-01 | https://vanban.chinhphu.vn/?docid=216495&pageid=27160 | Primary PIT law |
| Luật `09/2026/QH16` sửa đổi Luật TNCN và một số luật thuế | 2026-04-24 | 2026-04-24 | https://vanban.chinhphu.vn/?docid=218095&pageid=27160&typegroupid=3 | Amendment that must be applied before deriving a 2026 rule |
| Nghị định `253/2026/NĐ-CP` | 2026-06-30 | 2026-07-01 | https://vanban.chinhphu.vn/?docid=218684&pageid=27160&typegroupid=4 | PIT implementation details |
| Thông tư `87/2026/TT-BTC` | 2026-06-30 | 2026-07-01 | https://vanban.chinhphu.vn/?docid=218772&orggroupid=4&pageid=27160 | Detailed PIT guidance |

### PIT activation rule

An enabled production `VN Payroll Rule` for PIT must record the exact legal-document chain relevant to its effective period. A fixture based only on `109/2025/QH15` is insufficient if an amendment or implementing instrument changes the applicable rule.

## Official social-insurance / health-insurance / unemployment-insurance source chain

| Source | Issued | Effective | Official source | Role |
|---|---:|---:|---|---|
| Luật Bảo hiểm xã hội `41/2024/QH15` | 2024-06-29 | 2025-07-01 | https://vanban.chinhphu.vn/?classid=1&docid=211199&orggroupid=1&pageid=27160 | Primary social-insurance law |
| Luật sửa đổi Luật Bảo hiểm y tế `51/2024/QH15` | 2024-11-27 | 2025-07-01 | https://vanban.chinhphu.vn/?classid=1&docid=212479&pageid=27160&typegroupid=3 | Health-insurance legal basis |
| Nghị định `188/2025/NĐ-CP` | 2025-07-01 | 2025-08-15 | https://vanban.chinhphu.vn/?classid=1&docid=214515&pageid=27160 | Detailed health-insurance guidance |
| Luật Việc làm `74/2025/QH15` | 2025-06-16 | 2026-01-01 | https://vanban.chinhphu.vn/?docid=214560&pageid=27160 | Primary unemployment-insurance/employment-law basis for 2026 |
| Nghị định `374/2025/NĐ-CP` | 2025-12-31 | 2026-01-01 | https://vanban.chinhphu.vn/?classid=1&docid=216493&orggroupid=2&pageid=27160 | Detailed unemployment-insurance guidance |
| Nghị định `274/2025/NĐ-CP` | 2025-10-16 | 2025-11-30 | https://vanban.chinhphu.vn/?classid=1&docid=215646&pageid=27160&typegroupid=4 | Late/evaded mandatory social/unemployment contribution controls |

## 2026 ceiling/floor warning

Contribution ceilings/floors may depend on effective-dated wage/base parameters and legal category. A general public-sector base-salary instrument must not automatically be treated as the private-sector payroll ceiling without verifying the exact statutory clause and worker category.

For that reason WS06 does **not** hard-code a 2026 BHXH/BHYT/BHTN ceiling into TypeScript or promote the stale PR #269 reference fixture. Ceiling/floor values remain typed effective-dated inputs until clause-level source extraction is completed.

## Forge rule requirements

Every enabled statutory rule must satisfy all of the following:

- `effective_from` / `effective_to` cover the full payroll period;
- legal source identity and official URL are stored;
- formula schema version is explicit;
- currency and fixed-point scale are explicit;
- thresholds/rates/caps are data, not TypeScript constants;
- approval actor/time is recorded;
- canonical formula JSON is hashed into Salary Slip trace;
- exact evaluated inputs/outputs are stored in Salary Slip trace;
- used rules and consumed inputs are immutable;
- replacement uses a new effective-dated version, never historical mutation;
- regression fixture references the same source version.

## Current promotion decision

- Deterministic evaluator schema: **eligible for review**.
- PIT/BHXH/BHYT/BHTN numeric 2026 production fixture: **NOT PROMOTED**.
- Reason: the current source inventory is official, but clause-level extraction of all numeric parameters, transition dates and worker-category applicability has not yet been verified into an exact regression fixture.

This is intentional fail-closed behavior, not a missing runtime capability.
