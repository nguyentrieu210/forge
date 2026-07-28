/**
 * CloudForge Center's own Worker — the first app on this platform to use the app-Worker
 * seam end to end.
 *
 * Everything an app can say as DATA is already in `briefs/center.json`. What lives here is
 * what data cannot express: rules that must COMPUTE before deciding, and an action that
 * creates many documents from one intent.
 *
 *   POST /hooks/validate          refuse a class session that double-books a room or a teacher
 *   POST /api/method/<method>     `center.sessions.generate` — build a term's sessions from
 *                                 a class's weekly pattern
 *
 * Both paths are the platform's, not this app's choosing: `dispatchAppMethod` posts to
 * `/api/method/<name>` and `runAppValidators` to `/hooks/validate`. This Worker first
 * answered on `/methods/` — a path nothing ever called — which would have surfaced as a
 * 404 from the app the moment the callback leg started working.
 *
 * WHAT THIS WORKER MAY DO. It holds no rights of its own. Every read and write goes back
 * through the gateway's `/_app/` prefix carrying two proofs it was handed: a credential
 * derived for (this tenant, this app), and a short-lived identity signed by the platform.
 * The gateway re-verifies both and acts as the USER who triggered the call — so this
 * Worker can do exactly what that user could, for the length of one call, and no more.
 *
 * WHAT IT MUST NOT DO. The conflict check below runs OUTSIDE the write transaction, so it
 * is check-then-act: two simultaneous bookings of the same room can both pass. That is
 * acceptable for a scheduling clash — the next save catches it and a human fixes it. It
 * would NOT be acceptable for money or stock, and those must never move here.
 */

interface ValidatorSubject {
  doctype: string;
  name: string;
  action: string;
  payload: Record<string, unknown>;
}

interface Env {
  /** Shared with the platform; proves an inbound call really came from the gateway. */
  INTERNAL_AUTH_SECRET?: string;
  /**
   * The gateway script, bound directly.
   *
   * Not an escalation: the gateway re-verifies the app credential and the signed identity
   * on every callback exactly as it would over the network. See `wrangler.jsonc` for why
   * a plain `fetch()` cannot be used here.
   */
  PLATFORM?: Fetcher;
}

/**
 * Calls the platform back as the user who invoked this app. Path is relative to the
 * callback root.
 *
 * `via` and `base` are carried so a failure can say WHICH route was taken and to which
 * origin. A bare status is not enough here: the same 403 means one thing over a service
 * binding and another over the open network, and the two are indistinguishable in a log.
 */
type PlatformCall = ((path: string, init?: RequestInit) => Promise<Response>) & { via: "binding" | "fetch"; base: string };

/**
 * Where the app calls back into the platform, as the user who invoked it.
 *
 * The platform sends an origin that ALREADY ends in `/_app/` — appending that prefix again
 * produces `/_app/_app/resource/...`, which the gateway does not route, so every read fails
 * and the validator (correctly) refuses the write. Paths passed to a `PlatformCall` are
 * therefore relative to the callback root: `resource/Class%20Session`, not `/_app/...`.
 */
function callbackBase(request: Request): string {
  const declared = request.headers.get("x-cloudforge-callback");
  if (declared) return declared.replace(/\/$/, "");
  // Without a declared origin the app cannot read anything, and a validator that cannot
  // read must refuse rather than wave the write through.
  //
  // The platform headers that DID arrive are named, because "callback origin was not
  // supplied" alone cannot distinguish "the tenant has no PUBLIC_ORIGIN configured" from
  // "this call never came from the platform at all", and those have opposite fixes.
  const seen = [...request.headers.keys()].filter((key) => key.startsWith("x-cloudforge-")).sort();
  throw new Error(`callback origin was not supplied by the platform (nhận được: ${seen.join(", ") || "không có header x-cloudforge-* nào"})`);
}

/**
 * Binds the four proofs the gateway just handed us to every call made during this request.
 *
 * The URL keeps the tenant's real hostname even when the service binding is used, because
 * the gateway resolves the tenant from that hostname. A service binding does not resolve
 * DNS — it invokes the bound script and hands it the Request as written — so the hostname
 * survives as data while the network hop that produced the 522 disappears.
 */
function platformCaller(request: Request, env: Env): PlatformCall {
  const base = callbackBase(request);
  const forwarded = {
    // Passed straight back: these are the proofs the gateway just issued, and the only
    // reason it will act as the user for us.
    authorization: request.headers.get("authorization") ?? "",
    "x-cloudforge-app": request.headers.get("x-cloudforge-app") ?? "",
    "x-cloudforge-identity": request.headers.get("x-cloudforge-identity") ?? "",
    "x-cloudforge-identity-signature": request.headers.get("x-cloudforge-identity-signature") ?? "",
  };
  const call: PlatformCall = Object.assign(
    (path: string, init: RequestInit = {}) => {
      const url = `${base}/${path.replace(/^\//, "")}`;
      const outbound = new Request(url, {
        ...init,
        headers: { "content-type": "application/json", ...forwarded, ...(init.headers as Record<string, string> | undefined) },
      });
      return env.PLATFORM ? env.PLATFORM.fetch(outbound) : fetch(outbound);
    },
    { via: (env.PLATFORM ? "binding" : "fetch") as "binding" | "fetch", base },
  );
  return call;
}

const refuse = (message: string) => new Response(JSON.stringify({ message }), { status: 422, headers: { "content-type": "application/json" } });
const accept = () => new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json" } });
const answer = (value: unknown) => new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });

/** `"18:00:00"` → minutes since midnight. Unparseable time yields null, never 0. */
function minutes(raw: unknown): number | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(raw ?? ""));
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Two half-open intervals overlap. Touching ends (10:00–11:00, 11:00–12:00) do NOT. */
function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Refuses a session that collides with one already booked.
 *
 * Checks the room and the teacher separately because the messages differ, and a receptionist
 * fixing a clash needs to know WHICH resource is taken and by what.
 */
async function validateClassSession(call: PlatformCall, subject: ValidatorSubject): Promise<Response> {
  const payload = subject.payload ?? {};
  const date = String(payload.session_date ?? "");
  const start = minutes(payload.start_time);
  // No date or no start time means there is nothing to compare against; the doctype's own
  // required-field rules already refuse those, so this must not double-report them.
  if (!date || start === null) return accept();
  const end = minutes(payload.end_time) ?? start + 90;

  const query = new URLSearchParams({
    fields: JSON.stringify(["name", "class_group", "classroom", "teacher", "start_time", "end_time"]),
    filters: JSON.stringify([["session_date", "=", date]]),
    limit_page_length: "200",
  });
  const response = await call(`resource/Class%20Session?${query}`);
  if (!response.ok) {
    /**
     * Cannot see the day's bookings, so cannot claim this one is free — and the reason is
     * carried through. A validator that only says "could not check" leaves an operator with
     * nowhere to go, and leaves whoever debugs it guessing between a wrong callback URL, a
     * revoked credential and a permission gap.
     */
    const detail = (await response.text()).slice(0, 160);
    return refuse(`Không đọc được lịch trong ngày để kiểm tra trùng (HTTP ${response.status}: ${detail}).`);
  }
  const rows = ((await response.json()) as { data?: Array<Record<string, unknown>> }).data ?? [];

  for (const row of rows) {
    // The document being edited is not a conflict with itself.
    if (String(row.name) === subject.name) continue;
    const otherStart = minutes(row.start_time);
    if (otherStart === null) continue;
    const otherEnd = minutes(row.end_time) ?? otherStart + 90;
    if (!overlaps(start, end, otherStart, otherEnd)) continue;

    if (payload.classroom && row.classroom === payload.classroom) {
      return refuse(`Phòng ${String(payload.classroom)} đã có lớp ${String(row.class_group)} lúc ${String(row.start_time).slice(0, 5)} ngày ${date}.`);
    }
    if (payload.teacher && row.teacher === payload.teacher) {
      return refuse(`Giáo viên ${String(payload.teacher)} đã có lớp ${String(row.class_group)} lúc ${String(row.start_time).slice(0, 5)} ngày ${date}.`);
    }
  }
  return accept();
}

/**
 * Refuses an enrolment that would push a class past its capacity.
 *
 * Counted rather than trusted: the client could send any number, and the count that matters
 * is the one in the database at this moment.
 */
async function validateEnrollment(call: PlatformCall, subject: ValidatorSubject): Promise<Response> {
  const classGroup = String(subject.payload?.class_group ?? "");
  if (!classGroup) return accept();

  const classResponse = await call(`resource/Class%20Group/${encodeURIComponent(classGroup)}`);
  if (!classResponse.ok) return refuse("Không đọc được lớp học để kiểm tra sĩ số.");
  const classDoc = ((await classResponse.json()) as { data?: Record<string, unknown> }).data ?? {};
  const capacity = Number(classDoc.capacity ?? 0);
  if (!capacity) return accept();

  const query = new URLSearchParams({
    fields: JSON.stringify(["name"]),
    filters: JSON.stringify([["class_group", "=", classGroup]]),
    limit_page_length: "500",
  });
  const enrolled = await call(`resource/Enrollment?${query}`);
  if (!enrolled.ok) return refuse("Không đếm được số học viên đang học để kiểm tra sĩ số.");
  const rows = ((await enrolled.json()) as { data?: Array<Record<string, unknown>> }).data ?? [];
  const existing = rows.filter((row) => String(row.name) !== subject.name).length;

  if (existing >= capacity) {
    return refuse(`Lớp ${String(classDoc.class_name ?? classGroup)} đã đủ ${capacity} học viên.`);
  }
  return accept();
}

/**
 * `center.sessions.generate` — turn a class's weekly pattern into real sessions.
 *
 * A schedule like "Thứ 2-4-6, 18:00" is a sentence, not a list of dates. Expanding it is
 * arithmetic over a term, which is why it cannot be a metadata default.
 *
 * Idempotent by construction: a date that already has a session for this class is skipped,
 * so running it twice does not produce two of everything — the single most likely way for
 * an operator to ruin a timetable.
 */
const WEEKDAY_WORDS: Array<[RegExp, number]> = [
  [/(chủ nhật|cn)\b/i, 0], [/thứ\s*2|t2\b/i, 1], [/thứ\s*3|t3\b/i, 2], [/thứ\s*4|t4\b/i, 3],
  [/thứ\s*5|t5\b/i, 4], [/thứ\s*6|t6\b/i, 5], [/thứ\s*7|t7\b/i, 6],
];

export function parseWeeklySchedule(text: string): { weekdays: number[]; start: string } {
  const source = String(text ?? "");
  const weekdays: number[] = [];
  // "Thứ 2-4-6" writes the days as a run of digits after one "Thứ", so the digits are read
  // directly; the word forms below catch "Thứ Bảy" and "CN".
  const run = /th[ứu]\s*([\d\s,\-–]+)/i.exec(source);
  if (run) {
    for (const digit of run[1]?.match(/\d/g) ?? []) {
      const day = Number(digit);
      if (day >= 2 && day <= 7) weekdays.push(day - 1);
    }
  }
  for (const [pattern, day] of WEEKDAY_WORDS) {
    if (pattern.test(source) && !weekdays.includes(day)) weekdays.push(day);
  }
  const time = /(\d{1,2}):(\d{2})/.exec(source);
  return {
    weekdays: [...new Set(weekdays)].sort(),
    start: time?.[1] && time[2] ? `${time[1].padStart(2, "0")}:${time[2]}:00` : "18:00:00",
  };
}

/** Local-date key `YYYY-MM-DD`. Never `toISOString()`, which shifts to UTC and can move the day. */
function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addMinutes(time: string, delta: number): string {
  const base = minutes(time) ?? 0;
  const total = (base + delta) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}:00`;
}

async function generateSessions(call: PlatformCall, args: Record<string, unknown>): Promise<Response> {
  const classGroup = String(args.class_group ?? "");
  if (!classGroup) return refuse("Thiếu class_group.");

  const classResponse = await call(`resource/Class%20Group/${encodeURIComponent(classGroup)}`);
  if (!classResponse.ok) {
    // Carrying the status and the platform's own words, for the same reason the session
    // validator does: "could not read" alone cannot tell a wrong callback URL from a
    // revoked credential from a permission gap, and those have three different fixes.
    return refuse(`Không đọc được lớp ${classGroup} (HTTP ${classResponse.status} qua ${call.via} tới ${call.base}: ${(await classResponse.text()).slice(0, 200)}).`);
  }
  const cls = ((await classResponse.json()) as { data?: Record<string, unknown> }).data ?? {};

  const { weekdays, start } = parseWeeklySchedule(String(cls.weekly_schedule ?? ""));
  if (!weekdays.length) {
    return refuse(`Lớp này chưa có lịch hàng tuần đọc được (đang là "${String(cls.weekly_schedule ?? "")}"). Ví dụ hợp lệ: "Thứ 2-4-6, 18:00".`);
  }

  const from = new Date(`${String(args.from ?? cls.start_date ?? "")}T00:00:00`);
  if (Number.isNaN(from.getTime())) return refuse("Không xác định được ngày bắt đầu.");
  /**
   * How many sessions the class should END UP with from `from` onward — NOT how many to
   * add this run.
   *
   * The difference is the whole of whether this is safe to re-run. Read as "add this
   * many", a second run skips the dates already taken and then keeps going until it has
   * created that many NEW ones — so "generate 16" twice leaves 32 sessions. That is
   * exactly the timetable-ruining outcome this was supposed to prevent, and it was
   * measured, not imagined: two runs of `count: 2` produced four sessions.
   */
  const wanted = Number(args.count ?? cls.planned_sessions ?? 0) || 12;
  const duration = Number(args.duration_minutes ?? 90);

  const existingQuery = new URLSearchParams({
    fields: JSON.stringify(["name", "session_date"]),
    filters: JSON.stringify([["class_group", "=", classGroup]]),
    limit_page_length: "500",
  });
  const existingResponse = await call(`resource/Class%20Session?${existingQuery}`);
  const taken = new Set(
    (((await existingResponse.json()) as { data?: Array<Record<string, unknown>> }).data ?? [])
      .map((row) => String(row.session_date).slice(0, 10)),
  );
  const fromKey = dateKey(from);
  // Only sessions inside the window count towards the target. Last term's sessions are
  // not this term's, and counting them would leave the new term short.
  const alreadyInWindow = [...taken].filter((date) => date >= fromKey).length;

  const created: string[] = [];
  const skipped: string[] = [];
  const cursor = new Date(from);
  // Bounded by a year of days, not by "until we have enough": a pattern that matches no
  // weekday would otherwise loop forever.
  for (let guard = 0; guard < 366 && alreadyInWindow + created.length < wanted; guard += 1) {
    const iso = dateKey(cursor);
    if (weekdays.includes(cursor.getDay())) {
      if (taken.has(iso)) {
        skipped.push(iso);
      } else {
        const response = await call("resource/Class%20Session", {
          method: "POST",
          body: JSON.stringify({
            class_group: classGroup,
            session_date: iso,
            start_time: start,
            end_time: addMinutes(start, duration),
            classroom: cls.classroom ?? undefined,
            teacher: cls.teacher,
          }),
        });
        if (response.ok) created.push(iso);
        else skipped.push(`${iso} (${String(((await response.json()) as { message?: string }).message ?? response.status)})`);
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return answer({
    class_group: classGroup, weekdays, start,
    target: wanted, already: alreadyInWindow,
    created: created.length, skipped: skipped.length, dates: created,
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // The platform is the only caller. Anything else gets nothing — this Worker is
    // reachable only through the dispatch namespace, but saying so explicitly costs
    // nothing and makes the boundary visible.
    if (!request.headers.get("x-cloudforge-tenant")) {
      return new Response(JSON.stringify({ message: "not a platform call" }), { status: 403 });
    }

    try {
      if (url.pathname === "/health") return answer({ ok: true, app: "center", platform_binding: Boolean(env.PLATFORM) });

      const call = platformCaller(request, env);

      if (url.pathname === "/hooks/validate") {
        const subject = (await request.json()) as ValidatorSubject;
        if (subject.doctype === "Class Session") return await validateClassSession(call, subject);
        if (subject.doctype === "Enrollment") return await validateEnrollment(call, subject);
        return accept();
      }

      if (url.pathname.startsWith("/api/method/")) {
        const method = decodeURIComponent(url.pathname.slice("/api/method/".length));
        // The platform posts an ENVELOPE — `{ method, args }` — not the arguments alone.
        // Reading the body as the arguments makes every one of them undefined, which
        // surfaces as the app complaining that a required argument is missing while the
        // caller can plainly see they sent it.
        const body = (await request.json().catch(() => ({}))) as { args?: Record<string, unknown> };
        const args = body.args ?? {};
        if (method === "center.sessions.generate" || method === "sessions.generate") {
          return await generateSessions(call, args);
        }
        return new Response(JSON.stringify({ message: `Không có method ${method}` }), { status: 404 });
      }

      return new Response(JSON.stringify({ message: "not found" }), { status: 404 });
    } catch (error) {
      // A validator that throws must READ as a refusal, not as a platform fault: the
      // platform turns any non-2xx into "the app refused this change", which is the
      // truthful outcome when the app could not decide.
      const message = error instanceof Error ? error.message : "lỗi không xác định";
      return refuse(`Center không kiểm tra được thay đổi này: ${message}`);
    }
  },
};
