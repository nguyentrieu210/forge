# V3-03 — AUTH / LOGIN

Branch: `ui/v3-03-auth-login`
Role: login/authenticated boot/session presentation owner
Program spec: `docs/design/FORGE_VBEN_NEXT_UI_V3_TECHNICAL_SPEC_20260804.md`
Execution rule: `docs/agents/ui-v3/NO_STOP_RULE.md`

## Mission

Replace the current login/boot/auth chrome with Forge V3 red/black/white identity and Vben-grade polish while preserving existing cookie-session, CSRF, AuthBoundary and session-expiry authority exactly.

## Exclusive hotspots

- shell auth/login presentation files;
- login layout and visual assets implemented in-source;
- global boot/loading surface where it belongs to auth/bootstrap presentation;
- session-expired/auth-error presentation states.

Do not change authentication authority, token/session model, CSRF semantics or server APIs.

## Target login

Desktop split composition:

- black/graphite branded visual field;
- white/high-contrast sign-in field;
- canonical Forge red accent;
- concise enterprise product identity;
- responsive collapse to focused single-column mobile login;
- no heavy video/background assets;
- subtle CSS/SVG grid/data-line motion only;
- reduced-motion fallback;
- dark-mode behavior only where it improves coherence rather than turning the form illegible.

## Required motion

- initial logo/brand reveal;
- login panel enter transition;
- input/focus/error states;
- submit/loading state;
- auth error reveal;
- global boot loader/progress handoff to workspace;
- no white flash during theme/bootstrap;
- all motion disabled/reduced appropriately under `prefers-reduced-motion`.

## Required states

- first boot/loading;
- normal login;
- invalid credentials;
- network/server error;
- submitting/disabled state;
- authenticated transition to app;
- session expiry mid-use presentation;
- logout completion presentation if applicable;
- mobile keyboard/viewport safe layout.

## Hard rules

- keep `AuthBoundary` and current adapter/session semantics authoritative;
- no token storage changes;
- no secret/client credential additions;
- no direct API bypass;
- no product-specific login fork unless branding is supplied by existing manifest/brand contracts;
- consume V3-01 token/motion system rather than defining a second login theme.

## Vben parity

Use Vben auth/login/loading behavior as the completeness baseline, but replace visual composition with Forge V3 when the Forge direction is stronger. Record disposition through V3-00.

## Verification

- keyboard/focus/autofill behavior;
- mobile 390-ish viewport and tablet/desktop evidence;
- reduced-motion;
- login failure/retry UI;
- boot/loading handoff;
- session expiry surface;
- targeted shell/auth typecheck/build/tests;
- confirm auth/session contracts are untouched.

## No-stop behavior

Choose the exact SVG/CSS motion, panel proportions, responsive breakpoints and loading composition autonomously within the V3 spec. If branding data is unavailable, implement a generic Forge fallback and continue instead of blocking the login overhaul.

## Acceptance

AUTH is complete when every authentication-visible state feels native to Forge V3, is accessible/responsive, and the implementation changes presentation only without weakening or duplicating auth authority.

## Start prompt

`Đọc V3 spec, NO_STOP_RULE, AGENT_BOARD và V3-03-AUTH-LOGIN.md. Làm AUTH/LOGIN trên branch hiện tại: rebuild login + boot/loading + session/auth chrome theo red/black/white V3, Vben-grade motion và responsive behavior. Giữ nguyên AuthBoundary/cookie-session/CSRF/server authority. Không dừng vì blocker cục bộ; dùng generic Forge fallback hoặc Dependency Request rồi tiếp tục.`
