import { describe, expect, it } from "vitest";
import { lessonFromPack } from "../lib/yaml-import";
import {
  groupCoursesByOwner,
  managementDenial,
  ownerFromAssignment,
} from "../lib/management-access";

describe("yaml lesson import", () => {
  it("maps a pack step onto Studio blocks", () => {
    const converted = lessonFromPack(
      {
        id: "comp1117-python-basics",
        title: "Café Code Sprint",
        description: "Start here.",
        track: "python",
        language: "python",
        steps: [
          {
            id: "order",
            title: "Take an order",
            instruction: {
              description: "A café needs a greeting.",
              task: "Print a greeting.",
              quickReference: "`print()`",
            },
            code: { language: "python", starter: "print('hi')", solution: "print('hi')" },
            check: { code: "_passed = True" },
            assistant: { chips: ["What does print do?"], systemPrompt: "Stay on print." },
          },
        ],
      },
      "https://codewithAI.hku.hk",
    );
    expect(converted.errors).toEqual([]);
    expect(converted.draft.track).toBe("Python");
    expect(converted.draft.steps[0].blocks.map((block) => block.type)).toEqual([
      "text",
      "quick-reference",
      "task",
      "code-exercise",
    ]);
    expect(converted.assistant.suggestedQuestions).toContain("print");
  });

  it("turns a site-relative figure into an https URL", () => {
    const converted = lessonFromPack(
      {
        id: "r-intro",
        title: "Plots",
        description: "Figures.",
        track: "r",
        language: "r",
        steps: [
          {
            id: "plot",
            title: "A figure",
            instruction: {
              description: "Look at the chart.",
              asideFigure: { src: "/images/r/example.png", alt: "A chart", body: "Notes" },
            },
          },
        ],
      },
      "https://codewithAI.hku.hk",
    );
    const figure = converted.draft.steps[0].blocks.find((block) => block.type === "figure");
    expect(figure && figure.type === "figure" && figure.imageUrl).toBe(
      "https://codewithAI.hku.hk/images/r/example.png",
    );
    expect(converted.errors).toEqual([]);
  });
});

describe("management request", () => {
  it("accepts only a localhost request with the server secret", () => {
    const previous = process.env.STUDIO_MANAGEMENT_SECRET;
    process.env.STUDIO_MANAGEMENT_SECRET = "test-secret-value-ok";
    const allowed = new Request("http://127.0.0.1:3010/studio/api/v1/management/courses", {
      headers: {
        host: "127.0.0.1:3010",
        "x-studio-management-secret": "test-secret-value-ok",
      },
    });
    const forwarded = new Request("http://127.0.0.1:3010/studio/api/v1/management/courses", {
      headers: {
        host: "127.0.0.1:3010",
        "x-forwarded-for": "10.0.0.8",
        "x-studio-management-secret": "test-secret-value-ok",
      },
    });
    const wrongSecret = new Request("http://127.0.0.1:3010/studio/api/v1/management/courses", {
      headers: {
        host: "127.0.0.1:3010",
        "x-studio-management-secret": "wrong-secret-value!",
      },
    });
    const publicHost = new Request("https://codewithai.hku.hk/studio/api/v1/management/courses", {
      headers: {
        host: "codewithai.hku.hk",
        "x-studio-management-secret": "test-secret-value-ok",
      },
    });
    expect(managementDenial(allowed)).toBeNull();
    expect(managementDenial(forwarded)).toBe(404);
    expect(managementDenial(wrongSecret)).toBe(401);
    expect(managementDenial(publicHost)).toBe(404);
    process.env.STUDIO_MANAGEMENT_SECRET = previous;
  });
});

describe("course owner label", () => {
  it("uses the assigned teacher instead of the admin who created the course", () => {
    expect(
      ownerFromAssignment(
        "admin",
        [{ id: "staff", display_name: "Cheti", email: "cheti_staff@hku.hk" }],
        { display_name: "Admin", email: "admin@hku.hk" },
      ),
    ).toEqual({ ownerName: "Cheti", ownerEmail: "cheti_staff@hku.hk" });
    expect(
      ownerFromAssignment("admin", [], { display_name: "Admin", email: "admin@hku.hk" }),
    ).toEqual({ ownerName: "Admin", ownerEmail: "admin@hku.hk" });
  });

  it("groups courses under the owner heading", () => {
    expect(
      groupCoursesByOwner([
        {
          ownerName: "Cheti",
          ownerEmail: "cheti_staff@hku.hk",
          title: "Python",
        },
        {
          ownerName: "Admin",
          ownerEmail: "admin@hku.hk",
          title: "R",
        },
        {
          ownerName: "Cheti",
          ownerEmail: "cheti_staff@hku.hk",
          title: "Plots",
        },
      ]),
    ).toEqual([
      {
        heading: "Cheti (cheti_staff@hku.hk)",
        courses: [
          { ownerName: "Cheti", ownerEmail: "cheti_staff@hku.hk", title: "Python" },
          { ownerName: "Cheti", ownerEmail: "cheti_staff@hku.hk", title: "Plots" },
        ],
      },
      {
        heading: "Admin (admin@hku.hk)",
        courses: [{ ownerName: "Admin", ownerEmail: "admin@hku.hk", title: "R" }],
      },
    ]);
  });
});
