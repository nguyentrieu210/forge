import type { JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import { nextDocStatus } from "../../document-kernel/src/index.js";
import { JobApplicantController as BaseJobApplicantController, JobOpeningController as BaseJobOpeningController } from "./hrm-core-controllers.js";
import { SuiteController } from "./suite-controllers.js";
import * as H from "./hrm-shared.js";

type HrmContext = H.HrmContext;

export class ExtendedJobOpeningController extends BaseJobOpeningController {
  async normalize(context: HrmContext): Promise<JsonObject> {
    const normalized = await super.normalize(context);
    const minimumYears = H.numeric(normalized.minimum_years_experience, 0);
    if (!Number.isFinite(minimumYears) || minimumYears < 0 || minimumYears > 80) throw errors.validation("Job Opening minimum_years_experience is invalid");
    const skills = normalizedStringArray(normalized.required_skills_json, "Job Opening required_skills_json");
    const skillWeight = H.numeric(normalized.skill_weight_percent, 70);
    const experienceWeight = H.numeric(normalized.experience_weight_percent, 30);
    if (skillWeight < 0 || experienceWeight < 0 || Math.abs(skillWeight + experienceWeight - 100) > 1e-9) {
      throw errors.validation("Job Opening match weights must be non-negative and sum to 100");
    }
    return { ...normalized, minimum_years_experience: minimumYears, required_skills_json: JSON.stringify(skills), skill_weight_percent: skillWeight, experience_weight_percent: experienceWeight };
  }
}

export class CandidateProfileController extends SuiteController<JsonObject> {
  readonly doctype = "Candidate Profile";
  async normalize(context: HrmContext): Promise<JsonObject> {
    const input = context.command.document;
    const email = H.requiredEmail(input.email, "Candidate Profile email");
    const name = H.requiredText(input.candidate_name, "Candidate Profile candidate_name");
    const years = H.numeric(input.years_experience, 0);
    if (!Number.isFinite(years) || years < 0 || years > 80) throw errors.validation("Candidate Profile years_experience is invalid");
    const skills = normalizedStringArray(input.skills_json, "Candidate Profile skills_json");
    const resumeText = H.text(input.resume_text);
    const parsedEmail = resumeText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.toLowerCase();
    const parsedPhone = resumeText.match(/(?:\+?\d[\d\s().-]{7,}\d)/)?.[0]?.replace(/\s+/g, " ");
    if (parsedEmail && parsedEmail !== email.toLowerCase()) throw errors.validation("Candidate Profile resume_text email does not match candidate email");
    const profiles = await context.reader.listDocumentsByDoctype<JsonObject>(context.command.tenant_id, this.doctype);
    if (profiles.some((item) => item.name !== context.command.aggregate.name && item.docstatus !== 2 && H.text(item.data.email).toLowerCase() === email.toLowerCase())) {
      throw errors.exists(`Candidate Profile email ${email} already exists`);
    }
    return {
      ...input,
      candidate_name: name,
      email,
      years_experience: years,
      skills_json: JSON.stringify(skills),
      parsed_profile_json: JSON.stringify({ candidate_name: name, email, mobile: H.text(input.mobile) || parsedPhone || "", current_title: H.text(input.current_title), years_experience: years, skills, resume_text_available: Boolean(resumeText) }),
      active: H.truthy(input.active ?? 1) ? 1 : 0,
    };
  }
}

export class ExtendedJobApplicantController extends BaseJobApplicantController {
  async normalize(context: HrmContext): Promise<JsonObject> {
    const input = context.command.document;
    const profileName = H.text(input.candidate_profile);
    let enriched = input;
    if (profileName) {
      const profile = await H.requireRecord(context, "Candidate Profile", profileName);
      if (!H.truthy(profile.active ?? 1)) throw errors.reference(`Candidate Profile ${profileName} is inactive`);
      enriched = {
        ...input,
        applicant_name: H.requiredText(profile.candidate_name, `Candidate Profile ${profileName} candidate_name`),
        email: H.requiredEmail(profile.email, `Candidate Profile ${profileName} email`),
        mobile: H.text(input.mobile) || H.text(profile.mobile),
        source: H.text(input.source) || H.text(profile.source),
        resume: H.text(input.resume) || H.text(profile.resume),
      };
    }
    const nestedContext = { ...context, command: { ...context.command, document: enriched } } as HrmContext;
    const normalized = await super.normalize(nestedContext);
    const matches = await context.reader.listDocumentsByDoctype<JsonObject>(context.command.tenant_id, "Candidate Match");
    const opening = H.text(normalized.job_opening);
    const latest = matches.filter((item) => item.docstatus === 1 && H.text(item.data.candidate_profile) === profileName && H.text(item.data.job_opening) === opening)
      .sort((a, b) => H.text(b.data.evaluated_at).localeCompare(H.text(a.data.evaluated_at)))[0];
    return { ...normalized, ...(profileName ? { candidate_profile: profileName } : {}), latest_match_score: latest ? H.numeric(latest.data.total_score, 0) : H.numeric(normalized.latest_match_score, 0) };
  }
}

export class CandidateMatchController extends SuiteController<JsonObject> {
  readonly doctype = "Candidate Match";
  async normalize(context: HrmContext): Promise<JsonObject> {
    const input = context.command.document;
    const profileName = H.requiredText(input.candidate_profile, "Candidate Match candidate_profile");
    const profile = await H.requireRecord(context, "Candidate Profile", profileName);
    if (!H.truthy(profile.active ?? 1)) throw errors.reference(`Candidate Profile ${profileName} is inactive`);
    const openingName = H.requiredText(input.job_opening, "Candidate Match job_opening");
    const opening = await H.requireSubmitted(context, "Job Opening", openingName);
    const candidateSkills = new Set(normalizedStringArray(profile.skills_json, `Candidate Profile ${profileName} skills_json`).map((value) => value.toLowerCase()));
    const requiredSkills = normalizedStringArray(opening.required_skills_json, `Job Opening ${openingName} required_skills_json`);
    const matched = requiredSkills.filter((skill) => candidateSkills.has(skill.toLowerCase()));
    const missing = requiredSkills.filter((skill) => !candidateSkills.has(skill.toLowerCase()));
    const skillScore = requiredSkills.length === 0 ? 100 : Math.round((matched.length / requiredSkills.length) * 10000) / 100;
    const years = H.numeric(profile.years_experience, 0);
    const minimumYears = H.numeric(opening.minimum_years_experience, 0);
    const experienceScore = minimumYears <= 0 ? 100 : Math.min(100, Math.round((years / minimumYears) * 10000) / 100);
    const skillWeight = H.numeric(opening.skill_weight_percent, 70);
    const experienceWeight = H.numeric(opening.experience_weight_percent, 30);
    if (Math.abs(skillWeight + experienceWeight - 100) > 1e-9) throw errors.reference(`Job Opening ${openingName} match weights do not sum to 100`);
    const total = Math.round((skillScore * skillWeight + experienceScore * experienceWeight) * 100) / 10000;
    return {
      ...input,
      candidate_profile: profileName,
      job_opening: openingName,
      skill_match_score: skillScore,
      experience_score: experienceScore,
      total_score: total,
      matched_skills_json: JSON.stringify(matched),
      missing_skills_json: JSON.stringify(missing),
      evaluated_at: context.now,
      evaluation_trace_json: JSON.stringify({ candidate_profile: profileName, job_opening: openingName, candidate_skills: [...candidateSkills].sort(), required_skills: requiredSkills, years_experience: years, minimum_years_experience: minimumYears, skill_weight_percent: skillWeight, experience_weight_percent: experienceWeight, skill_match_score: skillScore, experience_score: experienceScore, total_score: total }),
    };
  }
  status(context: HrmContext): string { return nextDocStatus(context.command.action) === 1 ? "Evaluated" : super.status(context, context.command.document); }
}

export class InterviewScorecardController extends SuiteController<JsonObject> {
  readonly doctype = "Interview Scorecard";
  async normalize(context: HrmContext): Promise<JsonObject> {
    const input = context.command.document;
    const interviewName = H.requiredText(input.interview, "Interview Scorecard interview");
    const interview = await H.requireSubmitted(context, "Interview", interviewName);
    const applicant = H.requiredText(interview.job_applicant, "Interview job_applicant");
    const opening = H.requiredText(interview.job_opening, "Interview job_opening");
    const reviewer = H.requiredText(interview.interviewer, "Interview interviewer");
    const reviewDate = H.requiredDate(input.review_date, "Interview Scorecard review_date");
    if (!Array.isArray(input.scores) || input.scores.length === 0) throw errors.validation("Interview Scorecard requires criteria");
    const seen = new Set<string>(); let weightTotal = 0; let weighted = 0; const scores: JsonObject[] = [];
    for (const [index, raw] of input.scores.entries()) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw errors.validation(`Interview Scorecard line ${index + 1} is invalid`);
      const row = raw as JsonObject; const criterion = H.requiredText(row.criterion, `Interview Scorecard line ${index + 1} criterion`);
      if (seen.has(criterion.toLowerCase())) throw errors.validation(`Interview Scorecard criterion ${criterion} is duplicated`); seen.add(criterion.toLowerCase());
      const weight = H.numeric(row.weight, NaN); const score = H.numeric(row.score, NaN);
      if (!Number.isFinite(weight) || weight <= 0 || weight > 100) throw errors.validation("Interview Scorecard weight must be >0 and <=100");
      if (!Number.isFinite(score) || score < 0 || score > 100) throw errors.validation("Interview Scorecard score must be between 0 and 100");
      H.requiredText(row.comments, `Interview Scorecard line ${index + 1} comments`); weightTotal += weight; weighted += weight * score; scores.push({ ...row, criterion, weight, score });
    }
    if (Math.abs(weightTotal - 100) > 1e-9) throw errors.validation("Interview Scorecard weights must sum to 100");
    const recommendation = H.requiredText(input.recommendation, "Interview Scorecard recommendation");
    if (!["Strong Hire", "Hire", "Hold", "No Hire"].includes(recommendation)) throw errors.validation("Interview Scorecard recommendation is invalid");
    if (context.command.action === "submit") {
      const existing = await context.reader.listDocumentsByDoctype<JsonObject>(context.command.tenant_id, this.doctype);
      if (existing.some((item) => item.name !== context.command.aggregate.name && item.docstatus === 1 && H.text(item.data.interview) === interviewName)) throw errors.exists(`Interview ${interviewName} already has a submitted scorecard`);
    }
    return { ...input, interview: interviewName, job_applicant: applicant, job_opening: opening, reviewer, review_date: reviewDate, scores, total_score: Math.round(weighted) / 100, recommendation };
  }
  status(context: HrmContext): string { return nextDocStatus(context.command.action) === 1 ? "Completed" : super.status(context, context.command.document); }
}

export class JobOfferResponseController extends SuiteController<JsonObject> {
  readonly doctype = "Job Offer Response";
  async normalize(context: HrmContext): Promise<JsonObject> {
    const input = context.command.document; const offerName = H.requiredText(input.job_offer, "Job Offer Response job_offer"); const offer = await H.requireSubmitted(context, "Job Offer", offerName);
    const response = H.requiredText(input.response, "Job Offer Response response"); if (!["Accepted", "Rejected"].includes(response)) throw errors.validation("Job Offer Response response is invalid");
    const responseDate = H.requiredDate(input.response_date, "Job Offer Response response_date"); const offerDate = H.requiredDate(offer.offer_date, "Job Offer offer_date"); const expiryDate = H.requiredDate(offer.offer_expiry_date, "Job Offer offer_expiry_date");
    if (responseDate < offerDate || responseDate > expiryDate) throw errors.validation("Job Offer Response response_date must fall inside the offer response window");
    if (response === "Rejected") H.requiredText(input.rejection_reason, "Job Offer Response rejection_reason");
    if (context.command.action === "submit") { const responses = await context.reader.listDocumentsByDoctype<JsonObject>(context.command.tenant_id, this.doctype); if (responses.some((item) => item.name !== context.command.aggregate.name && item.docstatus === 1 && H.text(item.data.job_offer) === offerName)) throw errors.exists(`Job Offer ${offerName} already has a submitted response`); }
    return { ...input, job_offer: offerName, job_applicant: H.requiredText(offer.job_applicant, "Job Offer job_applicant"), response, response_date: responseDate };
  }
  status(context: HrmContext): string { return nextDocStatus(context.command.action) === 1 ? H.text(context.command.document.response) || "Responded" : super.status(context, context.command.document); }
}

export class CareerPostingController extends SuiteController<JsonObject> {
  readonly doctype = "Career Posting";
  async normalize(context: HrmContext): Promise<JsonObject> {
    const input = context.command.document; const openingName = H.requiredText(input.job_opening, "Career Posting job_opening"); await H.requireSubmitted(context, "Job Opening", openingName);
    const slug = H.requiredText(input.slug, "Career Posting slug").toLowerCase(); if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw errors.validation("Career Posting slug must be lowercase kebab-case");
    const publishFrom = H.requiredDatetime(input.publish_from, "Career Posting publish_from"); const publishTo = H.text(input.publish_to) ? H.requiredDatetime(input.publish_to, "Career Posting publish_to") : undefined;
    if (publishTo && publishTo <= publishFrom) throw errors.validation("Career Posting publish_to must be after publish_from");
    return { ...input, job_opening: openingName, slug, publish_from: publishFrom, ...(publishTo ? { publish_to: publishTo } : {}), published: H.truthy(input.published) ? 1 : 0 };
  }
  status(context: HrmContext): string { return nextDocStatus(context.command.action) === 1 ? (H.truthy(context.command.document.published) ? "Published" : "Ready") : super.status(context, context.command.document); }
}

function normalizedStringArray(value: unknown, field: string): string[] {
  let raw: unknown = value;
  if (typeof value === "string") { try { raw = JSON.parse(value); } catch { throw errors.validation(`${field} must be valid JSON`); } }
  if (!Array.isArray(raw) || raw.some((item) => typeof item !== "string" || !item.trim())) throw errors.validation(`${field} must be an array of non-empty strings`);
  const unique = [...new Map(raw.map((item) => [item.trim().toLowerCase(), item.trim()])).values()];
  return unique.sort((a, b) => a.localeCompare(b));
}
