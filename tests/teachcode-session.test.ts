import { afterEach, describe, expect, it } from "vitest";
import {
  safeCoursesPath,
  teachcodeLearnHref,
  teachcodePasswordHref,
} from "../lib/teachcode-public";
import { parseTeachCodeIdentity, teachcodeApiOrigin } from "../lib/teachcode-session";

const previous = {
  APP_URL: process.env.APP_URL,
  TEACHCODE_PUBLIC_URL: process.env.TEACHCODE_PUBLIC_URL,
  TEACHCODE_API_ORIGIN: process.env.TEACHCODE_API_ORIGIN,
};

afterEach(() => {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("TeachCode return link", () => {
  it("drops the /studio prefix from APP_URL", () => {
    delete process.env.TEACHCODE_PUBLIC_URL;
    process.env.APP_URL = "https://codewithAI.hku.hk/studio";
    expect(teachcodeLearnHref()).toBe("https://codewithai.hku.hk/learn");
    expect(teachcodePasswordHref()).toBe("https://codewithai.hku.hk/account/password");
  });

  it("uses TEACHCODE_PUBLIC_URL when set and rejects other schemes", () => {
    process.env.TEACHCODE_PUBLIC_URL = "http://127.0.0.1:3002";
    process.env.APP_URL = "http://localhost:3000";
    expect(teachcodeLearnHref()).toBe("http://127.0.0.1:3002/learn");
    process.env.TEACHCODE_PUBLIC_URL = "javascript:alert(1)";
    expect(teachcodeLearnHref()).toBeNull();
  });
});

describe("Studio handoff path", () => {
  it("keeps course paths and drops anything else", () => {
    expect(safeCoursesPath(null)).toBe("/courses");
    expect(safeCoursesPath("/courses/new")).toBe("/courses/new");
    expect(safeCoursesPath("/courses/comp1117/lessons/hello/edit")).toBe(
      "/courses/comp1117/lessons/hello/edit",
    );
    expect(safeCoursesPath("https://evil.example/courses")).toBe("/courses");
    expect(safeCoursesPath("//evil.example")).toBe("/courses");
    expect(safeCoursesPath("/courses/../admin")).toBe("/courses");
    expect(safeCoursesPath("/admin")).toBe("/courses");
  });
});

describe("TeachCode identity", () => {
  it("accepts a teacher and treats other roles as students", () => {
    expect(
      parseTeachCodeIdentity({
        email: "Cheti_Staff@hku.hk",
        display_name: "Cheti",
        role: "staff",
        must_change_password: false,
      }),
    ).toEqual({
      email: "cheti_staff@hku.hk",
      displayName: "Cheti",
      role: "staff",
      mustChangePassword: false,
    });
    expect(parseTeachCodeIdentity({ email: "learner@hku.hk", role: "student" })?.role).toBe(
      "student",
    );
    expect(parseTeachCodeIdentity({ role: "admin" })).toBeNull();
  });

  it("reads the API origin from the environment", () => {
    delete process.env.TEACHCODE_API_ORIGIN;
    expect(teachcodeApiOrigin()).toBe("http://127.0.0.1:8002");
    process.env.TEACHCODE_API_ORIGIN = "javascript:alert(1)";
    expect(teachcodeApiOrigin()).toBeNull();
  });
});
