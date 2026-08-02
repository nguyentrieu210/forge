-- HRM recruitment depth integrity after lifecycle closure migration 0045.
-- Candidate pool identity, scorecards and offer responses are auditable source data.
-- Hiring Completion must never bypass explicit offer acceptance.

CREATE TRIGGER IF NOT EXISTS hr_candidate_profile_email_unique_insert_guard
BEFORE INSERT ON documents
WHEN NEW.doctype='Candidate Profile' AND NEW.docstatus<>2
AND EXISTS(
  SELECT 1 FROM documents c
  WHERE c.tenant_id=NEW.tenant_id
    AND c.doctype='Candidate Profile'
    AND c.docstatus<>2
    AND lower(trim(json_extract(c.payload_json,'$.email')))=lower(trim(json_extract(NEW.payload_json,'$.email')))
)
BEGIN
  SELECT RAISE(ABORT,'REFERENCE_VALIDATION_FAILED: HR_CANDIDATE_PROFILE_EMAIL_DUPLICATE');
END;

CREATE TRIGGER IF NOT EXISTS hr_candidate_profile_email_unique_update_guard
BEFORE UPDATE OF docstatus,payload_json ON documents
WHEN NEW.doctype='Candidate Profile' AND NEW.docstatus<>2
AND EXISTS(
  SELECT 1 FROM documents c
  WHERE c.tenant_id=NEW.tenant_id
    AND c.doc_key<>OLD.doc_key
    AND c.doctype='Candidate Profile'
    AND c.docstatus<>2
    AND lower(trim(json_extract(c.payload_json,'$.email')))=lower(trim(json_extract(NEW.payload_json,'$.email')))
)
BEGIN
  SELECT RAISE(ABORT,'REFERENCE_VALIDATION_FAILED: HR_CANDIDATE_PROFILE_EMAIL_DUPLICATE');
END;

CREATE TRIGGER IF NOT EXISTS hr_interview_scorecard_unique_insert_guard
BEFORE INSERT ON documents
WHEN NEW.doctype='Interview Scorecard' AND NEW.docstatus=1
AND EXISTS(
  SELECT 1 FROM documents s
  WHERE s.tenant_id=NEW.tenant_id
    AND s.doctype='Interview Scorecard'
    AND s.docstatus=1
    AND json_extract(s.payload_json,'$.interview')=json_extract(NEW.payload_json,'$.interview')
)
BEGIN
  SELECT RAISE(ABORT,'REFERENCE_VALIDATION_FAILED: HR_INTERVIEW_SCORECARD_DUPLICATE');
END;

CREATE TRIGGER IF NOT EXISTS hr_interview_scorecard_unique_update_guard
BEFORE UPDATE OF docstatus,payload_json ON documents
WHEN NEW.doctype='Interview Scorecard' AND NEW.docstatus=1
AND EXISTS(
  SELECT 1 FROM documents s
  WHERE s.tenant_id=NEW.tenant_id
    AND s.doc_key<>OLD.doc_key
    AND s.doctype='Interview Scorecard'
    AND s.docstatus=1
    AND json_extract(s.payload_json,'$.interview')=json_extract(NEW.payload_json,'$.interview')
)
BEGIN
  SELECT RAISE(ABORT,'REFERENCE_VALIDATION_FAILED: HR_INTERVIEW_SCORECARD_DUPLICATE');
END;

CREATE TRIGGER IF NOT EXISTS hr_interview_scored_source_update_guard
BEFORE UPDATE OF docstatus,payload_json ON documents
WHEN OLD.doctype='Interview' AND OLD.docstatus=1
AND EXISTS(
  SELECT 1 FROM documents s
  WHERE s.tenant_id=OLD.tenant_id
    AND s.doctype='Interview Scorecard'
    AND s.docstatus=1
    AND json_extract(s.payload_json,'$.interview')=OLD.name
)
BEGIN
  SELECT RAISE(ABORT,'INVALID_LIFECYCLE_TRANSITION: HR_INTERVIEW_ALREADY_SCORED');
END;

CREATE TRIGGER IF NOT EXISTS hr_interview_scored_source_delete_guard
BEFORE DELETE ON documents
WHEN OLD.doctype='Interview' AND OLD.docstatus=1
AND EXISTS(
  SELECT 1 FROM documents s
  WHERE s.tenant_id=OLD.tenant_id
    AND s.doctype='Interview Scorecard'
    AND s.docstatus=1
    AND json_extract(s.payload_json,'$.interview')=OLD.name
)
BEGIN
  SELECT RAISE(ABORT,'INVALID_LIFECYCLE_TRANSITION: HR_INTERVIEW_ALREADY_SCORED');
END;

CREATE TRIGGER IF NOT EXISTS hr_job_offer_response_unique_insert_guard
BEFORE INSERT ON documents
WHEN NEW.doctype='Job Offer Response' AND NEW.docstatus=1
AND EXISTS(
  SELECT 1 FROM documents r
  WHERE r.tenant_id=NEW.tenant_id
    AND r.doctype='Job Offer Response'
    AND r.docstatus=1
    AND json_extract(r.payload_json,'$.job_offer')=json_extract(NEW.payload_json,'$.job_offer')
)
BEGIN
  SELECT RAISE(ABORT,'REFERENCE_VALIDATION_FAILED: HR_JOB_OFFER_RESPONSE_DUPLICATE');
END;

CREATE TRIGGER IF NOT EXISTS hr_job_offer_response_unique_update_guard
BEFORE UPDATE OF docstatus,payload_json ON documents
WHEN NEW.doctype='Job Offer Response' AND NEW.docstatus=1
AND EXISTS(
  SELECT 1 FROM documents r
  WHERE r.tenant_id=NEW.tenant_id
    AND r.doc_key<>OLD.doc_key
    AND r.doctype='Job Offer Response'
    AND r.docstatus=1
    AND json_extract(r.payload_json,'$.job_offer')=json_extract(NEW.payload_json,'$.job_offer')
)
BEGIN
  SELECT RAISE(ABORT,'REFERENCE_VALIDATION_FAILED: HR_JOB_OFFER_RESPONSE_DUPLICATE');
END;

CREATE TRIGGER IF NOT EXISTS hr_job_offer_responded_source_update_guard
BEFORE UPDATE OF docstatus,payload_json ON documents
WHEN OLD.doctype='Job Offer' AND OLD.docstatus=1
AND EXISTS(
  SELECT 1 FROM documents r
  WHERE r.tenant_id=OLD.tenant_id
    AND r.doctype='Job Offer Response'
    AND r.docstatus=1
    AND json_extract(r.payload_json,'$.job_offer')=OLD.name
)
BEGIN
  SELECT RAISE(ABORT,'INVALID_LIFECYCLE_TRANSITION: HR_JOB_OFFER_ALREADY_RESPONDED');
END;

CREATE TRIGGER IF NOT EXISTS hr_job_offer_responded_source_delete_guard
BEFORE DELETE ON documents
WHEN OLD.doctype='Job Offer' AND OLD.docstatus=1
AND EXISTS(
  SELECT 1 FROM documents r
  WHERE r.tenant_id=OLD.tenant_id
    AND r.doctype='Job Offer Response'
    AND r.docstatus=1
    AND json_extract(r.payload_json,'$.job_offer')=OLD.name
)
BEGIN
  SELECT RAISE(ABORT,'INVALID_LIFECYCLE_TRANSITION: HR_JOB_OFFER_ALREADY_RESPONDED');
END;

CREATE TRIGGER IF NOT EXISTS hr_hiring_completion_acceptance_insert_guard
BEFORE INSERT ON documents
WHEN NEW.doctype='Hiring Completion' AND NEW.docstatus=1
AND NOT EXISTS(
  SELECT 1 FROM documents r
  WHERE r.tenant_id=NEW.tenant_id
    AND r.doctype='Job Offer Response'
    AND r.docstatus=1
    AND json_extract(r.payload_json,'$.job_offer')=json_extract(NEW.payload_json,'$.job_offer')
    AND json_extract(r.payload_json,'$.response')='Accepted'
)
BEGIN
  SELECT RAISE(ABORT,'REFERENCE_VALIDATION_FAILED: HR_HIRING_REQUIRES_ACCEPTED_OFFER');
END;

CREATE TRIGGER IF NOT EXISTS hr_hiring_completion_acceptance_update_guard
BEFORE UPDATE OF docstatus,payload_json ON documents
WHEN NEW.doctype='Hiring Completion' AND NEW.docstatus=1
AND NOT EXISTS(
  SELECT 1 FROM documents r
  WHERE r.tenant_id=NEW.tenant_id
    AND r.doctype='Job Offer Response'
    AND r.docstatus=1
    AND json_extract(r.payload_json,'$.job_offer')=json_extract(NEW.payload_json,'$.job_offer')
    AND json_extract(r.payload_json,'$.response')='Accepted'
)
BEGIN
  SELECT RAISE(ABORT,'REFERENCE_VALIDATION_FAILED: HR_HIRING_REQUIRES_ACCEPTED_OFFER');
END;
