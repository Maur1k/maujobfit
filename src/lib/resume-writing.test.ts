import { describe, expect, test } from "bun:test";

import { assessBulletStructure } from "./resume-writing";

describe("assessBulletStructure", () => {
  test("recognises an integrated Action–Result–Reflection bullet", () => {
    expect(
      assessBulletStructure(
        "Rebuilt the dispatch platform on Node.js and MySQL, enabling reliable operations and improving delivery for the support team.",
      ),
    ).toEqual({ action: true, result: true, reflection: true });
  });

  test("flags a responsibility-only statement", () => {
    expect(assessBulletStructure("Worked on the customer mobile application.")).toEqual({
      action: false,
      result: false,
      reflection: false,
    });
  });

  test("does not mistake a strong action for a complete reflection", () => {
    expect(assessBulletStructure("Developed the customer mobile application for iOS and Android.")).toEqual({
      action: true,
      result: false,
      reflection: false,
    });
  });
});