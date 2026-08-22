import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { addManagedStationItem, auditAaqibCommons, createManagedAsset, createManagedSource, createManagedStation, importCommonsCandidate, probeManagedLiveHlsChannel, updateManagedAssetPublication, upsertManagedLiveHlsChannel, upsertManagedReciter } from "./media-admin";
import { claimFirstOwner, getOwnerBootstrapState } from "./db";
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
  owner: router({
    bootstrapStatus: publicProcedure.query(({ ctx }) => getOwnerBootstrapState(ctx.user?.id)),
    claimFirst: protectedProcedure.mutation(({ ctx }) => claimFirstOwner(ctx.user.id)),
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
    createStation: adminProcedure.input(z.object({
      id: z.string().min(3).max(80), title: z.string().min(3).max(120), description: z.string().max(500).optional(),
      timezone: z.string().min(2).max(64).optional(), rotationAnchorAt: z.string().datetime().optional(),
      status: z.enum(["draft", "published", "hidden", "archived"]),
    })).mutation(({ input }) => createManagedStation(input)),
    addStationItem: adminProcedure.input(z.object({ stationId: z.string().min(3), assetId: z.string().min(3), sortOrder: z.number().int().min(0).max(1_000_000).optional(), isActive: z.boolean().optional() }))
      .mutation(({ input }) => addManagedStationItem(input.stationId, { assetId: input.assetId, sortOrder: input.sortOrder, isActive: input.isActive })),
    upsertLiveHlsChannel: adminProcedure.input(z.object({ id: z.string().min(3).max(80), title: z.string().min(3).max(120), description: z.string().max(500).optional(), sourceId: z.string().min(3).max(120), manifestUrl: z.string().url().refine((value) => /^https:\/\/.+\.m3u8(?:\?.*)?$/i.test(value), "يلزم رابط HTTPS لقائمة HLS ينتهي بـ .m3u8"), status: z.enum(["draft", "published", "hidden", "archived"]), sortOrder: z.number().int().min(0).max(1_000_000).optional(), isActive: z.boolean().optional() }))
      .mutation(({ input }) => upsertManagedLiveHlsChannel(input)),
    probeLiveHlsChannel: adminProcedure.input(z.object({ id: z.string().min(3).max(80) })).mutation(({ input }) => probeManagedLiveHlsChannel(input.id)),
    updatePublication: adminProcedure.input(z.object({ assetId: z.string().min(3), publicationStatus: z.enum(["draft", "published", "hidden", "archived"]), sortOrder: z.number().int().min(0).max(1_000_000).optional() }))
      .mutation(({ input }) => updateManagedAssetPublication(input.assetId, { publicationStatus: input.publicationStatus, sortOrder: input.sortOrder })),
    upsertReciter: adminProcedure.input(z.object({ id: z.string().min(3).max(80), nameAr: z.string().min(2).max(160), nameEn: z.string().max(160).optional(), description: z.string().max(1000).optional(), sortOrder: z.number().int().min(0).max(1_000_000).optional(), publicationStatus: z.enum(["draft", "published", "hidden", "archived"]), isActive: z.boolean().optional() }))
      .mutation(({ input }) => upsertManagedReciter(input)),
  }),

  // TODO: add feature routers here, e.g.
  // todo: router({
  //   list: protectedProcedure.query(({ ctx }) =>
  //     db.getUserTodos(ctx.user.id)
  //   ),
  // }),
});

export type AppRouter = typeof appRouter;
