import { describe, expect, it } from "vitest";
import {
  appendD1ObservationHeaders,
  normalizeD1Bookmark,
  openD1Session,
} from "../../../packages/core/src/d1-session-policy.js";

function fakeDatabase() {
  const constraints: string[] = [];
  const session = {
    getBookmark: () => "bookmark-current",
  } as unknown as D1DatabaseSession;
  const database = {
    withSession(constraint?: string) {
      constraints.push(constraint ?? "");
      return session;
    },
  } as unknown as D1Database;
  return { database, session, constraints };
}

describe("CF01 D1 session policy", () => {
  it("forces authoritative paths to first-primary", () => {
    const { database, session, constraints } = fakeDatabase();
    expect(openD1Session(database, "authoritative")).toBe(session);
    expect(constraints).toEqual(["first-primary"]);
  });

  it("allows replica-safe reads to start unconstrained when there is no dependency bookmark", () => {
    const { database, session, constraints } = fakeDatabase();
    expect(openD1Session(database, "replica-safe")).toBe(session);
    expect(constraints).toEqual(["first-unconstrained"]);
  });

  it("passes a valid opaque bookmark unchanged to the selected tenant database", () => {
    const tenantA = fakeDatabase();
    const tenantB = fakeDatabase();
    const foreignLookingBookmark = "opaque-bookmark-from-another-logical-session";

    openD1Session(tenantA.database, "replica-safe", foreignLookingBookmark);

    // Bookmark input can constrain the already-selected DB; it cannot choose or
    // redirect to another tenant binding.
    expect(tenantA.constraints).toEqual([foreignLookingBookmark]);
    expect(tenantB.constraints).toEqual([]);
  });

  it("drops transport-hostile bookmark values before D1", () => {
    expect(normalizeD1Bookmark("x".repeat(1025))).toBeNull();
    expect(normalizeD1Bookmark("bookmark\r\ninjected")).toBeNull();
    expect(normalizeD1Bookmark("  bookmark-ok  ")).toBe("bookmark-ok");

    const { database, constraints } = fakeDatabase();
    openD1Session(database, "replica-safe", "x".repeat(1025));
    expect(constraints).toEqual(["first-unconstrained"]);
  });

  it("exposes only non-sensitive routing observation headers", () => {
    const headers = appendD1ObservationHeaders(new Headers(), {
      bookmark: "bookmark-next",
      served_by_region: "APAC",
      served_by_primary: false,
    });
    expect(headers.get("x-d1-bookmark")).toBe("bookmark-next");
    expect(headers.get("x-d1-served-by-region")).toBe("APAC");
    expect(headers.get("x-d1-served-by-primary")).toBe("false");
  });
});
