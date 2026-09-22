-- CreateTable
CREATE TABLE "Financial_Profile" (
    "profile_id" TEXT NOT NULL PRIMARY KEY,
    "user_id" INTEGER NOT NULL,
    "monthly_income" REAL NOT NULL,
    "monthly_expenses" REAL NOT NULL,
    "savings" REAL NOT NULL,
    "credit_score" INTEGER NOT NULL,
    "financial_goal" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "Financial_Profile_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "Users" ("user_id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Risk_Assessment" (
    "assessment_id" TEXT NOT NULL PRIMARY KEY,
    "profile_id" TEXT NOT NULL,
    "risk_level" TEXT NOT NULL,
    "risk_score" REAL NOT NULL,
    "low_probability" REAL NOT NULL,
    "medium_probability" REAL NOT NULL,
    "high_probability" REAL NOT NULL,
    "prediction_date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "model_name" TEXT NOT NULL,
    "model_version" TEXT NOT NULL,
    "target_version" TEXT NOT NULL,
    "target_status" TEXT NOT NULL,
    "explanation_method" TEXT NOT NULL,
    "input_snapshot_json" TEXT NOT NULL,
    "indicators_json" TEXT NOT NULL,
    "warnings_json" TEXT NOT NULL DEFAULT '[]',
    CONSTRAINT "Risk_Assessment_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "Financial_Profile" ("profile_id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Risk_Driver" (
    "driver_id" TEXT NOT NULL PRIMARY KEY,
    "assessment_id" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "feature_name" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "importance" REAL NOT NULL,
    "influence" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "feature_value" TEXT NOT NULL,
    CONSTRAINT "Risk_Driver_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "Risk_Assessment" ("assessment_id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Recommendation" (
    "recommendation_id" TEXT NOT NULL PRIMARY KEY,
    "assessment_id" TEXT NOT NULL,
    "recommendation_type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "recommendation_text" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "priority_rank" INTEGER NOT NULL,
    "rule_id" TEXT NOT NULL,
    "trace_json" TEXT NOT NULL,
    "rules_version" TEXT NOT NULL,
    "created_date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Recommendation_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "Risk_Assessment" ("assessment_id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Financial_Profile_user_id_key" ON "Financial_Profile"("user_id");

-- CreateIndex
CREATE INDEX "Risk_Assessment_profile_id_prediction_date_idx" ON "Risk_Assessment"("profile_id", "prediction_date");

-- CreateIndex
CREATE INDEX "Risk_Driver_assessment_id_idx" ON "Risk_Driver"("assessment_id");

-- CreateIndex
CREATE INDEX "Recommendation_assessment_id_idx" ON "Recommendation"("assessment_id");

