# Upstream Design Sources

`forge-ui-design` là bản **synthesis/adaptation cho Forge ERP**, không vendor nguyên upstream skill/database. Các nguyên tắc được paraphrase, lọc và ghép với authority/architecture của Forge.

## 1. UI/UX Pro Max

- Repo: `nextlevelbuilder/ui-ux-pro-max-skill`
- Upstream head khi tổng hợp: `a38d04c3d5c298c851dbe5e6ee1965ee3de42cb5`
- Primary source: `.claude/skills/ui-ux-pro-max/SKILL.md`
- License: MIT
- Ý tưởng được áp dụng:
  - ưu tiên accessibility/interaction/layout/forms trước decoration;
  - chọn coherent design direction thay vì style chắp vá;
  - design dials cho density/motion/variance;
  - data/table/form/accessibility/responsive checklist;
  - stack-aware implementation và re-check output thay vì áp rule mù quáng.

Forge adaptation:

- density mặc định cao hơn SaaS marketing;
- motion thấp hơn;
- desktop operational workflow là primary;
- không copy upstream searchable CSV/catalog/scripts vào Forge để tránh vendor bloat và stale duplicate data.

## 2. Emil Kowalski Design Engineering

- Repo: `emilkowalski/skills`
- Upstream head khi tổng hợp: `78761e1b57f97dce65b983d640c70a68f39e8163`
- Primary source: `skills/emil-design-eng/SKILL.md`
- License: MIT
- Ý tưởng được áp dụng:
  - invisible details compound thành perceived quality;
  - animation phải phụ thuộc frequency và purpose;
  - repeated/keyboard actions cần instant/snappy behavior;
  - press feedback, easing và motion phải phục vụ responsiveness;
  - tránh motion/decorative effect làm software cảm giác chậm.

Forge adaptation:

- money/stock/manufacturing flows gần như không dùng playful bounce;
- animation budget giảm mạnh cho operator screens;
- perceived speed đạt chủ yếu bằng immediate feedback, stable layout và ít context switching.

## 3. GitHub Awesome Copilot — Web Design Reviewer

- Repo: `github/awesome-copilot`
- Upstream head khi tổng hợp: `406c31f848e641e9ccb33277cb03b51b015c27c7`
- Primary source: `skills/web-design-reviewer/SKILL.md`
- Checklist source: `skills/web-design-reviewer/references/visual-checklist.md`
- License: MIT
- Ý tưởng được áp dụng:
  - browser inspection là phase riêng sau source implementation;
  - kiểm tra layout/overflow/responsive/accessibility/visual consistency;
  - severity-based issue prioritization;
  - fix source rồi re-open/re-inspect thay vì kết luận từ code diff;
  - test multiple viewports và states.

Forge adaptation:

- primary viewports tập trung ERP desktop: 1280, 1440/1536, 1920;
- 768 là resilience check;
- 375–430 chỉ full-flow requirement khi vertical/product thực sự support mobile;
- visual review phải thêm authority/lineage/disabled blocker/long Vietnamese text/data-table concerns.

## 4. Source precedence

Các upstream skill là **design guidance**, không override Forge authority.

Precedence khi có mâu thuẫn:

1. user requirement;
2. exact Forge business/server contract;
3. `forge-ui-change-routing` owner/source rules;
4. `forge-enterprise-completion` architecture/security/data invariants;
5. existing Forge design tokens/components/patterns;
6. `forge-ui-design` guidance;
7. upstream generic design guidance.

Không mang upstream package/library/dependency vào Forge chỉ vì upstream ví dụ dùng nó.

## 5. Refresh policy

Không auto-sync upstream. Chỉ refresh skill khi:

- Forge đổi UI architecture/design system lớn;
- upstream có guidance mới materially hữu ích cho enterprise operations;
- một repeated UI failure cho thấy checklist/pattern hiện tại thiếu.

Mỗi refresh phải:

- re-read exact upstream source;
- giữ provenance/commit mới trong file này;
- không copy catalog lớn nếu Forge không cần runtime search;
- review conflict với current Forge skills;
- validate skill vẫn hướng agent về đúng authority trước visual polish.
