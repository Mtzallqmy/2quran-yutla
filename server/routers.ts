import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, publicProcedure, router } from "./_core/trpc";
import { auditAaqibCommons, createManagedAsset, createManagedSource, importCommonsCandidate } from "./media-admin";
import { z } from "zod";

export const appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),
  mediaAdmin: router({
    auditCommons: adminProcedure.query(() => auditAaqibCommons()),
    createSource: adminProcedure.input(z.object({
      id: z.string().min(3), name: z.string().min(3), officialUrl: z.string().url(), termsUrl: z.string().url(), licenseLabel: z.string().min(2),
      rightsStatus: z.enum(["r2_redistribution_allowed", "attribution_required"]), streamingAllowed: z.boolean(), downloadAllowed: z.boolean(),
      attributionRequired: z.boolean(), attributionText: z.string().min(3).optional(), reviewNotes: z.string().min(10),
    }).refine((value) => !value.attributionRequired || Boolean(value.attributionText), { message: "يلزم نص الإسناد عند اشتراطه." }))
      .mutation(({ input }) => createManagedSource(input)),
    createAsset: adminProcedure.input(z.object({
      id: z.string().min(3), sourceId: z.string().min(3), title: z.string().min(3), description: z.string().optional(),
      reciterId: z.string().min(3), reciterName: z.string().min(2), moshafId: z.string().min(3), moshafName: z.string().min(2),
      rewaya: z.string().optional(), qualityKbps: z.number().int().positive().max(320).optional(), surahNumber: z.number().int().min(1).max(114),
      originalUrl: z.string().url(), attributionSnapshot: z.string().optional(), isDownloadable: z.boolean(),
    })).mutation(({ input }) => createManagedAsset(input)),
    importCommons: adminProcedure
      .input(z.object({
        id: z.string().min(3), surahNumber: z.number().int().min(1).max(114), mode: z.enum(["murattal", "mujawwad"]),
        title: z.string().min(3), license: z.enum(["CC0", "CC BY-SA 4.0"]), author: z.string().min(1),
        pageUrl: z.string().url(), originalFileUrl: z.string().url(), bytes: z.number().int().positive(),
        sourceId: z.string().min(3), attributionSnapshot: z.string().nullable(),
      }))
      .mutation(({ input }) => importCommonsCandidate(input)),
  }),

  // TODO: add feature routers here, e.g.
  // todo: router({
  //   list: protectedProcedure.query(({ ctx }) =>
  //     db.getUserTodos(ctx.user.id)
  //   ),
  // }),
});

export type AppRouter = typeof appRouter;
