-- CreateTable
CREATE TABLE "Budget_Item" (
    "budget_item_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "Budget_Item_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "Users" ("user_id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Budget_Item_user_id_idx" ON "Budget_Item"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "Budget_Item_user_id_category_key" ON "Budget_Item"("user_id", "category");

