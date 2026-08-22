import { describe, expect, it } from "vitest";
import { appRouter } from "../server/routers";
import type { TrpcContext } from "../server/_core/context";

describe("واجهة دخول المالك بالبريد", () => {
  it("تتحقق من البيانات المهيأة وتصدر جلسة قصيرة العمر دون إعادة كلمة المرور", async () => {
    const cookies: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];
    const ctx: TrpcContext = {
      user: null,
      req: { protocol: "https", hostname: "localhost", headers: {} } as TrpcContext["req"],
      res: { cookie: (name: string, value: string, options: Record<string, unknown>) => { cookies.push({ name, value, options }); } } as TrpcContext["res"],
    };
    const caller = appRouter.createCaller(ctx);
    const result = await caller.ownerEmail.login({ email: process.env.OWNER_LOGIN_EMAIL!, password: process.env.OWNER_LOGIN_PASSWORD! });
    expect(result.token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(result.user.email).toBe(process.env.OWNER_LOGIN_EMAIL);
    expect(cookies).toHaveLength(1);
    expect(cookies[0]?.name).toBe("app_session_id");
    expect(cookies[0]?.value).toBe(result.token);
  });

  it("يرفض كلمة مرور خاطئة من دون إنشاء جلسة", async () => {
    const ctx: TrpcContext = {
      user: null,
      req: { protocol: "https", hostname: "localhost", headers: {} } as TrpcContext["req"],
      res: { cookie: () => undefined } as unknown as TrpcContext["res"],
    };
    const caller = appRouter.createCaller(ctx);
    await expect(caller.ownerEmail.login({ email: process.env.OWNER_LOGIN_EMAIL!, password: "not-the-configured-password" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
