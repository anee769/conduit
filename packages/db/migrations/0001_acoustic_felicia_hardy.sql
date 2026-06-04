CREATE TABLE "model_pricing" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"input_per_mtok_usd" double precision NOT NULL,
	"output_per_mtok_usd" double precision NOT NULL,
	"cache_read_per_mtok_usd" double precision,
	"cache_write_per_mtok_usd" double precision,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "model_pricing_provider_model_uq" UNIQUE("provider","model")
);
