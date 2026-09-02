-- CreateTable
CREATE TABLE "EventReminder" (
    "userId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventReminder_pkey" PRIMARY KEY ("userId","eventId","kind")
);

-- CreateTable
CREATE TABLE "WhatsAppDigestLog" (
    "userId" TEXT NOT NULL,
    "sentOn" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppDigestLog_pkey" PRIMARY KEY ("userId","sentOn")
);

-- CreateIndex
CREATE INDEX "EventReminder_userId_idx" ON "EventReminder"("userId");
