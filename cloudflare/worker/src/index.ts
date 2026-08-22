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
  moshafId?: string;
  moshafName?: string;
  rewaya?: string;
  qualityKbps?: number;
  surahNumber?: number;
  originalUrl?: string;
  attributionSnapshot?: string;
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

type StationInput = { id: string; title: string; description?: string; timezone?: string; rotationAnchorAt?: string; status?: "draft" | "published" | "hidden" | "archived" };
type StationItemInput = { assetId: string; sortOrder?: number; isActive?: boolean };
type PublicationInput = { publicationStatus: "draft" | "published" | "hidden" | "archived"; sortOrder?: number };
type ReciterInput = { id: string; nameAr: string; nameEn?: string; description?: string; sortOrder?: number; publicationStatus?: "draft" | "published" | "hidden" | "archived"; isActive?: boolean };
type LiveHlsChannelInput = { id: string; title: string; description?: string; sourceId: string; manifestUrl: string; status?: "draft" | "published" | "hidden" | "archived"; sortOrder?: number; isActive?: boolean };


const json = (body: unknown, status = 200, headers: HeadersInit = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", ...headers } });
const id = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const asNumber = (value: unknown) => Number(value ?? 0);

function publicEtag(value: string) {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
  return `"quran-yutla-${(hash >>> 0).toString(16)}"`;
}

function publicJson(request: Request, body: unknown, lastModified?: string | null, maxAge = 60, headers: HeadersInit = {}) {
  const encoded = JSON.stringify(body);
  const etag = publicEtag(encoded);
  const responseHeaders = { "content-type": "application/json; charset=utf-8", "cache-control": `public, max-age=${maxAge}`, etag, ...(lastModified ? { "last-modified": new Date(lastModified).toUTCString() } : {}), ...headers };
  if (request.headers.get("if-none-match")?.replace(/^W\//, "") === etag) return new Response(null, { status: 304, headers: responseHeaders });
  return new Response(request.method === "HEAD" ? null : encoded, { status: 200, headers: responseHeaders });
}

function cors(env: Env) {
  return {
    "access-control-allow-origin": env.ALLOWED_ORIGIN || "*",
    "access-control-allow-methods": "GET,POST,PUT,PATCH,OPTIONS",
    "access-control-allow-headers": "Authorization,Content-Type,Idempotency-Key,X-Part-SHA256,X-Original-Url,X-Attribution-Snapshot",
  };
}

function requireAdmin(request: Request, env: Env): Response | null {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return !env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN ? json({ error: "Unauthorized" }, 401, cors(env)) : null;
}

function sanitizeSegment(value: string) {
  const clean = value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (!clean) throw new Error("Invalid path segment");
  return clean;
}

function logicalKey(input: AssetInput) {
  if (input.kind === "quran_surah") {
    if (!input.reciterId || !input.moshafId || !input.surahNumber || input.surahNumber < 1 || input.surahNumber > 114) throw new Error("Quran surah needs a reciter, moshaf and a valid surah number.");
    return `quran/${sanitizeSegment(input.reciterId)}/${sanitizeSegment(input.moshafId)}/${String(input.surahNumber).padStart(3, "0")}.mp3`;
  }
  const prefix = input.kind === "radio_program" ? "radio/programs" : input.kind === "lecture" ? "lectures" : input.kind === "recording" ? "recordings" : "radio/jingles";
  return `${prefix}/${sanitizeSegment(input.id)}.mp3`;
}

function versionKey(asset: Record<string, unknown>, version: number, sha256: string) {
  const shortHash = sanitizeSegment(sha256.slice(0, 16));
  if (asset.kind === "quran_surah") return `quran/${sanitizeSegment(String(asset.reciter_id))}/${sanitizeSegment(String(asset.moshaf_id))}/${String(asset.surah_number).padStart(3, "0")}/versions/v${version}-${shortHash}.mp3`;
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
  return env.CATALOG.prepare(`SELECT a.id, a.title, a.description, a.kind, a.is_downloadable, a.moshaf_id, v.r2_key, v.content_type, v.bytes, v.etag, v.sha256 FROM media_assets a JOIN media_versions v ON v.id = a.current_version_id WHERE a.id = ? AND a.status = 'active' AND v.state = 'ready'`).bind(assetId).first<Record<string, unknown>>();
}

async function streamAsset(request: Request, env: Env, assetId: string, download: boolean) {
  const media = await activeMedia(env, assetId);
  if (!media) return json({ error: "الملف غير متاح أو لم يُتحقق منه بعد." }, 404, cors(env));
  if (download && asNumber(media.is_downloadable) !== 1) return json({ error: "هذا الملف غير متاح للتنزيل." }, 403, cors(env));
  const requestedRange = request.headers.get("range");
  const object = requestedRange ? await env.MEDIA.get(String(media.r2_key), { range: request.headers }) : await env.MEDIA.get(String(media.r2_key));
  if (!object) return json({ error: "مرجع التخزين غير موجود." }, 404, cors(env));
  const headers = new Headers(cors(env));
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("accept-ranges", "bytes");
  headers.set("cache-control", `public, max-age=${Number(env.PUBLIC_CACHE_SECONDS ?? 86400)}, immutable`);
  headers.set("x-content-sha256", String(media.sha256));
  if (download) headers.set("content-disposition", `attachment; filename="${sanitizeSegment(String(media.id))}.mp3"`);
  if (requestedRange && object.range) {
    const range = object.range;
    const start = "suffix" in range ? object.size - range.suffix : range.offset ?? 0;
    const length = "suffix" in range ? range.suffix : range.length ?? (object.size - start);
    const end = start + length - 1;
    headers.set("content-range", `bytes ${start}-${end}/${object.size}`);
    return new Response(request.method === "HEAD" ? null : object.body, { status: 206, headers });
  }
  headers.set("content-length", String(object.size));
  return new Response(request.method === "HEAD" ? null : object.body, { status: 200, headers });
}

async function createAsset(request: Request, env: Env) {
  const denied = requireAdmin(request, env); if (denied) return denied;
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
      if (!input.reciterId || !input.reciterName?.trim() || !input.moshafId || !input.moshafName?.trim()) return json({ error: "يلزم reciterId وreciterName وmoshafId وmoshafName للتلاوة القرآنية." }, 422, cors(env));
      await env.CATALOG.prepare("INSERT INTO reciters (id, name_ar, source_name, is_active, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?) ON CONFLICT(id) DO UPDATE SET name_ar = excluded.name_ar, source_name = excluded.source_name, is_active = 1, updated_at = excluded.updated_at")
        .bind(sanitizeSegment(input.reciterId), input.reciterName.trim(), String(source.name), now(), now()).run();
      await env.CATALOG.prepare("INSERT INTO moshafs (id, reciter_id, slug, name, rewaya, quality_kbps, source_name, source_id, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, rewaya = excluded.rewaya, quality_kbps = excluded.quality_kbps, source_name = excluded.source_name, source_id = excluded.source_id, is_active = 1, updated_at = excluded.updated_at")
        .bind(sanitizeSegment(input.moshafId), sanitizeSegment(input.reciterId), sanitizeSegment(input.moshafId), input.moshafName.trim(), input.rewaya?.trim() ?? null, input.qualityKbps ?? null, String(source.name), input.sourceId, now(), now()).run();
    }
    await env.CATALOG.prepare(`INSERT INTO media_assets (id, source_id, attribution_snapshot, kind, logical_key, reciter_id, moshaf_id, surah_number, title, description, original_url, bitrate_kbps, is_downloadable, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`)
      .bind(assetId, input.sourceId, input.attributionSnapshot?.trim() || source.attribution_text || null, input.kind, logical, input.reciterId ?? null, input.moshafId ? sanitizeSegment(input.moshafId) : null, input.surahNumber ?? null, input.title, input.description ?? null, input.originalUrl ?? null, input.qualityKbps ?? null, input.isDownloadable === false ? 0 : 1, now(), now()).run();
    return json({ id: assetId, logicalKey: logical, status: "draft" }, 201, cors(env));
  } catch (error) { return json({ error: error instanceof Error ? error.message : "تعذر إنشاء الأصل." }, 400, cors(env)); }
}

async function createSource(request: Request, env: Env) {
  const denied = requireAdmin(request, env); if (denied) return denied;
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
  const denied = requireAdmin(request, env); if (denied) return denied;
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
  const denied = requireAdmin(request, env); if (denied) return denied;
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
  const denied = requireAdmin(request, env); if (denied) return denied;
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

function stationAsset(row: Record<string, unknown>, origin: string) {
  const assetId = String(row.id);
  return {
    id: assetId, kind: "radio_program", title: row.title, description: row.description, durationMs: Number(row.duration_ms), isDownloadable: Number(row.is_downloadable) === 1, bytes: Number(row.bytes), sha256: row.sha256,
    streamUrl: `${origin}/v1/media/${assetId}/stream`, downloadUrl: Number(row.is_downloadable) === 1 ? `${origin}/v1/media/${assetId}/download` : null,
  };
}

async function stationItems(env: Env, stationId: string) {
  const rows = await env.CATALOG.prepare(`SELECT a.id, a.title, a.description, a.duration_ms, a.is_downloadable, v.bytes, v.sha256
    FROM radio_playlist_items p JOIN media_assets a ON a.id = p.media_asset_id JOIN media_versions v ON v.id = a.current_version_id
    JOIN content_sources s ON s.id = a.source_id
    WHERE p.station_id = ? AND p.is_active = 1 AND a.status = 'active' AND a.publication_status = 'published' AND v.state = 'ready' AND s.streaming_allowed = 1 AND a.duration_ms > 0
    ORDER BY p.sort_order, p.id`).bind(stationId).all<Record<string, unknown>>();
  return rows.results as Record<string, unknown>[];
}

async function listStations(request: Request, env: Env) {
  const rows = await env.CATALOG.prepare(`SELECT s.id, s.title, s.description, s.artwork_storage_key AS artworkStorageKey, s.timezone, s.rotation_anchor_at AS rotationAnchorAt, s.content_version AS contentVersion, s.updated_at AS updatedAt, COUNT(p.id) AS playlistCount
    FROM radio_stations s LEFT JOIN radio_playlist_items p ON p.station_id = s.id AND p.is_active = 1
    WHERE s.status = 'published' AND s.is_active = 1 GROUP BY s.id ORDER BY s.title`).all<Record<string, unknown>>();
  return publicJson(request, { items: rows.results }, new Date().toISOString(), 60, cors(env));
}

async function stationNow(request: Request, env: Env, stationId: string, origin: string) {
  const station = await env.CATALOG.prepare("SELECT id, title, description, timezone, rotation_anchor_at, content_version, updated_at FROM radio_stations WHERE id = ? AND status = 'published' AND is_active = 1").bind(stationId).first<Record<string, unknown>>();
  if (!station) return json({ error: "المحطة غير منشورة أو غير متاحة." }, 404, cors(env));
  const items = await stationItems(env, stationId);
  if (!items.length) return json({ error: "لا تحتوي المحطة على قائمة تشغيل مرخصة مكتملة." }, 409, cors(env));
  const totalMs = items.reduce((sum, item) => sum + Number(item.duration_ms), 0);
  const anchorMs = Date.parse(String(station.rotation_anchor_at));
  const elapsedMs = Math.max(0, Date.now() - (Number.isFinite(anchorMs) ? anchorMs : Date.now()));
  let cursor = totalMs ? elapsedMs % totalMs : 0;
  let index = 0;
  while (index < items.length - 1 && cursor >= Number(items[index].duration_ms)) { cursor -= Number(items[index].duration_ms); index += 1; }
  const current = stationAsset(items[index], origin);
  const next = stationAsset(items[(index + 1) % items.length], origin);
  const startsAt = new Date(Date.now() - cursor).toISOString();
  const endsAt = new Date(Date.now() + Number(items[index].duration_ms) - cursor).toISOString();
  return publicJson(request, { station: { id: station.id, title: station.title, description: station.description, timezone: station.timezone, contentVersion: station.content_version }, now: { asset: current, startOffsetMs: Math.floor(cursor), startsAt, endsAt }, next: { asset: next }, serverTime: now() }, String(station.updated_at), 10, cors(env));
}

async function createStation(request: Request, env: Env) {
  const denied = requireAdmin(request, env); if (denied) return denied;
  const input = await readJson<StationInput>(request);
  if (!input.id || !input.title) return json({ error: "يلزم معرّف المحطة وعنوانها." }, 422, cors(env));
  const status = input.status ?? "draft";
  if (!["draft", "published", "hidden", "archived"].includes(status)) return json({ error: "حالة نشر المحطة غير صالحة." }, 422, cors(env));
  await env.CATALOG.prepare("INSERT INTO radio_stations (id, title, description, timezone, rotation_anchor_at, status, is_active, content_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?, ?) ON CONFLICT(id) DO UPDATE SET title = excluded.title, description = excluded.description, timezone = excluded.timezone, rotation_anchor_at = excluded.rotation_anchor_at, status = excluded.status, content_version = radio_stations.content_version + 1, updated_at = excluded.updated_at")
    .bind(sanitizeSegment(input.id), input.title.trim(), input.description?.trim() ?? null, input.timezone?.trim() || "UTC", input.rotationAnchorAt || now(), status, now(), now()).run();
  return json({ id: sanitizeSegment(input.id), status }, 201, cors(env));
}

async function addStationItem(request: Request, env: Env, stationId: string) {
  const denied = requireAdmin(request, env); if (denied) return denied;
  const input = await readJson<StationItemInput>(request);
  const asset = await env.CATALOG.prepare(`SELECT a.id FROM media_assets a JOIN media_versions v ON v.id = a.current_version_id JOIN content_sources s ON s.id = a.source_id
    WHERE a.id = ? AND a.status = 'active' AND a.publication_status = 'published' AND v.state = 'ready' AND a.duration_ms > 0 AND s.streaming_allowed = 1`).bind(input.assetId).first<{ id?: string }>();
  if (!asset?.id) return json({ error: "الأصل غير صالح للبث الإذاعي؛ يلزم أصل نشط ومدة وحقوق بث صريحة." }, 422, cors(env));
  const station = await env.CATALOG.prepare("SELECT id FROM radio_stations WHERE id = ?").bind(stationId).first<{ id?: string }>();
  if (!station?.id) return json({ error: "المحطة غير موجودة." }, 404, cors(env));
  const itemId = `${sanitizeSegment(stationId)}-${sanitizeSegment(input.assetId)}`;
  await env.CATALOG.batch([
    env.CATALOG.prepare("INSERT INTO radio_playlist_items (id, station_id, media_asset_id, sort_order, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(station_id, media_asset_id) DO UPDATE SET sort_order = excluded.sort_order, is_active = excluded.is_active, updated_at = excluded.updated_at").bind(itemId, stationId, input.assetId, input.sortOrder ?? 0, input.isActive === false ? 0 : 1, now(), now()),
    env.CATALOG.prepare("UPDATE radio_stations SET content_version = content_version + 1, updated_at = ? WHERE id = ?").bind(now(), stationId),
  ]);
  return json({ id: itemId, stationId, assetId: input.assetId }, 201, cors(env));
}

function validatedHlsManifestUrl(value: string) {
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error("رابط قائمة HLS غير صالح."); }
  if (parsed.protocol !== "https:" || !parsed.pathname.toLowerCase().endsWith(".m3u8")) throw new Error("يلزم رابط HTTPS لقائمة HLS ينتهي بـ .m3u8.");
  if (["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(parsed.hostname)) throw new Error("رابط قائمة HLS غير مسموح.");
  return parsed.toString();
}

async function listLiveHlsChannels(request: Request, env: Env) {
  const rows = await env.CATALOG.prepare(`SELECT c.id, c.title, c.description, c.hls_manifest_url AS manifestUrl, c.sort_order AS sortOrder, c.last_probe_status AS lastProbeStatus, c.last_checked_at AS lastCheckedAt, c.updated_at AS updatedAt, s.id AS sourceId, s.name AS sourceName, s.license_label AS licenseLabel, s.attribution_required AS attributionRequired, s.attribution_text AS attributionText
    FROM live_hls_channels c JOIN content_sources s ON s.id = c.source_id
    WHERE c.status = 'published' AND c.is_active = 1 AND s.is_active = 1 AND s.streaming_allowed = 1 AND s.rights_status IN ('r2_redistribution_allowed', 'stream_link_only', 'attribution_required')
    ORDER BY c.sort_order, c.title`).all<Record<string, unknown>>();
  const revision = (rows.results as Record<string, unknown>[]).reduce((latest, row) => String(row.updatedAt ?? "") > latest ? String(row.updatedAt) : latest, "no-live-hls");
  return publicJson(request, { items: rows.results }, revision, 15, cors(env));
}

async function upsertLiveHlsChannel(request: Request, env: Env) {
  const denied = requireAdmin(request, env); if (denied) return denied;
  const input = await readJson<LiveHlsChannelInput>(request);
  if (!input.id || !input.title || !input.sourceId || !input.manifestUrl) return json({ error: "يلزم معرّف القناة وعنوانها ومصدر الحقوق ورابط HLS." }, 422, cors(env));
  let manifestUrl: string;
  try { manifestUrl = validatedHlsManifestUrl(input.manifestUrl); } catch (error) { return json({ error: error instanceof Error ? error.message : "رابط HLS غير صالح." }, 422, cors(env)); }
  const source = await env.CATALOG.prepare("SELECT id FROM content_sources WHERE id = ? AND is_active = 1 AND streaming_allowed = 1 AND rights_status IN ('r2_redistribution_allowed', 'stream_link_only', 'attribution_required')").bind(input.sourceId).first<{ id?: string }>();
  if (!source?.id) return json({ error: "مصدر الحقوق غير مؤهل للبث المباشر؛ يلزم بث مسموح وترخيص واضح." }, 422, cors(env));
  const status = input.status ?? "draft";
  await env.CATALOG.prepare("INSERT INTO live_hls_channels (id, title, description, source_id, hls_manifest_url, status, is_active, sort_order, content_version, last_probe_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'unverified', ?, ?) ON CONFLICT(id) DO UPDATE SET title = excluded.title, description = excluded.description, source_id = excluded.source_id, hls_manifest_url = excluded.hls_manifest_url, status = excluded.status, is_active = excluded.is_active, sort_order = excluded.sort_order, content_version = live_hls_channels.content_version + 1, last_probe_status = 'unverified', updated_at = excluded.updated_at")
    .bind(sanitizeSegment(input.id), input.title.trim(), input.description?.trim() ?? null, input.sourceId, manifestUrl, status, input.isActive === false ? 0 : 1, input.sortOrder ?? 0, now(), now()).run();
  return json({ id: sanitizeSegment(input.id), status, manifestUrl }, 201, cors(env));
}

async function probeLiveHlsChannel(request: Request, env: Env, channelId: string) {
  const denied = requireAdmin(request, env); if (denied) return denied;
  const channel = await env.CATALOG.prepare("SELECT id, hls_manifest_url FROM live_hls_channels WHERE id = ?").bind(channelId).first<{ id?: string; hls_manifest_url?: string }>();
  if (!channel?.id || !channel.hls_manifest_url) return json({ error: "قناة HLS غير موجودة." }, 404, cors(env));
  let probeStatus: "online" | "offline" | "invalid" = "offline"; let httpStatus: number | null = null;
  try {
    const response = await fetch(channel.hls_manifest_url, { headers: { accept: "application/vnd.apple.mpegurl,application/x-mpegURL,text/plain" } });
    httpStatus = response.status;
    const body = await response.text();
    probeStatus = response.ok && body.slice(0, 512).includes("#EXTM3U") ? "online" : "invalid";
  } catch { probeStatus = "offline"; }
  await env.CATALOG.prepare("UPDATE live_hls_channels SET last_probe_status = ?, last_checked_at = ?, updated_at = ? WHERE id = ?").bind(probeStatus, now(), now(), channelId).run();
  return json({ id: channelId, probeStatus, httpStatus, checkedAt: now() }, 200, cors(env));
}

async function updatePublication(request: Request, env: Env, assetId: string) {
  const denied = requireAdmin(request, env); if (denied) return denied;
  const input = await readJson<PublicationInput>(request);
  await env.CATALOG.prepare("UPDATE media_assets SET publication_status = ?, sort_order = COALESCE(?, sort_order), content_version = content_version + 1, updated_at = ? WHERE id = ?").bind(input.publicationStatus, input.sortOrder ?? null, now(), assetId).run();
  return json({ id: assetId, publicationStatus: input.publicationStatus }, 200, cors(env));
}

async function upsertReciter(request: Request, env: Env) {
  const denied = requireAdmin(request, env); if (denied) return denied;
  const input = await readJson<ReciterInput>(request);
  if (!input.id || !input.nameAr?.trim()) return json({ error: "يلزم معرّف القارئ واسمه العربي." }, 422, cors(env));
  const status = input.publicationStatus ?? "draft";
  await env.CATALOG.prepare("INSERT INTO reciters (id, name_ar, name_en, description, sort_order, publication_status, is_active, source_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'internal', ?, ?) ON CONFLICT(id) DO UPDATE SET name_ar = excluded.name_ar, name_en = excluded.name_en, description = excluded.description, sort_order = excluded.sort_order, publication_status = excluded.publication_status, is_active = excluded.is_active, updated_at = excluded.updated_at")
    .bind(sanitizeSegment(input.id), input.nameAr.trim(), input.nameEn?.trim() ?? null, input.description?.trim() ?? null, input.sortOrder ?? 0, status, input.isActive === false ? 0 : 1, now(), now()).run();
  return json({ id: sanitizeSegment(input.id), publicationStatus: status }, 201, cors(env));
}

function bytesToHex(bytes: ArrayBuffer) { return Array.from(new Uint8Array(bytes)).map((value) => value.toString(16).padStart(2, "0")).join(""); }

async function uploadReciterImage(request: Request, env: Env, reciterId: string) {
  const denied = requireAdmin(request, env); if (denied) return denied;
  const contentType = request.headers.get("content-type")?.split(";")[0] ?? "";
  const extensions: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
  const originalUrl = request.headers.get("x-original-url")?.trim() ?? "";
  if (!extensions[contentType] || !/^https:\/\//.test(originalUrl)) return json({ error: "تُقبل JPEG أو PNG أو WebP مع رابط مصدر https موثق للصورة." }, 422, cors(env));
  const reciter = await env.CATALOG.prepare("SELECT id FROM reciters WHERE id = ?").bind(reciterId).first<{ id?: string }>();
  if (!reciter?.id) return json({ error: "القارئ غير موجود؛ أنشئ بياناته أولًا." }, 404, cors(env));
  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > 5 * 1024 * 1024) return json({ error: "حجم صورة القارئ يجب أن يكون بين 1 بايت و5 MB." }, 422, cors(env));
  const sha256 = bytesToHex(await crypto.subtle.digest("SHA-256", bytes));
  const last = await env.CATALOG.prepare("SELECT COALESCE(MAX(version_number), 0) AS version FROM reciter_image_versions WHERE reciter_id = ?").bind(reciterId).first<{ version?: number }>();
  const version = Number(last?.version ?? 0) + 1;
  const r2Key = `images/reciters/${sanitizeSegment(reciterId)}/v${version}-${sha256.slice(0, 16)}.${extensions[contentType]}`;
  await env.MEDIA.put(r2Key, bytes, { httpMetadata: { contentType, cacheControl: "public, max-age=31536000, immutable" }, customMetadata: { reciterId, sha256 } });
  await env.CATALOG.batch([
    env.CATALOG.prepare("INSERT INTO reciter_image_versions (id, reciter_id, version_number, r2_key, content_type, bytes, sha256, original_url, attribution_snapshot, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(id(), reciterId, version, r2Key, contentType, bytes.byteLength, sha256, originalUrl, request.headers.get("x-attribution-snapshot")?.trim() ?? null, now()),
    env.CATALOG.prepare("UPDATE reciters SET image_storage_key = ?, updated_at = ? WHERE id = ?").bind(r2Key, now(), reciterId),
  ]);
  return json({ reciterId, version, r2Key, sha256, imageUrl: `/v1/images/reciters/${sanitizeSegment(reciterId)}` }, 201, cors(env));
}

async function streamReciterImage(request: Request, env: Env, reciterId: string) {
  const reciter = await env.CATALOG.prepare("SELECT image_storage_key FROM reciters WHERE id = ? AND is_active = 1 AND publication_status = 'published'").bind(reciterId).first<{ image_storage_key?: string | null }>();
  if (!reciter?.image_storage_key) return json({ error: "لا توجد صورة منشورة لهذا القارئ." }, 404, cors(env));
  const object = await env.MEDIA.get(reciter.image_storage_key);
  if (!object) return json({ error: "مرجع صورة القارئ غير موجود." }, 404, cors(env));
  const headers = new Headers(cors(env)); object.writeHttpMetadata(headers); headers.set("etag", object.httpEtag); headers.set("cache-control", "public, max-age=31536000, immutable");
  return new Response(request.method === "HEAD" ? null : object.body, { status: 200, headers });
}

async function contentManifest(request: Request, env: Env) {
  const counts = await env.CATALOG.prepare(`SELECT
    (SELECT COUNT(*) FROM reciters WHERE is_active = 1 AND publication_status = 'published') AS reciters,
    (SELECT COUNT(*) FROM moshafs WHERE is_active = 1 AND publication_status = 'published') AS moshafs,
    (SELECT COUNT(*) FROM media_assets WHERE status = 'active' AND publication_status = 'published') AS assets,
    (SELECT COUNT(*) FROM radio_stations WHERE status = 'published' AND is_active = 1) AS stations,
    (SELECT COUNT(*) FROM live_hls_channels WHERE status = 'published' AND is_active = 1) AS liveHlsChannels,
    MAX(COALESCE((SELECT MAX(updated_at) FROM media_assets), ''), COALESCE((SELECT MAX(updated_at) FROM reciters), ''), COALESCE((SELECT MAX(updated_at) FROM moshafs), ''), COALESCE((SELECT MAX(updated_at) FROM radio_stations), ''), COALESCE((SELECT MAX(updated_at) FROM live_hls_channels), ''), COALESCE((SELECT MAX(updated_at) FROM content_sources), '')) AS lastModified`).first<Record<string, unknown>>();
  return publicJson(request, { revision: counts?.lastModified ?? null, counts: { reciters: Number(counts?.reciters ?? 0), moshafs: Number(counts?.moshafs ?? 0), assets: Number(counts?.assets ?? 0), stations: Number(counts?.stations ?? 0), liveHlsChannels: Number(counts?.liveHlsChannels ?? 0) } }, String(counts?.lastModified ?? now()), 30, cors(env));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url); const path = url.pathname.replace(/\/$/, "") || "/";
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(env) });
    try {
      if (request.method === "GET" && path === "/health") return json({ ok: true, time: now() }, 200, cors(env));
      if ((request.method === "GET" || request.method === "HEAD") && path === "/v1/content/manifest") return contentManifest(request, env);
      if (request.method === "POST" && path === "/v1/admin/sources") return createSource(request, env);
      if (request.method === "POST" && path === "/v1/admin/assets") return createAsset(request, env);
      if (request.method === "POST" && path === "/v1/admin/live/hls-channels") return upsertLiveHlsChannel(request, env);
      const liveHlsProbeMatch = path.match(/^\/v1\/admin\/live\/hls-channels\/([^/]+)\/probe$/);
      if (request.method === "POST" && liveHlsProbeMatch) return probeLiveHlsChannel(request, env, liveHlsProbeMatch[1]);
      if (request.method === "POST" && path === "/v1/admin/reciters") return upsertReciter(request, env);
      const reciterImageUploadMatch = path.match(/^\/v1\/admin\/reciters\/([^/]+)\/image$/);
      if (request.method === "PUT" && reciterImageUploadMatch) return uploadReciterImage(request, env, reciterImageUploadMatch[1]);
      if (request.method === "POST" && path === "/v1/admin/radio/stations") return createStation(request, env);
      const stationItemMatch = path.match(/^\/v1\/admin\/radio\/stations\/([^/]+)\/items$/);
      if (request.method === "POST" && stationItemMatch) return addStationItem(request, env, stationItemMatch[1]);
      const publicationMatch = path.match(/^\/v1\/admin\/assets\/([^/]+)\/publication$/);
      if (request.method === "PATCH" && publicationMatch) return updatePublication(request, env, publicationMatch[1]);
      if ((request.method === "GET" || request.method === "HEAD") && path === "/v1/sources") {
        const rows = await env.CATALOG.prepare("SELECT id, name, official_url AS officialUrl, terms_url AS termsUrl, license_label AS licenseLabel, rights_status AS rightsStatus, streaming_allowed AS streamingAllowed, download_allowed AS downloadAllowed, r2_redistribution_allowed AS r2RedistributionAllowed, attribution_required AS attributionRequired, attribution_text AS attributionText, reviewed_at AS reviewedAt FROM content_sources WHERE is_active = 1 ORDER BY name").all();
        return publicJson(request, { items: rows.results }, new Date().toISOString(), 300, cors(env));
      }
      if ((request.method === "GET" || request.method === "HEAD") && path === "/v1/radio/stations") return listStations(request, env);
      if ((request.method === "GET" || request.method === "HEAD") && path === "/v1/live/hls-channels") return listLiveHlsChannels(request, env);
      const stationNowMatch = path.match(/^\/v1\/radio\/stations\/([^/]+)\/now$/);
      if ((request.method === "GET" || request.method === "HEAD") && stationNowMatch) return stationNow(request, env, stationNowMatch[1], url.origin);
      if ((request.method === "GET" || request.method === "HEAD") && path === "/v1/quran/surahs") {
        const rows = await env.CATALOG.prepare(`SELECT number, name_ar AS name, name_en AS englishName, ayah_count AS numberOfAyahs,
          CASE revelation_type WHEN 'meccan' THEN 'Meccan' WHEN 'medinan' THEN 'Medinan' ELSE NULL END AS revelationType, updated_at AS updatedAt
          FROM surahs ORDER BY number`).all<Record<string, unknown>>();
        return publicJson(request, { items: rows.results }, new Date().toISOString(), 86_400, cors(env));
      }
      if ((request.method === "GET" || request.method === "HEAD") && path === "/v1/quran/reciters") {
        const rows = await env.CATALOG.prepare(`SELECT r.id, r.name_ar AS nameAr, r.name_en AS nameEn, r.image_storage_key AS imageStorageKey, r.description, COUNT(DISTINCT m.id) AS moshafCount, COUNT(DISTINCT a.id) AS trackCount FROM reciters r JOIN moshafs m ON m.reciter_id = r.id AND m.is_active = 1 AND m.publication_status = 'published' JOIN media_assets a ON a.moshaf_id = m.id AND a.kind = 'quran_surah' AND a.status = 'active' AND a.publication_status = 'published' JOIN media_versions v ON v.id = a.current_version_id AND v.state = 'ready' WHERE r.is_active = 1 AND r.publication_status = 'published' GROUP BY r.id ORDER BY r.sort_order, r.name_ar`).all<Record<string, unknown>>();
        const items = rows.results.map((row) => ({ ...row, imageUrl: row.imageStorageKey ? `${url.origin}/v1/images/reciters/${row.id}` : null }));
        return publicJson(request, { items }, new Date().toISOString(), 120, cors(env));
      }
      const reciterImageMatch = path.match(/^\/v1\/images\/reciters\/([^/]+)$/);
      if ((request.method === "GET" || request.method === "HEAD") && reciterImageMatch) return streamReciterImage(request, env, reciterImageMatch[1]);
      const reciterMoshafsMatch = path.match(/^\/v1\/quran\/reciters\/([^/]+)\/moshafs$/);
      if ((request.method === "GET" || request.method === "HEAD") && reciterMoshafsMatch) {
        const rows = await env.CATALOG.prepare(`SELECT m.id, m.slug, m.name, m.rewaya, m.quality_kbps AS qualityKbps, m.source_name AS sourceName, COUNT(a.id) AS surahCount FROM moshafs m JOIN media_assets a ON a.moshaf_id = m.id AND a.kind = 'quran_surah' AND a.status = 'active' AND a.publication_status = 'published' JOIN media_versions v ON v.id = a.current_version_id AND v.state = 'ready' WHERE m.reciter_id = ? AND m.is_active = 1 AND m.publication_status = 'published' GROUP BY m.id ORDER BY m.sort_order, m.name`).bind(reciterMoshafsMatch[1]).all();
        return json({ items: rows.results }, 200, cors(env));
      }
      const moshafSurahsMatch = path.match(/^\/v1\/quran\/moshafs\/([^/]+)\/surahs$/);
      if ((request.method === "GET" || request.method === "HEAD") && moshafSurahsMatch) {
        const rows = await env.CATALOG.prepare(`SELECT a.id, a.surah_number AS surahNumber, s.name_ar AS surahName, a.title, a.description, a.duration_ms AS durationMs, a.bitrate_kbps AS bitrateKbps, a.original_url AS originalUrl, a.is_downloadable AS isDownloadable, v.bytes, v.sha256 FROM media_assets a JOIN media_versions v ON v.id = a.current_version_id JOIN surahs s ON s.number = a.surah_number WHERE a.moshaf_id = ? AND a.kind = 'quran_surah' AND a.status = 'active' AND a.publication_status = 'published' AND v.state = 'ready' ORDER BY a.sort_order, a.surah_number`).bind(moshafSurahsMatch[1]).all();
        return json({ items: rows.results.map((row: any) => ({ ...row, streamUrl: `${url.origin}/v1/media/${row.id}/stream`, downloadUrl: row.isDownloadable ? `${url.origin}/v1/media/${row.id}/download` : null })) }, 200, cors(env));
      }
      const quranAudioMatch = path.match(/^\/v1\/quran\/audio\/([^/]+)\/(\d{1,3})$/);
      if ((request.method === "GET" || request.method === "HEAD") && quranAudioMatch) {
        const row = await env.CATALOG.prepare("SELECT id FROM media_assets WHERE moshaf_id = ? AND surah_number = ? AND kind = 'quran_surah' AND status = 'active' AND publication_status = 'published'").bind(quranAudioMatch[1], Number(quranAudioMatch[2])).first<{ id?: string }>();
        return row?.id ? streamAsset(request, env, row.id, false) : json({ error: "السورة غير متاحة في هذا المصحف." }, 404, cors(env));
      }
      const quranDownloadMatch = path.match(/^\/v1\/quran\/download\/([^/]+)\/(\d{1,3})$/);
      if ((request.method === "GET" || request.method === "HEAD") && quranDownloadMatch) {
        const row = await env.CATALOG.prepare("SELECT id FROM media_assets WHERE moshaf_id = ? AND surah_number = ? AND kind = 'quran_surah' AND status = 'active' AND publication_status = 'published'").bind(quranDownloadMatch[1], Number(quranDownloadMatch[2])).first<{ id?: string }>();
        return row?.id ? streamAsset(request, env, row.id, true) : json({ error: "السورة غير متاحة في هذا المصحف." }, 404, cors(env));
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
      if ((request.method === "GET" || request.method === "HEAD") && path === "/v1/media") {
        const kind = url.searchParams.get("kind");
        const reciterId = url.searchParams.get("reciterId");
        const cursor = url.searchParams.get("cursor"); const requestedLimit = Number(url.searchParams.get("limit") ?? 500); const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 500, 1), 500);
        const rows = await env.CATALOG.prepare(`SELECT a.id, a.kind, a.title, a.description, a.reciter_id AS reciterId, r.name_ar AS reciterName, a.moshaf_id AS moshafId, m.name AS moshafName, m.rewaya, m.quality_kbps AS qualityKbps, a.surah_number AS surahNumber, a.duration_ms AS durationMs, a.original_url AS originalUrl, a.bitrate_kbps AS bitrateKbps, a.is_downloadable AS isDownloadable, a.content_version AS contentVersion, a.updated_at AS updatedAt, v.bytes, v.sha256 FROM media_assets a JOIN media_versions v ON v.id = a.current_version_id LEFT JOIN reciters r ON r.id = a.reciter_id LEFT JOIN moshafs m ON m.id = a.moshaf_id WHERE a.status = 'active' AND a.publication_status = 'published' AND v.state = 'ready' AND (? IS NULL OR a.kind = ?) AND (? IS NULL OR a.reciter_id = ?) AND (? IS NULL OR a.id > ?) ORDER BY a.id LIMIT ?`).bind(kind, kind, reciterId, reciterId, cursor, cursor, limit + 1).all();
        const result = rows.results as Array<Record<string, unknown>>; const hasMore = result.length > limit; const sourcePage = hasMore ? result.slice(0, limit) : result; const nextCursor = hasMore ? String(sourcePage[sourcePage.length - 1]?.id ?? "") : null; const page = sourcePage.map((row) => ({ ...row, streamUrl: `${url.origin}/v1/media/${row.id}/stream`, downloadUrl: row.isDownloadable ? `${url.origin}/v1/media/${row.id}/download` : null }));
        return publicJson(request, { items: page, nextCursor, hasMore }, new Date().toISOString(), 120, cors(env));
      }
      return json({ error: "Not found" }, 404, cors(env));
    } catch (error) {
      if (error instanceof Response) return error;
      return json({ error: error instanceof Error ? error.message : "Internal error" }, 500, cors(env));
    }
  },
};
