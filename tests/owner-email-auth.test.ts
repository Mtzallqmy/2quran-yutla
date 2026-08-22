import { describe, expect, it } from "vitest";
import { localOwnerOpenId, normalizeOwnerEmail, verifyConfiguredOwnerLogin } from "../server/owner-email-auth";

describe("تحقق دخول مالك البريد الإلكتروني", () => {
  it("يطبع معرفًا محليًا ثابتًا للبريد دون تضمين البريد نفسه", () => {
    const email = process.env.OWNER_LOGIN_EMAIL!;
    const openId = localOwnerOpenId(email);
    expect(openId).toMatch(/^owner-email-[a-f0-9]{48}$/);
    expect(openId).not.toContain(normalizeOwnerEmail(email));
  });

  it("يقبل البيانات المهيأة ويرفض رمزًا خاطئًا دون كشف القيم", async () => {
    const email = process.env.OWNER_LOGIN_EMAIL!;
    const password = process.env.OWNER_LOGIN_PASSWORD!;
    await expect(verifyConfiguredOwnerLogin(email, password)).resolves.toBe(true);
    await expect(verifyConfiguredOwnerLogin(email, "incorrect-owner-password")).resolves.toBe(false);
  });
});
