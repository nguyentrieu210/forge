-- WS15 evidence-backed state integrity.
--
-- OCR/signature status is system-owned metadata, but integrations and app Workers still
-- write the canonical document payload. A status such as Ready/Signed must therefore be
-- backed by evidence in the same committed row; otherwise reporting/audit can claim an
-- extraction or signature that never happened.

CREATE TRIGGER IF NOT EXISTS ws15_managed_document_evidence_insert_guard
BEFORE INSERT ON documents
WHEN NEW.doctype='Managed Document'
BEGIN
  SELECT CASE
    WHEN json_extract(NEW.payload_json,'$.ocr_status')='Ready'
      AND TRIM(COALESCE(json_extract(NEW.payload_json,'$.ocr_text'),''))=''
      THEN RAISE(ABORT,'MANAGED_DOCUMENT_OCR_READY_WITHOUT_TEXT')
    WHEN json_extract(NEW.payload_json,'$.signature_status')='Signed'
      AND TRIM(COALESCE(json_extract(NEW.payload_json,'$.signature_reference'),''))=''
      THEN RAISE(ABORT,'MANAGED_DOCUMENT_SIGNED_WITHOUT_REFERENCE')
    WHEN json_extract(NEW.payload_json,'$.signature_status')='Signed'
      AND TRIM(COALESCE(json_extract(NEW.payload_json,'$.signed_by'),''))=''
      THEN RAISE(ABORT,'MANAGED_DOCUMENT_SIGNED_WITHOUT_SIGNER')
    WHEN json_extract(NEW.payload_json,'$.signature_status')='Signed'
      AND datetime(json_extract(NEW.payload_json,'$.signed_at')) IS NULL
      THEN RAISE(ABORT,'MANAGED_DOCUMENT_SIGNED_WITHOUT_TIMESTAMP')
  END;
END;

CREATE TRIGGER IF NOT EXISTS ws15_managed_document_evidence_update_guard
BEFORE UPDATE OF payload_json ON documents
WHEN NEW.doctype='Managed Document'
BEGIN
  SELECT CASE
    WHEN json_extract(NEW.payload_json,'$.ocr_status')='Ready'
      AND TRIM(COALESCE(json_extract(NEW.payload_json,'$.ocr_text'),''))=''
      THEN RAISE(ABORT,'MANAGED_DOCUMENT_OCR_READY_WITHOUT_TEXT')
    WHEN json_extract(NEW.payload_json,'$.signature_status')='Signed'
      AND TRIM(COALESCE(json_extract(NEW.payload_json,'$.signature_reference'),''))=''
      THEN RAISE(ABORT,'MANAGED_DOCUMENT_SIGNED_WITHOUT_REFERENCE')
    WHEN json_extract(NEW.payload_json,'$.signature_status')='Signed'
      AND TRIM(COALESCE(json_extract(NEW.payload_json,'$.signed_by'),''))=''
      THEN RAISE(ABORT,'MANAGED_DOCUMENT_SIGNED_WITHOUT_SIGNER')
    WHEN json_extract(NEW.payload_json,'$.signature_status')='Signed'
      AND datetime(json_extract(NEW.payload_json,'$.signed_at')) IS NULL
      THEN RAISE(ABORT,'MANAGED_DOCUMENT_SIGNED_WITHOUT_TIMESTAMP')
  END;
END;

CREATE TRIGGER IF NOT EXISTS ws15_contract_signature_evidence_insert_guard
BEFORE INSERT ON documents
WHEN NEW.doctype='Contract'
BEGIN
  SELECT CASE
    WHEN json_extract(NEW.payload_json,'$.signature_status')='Signed'
      AND TRIM(COALESCE(json_extract(NEW.payload_json,'$.signed_file'),''))=''
      AND TRIM(COALESCE(json_extract(NEW.payload_json,'$.signature_reference'),''))=''
      THEN RAISE(ABORT,'CONTRACT_SIGNED_WITHOUT_EVIDENCE')
  END;
END;

CREATE TRIGGER IF NOT EXISTS ws15_contract_signature_evidence_update_guard
BEFORE UPDATE OF payload_json ON documents
WHEN NEW.doctype='Contract'
BEGIN
  SELECT CASE
    WHEN json_extract(NEW.payload_json,'$.signature_status')='Signed'
      AND TRIM(COALESCE(json_extract(NEW.payload_json,'$.signed_file'),''))=''
      AND TRIM(COALESCE(json_extract(NEW.payload_json,'$.signature_reference'),''))=''
      THEN RAISE(ABORT,'CONTRACT_SIGNED_WITHOUT_EVIDENCE')
  END;
END;

-- Fail closed on any live rows produced by an earlier development install. No-op writes
-- do not alter business data; they only force the existing payload through the guards.
UPDATE documents SET payload_json=payload_json WHERE doctype='Managed Document';
UPDATE documents SET payload_json=payload_json WHERE doctype='Contract';
