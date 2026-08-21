type Env = {
  MEDIA: R2Bucket;
  CATALOG: D1Database;
  ADMIN_TOKEN: string;
  ALLOWED_ORIGIN?: string;
  PUBLIC_CACHE_SECONDS?: string;
};

type AssetInput = {
  id: string;
  sourceId: string;
  kind: "quran_surah" | "radio_program" | "lecture" | "recording" | "jingle";
  title: string;
  description?: string;
  reciterId?: string;
  reciterName?: string;
  surahNumber?: number;
  isDownloadable?: boolean;
};

type SourceInput = {
  id: string;
  name: string;
  officialUrl: string;
  termsUrl: string;
  licenseLabel: string;
  rightsStatus: "r2_redistribution_allowed" | "stream_link_only" | "attribution_required" | "permission_required" | "review_required" | "prohibited";
  streamingAllowed?: boolean;
  downloadAllowed?: boolean;
  r2RedistributionAllowed?: boolean;
  attributionRequired?: boolean;
  attributionText?: string;
  writtenPermissionReference?: string;
  reviewNotes: string;
};

type UploadInput = {
  idempotencyKey: string;
  expectedSha256: string;
  expectedBytes: number;
  contentType: string;
  durationMs?: number;
};

const json = (body: unknown, status = 200, headers: HeadersInit = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", ...headers } });
const id = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const asNumber = (value: unknown) => Number(value ?? 0);

function cors(env: Env) {
  return {
    "access-control-allow-origin": env.ALLOWED_ORIGIN || "*",
    "access-control-allow-methods": "GET,POST,PUT,OPTIONS",
    "access-control-allow-headers": "Authorization,Content-Type,Idempotency-Key,X-Part-SHA256",
  };
}

function requireAdmin(request: Request, env: Env) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) throw new Response("Unauthorized", { status: 401 });
}

function sanitizeSegment(value: string) {
  const clean = value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (!clean) throw new Error("Invalid path segment");
  return clean;
}

function logicalKey(input: AssetInput) {
  if (input.kind === "quran_surah") {
    if (!input.reciterId || !input.surahNumber || input.surahNumber < 1 || input.surahNumber > 114) throw new Error("Quran surah needs a reciter and a valid surah number.");
    return `quran/reciters/${sanitizeSegment(input.reciterId)}/${String(input.surahNumber).padStart(3, "0")}.mp3`;
  }
  const prefix = input.kind === "radio_program" ? "radio/programs" : input.kind === "lecture" ? "lectures" : input.kind === "recording" ? "recordings" : "radio/jingles";
  return `${prefix}/${sanitizeSegment(input.id)}.mp3`;
}

function versionKey(asset: Record<string, unknown>, version: number, sha256: string) {
  const shortHash = sanitizeSegment(sha256.slice(0, 16));
  if (asset.kind === "quran_surah") return `quran/reciters/${sanitizeSegment(String(asset.reciter_id))}/${String(asset.surah_number).padStart(3, "0")}/versions/v${version}-${shortHash}.mp3`;
  const root = String(asset.logical_key).replace(/\.mp3$/, "");
  return `${root}/versions/v${version}-${shortHash}.mp3`;
}

function hexToBuffer(hex: string) {
  if (!/^[a-fA-F0-9]{64}$/.test(hex)) throw new Error("Expected SHA-256 hex checksum.");
  const bytes = new Uint8Array(hex.match(/.{1,2}/g)!.map((pair) => parseInt(pair, 16)));
  return bytes.buffer;
}

async function readJson<T>(request: Request): Promise<T> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) throw new Response("Expected application/json", { status: 415 });
  return request.json() as Promise<T>;
}

async function findAsset(env: Env, assetId: string) {
  return env.CATALOG.prepare("SELECT * FROM media_assets WHERE id = ?").bind(assetId).first<Record<string, unknown>>();
}

async function activeMedia(env: Env, assetId: string) {
  return env.CATALOG.prepare(`SELECT a.id, a.title, a.description, a.kind, a.is_downloadable, v.r2_key, v.content_type, v.bytes, v.etag, v.sha256 FROM media_assets a JOIN media_versions v ON v.id = a.current_version_id WHERE a.id = ? AND a.status = 'active' AND v.state = 'ready'`).bind(assetId).first<Record<string, unknown>>();
}

async function streamAsset(request: Request, env: Env, assetId: string, download: boolean) {
  const media = await activeMedia(env, assetId);
  if (!media) return json({ error: "الملف غير متاح أو لم يُتحقق منه بعد." }, 404, cors(env));
  if (download && asNumber(media.is_downloadable) !== 1) return json({ error: "هذا الملف غير متاح للتنزيل." }, 403, cors(env));
  const object = await env.MEDIA.get(String(media.r2_key), { range: request.headers });
  if (!object) return json({ error: "مرجع التخزين غير موجود." }, 404, cors(env));
  const headers = new Headers(cors(env));
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("accept-ranges", "bytes");
  headers.set("cache-control", `public, max-age=${Number(env.PUBLIC_CACHE_SECONDS ?? 86400)}, immutable`);
  headers.set("x-content-sha256", String(media.sha256));
  if (download) headers.set("content-disposition", `attachment; filename="${sanitizeSegment(String(media.id))}.mp3"`);
  if (object.range) {
    const range = object.range;
    const start = "suffix" in range ? object.size - range.suffix : range.offset ?? 0;
    const length = "suffix" in range ? range.suffix : range.length ?? (object.size - start);
    const end = start + length - 1;
    headers.set("content-range", `bytes ${start}-${end}/${object.size}`);
    return new Response(request.method === "HEAD" ? null : object.body, { status: 206, headers });
  }
  return new Response(request.method === "HEAD" ? null : object.body, { status: 200, headers });
}

async function createAsset(request: Request, env: Env) {
  requireAdmin(request, env);
  const input = await readJson<AssetInput>(request);
  if (!input.id || !input.title || !input.sourceId) return json({ error: "id, title and sourceId are required" }, 400, cors(env));
  const source = await env.CATALOG.prepare("SELECT * FROM content_sources WHERE id = ? AND is_active = 1").bind(input.sourceId).first<Record<string, unknown>>();
  if (!source) return json({ error: "مصدر المحتوى غير مسجل أو غير مفعل." }, 422, cors(env));
  if (asNumber(source.r2_redistribution_allowed) !== 1) return json({ error: "لا يسمح سجل حقوق هذا المصدر بإعادة الاستضافة على R2." }, 403, cors(env));
  if (input.isDownloadable !== false && asNumber(source.download_allowed) !== 1) return json({ error: "لا يسمح سجل حقوق هذا المصدر بتنزيل الملف." }, 403, cors(env));
  const logical = logicalKey(input);
  const assetId = sanitizeSegment(input.id);
  const existing = await findAsset(env, assetId);
  if (existing) return json({ error: "معرّف الملف مستخدم بالفعل." }, 409, cors(env));
  try {
    if (input.kind === "quran_surah") {
      if (!input.reciterId || !input.reciterName?.trim()) return json({ error: "يلزم reciterId وreciterName للتلاوة القرآنية." }, 422, cors(env));
      await env.CATALOG.prepare("INSERT INTO reciters (id, name_ar, source_name, is_active, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?) ON CONFLICT(id) DO UPDATE SET name_ar = excluded.name_ar, source_name = excluded.source_name, is_active = 1, updated_at = excluded.updated_at")
        .bind(sanitizeSegment(input.reciterId), input.reciterName.trim(), String(source.name), now(), now()).run();
    }
    await env.CATALOG.prepare(`INSERT INTO media_assets (id, source_id, attribution_snapshot, kind, logical_key, reciter_id, surah_number, title, description, is_downloadable, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`)
      .bind(assetId, input.sourceId, source.attribution_text ?? null, input.kind, logical, input.reciterId ?? null, input.surahNumber ?? null, input.title, input.description ?? null, input.isDownloadable === false ? 0 : 1, now(), now()).run();
    return json({ id: assetId, logicalKey: logical, status: "draft" }, 201, cors(env));
  } catch (error) { return json({ error: error instanceof Error ? error.message : "تعذر إنشاء الأصل." }, 400, cors(env)); }
}

async function createSource(request: Request, env: Env) {
  requireAdmin(request, env);
  const input = await readJson<SourceInput>(request);
  const rightsStatuses = new Set<SourceInput["rightsStatus"]>(["r2_redistribution_allowed", "stream_link_only", "attribution_required", "permission_required", "review_required", "prohibited"]);
  if (!input.id || !input.name || !input.officialUrl || !input.termsUrl || !input.licenseLabel || !input.reviewNotes || !rightsStatuses.has(input.rightsStatus)) {
    return json({ error: "بيانات مصدر الحقوق غير مكتملة أو غير صالحة." }, 422, cors(env));
  }
  const r2Allowed = input.r2RedistributionAllowed === true;
  const attributionRequired = input.attributionRequired === true;
  if (r2Allowed && !["r2_redistribution_allowed", "attribution_required"].includes(input.rightsStatus)) return json({ error: "حالة الحقوق لا تسمح بإعادة الاستضافة على R2." }, 422, cors(env));
  if (attributionRequired && !input.attributionText?.trim()) return json({ error: "يلزم نص الإسناد للمصدر الذي يشترط الإسناد." }, 422, cors(env));
  try {
    const sourceId = sanitizeSegment(input.id);
    await env.CATALOG.prepare("INSERT INTO content_sources (id, name, official_url, terms_url, license_label, rights_status, streaming_allowed, download_allowed, r2_redistribution_allowed, attribution_required, attribution_text, written_permission_reference, reviewed_at, review_notes, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)")
      .bind(sourceId, input.name.trim(), input.officialUrl, input.termsUrl, input.licenseLabel.trim(), input.rightsStatus, input.streamingAllowed === true ? 1 : 0, input.downloadAllowed === true ? 1 : 0, r2Allowed ? 1 : 0, attributionRequired ? 1 : 0, input.attributionText?.trim() ?? null, input.writtenPermissionReference?.trim() ?? null, now(), input.reviewNotes.trim(), now(), now()).run();
    return json({ id: sourceId, status: "active" }, 201, cors(env));
  } catch (error) { return json({ error: error instanceof Error ? error.message : "تعذر تسجيل مصدر الحقوق." }, 400, cors(env)); }
}

async function initUpload(request: Request, env: Env, assetId: string) {
  requireAdmin(request, env);
  const input = await readJson<UploadInput>(request);
  if (!input.idempotencyKey || !input.expectedSha256 || !input.expectedBytes || !input.contentType.startsWith("audio/")) return json({ error: "معلومات الرفع غير مكتملة." }, 400, cors(env));
  const asset = await findAsset(env, assetId);
  if (!asset) return json({ error: "الأصل غير موجود." }, 404, cors(env));
  const repeated = await env.CATALOG.prepare("SELECT id, version_id, r2_key, r2_upload_id, state FROM upload_sessions WHERE idempotency_key = ?").bind(input.idempotencyKey).first<Record<string, unknown>>();
  if (repeated) return json({ sessionId: repeated.id, versionId: repeated.version_id, r2Key: repeated.r2_key, uploadId: repeated.r2_upload_id, state: repeated.state, partSize: 5 * 1024 * 1024 }, 200, cors(env));
  try {
    const last = await env.CATALOG.prepare("SELECT COALESCE(MAX(version_number), 0) AS last_version FROM media_versions WHERE asset_id = ?").bind(assetId).first<{ last_version?: number }>();
    const versionNumber = Number(last?.last_version ?? 0) + 1;
    const versionId = id(); const sessionId = id(); const r2Key = versionKey(asset, versionNumber, input.expectedSha256);
    const multipart = await env.MEDIA.createMultipartUpload(r2Key, { httpMetadata: { contentType: input.contentType, cacheControl: "public, max-age=86400, immutable" }, customMetadata: { assetId, versionId, sha256: input.expectedSha256 } });
    await env.CATALOG.batch([
      env.CATALOG.prepare("INSERT INTO media_versions (id, asset_id, version_number, r2_bucket, r2_key, content_type, bytes, sha256, duration_ms, state, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'uploading', ?)").bind(versionId, assetId, versionNumber, "quran-yutla-media", r2Key, input.contentType, input.expectedBytes, input.expectedSha256, input.durationMs ?? null, now()),
      env.CATALOG.prepare("INSERT INTO upload_sessions (id, asset_id, version_id, idempotency_key, expected_sha256, expected_bytes, expires_at, state, created_at, r2_key, r2_upload_id, content_type) VALUES (?, ?, ?, ?, ?, ?, datetime('now', '+6 hours'), 'pending', ?, ?, ?, ?)").bind(sessionId, assetId, versionId, input.idempotencyKey, input.expectedSha256, input.expectedBytes, now(), r2Key, multipart.uploadId, input.contentType),
    ]);
    return json({ sessionId, versionId, r2Key, uploadId: multipart.uploadId, partSize: 5 * 1024 * 1024 }, 201, cors(env));
  } catch (error) { return json({ error: error instanceof Error ? error.message : "تعذر بدء الرفع." }, 400, cors(env)); }
}

async function uploadPart(request: Request, env: Env, sessionId: string, partNumber: number) {
  requireAdmin(request, env);
  const session = await env.CATALOG.prepare("SELECT * FROM upload_sessions WHERE id = ? AND state IN ('pending', 'uploaded') AND expires_at > CURRENT_TIMESTAMP").bind(sessionId).first<Record<string, unknown>>();
  if (!session || !session.r2_key || !session.r2_upload_id) return json({ error: "جلسة الرفع غير صالحة أو منتهية." }, 404, cors(env));
  const declared = request.headers.get("x-part-sha256") ?? ""; let checksum: ArrayBuffer;
  try { checksum = hexToBuffer(declared); } catch { return json({ error: "يلزم X-Part-SHA256 بصيغة SHA-256 hex." }, 400, cors(env)); }
  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength) return json({ error: "جزء الرفع فارغ." }, 400, cors(env));
  const calculated = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map((value) => value.toString(16).padStart(2, "0")).join("");
  if (calculated !== declared.toLowerCase()) return json({ error: "فشل التحقق من سلامة جزء الرفع." }, 422, cors(env));
  try {
    const multipart = env.MEDIA.resumeMultipartUpload(String(session.r2_key), String(session.r2_upload_id));
    const uploaded = await multipart.uploadPart(partNumber, bytes);
    await env.CATALOG.batch([
      env.CATALOG.prepare("INSERT OR REPLACE INTO upload_parts (session_id, part_number, etag, bytes, sha256, uploaded_at) VALUES (?, ?, ?, ?, ?, ?)").bind(sessionId, partNumber, uploaded.etag, bytes.byteLength, calculated, now()),
      env.CATALOG.prepare("UPDATE upload_sessions SET state = 'uploaded' WHERE id = ?").bind(sessionId),
    ]);
    return json({ partNumber, etag: uploaded.etag, bytes: bytes.byteLength }, 200, cors(env));
  } catch (error) { return json({ error: error instanceof Error ? error.message : "تعذر حفظ جزء الرفع." }, 400, cors(env)); }
}

async function completeUpload(request: Request, env: Env, sessionId: string) {
  requireAdmin(request, env);
  const session = await env.CATALOG.prepare("SELECT * FROM upload_sessions WHERE id = ? AND state = 'uploaded' AND expires_at > CURRENT_TIMESTAMP").bind(sessionId).first<Record<string, unknown>>();
  if (!session || !session.r2_key || !session.r2_upload_id) return json({ error: "جلسة الرفع غير قابلة للإكمال." }, 404, cors(env));
  const parts = await env.CATALOG.prepare("SELECT part_number, etag, bytes FROM upload_parts WHERE session_id = ? ORDER BY part_number ASC").bind(sessionId).all<{ part_number: number; etag: string; bytes: number }>();
  const uploadedParts = parts.results as Array<{ part_number: number; etag: string; bytes: number }>;
  const total = uploadedParts.reduce((sum: number, part: { part_number: number; etag: string; bytes: number }) => sum + Number(part.bytes), 0);
  if (!uploadedParts.length || total !== Number(session.expected_bytes)) return json({ error: "الأجزاء المرفوعة لا تطابق حجم الملف المعلن." }, 422, cors(env));
  try {
    const multipart = env.MEDIA.resumeMultipartUpload(String(session.r2_key), String(session.r2_upload_id));
    const object = await multipart.complete(uploadedParts.map((part: { part_number: number; etag: string }) => ({ partNumber: part.part_number, etag: part.etag })));
    await env.CATALOG.batch([
      env.CATALOG.prepare("UPDATE media_versions SET state = 'ready', etag = ?, verified_at = ? WHERE id = ?").bind(object.etag, now(), session.version_id),
      env.CATALOG.prepare("UPDATE media_assets SET current_version_id = ?, status = 'active', updated_at = ? WHERE id = ?").bind(session.version_id, now(), session.asset_id),
      env.CATALOG.prepare("UPDATE media_versions SET state = 'superseded' WHERE asset_id = ? AND id <> ? AND state = 'ready'").bind(session.asset_id, session.version_id),
      env.CATALOG.prepare("UPDATE upload_sessions SET state = 'verified' WHERE id = ?").bind(sessionId),
    ]);
    return json({ assetId: session.asset_id, versionId: session.version_id, r2Key: session.r2_key, etag: object.etag, state: "ready" }, 200, cors(env));
  } catch (error) { return json({ error: error instanceof Error ? error.message : "تعذر إكمال الرفع." }, 400, cors(env)); }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url); const path = url.pathname.replace(/\/$/, "") || "/";
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(env) });
    try {
      if (request.method === "GET" && path === "/health") return json({ ok: true, time: now() }, 200, cors(env));
      if (request.method === "POST" && path === "/v1/admin/sources") return createSource(request, env);
      if (request.method === "POST" && path === "/v1/admin/assets") return createAsset(request, env);
      if (request.method === "GET" && path === "/v1/sources") {
        const rows = await env.CATALOG.prepare("SELECT id, name, official_url AS officialUrl, terms_url AS termsUrl, license_label AS licenseLabel, rights_status AS rightsStatus, streaming_allowed AS streamingAllowed, download_allowed AS downloadAllowed, r2_redistribution_allowed AS r2RedistributionAllowed, attribution_required AS attributionRequired, attribution_text AS attributionText, reviewed_at AS reviewedAt FROM content_sources WHERE is_active = 1 ORDER BY name").all();
        return json({ items: rows.results }, 200, cors(env));
      }
      const initMatch = path.match(/^\/v1\/admin\/assets\/([^/]+)\/uploads$/);
      if (request.method === "POST" && initMatch) return initUpload(request, env, initMatch[1]);
      const partMatch = path.match(/^\/v1\/admin\/uploads\/([^/]+)\/parts\/(\d+)$/);
      if (request.method === "PUT" && partMatch) return uploadPart(request, env, partMatch[1], Number(partMatch[2]));
      const completeMatch = path.match(/^\/v1\/admin\/uploads\/([^/]+)\/complete$/);
      if (request.method === "POST" && completeMatch) return completeUpload(request, env, completeMatch[1]);
      const streamMatch = path.match(/^\/v1\/media\/([^/]+)\/stream$/);
      if ((request.method === "GET" || request.method === "HEAD") && streamMatch) return streamAsset(request, env, streamMatch[1], false);
      const downloadMatch = path.match(/^\/v1\/media\/([^/]+)\/download$/);
      if ((request.method === "GET" || request.method === "HEAD") && downloadMatch) return streamAsset(request, env, downloadMatch[1], true);
      if (request.method === "GET" && path === "/v1/media") {
        const kind = url.searchParams.get("kind");
        const reciterId = url.searchParams.get("reciterId");
        const rows = await env.CATALOG.prepare(`SELECT a.id, a.kind, a.title, a.description, a.reciter_id AS reciterId, r.name_ar AS reciterName, a.surah_number AS surahNumber, a.duration_ms AS durationMs, a.is_downloadable AS isDownloadable, v.bytes, v.sha256 FROM media_assets a JOIN media_versions v ON v.id = a.current_version_id LEFT JOIN reciters r ON r.id = a.reciter_id WHERE a.status = 'active' AND v.state = 'ready' AND (? IS NULL OR a.kind = ?) AND (? IS NULL OR a.reciter_id = ?) ORDER BY a.reciter_id, a.surah_number, a.title`).bind(kind, kind, reciterId, reciterId).all();
        return json({ items: rows.results.map((row: any) => ({ ...row, streamUrl: `${url.origin}/v1/media/${row.id}/stream`, downloadUrl: row.isDownloadable ? `${url.origin}/v1/media/${row.id}/download` : null })) }, 200, cors(env));
      }
      return json({ error: "Not found" }, 404, cors(env));
    } catch (error) {
      if (error instanceof Response) return error;
      return json({ error: error instanceof Error ? error.message : "Internal error" }, 500, cors(env));
    }
  },
};
