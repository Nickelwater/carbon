CREATE TYPE "purchasePriceUpdateTiming" AS ENUM ('Purchase Invoice Post', 'Purchase Order Finalize');

ALTER TABLE "companySettings" ADD COLUMN "purchasePriceUpdateTiming" "purchasePriceUpdateTiming" NOT NULL DEFAULT 'Purchase Invoice Post';
