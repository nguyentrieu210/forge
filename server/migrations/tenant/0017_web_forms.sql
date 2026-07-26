-- Web Forms: the platform's first PUBLIC write surface.
--
-- Everything else requires a session. This lets an unauthenticated visitor create one
-- document of one doctype, and every column below exists to bound that.
CREATE TABLE IF NOT EXISTS web_forms (
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  -- The route the form is served at, unique so two forms cannot fight over one URL.
  route TEXT NOT NULL,
  doc_type TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  introduction TEXT NOT NULL DEFAULT '',
  success_message TEXT NOT NULL DEFAULT '',
  -- JSON array of fieldnames a submitter may set. NOT "every field of the doctype":
  -- a form that accepted anything would let a visitor set `approved`, `amount`, or a
  -- Link to a record they were never shown.
  fields_json TEXT NOT NULL DEFAULT '[]',
  -- The role the submission runs as. The tenant must grant it `create` on doc_type
  -- through ordinary DocPerm — this table grants NOTHING by itself. A Web Form can
  -- therefore never do more than the tenant already decided that role may do.
  submit_as_role TEXT NOT NULL,
  -- 0 means a guest may submit. 1 requires a session, which is how an internal form
  -- (an expense claim, an internal request) differs from a public one.
  login_required INTEGER NOT NULL DEFAULT 0 CHECK (login_required IN (0,1)),
  -- Unpublished forms 404 for everyone. Default is UNPUBLISHED: a form that went live
  -- the moment it was created would be a public endpoint nobody meant to open yet.
  published INTEGER NOT NULL DEFAULT 0 CHECK (published IN (0,1)),
  -- Upper bound on submissions accepted from one visitor per day, counted by the
  -- platform. A public write endpoint with no ceiling is a way to fill a tenant's
  -- database from the outside.
  max_per_day INTEGER NOT NULL DEFAULT 20 CHECK (max_per_day > 0),
  modified_by TEXT NOT NULL DEFAULT '',
  modified_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, name)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_web_forms_route ON web_forms(tenant_id, route);

-- Submissions counted per (form, visitor, day), so `max_per_day` is enforceable
-- without a session. `visitor` is a hash of the client address, never the address
-- itself: the ceiling needs to distinguish visitors, not identify them.
CREATE TABLE IF NOT EXISTS web_form_submissions (
  tenant_id TEXT NOT NULL,
  form_name TEXT NOT NULL,
  visitor TEXT NOT NULL,
  day TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  modified_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, form_name, visitor, day)
);
