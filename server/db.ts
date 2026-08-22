import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { appOwnerClaims, InsertUser, users } from "../drizzle/schema";
import { ENV } from "./_core/env";
import { localOwnerOpenId, normalizeOwnerEmail } from "./owner-email-auth";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getOwnerBootstrapState(userId?: number) {
  const db = await getDb();
  if (!db) return { hasOwner: Boolean(ENV.ownerOpenId), isOwner: false, canClaim: false };
  const claimed = await db.select().from(appOwnerClaims).limit(1);
  const admins = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin")).limit(1);
  const ownerId = claimed[0]?.userId ?? admins[0]?.id ?? null;
  return { hasOwner: ownerId !== null, isOwner: userId !== undefined && ownerId === userId, canClaim: ownerId === null };
}

export async function claimFirstOwner(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("قاعدة بيانات التطبيق غير متاحة لتعيين المالك.");
  return db.transaction(async (tx) => {
    const current = await tx.select().from(appOwnerClaims).limit(1);
    const existingAdmin = await tx.select({ id: users.id }).from(users).where(eq(users.role, "admin")).limit(1);
    const ownerId = current[0]?.userId ?? existingAdmin[0]?.id;
    if (ownerId !== undefined) {
      if (ownerId === userId) return { status: "already_owner" as const };
      throw new Error("تم تعيين مالك للتطبيق بالفعل ولا يمكن استبداله من الواجهة.");
    }
    await tx.insert(appOwnerClaims).values({ singletonId: 1, userId });
    await tx.update(users).set({ role: "admin" }).where(eq(users.id, userId));
    return { status: "claimed" as const };
  });
}

export async function ensureEmailOwnerAccount(email: string) {
  const db = await getDb();
  if (!db) throw new Error("قاعدة بيانات التطبيق غير متاحة لتسجيل دخول المالك.");
  const normalizedEmail = normalizeOwnerEmail(email);
  const openId = localOwnerOpenId(normalizedEmail);
  return db.transaction(async (tx) => {
    await tx.insert(users).values({ openId, name: "مالك قرآن يتلى", email: normalizedEmail, loginMethod: "email_password", role: "admin", lastSignedIn: new Date() }).onDuplicateKeyUpdate({ set: { name: "مالك قرآن يتلى", email: normalizedEmail, loginMethod: "email_password", role: "admin", lastSignedIn: new Date() } });
    const owner = await tx.select().from(users).where(eq(users.openId, openId)).limit(1);
    const ownerUser = owner[0];
    if (!ownerUser) throw new Error("تعذر تهيئة حساب المالك.");
    await tx.insert(appOwnerClaims).values({ singletonId: 1, userId: ownerUser.id }).onDuplicateKeyUpdate({ set: { userId: ownerUser.id } });
    return ownerUser;
  });
}

// TODO: add feature queries here as your project grows.
