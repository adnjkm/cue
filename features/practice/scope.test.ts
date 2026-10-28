import { describe, expect, it } from "vitest";
import type { CourseId, SectionId } from "@/lib/domain";
import { generateParam, href } from "@/lib/routes";
import { parseGenerateParam } from "./scope";

const section = { kind: "section", courseId: "ECO101" as CourseId, sectionId: "ECO101.price-elasticity-of-demand" as SectionId } as const;

describe("parseGenerateParam", () => {
  it("reads back the scope that Study guides' Quiz me link encodes", () => {
    const url = new URL(href.practice({ generate: section }), "http://cue.test");
    expect(url.pathname).toBe("/practice");
    expect(parseGenerateParam(url.searchParams.get("generate")!)).toEqual(section);
  });

  it("refuses garbage, a section from another course and an unknown kind", () => {
    expect(parseGenerateParam("not base64 json")).toBeNull();
    expect(parseGenerateParam(generateParam.encode({ ...section, courseId: "CSC148" as CourseId }))).toBeNull();
    expect(parseGenerateParam(Buffer.from(JSON.stringify({ kind: "everything" })).toString("base64url"))).toBeNull();
  });

  it("refuses a topic scope with a count the dialog never offers", () => {
    const topic = { kind: "topic", courseId: "CSC148", topic: "Linked lists", missedOnly: false, count: 7 };
    expect(parseGenerateParam(Buffer.from(JSON.stringify(topic)).toString("base64url"))).toBeNull();
    expect(parseGenerateParam(Buffer.from(JSON.stringify({ ...topic, count: 5 })).toString("base64url"))).toEqual({ ...topic, count: 5 });
  });
});
