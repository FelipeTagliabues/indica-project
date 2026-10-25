-- Migration inicial preparada com Prisma ORM 7.10.1.
-- REVISÃO OBRIGATÓRIA: este arquivo ainda não foi aplicado a nenhum banco.

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- Extensão padrão do PostgreSQL necessária para impedir vigências sobrepostas.
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- CreateEnum
CREATE TYPE "RecordStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "IndicatorCode" AS ENUM ('NPS', 'TMA_SECONDS', 'CARD_RETENTION', 'CALLBACK_RATE');
CREATE TYPE "ResultStatus" AS ENUM ('ACTIVE', 'CANCELLED');
CREATE TYPE "ImportType" AS ENUM ('OPERATORS', 'RESULTS');
CREATE TYPE "ImportStatus" AS ENUM ('PENDING', 'VALIDATING', 'COMPLETED', 'FAILED');
CREATE TYPE "AuditOperation" AS ENUM ('CREATE', 'UPDATE', 'CORRECTION', 'LOGICAL_CANCEL', 'IMPORT');
CREATE TYPE "AuditActorKind" AS ENUM ('INFORMED', 'AUTHENTICATED');

-- CreateTable
CREATE TABLE "environments" (
    "id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "environments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "skus" (
    "id" UUID NOT NULL,
    "environmentId" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "skus_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "supervisors" (
    "id" UUID NOT NULL,
    "environmentId" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "supervisors_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "operators" (
    "id" UUID NOT NULL,
    "login" VARCHAR(100) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "admissionDate" DATE NOT NULL,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "inactivatedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "operators_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "operator_assignments" (
    "id" UUID NOT NULL,
    "operatorId" UUID NOT NULL,
    "environmentId" UUID NOT NULL,
    "skuId" UUID NOT NULL,
    "supervisorId" UUID NOT NULL,
    "validFrom" DATE NOT NULL,
    "validTo" DATE,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "operator_assignments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "indicator_targets" (
    "id" UUID NOT NULL,
    "environmentId" UUID NOT NULL,
    "skuId" UUID NOT NULL,
    "indicator" "IndicatorCode" NOT NULL,
    "value" DECIMAL(12,4) NOT NULL,
    "validFrom" DATE NOT NULL,
    "validTo" DATE,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "indicator_targets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "daily_results" (
    "id" UUID NOT NULL,
    "assignmentId" UUID NOT NULL,
    "importBatchId" UUID,
    "resultDate" DATE NOT NULL,
    "nps" DECIMAL(7,3),
    "tmaSeconds" INTEGER,
    "cardRetention" DECIMAL(7,3),
    "callbackRate" DECIMAL(7,3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "ResultStatus" NOT NULL DEFAULT 'ACTIVE',
    "cancelledAt" TIMESTAMPTZ(3),
    "cancellationReason" VARCHAR(500),
    "cancelledBy" VARCHAR(160),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "daily_results_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "operational_calendar_rules" (
    "id" UUID NOT NULL,
    "environmentId" UUID NOT NULL,
    "skuId" UUID NOT NULL,
    "validFrom" DATE NOT NULL,
    "validTo" DATE,
    "timezone" VARCHAR(80) NOT NULL,
    "workingWeekdays" INTEGER[],
    "cutoffMinutes" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "operational_calendar_rules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "operational_calendar_exceptions" (
    "id" UUID NOT NULL,
    "calendarRuleId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "isOperational" BOOLEAN NOT NULL,
    "reason" VARCHAR(250),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "operational_calendar_exceptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "import_batches" (
    "id" UUID NOT NULL,
    "environmentId" UUID NOT NULL,
    "skuId" UUID,
    "type" "ImportType" NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'PENDING',
    "originalFileName" VARCHAR(255) NOT NULL,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "acceptedRows" INTEGER NOT NULL DEFAULT 0,
    "rejectedRows" INTEGER NOT NULL DEFAULT 0,
    "actorKind" "AuditActorKind" NOT NULL DEFAULT 'INFORMED',
    "actorIdentifier" VARCHAR(160) NOT NULL,
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMPTZ(3),
    "metadata" JSONB,
    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "import_row_errors" (
    "id" UUID NOT NULL,
    "importBatchId" UUID NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "fieldName" VARCHAR(100),
    "code" VARCHAR(80) NOT NULL,
    "message" VARCHAR(500) NOT NULL,
    "rawValues" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "import_row_errors_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "environmentId" UUID,
    "operation" "AuditOperation" NOT NULL,
    "entityType" VARCHAR(100) NOT NULL,
    "entityId" VARCHAR(100) NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorKind" "AuditActorKind" NOT NULL DEFAULT 'INFORMED',
    "actorIdentifier" VARCHAR(160) NOT NULL,
    "previousValues" JSONB,
    "newValues" JSONB,
    "metadata" JSONB,
    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "environments_code_key" ON "environments"("code");
CREATE INDEX "skus_environmentId_status_idx" ON "skus"("environmentId", "status");
CREATE UNIQUE INDEX "skus_id_environmentId_key" ON "skus"("id", "environmentId");
CREATE UNIQUE INDEX "skus_environmentId_code_key" ON "skus"("environmentId", "code");
CREATE INDEX "supervisors_environmentId_status_idx" ON "supervisors"("environmentId", "status");
CREATE INDEX "supervisors_environmentId_name_idx" ON "supervisors"("environmentId", "name");
CREATE UNIQUE INDEX "supervisors_id_environmentId_key" ON "supervisors"("id", "environmentId");
CREATE UNIQUE INDEX "operators_login_key" ON "operators"("login");
CREATE INDEX "operators_status_idx" ON "operators"("status");
CREATE INDEX "operators_name_idx" ON "operators"("name");
CREATE INDEX "operator_assignments_operatorId_validFrom_validTo_idx" ON "operator_assignments"("operatorId", "validFrom", "validTo");
CREATE INDEX "operator_assignments_environmentId_skuId_supervisorId_valid_idx" ON "operator_assignments"("environmentId", "skuId", "supervisorId", "validFrom", "validTo");
CREATE UNIQUE INDEX "operator_assignments_operatorId_validFrom_key" ON "operator_assignments"("operatorId", "validFrom");
CREATE INDEX "indicator_targets_environmentId_skuId_indicator_validFrom_v_idx" ON "indicator_targets"("environmentId", "skuId", "indicator", "validFrom", "validTo");
CREATE UNIQUE INDEX "indicator_targets_environmentId_skuId_indicator_validFrom_key" ON "indicator_targets"("environmentId", "skuId", "indicator", "validFrom");
CREATE INDEX "daily_results_resultDate_status_idx" ON "daily_results"("resultDate", "status");
CREATE INDEX "daily_results_importBatchId_idx" ON "daily_results"("importBatchId");
CREATE UNIQUE INDEX "daily_results_assignmentId_resultDate_key" ON "daily_results"("assignmentId", "resultDate");
CREATE INDEX "operational_calendar_rules_environmentId_skuId_validFrom_va_idx" ON "operational_calendar_rules"("environmentId", "skuId", "validFrom", "validTo");
CREATE UNIQUE INDEX "operational_calendar_rules_environmentId_skuId_validFrom_key" ON "operational_calendar_rules"("environmentId", "skuId", "validFrom");
CREATE INDEX "operational_calendar_exceptions_date_isOperational_idx" ON "operational_calendar_exceptions"("date", "isOperational");
CREATE UNIQUE INDEX "operational_calendar_exceptions_calendarRuleId_date_key" ON "operational_calendar_exceptions"("calendarRuleId", "date");
CREATE INDEX "import_batches_environmentId_startedAt_idx" ON "import_batches"("environmentId", "startedAt");
CREATE INDEX "import_batches_status_startedAt_idx" ON "import_batches"("status", "startedAt");
CREATE INDEX "import_row_errors_importBatchId_lineNumber_idx" ON "import_row_errors"("importBatchId", "lineNumber");
CREATE INDEX "audit_events_entityType_entityId_occurredAt_idx" ON "audit_events"("entityType", "entityId", "occurredAt");
CREATE INDEX "audit_events_environmentId_occurredAt_idx" ON "audit_events"("environmentId", "occurredAt");
CREATE INDEX "audit_events_actorIdentifier_occurredAt_idx" ON "audit_events"("actorIdentifier", "occurredAt");

-- AddForeignKey
ALTER TABLE "skus" ADD CONSTRAINT "skus_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "environments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supervisors" ADD CONSTRAINT "supervisors_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "environments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "operator_assignments" ADD CONSTRAINT "operator_assignments_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "operators"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "operator_assignments" ADD CONSTRAINT "operator_assignments_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "environments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "operator_assignments" ADD CONSTRAINT "operator_assignments_skuId_environmentId_fkey" FOREIGN KEY ("skuId", "environmentId") REFERENCES "skus"("id", "environmentId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "operator_assignments" ADD CONSTRAINT "operator_assignments_supervisorId_environmentId_fkey" FOREIGN KEY ("supervisorId", "environmentId") REFERENCES "supervisors"("id", "environmentId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "indicator_targets" ADD CONSTRAINT "indicator_targets_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "environments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "indicator_targets" ADD CONSTRAINT "indicator_targets_skuId_environmentId_fkey" FOREIGN KEY ("skuId", "environmentId") REFERENCES "skus"("id", "environmentId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "daily_results" ADD CONSTRAINT "daily_results_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "operator_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "daily_results" ADD CONSTRAINT "daily_results_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "operational_calendar_rules" ADD CONSTRAINT "operational_calendar_rules_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "environments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "operational_calendar_rules" ADD CONSTRAINT "operational_calendar_rules_skuId_environmentId_fkey" FOREIGN KEY ("skuId", "environmentId") REFERENCES "skus"("id", "environmentId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "operational_calendar_exceptions" ADD CONSTRAINT "operational_calendar_exceptions_calendarRuleId_fkey" FOREIGN KEY ("calendarRuleId") REFERENCES "operational_calendar_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "environments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_skuId_environmentId_fkey" FOREIGN KEY ("skuId", "environmentId") REFERENCES "skus"("id", "environmentId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "import_row_errors" ADD CONSTRAINT "import_row_errors_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "environments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Restrições de domínio que o Prisma Schema Language não representa diretamente.
ALTER TABLE "operators" ADD CONSTRAINT "operators_status_inactivation_check"
CHECK (("status" = 'ACTIVE' AND "inactivatedAt" IS NULL) OR ("status" = 'INACTIVE' AND "inactivatedAt" IS NOT NULL));

ALTER TABLE "operator_assignments" ADD CONSTRAINT "operator_assignments_validity_check"
CHECK ("validTo" IS NULL OR "validTo" >= "validFrom");

ALTER TABLE "operator_assignments" ADD CONSTRAINT "operator_assignments_no_overlap"
EXCLUDE USING GIST (
    "operatorId" WITH =,
    daterange("validFrom", COALESCE("validTo", 'infinity'::date), '[]') WITH &&
) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "indicator_targets" ADD CONSTRAINT "indicator_targets_validity_check"
CHECK ("validTo" IS NULL OR "validTo" >= "validFrom");

ALTER TABLE "indicator_targets" ADD CONSTRAINT "indicator_targets_value_check"
CHECK (
    ("indicator" = 'NPS' AND "value" BETWEEN -100 AND 100) OR
    ("indicator" = 'TMA_SECONDS' AND "value" >= 0 AND "value" = trunc("value")) OR
    ("indicator" IN ('CARD_RETENTION', 'CALLBACK_RATE') AND "value" BETWEEN 0 AND 100)
);

ALTER TABLE "indicator_targets" ADD CONSTRAINT "indicator_targets_no_overlap"
EXCLUDE USING GIST (
    "environmentId" WITH =,
    "skuId" WITH =,
    "indicator" WITH =,
    daterange("validFrom", COALESCE("validTo", 'infinity'::date), '[]') WITH &&
) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "daily_results" ADD CONSTRAINT "daily_results_values_check"
CHECK (
    ("nps" IS NULL OR "nps" BETWEEN -100 AND 100) AND
    ("tmaSeconds" IS NULL OR "tmaSeconds" >= 0) AND
    ("cardRetention" IS NULL OR "cardRetention" BETWEEN 0 AND 100) AND
    ("callbackRate" IS NULL OR "callbackRate" BETWEEN 0 AND 100)
);

ALTER TABLE "daily_results" ADD CONSTRAINT "daily_results_has_value_check"
CHECK (num_nonnulls("nps", "tmaSeconds", "cardRetention", "callbackRate") >= 1);

ALTER TABLE "daily_results" ADD CONSTRAINT "daily_results_version_check"
CHECK ("version" >= 1);

ALTER TABLE "daily_results" ADD CONSTRAINT "daily_results_cancellation_check"
CHECK (
    ("status" = 'ACTIVE' AND "cancelledAt" IS NULL AND "cancellationReason" IS NULL AND "cancelledBy" IS NULL) OR
    ("status" = 'CANCELLED' AND "cancelledAt" IS NOT NULL AND "cancellationReason" IS NOT NULL AND btrim("cancellationReason") <> '' AND "cancelledBy" IS NOT NULL AND btrim("cancelledBy") <> '')
);

ALTER TABLE "operational_calendar_rules" ADD CONSTRAINT "operational_calendar_rules_validity_check"
CHECK ("validTo" IS NULL OR "validTo" >= "validFrom");

ALTER TABLE "operational_calendar_rules" ADD CONSTRAINT "operational_calendar_rules_weekdays_check"
CHECK ("workingWeekdays" IS NOT NULL AND cardinality("workingWeekdays") BETWEEN 1 AND 7 AND "workingWeekdays" <@ ARRAY[0,1,2,3,4,5,6]);

ALTER TABLE "operational_calendar_rules" ADD CONSTRAINT "operational_calendar_rules_cutoff_check"
CHECK ("cutoffMinutes" IS NULL OR "cutoffMinutes" BETWEEN 0 AND 1439);

ALTER TABLE "operational_calendar_rules" ADD CONSTRAINT "operational_calendar_rules_no_overlap"
EXCLUDE USING GIST (
    "environmentId" WITH =,
    "skuId" WITH =,
    daterange("validFrom", COALESCE("validTo", 'infinity'::date), '[]') WITH &&
) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_counts_check"
CHECK ("totalRows" >= 0 AND "acceptedRows" >= 0 AND "rejectedRows" >= 0 AND "acceptedRows" + "rejectedRows" <= "totalRows");

ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_finished_at_check"
CHECK ("finishedAt" IS NULL OR "finishedAt" >= "startedAt");

ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_status_finished_check"
CHECK (
    ("status" IN ('PENDING', 'VALIDATING') AND "finishedAt" IS NULL) OR
    ("status" IN ('COMPLETED', 'FAILED') AND "finishedAt" IS NOT NULL)
);

ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_actor_check"
CHECK (btrim("originalFileName") <> '' AND btrim("actorIdentifier") <> '');

ALTER TABLE "import_row_errors" ADD CONSTRAINT "import_row_errors_line_number_check"
CHECK ("lineNumber" >= 1 AND btrim("code") <> '' AND btrim("message") <> '');

ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_identity_check"
CHECK (btrim("entityType") <> '' AND btrim("entityId") <> '' AND btrim("actorIdentifier") <> '');

ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_change_values_check"
CHECK (
    "operation" NOT IN ('UPDATE', 'CORRECTION', 'LOGICAL_CANCEL') OR
    ("previousValues" IS NOT NULL AND "newValues" IS NOT NULL)
);

-- Garante que o resultado sempre aponte para uma atribuição válida na data informada.
CREATE FUNCTION "validate_daily_result_assignment_period"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    assignment_from DATE;
    assignment_to DATE;
    assignment_environment UUID;
    assignment_sku UUID;
    batch_environment UUID;
    batch_sku UUID;
    batch_type "ImportType";
BEGIN
    SELECT "validFrom", "validTo", "environmentId", "skuId"
      INTO assignment_from, assignment_to, assignment_environment, assignment_sku
      FROM "operator_assignments"
     WHERE "id" = NEW."assignmentId"
       FOR SHARE;

    IF NOT FOUND OR NEW."resultDate" < assignment_from OR (assignment_to IS NOT NULL AND NEW."resultDate" > assignment_to) THEN
        RAISE EXCEPTION 'Resultado fora da vigência da atribuição.'
            USING ERRCODE = '23514', CONSTRAINT = 'daily_results_assignment_period_check';
    END IF;

    IF NEW."importBatchId" IS NOT NULL THEN
        SELECT "environmentId", "skuId", "type"
          INTO batch_environment, batch_sku, batch_type
          FROM "import_batches"
         WHERE "id" = NEW."importBatchId"
           FOR SHARE;

        IF NOT FOUND
           OR batch_type <> 'RESULTS'
           OR batch_environment <> assignment_environment
           OR (batch_sku IS NOT NULL AND batch_sku <> assignment_sku) THEN
            RAISE EXCEPTION 'Lote de importação incompatível com a atribuição do resultado.'
                USING ERRCODE = '23514', CONSTRAINT = 'daily_results_import_batch_scope_check';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "daily_results_assignment_period_trigger"
BEFORE INSERT OR UPDATE OF "assignmentId", "resultDate", "importBatchId"
ON "daily_results"
FOR EACH ROW
EXECUTE FUNCTION "validate_daily_result_assignment_period"();

-- Impede que alterações retroativas desvinculem resultados já registrados da atribuição histórica.
CREATE FUNCTION "protect_assignment_result_period"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM "daily_results" WHERE "assignmentId" = OLD."id") THEN
        IF NEW."operatorId" IS DISTINCT FROM OLD."operatorId"
           OR NEW."environmentId" IS DISTINCT FROM OLD."environmentId"
           OR NEW."skuId" IS DISTINCT FROM OLD."skuId"
           OR NEW."supervisorId" IS DISTINCT FROM OLD."supervisorId" THEN
            RAISE EXCEPTION 'A identidade de uma atribuição com resultados não pode ser alterada.'
                USING ERRCODE = '23514', CONSTRAINT = 'operator_assignments_history_identity_check';
        END IF;

        IF EXISTS (
            SELECT 1
              FROM "daily_results"
             WHERE "assignmentId" = OLD."id"
               AND ("resultDate" < NEW."validFrom" OR (NEW."validTo" IS NOT NULL AND "resultDate" > NEW."validTo"))
        ) THEN
            RAISE EXCEPTION 'A nova vigência exclui resultados existentes da atribuição.'
                USING ERRCODE = '23514', CONSTRAINT = 'operator_assignments_history_period_check';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "operator_assignments_history_trigger"
BEFORE UPDATE OF "operatorId", "environmentId", "skuId", "supervisorId", "validFrom", "validTo"
ON "operator_assignments"
FOR EACH ROW
EXECUTE FUNCTION "protect_assignment_result_period"();

-- Toda correção ou cancelamento incrementa a versão usada pelo backend para controle otimista.
CREATE FUNCTION "increment_daily_result_version"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW."version" := OLD."version" + 1;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "daily_results_version_trigger"
BEFORE UPDATE
ON "daily_results"
FOR EACH ROW
EXECUTE FUNCTION "increment_daily_result_version"();
