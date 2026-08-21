import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { sdk } from "./sdk";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { uploadManagedAsset, uploadManagedReciterImage } from "../media-admin";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Enable CORS for all routes - reflect the request origin to support credentials
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.header("Access-Control-Allow-Origin", origin);
    }
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, Authorization",
    );
    res.header("Access-Control-Allow-Credentials", "true");

    // Handle preflight requests
    if (req.method === "OPTIONS") {
      res.sendStatus(200);
      return;
    }
    next();
  });

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  registerStorageProxy(app);
  registerOAuthRoutes(app);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, timestamp: Date.now() });
  });

  app.put("/api/admin/assets/:assetId/file", express.raw({ type: ["audio/mpeg", "audio/mp3"], limit: "80mb" }), async (req, res) => {
    try {
      const user = await sdk.authenticateRequest(req).catch(() => null);
      if (!user || user.role !== "admin") return res.status(403).json({ error: "لا تملك صلاحية إدارة مكتبة الوسائط." });
      if (!Buffer.isBuffer(req.body)) return res.status(415).json({ error: "يلزم إرسال ملف MP3 خام." });
      const durationHeader = Number(req.headers["x-duration-ms"] ?? 0);
      const result = await uploadManagedAsset(req.params.assetId, req.body, "audio/mpeg", durationHeader > 0 ? durationHeader : undefined);
      return res.status(201).json(result);
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : "تعذر رفع الملف الصوتي." });
    }
  });

  app.put("/api/admin/reciters/:reciterId/image", express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: "5mb" }), async (req, res) => {
    try {
      const user = await sdk.authenticateRequest(req).catch(() => null);
      if (!user || user.role !== "admin") return res.status(403).json({ error: "لا تملك صلاحية إدارة صور القراء." });
      if (!Buffer.isBuffer(req.body)) return res.status(415).json({ error: "يلزم إرسال صورة خام بصيغة JPEG أو PNG أو WebP." });
      const contentType = req.headers["content-type"]?.split(";")[0] as "image/jpeg" | "image/png" | "image/webp";
      if (!["image/jpeg", "image/png", "image/webp"].includes(contentType)) return res.status(415).json({ error: "نوع الصورة غير مدعوم." });
      const result = await uploadManagedReciterImage(req.params.reciterId, req.body, contentType, String(req.headers["x-original-url"] ?? ""), String(req.headers["x-attribution-snapshot"] ?? "") || undefined);
      return res.status(201).json(result);
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : "تعذر رفع صورة القارئ." });
    }
  });

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    }),
  );

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`[api] server listening on port ${port}`);
  });
}

startServer().catch(console.error);
