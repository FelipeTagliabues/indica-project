-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING', 'ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "AuthTokenType" AS ENUM ('EMAIL_CONFIRMATION', 'PASSWORD_RESET');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "passwordHash" VARCHAR(255) NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING',
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "emailConfirmedAt" TIMESTAMPTZ(3),
    "sessionVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_tokens" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "AuthTokenType" NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "sentAt" TIMESTAMPTZ(3),
    "usedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "auth_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_sessions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "verifierHash" CHAR(64) NOT NULL,
    "sessionVersion" INTEGER NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "absoluteExpiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE INDEX "users_status_idx" ON "users"("status");
CREATE UNIQUE INDEX "auth_tokens_tokenHash_key" ON "auth_tokens"("tokenHash");
CREATE INDEX "auth_tokens_userId_type_createdAt_idx" ON "auth_tokens"("userId", "type", "createdAt");
CREATE INDEX "auth_tokens_expiresAt_usedAt_idx" ON "auth_tokens"("expiresAt", "usedAt");
CREATE INDEX "user_sessions_userId_revokedAt_idx" ON "user_sessions"("userId", "revokedAt");
CREATE INDEX "user_sessions_expiresAt_revokedAt_idx" ON "user_sessions"("expiresAt", "revokedAt");

-- AddForeignKey
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Domain constraints not expressible in Prisma Schema Language.
ALTER TABLE "users" ADD CONSTRAINT "users_identity_check"
CHECK (btrim("name") <> '' AND "email" = lower(btrim("email")) AND btrim("passwordHash") <> '');

ALTER TABLE "users" ADD CONSTRAINT "users_confirmation_check"
CHECK (
    ("status" = 'PENDING' AND "emailConfirmedAt" IS NULL) OR
    ("status" IN ('ACTIVE', 'DISABLED') AND "emailConfirmedAt" IS NOT NULL)
);

ALTER TABLE "users" ADD CONSTRAINT "users_session_version_check"
CHECK ("sessionVersion" >= 1);

ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_dates_check"
CHECK (
    "expiresAt" > "createdAt" AND
    ("sentAt" IS NULL OR "sentAt" >= "createdAt") AND
    ("usedAt" IS NULL OR "usedAt" >= "createdAt")
);

ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_dates_check"
CHECK (
    "expiresAt" > "createdAt" AND
    "absoluteExpiresAt" >= "expiresAt" AND
    "lastSeenAt" >= "createdAt" AND
    ("revokedAt" IS NULL OR "revokedAt" >= "createdAt")
);

ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_version_check"
CHECK ("sessionVersion" >= 1 AND btrim("verifierHash") <> '');
