import { describe, expect, it } from "vitest";

describe("تهيئة دخول المالك بالبريد الإلكتروني", () => {
  it("يحتوي على بريد صالح ورمز إداري غير فارغ من متغيرات البيئة", () => {
    const email = process.env.OWNER_LOGIN_EMAIL?.trim() ?? "";
    const password = process.env.OWNER_LOGIN_PASSWORD ?? "";
    expect(email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
    expect(password.length).toBeGreaterThanOrEqual(8);
  });
});
