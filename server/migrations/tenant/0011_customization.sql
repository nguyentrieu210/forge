-- Customisation layer: Custom Field and Property Setter.
--
-- Without this, adapting a standard DocType for one customer means editing the
-- standard definition itself — which destroys the upgrade path, because the next
-- version of that definition would overwrite the customer's changes. Holding
-- customisations as separate overlay rows keeps the standard definition pristine
-- and replayable.

CREATE TABLE IF NOT EXISTS custom_fields (
  tenant_id TEXT NOT NULL,
  -- Frappe names these `<DocType>-<fieldname>`; kept so a Frappe client can
  -- address the row by the name it expects.
  name TEXT NOT NULL,
  dt TEXT NOT NULL,
  fieldname TEXT NOT NULL,
  -- The DocField definition, validated as field metadata before it is stored.
  metadata_json TEXT NOT NULL CHECK (json_valid(metadata_json)),
  -- Position: the standard fieldname this one follows. NULL appends at the end.
  insert_after TEXT,
  modified_by TEXT NOT NULL,
  modified_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, name),
  -- One custom field per (doctype, fieldname): two rows claiming the same
  -- fieldname would make the effective schema depend on row order.
  UNIQUE (tenant_id, dt, fieldname)
);
CREATE INDEX IF NOT EXISTS idx_custom_fields_dt ON custom_fields(tenant_id, dt, fieldname);

CREATE TABLE IF NOT EXISTS property_setters (
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  doc_type TEXT NOT NULL,
  -- 'DocField' overrides one field's property; 'DocType' overrides a
  -- doctype-level property such as the title field or the naming rule.
  doctype_or_field TEXT NOT NULL CHECK (doctype_or_field IN ('DocField','DocType')),
  field_name TEXT NOT NULL DEFAULT '',
  property TEXT NOT NULL,
  property_type TEXT NOT NULL DEFAULT 'Data',
  value TEXT,
  modified_by TEXT NOT NULL,
  modified_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, name),
  -- One setter per target property, for the same reason: otherwise the winner
  -- depends on scan order.
  UNIQUE (tenant_id, doc_type, doctype_or_field, field_name, property)
);
CREATE INDEX IF NOT EXISTS idx_property_setters_doctype ON property_setters(tenant_id, doc_type);

-- A DocField setter must name a field; a DocType setter must not.
-- Enforced in SQL because a setter with the wrong shape would apply to nothing and
-- look like a customisation that silently does not work.
CREATE TRIGGER IF NOT EXISTS property_setters_shape_insert
BEFORE INSERT ON property_setters
BEGIN
  SELECT CASE
    WHEN NEW.doctype_or_field='DocField' AND (NEW.field_name IS NULL OR NEW.field_name='')
      THEN RAISE(ABORT,'PROPERTY_SETTER_FIELD_REQUIRED')
    WHEN NEW.doctype_or_field='DocType' AND NEW.field_name<>''
      THEN RAISE(ABORT,'PROPERTY_SETTER_FIELD_NOT_ALLOWED')
  END;
END;

CREATE TRIGGER IF NOT EXISTS property_setters_shape_update
BEFORE UPDATE ON property_setters
BEGIN
  SELECT CASE
    WHEN NEW.doctype_or_field='DocField' AND (NEW.field_name IS NULL OR NEW.field_name='')
      THEN RAISE(ABORT,'PROPERTY_SETTER_FIELD_REQUIRED')
    WHEN NEW.doctype_or_field='DocType' AND NEW.field_name<>''
      THEN RAISE(ABORT,'PROPERTY_SETTER_FIELD_NOT_ALLOWED')
  END;
END;

-- Customisation revision per doctype.
--
-- The effective schema is (standard definition + overlays), so a cache keyed only
-- on the standard definition's revision would serve a stale schema after a
-- customisation change. Bumping this gives the merged schema a version of its own.
CREATE TABLE IF NOT EXISTS customization_revisions (
  tenant_id TEXT NOT NULL,
  doctype TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  modified_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, doctype)
);
