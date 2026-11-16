-- CreateTable
CREATE TABLE "Room" (
    "code" TEXT NOT NULL,
    "hostId" TEXT,
    "settings" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'lobby',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "RoomSnapshot" (
    "code" TEXT NOT NULL,
    "state" JSONB NOT NULL,
    "phase" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoomSnapshot_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL,
    "roomCode" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "seat" INTEGER NOT NULL,
    "isBot" BOOLEAN NOT NULL DEFAULT false,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "roomCode" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "seed" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "results" JSONB,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Round" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "storm" BOOLEAN NOT NULL DEFAULT false,
    "events" JSONB NOT NULL,
    "publicNews" JSONB NOT NULL,
    "clues" JSONB NOT NULL,
    "prices" JSONB NOT NULL,
    "execution" JSONB NOT NULL,
    "nextPrices" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Round_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "orders" JSONB NOT NULL,
    "bid" INTEGER,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "fromPlayer" TEXT NOT NULL,
    "toPlayer" TEXT NOT NULL,
    "give" JSONB NOT NULL,
    "receive" JSONB NOT NULL,

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClueSale" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "price" INTEGER NOT NULL,

    CONSTRAINT "ClueSale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Claim" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "good" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "evaluation" JSONB NOT NULL,

    CONSTRAINT "Claim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Auction" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "contract" JSONB NOT NULL,
    "bids" JSONB NOT NULL,
    "winnerId" TEXT,
    "outcome" JSONB NOT NULL,

    CONSTRAINT "Auction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Player_roomCode_idx" ON "Player"("roomCode");

-- CreateIndex
CREATE INDEX "Match_roomCode_idx" ON "Match"("roomCode");

-- CreateIndex
CREATE UNIQUE INDEX "Round_matchId_number_key" ON "Round"("matchId", "number");

-- CreateIndex
CREATE INDEX "Order_roundId_idx" ON "Order"("roundId");

-- CreateIndex
CREATE INDEX "Trade_roundId_idx" ON "Trade"("roundId");

-- CreateIndex
CREATE INDEX "ClueSale_roundId_idx" ON "ClueSale"("roundId");

-- CreateIndex
CREATE INDEX "Claim_roundId_idx" ON "Claim"("roundId");

-- CreateIndex
CREATE UNIQUE INDEX "Auction_roundId_key" ON "Auction"("roundId");

-- AddForeignKey
ALTER TABLE "RoomSnapshot" ADD CONSTRAINT "RoomSnapshot_code_fkey" FOREIGN KEY ("code") REFERENCES "Room"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_roomCode_fkey" FOREIGN KEY ("roomCode") REFERENCES "Room"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_roomCode_fkey" FOREIGN KEY ("roomCode") REFERENCES "Room"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Round" ADD CONSTRAINT "Round_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClueSale" ADD CONSTRAINT "ClueSale_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Auction" ADD CONSTRAINT "Auction_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

