import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { readAppSource } from "../scripts/lib/read-app-source.mjs";
import { parseAppManifest } from "../dist/packages/app-registry/src/manifest.js";
import { isWebsitePath, websiteManifest, websitePage } from "../dist/packages/frappe-api/src/website.js";

const websiteRoot = new URL("../apps-src/website/", import.meta.url);

function fieldMap(doctype) {
  return new Map(doctype.fields.map((field) => [field.fieldname, field]));
}

test("Website app is a packable safe metadata capability", async () => {
  const source = await readAppSource(fileURLToPath(websiteRoot));
  const parsed = parseAppManifest(source);

  assert.equal(parsed.id, "website");
  assert.equal(parsed.version, "1.0.0");
  assert.deepEqual(parsed.doctypes.map((item) => item.name).sort(), ["Web Page", "Web Page Block", "Website Settings"]);

  const settings = parsed.doctypes.find((item) => item.name === "Website Settings");
  assert.equal(settings?.is_single, true);
  const settingsFields = fieldMap(settings);
  assert.equal(settingsFields.get("template_preset")?.required, true);
  assert.equal(settingsFields.get("template_version")?.required, true);
  assert.equal(settingsFields.get("template_version")?.read_only, true);
  assert.equal(settingsFields.get("theme_preset")?.required, true);
  assert.equal(settingsFields.get("theme_version")?.required, true);
  assert.equal(settingsFields.get("theme_version")?.read_only, true);

  const page = parsed.doctypes.find((item) => item.name === "Web Page");
  assert.equal(fieldMap(page).get("blocks")?.options, "Web Page Block");
  const block = parsed.doctypes.find((item) => item.name === "Web Page Block");
  assert.equal(block?.is_child, true);
  const blockTypes = String(fieldMap(block).get("block_type")?.options ?? "").split("\n");
  assert.ok(blockTypes.includes("product-grid"));
  assert.equal(blockTypes.includes("html"), false);
  assert.equal(blockTypes.includes("script"), false);

  const templates = source.fixtures.filter((item) => item.record_type === "Website Template");
  const themes = source.fixtures.filter((item) => item.record_type === "Website Theme Preset");
  assert.deepEqual(templates.map((item) => item.name).sort(), ["business-landing@1", "catalogue@1", "sales@1"]);
  assert.deepEqual(themes.map((item) => item.name).sort(), ["business-blue@1", "industrial-dark@1", "warm@1"]);
  const sales = templates.find((item) => item.name === "sales@1");
  assert.equal(sales.data.preset_id, "sales");
  assert.equal(sales.data.version, 1);
  assert.ok(sales.data.pages.some((candidate) => candidate.blocks.some((entry) => entry.type === "product-grid" && entry.source === "storefront-catalog")));
});

test("Website public path allowlist is exact", () => {
  assert.equal(isWebsitePath("/api/method/forge.website.manifest"), true);
  assert.equal(isWebsitePath("/api/method/forge.website.page"), true);
  assert.equal(isWebsitePath("/api/method/forge.website.page.private"), false);
  assert.equal(isWebsitePath("/api/resource/Web Page"), false);
});

test("Website resolver exposes only published tenant content and safe blocks", async () => {
  const db = fakeDb({
    tenants: {
      alpha: {
        settings: {
          enabled: 1,
          published: 1,
          site_title: "Alpha Window",
          site_description: "Public Alpha site",
          home_page: "home",
          template_preset: "business-landing",
          template_version: 1,
          theme_preset: "business-blue",
          theme_version: 1,
          primary_color: "#112233",
          contact_email: "hello@alpha.test",
        },
        pages: [
          {
            name: "about",
            payload: {
              slug: "about",
              title: "Alpha About",
              published: 1,
              show_in_nav: 1,
              nav_order: 2,
              blocks: [
                { block_type: "text", heading: "Only Alpha", body: "Safe plain text", button_url: "javascript:alert(1)" },
              ],
              internal_note: "must never leak",
            },
          },
          {
            name: "draft",
            payload: { slug: "draft", title: "Draft Secret", published: 0, blocks: [{ block_type: "text", body: "secret" }] },
          },
        ],
      },
      beta: {
        settings: {
          enabled: 1,
          published: 1,
          site_title: "Beta Plastic",
          home_page: "home",
          template_preset: "catalogue",
          theme_preset: "warm",
        },
        pages: [],
      },
    },
    masters: presetMasters(),
  });

  const alpha = await websitePage({ db, tenantId: "alpha" }, "about");
  assert.equal(alpha.site.title, "Alpha Window");
  assert.equal(alpha.site.template_version, 1);
  assert.equal(alpha.site.theme_version, 1);
  assert.equal(alpha.theme.primary, "#112233");
  assert.equal(alpha.page.title, "Alpha About");
  assert.equal(alpha.page.internal_note, undefined);
  assert.equal(alpha.page.blocks[0].button_url, undefined, "javascript: URL must not reach the browser");

  const alphaManifest = await websiteManifest({ db, tenantId: "alpha" });
  assert.equal(alphaManifest.navigation.some((item) => item.slug === "draft"), false);
  assert.equal(alphaManifest.navigation.some((item) => item.slug === "about"), true);

  const beta = await websitePage({ db, tenantId: "beta" }, "home");
  assert.equal(beta.site.title, "Beta Plastic");
  assert.equal(beta.site.template_version, 1, "missing legacy version field must default to v1");
  assert.equal(beta.site.theme_version, 1, "missing legacy version field must default to v1");
  assert.equal(beta.page.blocks.some((item) => item.type === "product-grid"), true);
  assert.notEqual(beta.theme.primary, alpha.theme.primary);

  await assert.rejects(() => websitePage({ db, tenantId: "alpha" }, "draft"));
});

test("Website preset versions are pinned and do not silently change on app upgrade", async () => {
  const masters = presetMasters();
  masters["Website Template:business-landing@2"] = {
    preset_id: "business-landing",
    version: 2,
    pages: [{ slug: "home", title: "V2 Home", blocks: [{ type: "hero", heading: "V2 must not leak" }] }],
  };
  masters["Website Theme Preset:business-blue@2"] = {
    preset_id: "business-blue",
    version: 2,
    tokens: { primary: "#ff0000", secondary: "#000000", background: "#ffffff", surface: "#ffffff", text: "#000000", muted: "#666666", heading_font: "system", body_font: "system", radius: "soft", density: "comfortable" },
  };
  const db = fakeDb({
    tenants: {
      pinned: {
        settings: {
          enabled: 1,
          published: 1,
          site_title: "Pinned",
          home_page: "home",
          template_preset: "business-landing",
          template_version: 1,
          theme_preset: "business-blue",
          theme_version: 1,
        },
        pages: [],
      },
    },
    masters,
  });

  const page = await websitePage({ db, tenantId: "pinned" }, "home");
  assert.equal(page.site.template_version, 1);
  assert.equal(page.site.theme_version, 1);
  assert.equal(page.page.title, "Home");
  assert.equal(page.page.blocks[0].heading, "Business");
  assert.equal(page.theme.primary, "#1d4ed8");
});

test("Website resolver fails closed for unpublished site and unsupported block", async () => {
  const masters = presetMasters();
  masters["Website Template:unsafe@1"] = {
    preset_id: "unsafe",
    version: 1,
    pages: [{ slug: "home", title: "Unsafe", blocks: [{ type: "html", body: "<script>alert(1)</script>" }] }],
  };
  const db = fakeDb({
    tenants: {
      hidden: {
        settings: { enabled: 1, published: 0, site_title: "Hidden", home_page: "home", template_preset: "business-landing", template_version: 1, theme_preset: "business-blue", theme_version: 1 },
        pages: [],
      },
      unsafe: {
        settings: { enabled: 1, published: 1, site_title: "Unsafe", home_page: "home", template_preset: "unsafe", template_version: 1, theme_preset: "business-blue", theme_version: 1 },
        pages: [],
      },
    },
    masters,
  });

  await assert.rejects(() => websiteManifest({ db, tenantId: "hidden" }));
  await assert.rejects(() => websitePage({ db, tenantId: "unsafe" }, "home"), /block type/i);
});

function presetMasters() {
  return {
    "Website Theme Preset:business-blue@1": {
      preset_id: "business-blue",
      version: 1,
      tokens: { primary: "#1d4ed8", secondary: "#0f766e", background: "#ffffff", surface: "#f8fafc", text: "#0f172a", muted: "#64748b", heading_font: "system", body_font: "system", radius: "soft", density: "comfortable" },
    },
    "Website Theme Preset:warm@1": {
      preset_id: "warm",
      version: 1,
      tokens: { primary: "#c2410c", secondary: "#a16207", background: "#fffbeb", surface: "#fff7ed", text: "#431407", muted: "#78716c", heading_font: "serif", body_font: "system", radius: "round", density: "comfortable" },
    },
    "Website Template:business-landing@1": {
      preset_id: "business-landing",
      version: 1,
      pages: [
        { slug: "home", title: "Home", show_in_nav: 1, nav_label: "Home", nav_order: 1, blocks: [{ type: "hero", heading: "Business", button_url: "/contact" }] },
        { slug: "about", title: "Template About", show_in_nav: 1, nav_label: "About", nav_order: 2, blocks: [{ type: "text", body: "Template" }] },
        { slug: "contact", title: "Contact", show_in_nav: 1, nav_label: "Contact", nav_order: 9, blocks: [{ type: "contact" }] },
      ],
    },
    "Website Template:catalogue@1": {
      preset_id: "catalogue",
      version: 1,
      pages: [{ slug: "home", title: "Catalogue", show_in_nav: 1, nav_label: "Home", nav_order: 1, blocks: [{ type: "product-grid", source: "storefront-catalog", limit: 6 }] }],
    },
  };
}

function fakeDb({ tenants, masters }) {
  return {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async first() {
              const tenantId = values[0];
              if (sql.includes("doctype='Website Settings'")) {
                const settings = tenants[tenantId]?.settings;
                return settings ? { payload_json: JSON.stringify(settings) } : null;
              }
              if (sql.includes("FROM master_records")) {
                const key = `${values[1]}:${values[2]}`;
                const data = masters[key];
                return data ? { data_json: JSON.stringify(data) } : null;
              }
              throw new Error(`Unexpected first query: ${sql}`);
            },
            async all() {
              const tenantId = values[0];
              if (sql.includes("doctype='Web Page'")) {
                return {
                  results: (tenants[tenantId]?.pages ?? []).map((page) => ({ name: page.name, payload_json: JSON.stringify(page.payload) })),
                };
              }
              throw new Error(`Unexpected all query: ${sql}`);
            },
          };
        },
      };
    },
  };
}
