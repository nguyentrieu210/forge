# Forge Documentation

Ngày cập nhật: **2026-08-16**.

Tài liệu được tổ chức theo **authority và vòng đời**, không theo số lượng file. Exact GitHub state, code, migrations và tests luôn thắng prose stale.

## 1. Entrypoints bắt buộc

1. `../SENTRUX_MAP.md` — repo topology/ownership và agent navigation.
2. `../CURRENT_STATUS.md` — verified checkpoint gần nhất.
3. `../NEXT_TASKS.md` — active queue ngắn.
4. `../PROJECT_CONTEXT.md` — stable authority/invariants.
5. `ARCHITECTURE.md` — canonical system architecture.
6. `../skills/forge-enterprise-completion/SKILL.md` — execution policy.

Không tạo một architecture/status source song song nếu canonical file trên đã tồn tại.

## 2. Strategic/product authority

- `FORGE_ENTERPRISE_NORTH_STAR.md` — đích sản phẩm dài hạn.
- `FORGE_ENTERPRISE_CAPABILITY_MAP.md` — capability denominator/checklist.
- `FORGE_ENTERPRISE_CAPABILITY_STATUS.md` — materialized maturity snapshot có evidence.
- `ROADMAP.md` — hướng dài hạn, không phải live status.
- `APP_FACTORY.md` — app/package lifecycle contract.
- `API_SURFACE.md` — API compatibility surface.
- `VERSIONING.md` — versioning policy.
- `VALIDATION_GATES.md` — validation/evidence contract.

## 3. Domain và vertical docs

Giữ BRD/spec/field-ledger/design khi chúng còn là một trong các loại sau:

- business/product contract chưa được canonical implementation thay thế;
- source/legal lock;
- user-facing operating guide;
- cross-package integration contract;
- final audit/convergence evidence.

Alumdoor, HRM, Sales, Social Commerce và các domain khác có thể có nhiều tài liệu, nhưng mỗi topic phải chỉ rõ đâu là current contract và đâu là historical evidence.

## 4. Operations và evidence

- `ops/` — SRE, release, provider, recovery và production governance.
- `runbooks/` — durable operating procedures.
- `audits/` — retained audit records.
- `agents/` — chỉ giữ protocol dùng lại và final program evidence; không phải nơi lưu vô hạn prompt/board/handoff.
- `source-data/` — generated lookup/source-lock material; không sửa tay nếu có generator.

## 5. Retention policy

### Giữ

Giữ file nếu còn ít nhất một vai trò:

- current authority;
- architecture/business contract;
- legal/source-lock evidence;
- migration/release/recovery evidence;
- final convergence/audit record;
- durable runbook/user documentation.

### Xóa sau convergence

Mặc định xóa khỏi `main` khi program/wave đã đóng:

- `AGENT_PROMPTS.md`;
- `OPEN_ORDER.md`;
- temporary Agent Board/NO-STOP/bootstrap topology;
- branch/PR `*-HANDOFF.md` đã superseded;
- one-off experiment/probe workflow;
- trigger file chỉ dùng để ép CI rerun;
- status snapshot đã được canonical checkpoint mới thay thế.

Git/PR history là nơi tra provenance của artifact bị xóa.

## 6. Naming và placement

- Stable architecture/contract: tên không gắn ngày nếu không cần version lịch sử.
- Historical evidence: có thể gắn ngày/RC/release identity và đặt dưới `audits/`, `agents/` hoặc scope evidence phù hợp.
- Không để cùng một canonical document ở root và `docs/`.
- Không đẩy project-wide architecture/status docs vào `client/` hoặc `server/`; local package docs chỉ mô tả scope local.

## 7. Khi topology thay đổi

Trong cùng PR phải xem xét cập nhật:

- `../SENTRUX_MAP.md`;
- `ARCHITECTURE.md`;
- `.sentrux/rules.toml` nếu boundary mới cần codify;
- docs index nếu thêm/bỏ canonical document.

Không cập nhật score Sentrux vào docs như một hằng số kiến trúc; score là measurement của exact scan.


## Active program

- `agents/r7/R7_PROGRAM.md` — R7-A Frappe 16 platform closure. Machine truth for current dispositions is `agents/r7/R7_FRAPPE_PARITY_MATRIX.json`; this program must remain fail-closed until GAP/UNRESOLVED are zero.
