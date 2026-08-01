function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function stringArray(value) {
  return Array.isArray(value) ? value.filter((entry) => typeof entry === "string") : [];
}

function sameStrings(actual, expected) {
  return actual.length === expected.length && actual.every((entry, index) => entry === expected[index]);
}

function visibleCharts(manifest, boot) {
  const roles = new Set(stringArray(boot?.roles));
  const isAdministrator = boot?.user === "Administrator" || roles.has("Administrator");
  return (manifest.charts ?? []).filter((chart) =>
    isAdministrator || stringArray(chart.roles).some((role) => roles.has(role)),
  );
}

/**
 * Read-only conformance smoke after an app metadata install.
 *
 * The install endpoint already validates storage. These checks validate the surfaces the
 * user opens afterwards: compact/full forms, the auth-backed User Link provider, overview
 * charts and their report drill-down. No document is created or changed here.
 */
export async function verifyInstalledApp({ manifest, clientManifest, call, adminUser }) {
  assert(clientManifest?.version === manifest.version,
    `installed client manifest reports ${clientManifest?.version ?? "no version"}, expected ${manifest.version}`);

  const formMeta = (manifest.doctypes ?? []).find((doctype) =>
    doctype.viewPolicy?.quickEntry?.enabled && doctype.viewPolicy?.form?.enabled,
  );
  let checkedForm = null;
  if (formMeta) {
    const bundle = await call("frappe.desk.form.load.getdoctype", {
      doctype: formMeta.name,
      with_parent: 1,
    });
    const installed = (bundle?.docs ?? []).find((doc) => doc?.name === formMeta.name);
    assert(installed, `installed metadata does not resolve DocType ${formMeta.name}`);

    const quickExpected = stringArray(formMeta.viewPolicy.quickEntry.fields);
    const quickActual = stringArray(installed.viewPolicy?.quickEntry?.fields);
    assert(sameStrings(quickActual, quickExpected),
      `${formMeta.name} quick form differs after install: ${quickActual.join(", ")}`);

    const fullExpected = stringArray(formMeta.viewPolicy.form.fields);
    const fullActual = stringArray(installed.viewPolicy?.form?.fields);
    assert(sameStrings(fullActual, fullExpected),
      `${formMeta.name} expanded form differs after install: ${fullActual.join(", ")}`);

    const installedFields = new Map((installed.fields ?? []).map((field) => [field.fieldname, field]));
    for (const field of formMeta.fields ?? []) {
      const actual = installedFields.get(field.fieldname);
      assert(actual, `${formMeta.name}.${field.fieldname} is missing after install`);
      assert(actual.surface === field.surface,
        `${formMeta.name}.${field.fieldname} surface changed from ${field.surface} to ${actual.surface}`);
      assert(actual.editMode === field.editMode,
        `${formMeta.name}.${field.fieldname} editMode changed from ${field.editMode} to ${actual.editMode}`);
      assert(actual.valueSource === field.valueSource,
        `${formMeta.name}.${field.fieldname} valueSource changed from ${field.valueSource} to ${actual.valueSource}`);
    }
    checkedForm = formMeta.name;
  }

  const userLink = (manifest.doctypes ?? []).flatMap((doctype) =>
    (doctype.fields ?? [])
      .filter((field) => field.fieldtype === "Link" && field.options === "User")
      .map((field) => ({ doctype: doctype.name, field: field.fieldname })),
  )[0];
  let checkedUserLink = null;
  if (userLink) {
    const users = await call("frappe.desk.search.search_link", {
      doctype: "User",
      txt: adminUser,
      page_length: 20,
    });
    assert(Array.isArray(users) && users.some((entry) => entry?.value === adminUser),
      `User Link provider cannot resolve the installer account ${adminUser}`);
    checkedUserLink = `${userLink.doctype}.${userLink.field}`;
  }

  let checkedCharts = 0;
  let checkedReports = 0;
  if ((manifest.charts ?? []).length) {
    const boot = await call("metaforge.api.get_boot", {});
    const expected = visibleCharts(manifest, boot);
    const overview = await call("metaforge.api.get_overview", { app: manifest.id });
    const actual = Array.isArray(overview?.charts) ? overview.charts : [];
    assert(actual.length === expected.length,
      `overview exposes ${actual.length} chart(s), expected ${expected.length} for the installer roles`);

    for (const chart of expected) {
      const rendered = actual.find((entry) => entry?.label === chart.label && entry?.route === chart.drilldown?.route);
      assert(rendered, `overview does not expose permitted chart ${chart.name}`);
      assert(rendered.emptyFallback === chart.emptyFallback,
        `overview chart ${chart.name} lost empty fallback ${chart.emptyFallback}`);

      const report = await call("frappe.desk.query_report.run", {
        report_name: chart.source,
        filters: {},
        ignore_prepared_report: 1,
      });
      const columns = Array.isArray(report?.columns) ? report.columns : [];
      const fields = new Set(columns.map((column) => column?.fieldname));
      for (const field of [...stringArray(chart.dimensions), ...stringArray(chart.measures)]) {
        assert(fields.has(field), `chart report ${chart.source} is missing column ${field}`);
      }
      assert(Array.isArray(report?.result), `chart report ${chart.source} did not return a result array`);
      checkedReports += 1;
    }
    checkedCharts = expected.length;
  }

  return {
    version: manifest.version,
    form: checkedForm,
    userLink: checkedUserLink,
    charts: checkedCharts,
    reports: checkedReports,
  };
}

export const __test = { visibleCharts };
