-- CreateTable
CREATE TABLE "WhatsAppAuthCreds" (
    "userId" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppAuthCreds_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "WhatsAppAuthKey" (
    "userId" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppAuthKey_pkey" PRIMARY KEY ("userId","keyId")
);
