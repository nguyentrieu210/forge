from pathlib import Path

path = Path("client/packages/ui/src/styles.css")
text = path.read_text()
marker = "METAFORGE COMMAND CENTER · POWER VISUAL LAYER"
if marker in text:
    raise SystemExit(0)

power = r'''

/* ── METAFORGE COMMAND CENTER · POWER VISUAL LAYER (2026-08-03) ─────────────
 * Authenticated shell only. Alumdoor/public login stays outside `.mf-shell` and is untouched.
 */
@layer components {
  .mf-shell {
    --background: #edf3fb;
    --foreground: #07111f;
    --card: #ffffff;
    --card-foreground: #07111f;
    --popover: #ffffff;
    --popover-foreground: #07111f;
    --secondary: #e4ebf5;
    --secondary-foreground: #0b1729;
    --muted: #f4f7fb;
    --muted-foreground: #40516a;
    --accent: color-mix(in srgb, var(--primary) 13%, #ffffff);
    --accent-foreground: color-mix(in srgb, var(--primary) 82%, #07111f);
    --border: #c6d3e5;
    --input: #b9c9de;
    --ring: var(--primary);
    --subtle: #53647a;
    --mf-card-shadow: 0 1px 2px rgb(5 18 40 / 0.06), 0 12px 30px rgb(5 18 40 / 0.07);
    --mf-soft-shadow: 0 5px 18px rgb(5 18 40 / 0.07);
    --mf-overlay-shadow: 0 28px 70px rgb(5 18 40 / 0.22), 0 8px 24px rgb(5 18 40 / 0.10);
    background-color: var(--background);
    background-image:
      radial-gradient(circle at 18% -8%, color-mix(in srgb, var(--primary) 15%, transparent), transparent 27rem),
      radial-gradient(circle at 92% 8%, color-mix(in srgb, var(--primary) 8%, transparent), transparent 24rem);
  }

  :root:not([data-brand]) .mf-shell,
  [data-brand="zinc"] .mf-shell,
  [data-brand="blue"] .mf-shell,
  .mf-shell[data-brand="zinc"],
  .mf-shell[data-brand="blue"] {
    --primary: #0047ff;
    --primary-foreground: #ffffff;
    --ring: #0047ff;
    --info: #0047ff;
    --info-text: #0036c7;
  }

  [data-theme="dark"] .mf-shell,
  .mf-shell[data-theme="dark"] {
    --background: #050b14;
    --foreground: #f5f8ff;
    --card: #0d1726;
    --card-foreground: #f5f8ff;
    --popover: #111d2f;
    --popover-foreground: #f5f8ff;
    --secondary: #142238;
    --secondary-foreground: #edf4ff;
    --muted: #101c2e;
    --muted-foreground: #a7b7cc;
    --accent: color-mix(in srgb, var(--primary) 24%, #0d1726);
    --accent-foreground: #f4f7ff;
    --border: #263a55;
    --input: #314968;
    --subtle: #8192aa;
  }

  .mf-shell .mf-shell-sidebar {
    background-color: #071427;
    background-image:
      radial-gradient(circle at 28% 0%, color-mix(in srgb, var(--primary) 24%, transparent), transparent 15rem),
      linear-gradient(180deg, #09182d 0%, #071427 55%, #050e1c 100%);
    border-right-color: #18304d;
    color: #f8fbff;
    box-shadow: 16px 0 44px -34px rgb(0 15 42 / 0.95);
  }
  .mf-shell .mf-shell-sidebar .mf-shell-nav-group-label {
    color: #7890ae;
    font-weight: 700;
    letter-spacing: 0.11em;
  }
  .mf-shell .mf-shell-sidebar .mf-shell-nav-item {
    color: #c3d0e2;
    transition: transform 140ms cubic-bezier(.2,.8,.2,1), background-color 140ms ease, color 140ms ease, box-shadow 140ms ease;
  }
  .mf-shell .mf-shell-sidebar .mf-shell-nav-item:hover {
    transform: translateX(2px);
    background: rgb(255 255 255 / 0.085);
    color: #ffffff;
  }
  .mf-shell .mf-shell-sidebar .mf-shell-nav-item[data-active="true"] {
    background: linear-gradient(135deg, var(--primary), color-mix(in srgb, var(--primary) 68%, #071427));
    color: #ffffff;
    box-shadow: 0 10px 24px -13px color-mix(in srgb, var(--primary) 88%, transparent), inset 0 0 0 1px rgb(255 255 255 / 0.16);
    font-weight: 700;
  }
  .mf-shell .mf-shell-sidebar .mf-shell-nav-item[data-active="true"] svg { color: #ffffff; }
  .mf-shell .mf-brand-mark { box-shadow: 0 8px 20px -10px color-mix(in srgb, var(--primary) 82%, #000000); }

  .mf-shell .mf-shell-topbar {
    background: color-mix(in srgb, var(--card) 94%, transparent);
    border-bottom-color: color-mix(in srgb, var(--border) 78%, var(--foreground));
    box-shadow: 0 10px 28px -25px rgb(4 17 39 / 0.8);
    backdrop-filter: blur(18px) saturate(1.25);
  }
  .mf-shell .mf-shell-search {
    border-color: color-mix(in srgb, var(--input) 84%, var(--foreground));
    background: color-mix(in srgb, var(--card) 91%, var(--secondary));
    box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.58), 0 4px 14px rgb(6 19 40 / 0.04);
    transition: border-color 140ms ease, box-shadow 140ms ease, background-color 140ms ease;
  }
  .mf-shell .mf-shell-search:focus-within {
    border-color: var(--primary);
    background: var(--card);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 16%, transparent), 0 8px 22px rgb(6 19 40 / 0.08);
  }
  .mf-shell .mf-shell-content {
    background: radial-gradient(circle at 82% 0%, color-mix(in srgb, var(--primary) 9%, transparent), transparent 26rem), linear-gradient(180deg, color-mix(in srgb, var(--background) 96%, #ffffff), var(--background));
  }

  .mf-shell .mf-page-header {
    min-height: 3.9rem;
    border-bottom-color: color-mix(in srgb, var(--border) 82%, var(--foreground));
    background: linear-gradient(90deg, var(--card), color-mix(in srgb, var(--primary) 4%, var(--card)));
    box-shadow: 0 8px 22px -24px rgb(5 18 40 / 0.75);
  }
  .mf-shell .mf-page-title { font-size: 1.12rem; font-weight: 760; letter-spacing: -0.028em; }
  .mf-shell .mf-page-subtitle { color: var(--muted-foreground); font-weight: 520; }
  .mf-shell .mf-section-heading { font-size: 0.82rem; font-weight: 740; letter-spacing: -0.012em; }

  .mf-shell :is(.mf-surface, .mf-view-card, .mf-section-card, .mf-stat-card, .mf-workspace-shortcut, .mf-kanban-card, .mf-number-card, .mf-dash-chart) {
    border-color: color-mix(in srgb, var(--border) 88%, var(--foreground));
    box-shadow: var(--mf-card-shadow);
  }
  .mf-shell :is(.mf-workspace-shortcut, .mf-kanban-card, .mf-number-card) {
    transition: transform 150ms cubic-bezier(.2,.8,.2,1), border-color 150ms ease, box-shadow 150ms ease, background-color 150ms ease;
  }
  .mf-shell :is(.mf-workspace-shortcut, .mf-kanban-card, .mf-number-card):hover {
    transform: translateY(-2px);
    border-color: color-mix(in srgb, var(--primary) 46%, var(--border));
    box-shadow: 0 16px 34px -18px color-mix(in srgb, var(--primary) 32%, rgb(5 18 40 / 0.2)), 0 7px 18px rgb(5 18 40 / 0.08);
  }
  .mf-shell .mf-number-card { position: relative; overflow: hidden; }
  .mf-shell .mf-number-card::before {
    position: absolute;
    inset: 0 auto 0 0;
    width: 3px;
    background: linear-gradient(180deg, var(--primary), color-mix(in srgb, var(--primary) 42%, transparent));
    content: "";
  }

  .mf-shell button[class*="bg-primary"] {
    box-shadow: 0 10px 22px -13px color-mix(in srgb, var(--primary) 82%, transparent);
    transition: transform 120ms cubic-bezier(.2,.8,.2,1), box-shadow 120ms ease, filter 120ms ease, background-color 120ms ease;
  }
  .mf-shell button[class*="bg-primary"]:not(:disabled):hover {
    transform: translateY(-1px);
    filter: saturate(1.16) brightness(1.03);
    box-shadow: 0 15px 30px -14px color-mix(in srgb, var(--primary) 82%, transparent);
  }
  .mf-shell button[class*="bg-primary"]:not(:disabled):active {
    transform: translateY(1px) scale(0.985);
    box-shadow: 0 5px 14px -10px color-mix(in srgb, var(--primary) 72%, transparent);
  }

  .mf-shell :is(input, textarea, button[role="combobox"]) {
    border-color: var(--input);
    box-shadow: inset 0 1px 0 color-mix(in srgb, var(--card) 72%, transparent);
    transition: border-color 130ms ease, box-shadow 130ms ease, background-color 130ms ease;
  }
  .mf-shell :is(input, textarea, button[role="combobox"]):focus-visible {
    border-color: var(--primary);
    outline: none;
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 17%, transparent), 0 5px 16px rgb(5 18 40 / 0.07);
  }
  .mf-shell .mf-field label { color: color-mix(in srgb, var(--foreground) 82%, var(--muted-foreground)); font-weight: 650; }
  .mf-shell .mf-form-header {
    border-bottom: 1px solid color-mix(in srgb, var(--border) 82%, var(--foreground));
    background: color-mix(in srgb, var(--card) 94%, transparent);
    box-shadow: 0 10px 26px -26px rgb(5 18 40 / 0.8);
    backdrop-filter: blur(18px) saturate(1.2);
  }
  .mf-shell .mf-form-body { background: linear-gradient(180deg, color-mix(in srgb, var(--primary) 2.5%, var(--card)), var(--card) 10rem); }
  .mf-shell .mf-grid { border-color: color-mix(in srgb, var(--border) 78%, var(--foreground)); box-shadow: 0 8px 22px rgb(5 18 40 / 0.05); }

  .mf-shell .mf-list-view thead,
  .mf-shell .mf-report thead,
  .mf-shell .mf-list-view thead th,
  .mf-shell .mf-report thead th {
    background: #0a1730;
    color: #dce8f8;
  }
  .mf-shell .mf-list-view th,
  .mf-shell .mf-report th { height: 2.55rem; color: #dce8f8; font-weight: 720; letter-spacing: 0.055em; }
  .mf-shell .mf-list-view tbody tr,
  .mf-shell .mf-report tbody tr { transition: background-color 110ms ease, box-shadow 110ms ease; }
  .mf-shell .mf-list-view tbody tr:hover,
  .mf-shell .mf-report tbody tr:hover { background: color-mix(in srgb, var(--primary) 6%, var(--card)); }
  .mf-shell .mf-list-view tbody tr[data-state="selected"] {
    background: color-mix(in srgb, var(--primary) 13%, var(--card));
    box-shadow: inset 3px 0 0 var(--primary);
  }
  .mf-shell .mf-bulk-bar {
    background: linear-gradient(90deg, color-mix(in srgb, var(--primary) 16%, var(--card)), color-mix(in srgb, var(--primary) 8%, var(--card)));
    color: var(--foreground);
    box-shadow: inset 3px 0 0 var(--primary), 0 8px 18px rgb(5 18 40 / 0.06);
  }

  .mf-shell .mf-kanban-column {
    border-color: color-mix(in srgb, var(--border) 85%, var(--foreground));
    background: color-mix(in srgb, var(--secondary) 86%, var(--card));
    box-shadow: inset 0 3px 0 color-mix(in srgb, var(--primary) 22%, transparent);
  }
  .mf-shell .mf-calendar-event {
    border-color: color-mix(in srgb, var(--primary) 46%, transparent);
    background: color-mix(in srgb, var(--primary) 14%, var(--card));
    font-weight: 650;
    box-shadow: 0 5px 14px -9px color-mix(in srgb, var(--primary) 45%, transparent);
  }
  .mf-shell .mf-gantt-bar { box-shadow: 0 5px 16px -9px color-mix(in srgb, var(--primary) 70%, transparent); }

  @keyframes mf-command-rise {
    from { opacity: 0.68; transform: translateY(5px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .mf-shell :is(.mf-number-card, .mf-workspace-shortcut) { animation: mf-command-rise 240ms cubic-bezier(.2,.8,.2,1) both; }
}
'''
path.write_text(text + power)
