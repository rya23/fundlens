CREATE TYPE "public"."benchmark_kind" AS ENUM('tri', 'index_fund_proxy');--> statement-breakpoint
CREATE TYPE "public"."option_type" AS ENUM('growth', 'idcw');--> statement-breakpoint
CREATE TYPE "public"."plan_type" AS ENUM('direct', 'regular');--> statement-breakpoint
CREATE TABLE "benchmark_nav" (
	"benchmark_id" text NOT NULL,
	"date" date NOT NULL,
	"value" numeric(18, 6) NOT NULL,
	CONSTRAINT "benchmark_nav_benchmark_id_date_pk" PRIMARY KEY("benchmark_id","date")
);
--> statement-breakpoint
CREATE TABLE "benchmarks" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" "benchmark_kind" NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "category_stats" (
	"category" text NOT NULL,
	"metric" text NOT NULL,
	"count" integer NOT NULL,
	"cut_q1" numeric(10, 4),
	"cut_q2" numeric(10, 4),
	"cut_q3" numeric(10, 4),
	"as_of" date NOT NULL,
	CONSTRAINT "category_stats_category_metric_pk" PRIMARY KEY("category","metric")
);
--> statement-breakpoint
CREATE TABLE "ingest_state" (
	"scheme_code" integer PRIMARY KEY NOT NULL,
	"last_nav_date" date,
	"last_attempt_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"last_error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheme_metrics" (
	"scheme_code" integer PRIMARY KEY NOT NULL,
	"as_of" date NOT NULL,
	"nav_last_date" date,
	"cagr_1y" numeric(10, 4),
	"cagr_3y" numeric(10, 4),
	"cagr_5y" numeric(10, 4),
	"cagr_10y" numeric(10, 4),
	"rolling_3y_cagr_median" numeric(10, 4),
	"pct_rolling_3y_beat_benchmark" numeric(10, 4),
	"sharpe_3y" numeric(10, 4),
	"sortino_3y" numeric(10, 4),
	"alpha_3y" numeric(10, 4),
	"beta_3y" numeric(10, 4),
	"r_squared_3y" numeric(10, 4),
	"std_dev_3y" numeric(10, 4),
	"tracking_error_3y" numeric(10, 4),
	"info_ratio_3y" numeric(10, 4),
	"max_drawdown_5y" numeric(10, 4),
	"up_capture_3y" numeric(10, 4),
	"down_capture_3y" numeric(10, 4),
	"sip_xirr_3y" numeric(10, 4),
	"sip_xirr_5y" numeric(10, 4),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schemes" (
	"scheme_code" integer PRIMARY KEY NOT NULL,
	"isin_growth_or_payout" text,
	"isin_reinvestment" text,
	"name" text NOT NULL,
	"amc" text NOT NULL,
	"category" text NOT NULL,
	"sub_category" text,
	"plan" "plan_type" NOT NULL,
	"option" "option_type" NOT NULL,
	"inception_date" date,
	"official_benchmark_name" text,
	"ter_pct" numeric(6, 3),
	"aum_cr" numeric(14, 2),
	"riskometer" text,
	"exit_load" text,
	"managers" text,
	"metadata_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "benchmark_nav" ADD CONSTRAINT "benchmark_nav_benchmark_id_benchmarks_id_fk" FOREIGN KEY ("benchmark_id") REFERENCES "public"."benchmarks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingest_state" ADD CONSTRAINT "ingest_state_scheme_code_schemes_scheme_code_fk" FOREIGN KEY ("scheme_code") REFERENCES "public"."schemes"("scheme_code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheme_metrics" ADD CONSTRAINT "scheme_metrics_scheme_code_schemes_scheme_code_fk" FOREIGN KEY ("scheme_code") REFERENCES "public"."schemes"("scheme_code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scheme_metrics_as_of_idx" ON "scheme_metrics" USING btree ("as_of");--> statement-breakpoint
CREATE INDEX "scheme_metrics_cagr_1y_idx" ON "scheme_metrics" USING btree ("cagr_1y");--> statement-breakpoint
CREATE INDEX "scheme_metrics_cagr_3y_idx" ON "scheme_metrics" USING btree ("cagr_3y");--> statement-breakpoint
CREATE INDEX "scheme_metrics_cagr_5y_idx" ON "scheme_metrics" USING btree ("cagr_5y");--> statement-breakpoint
CREATE INDEX "scheme_metrics_rolling_3y_cagr_median_idx" ON "scheme_metrics" USING btree ("rolling_3y_cagr_median");--> statement-breakpoint
CREATE INDEX "scheme_metrics_sharpe_3y_idx" ON "scheme_metrics" USING btree ("sharpe_3y");--> statement-breakpoint
CREATE INDEX "scheme_metrics_alpha_3y_idx" ON "scheme_metrics" USING btree ("alpha_3y");--> statement-breakpoint
CREATE INDEX "scheme_metrics_beta_3y_idx" ON "scheme_metrics" USING btree ("beta_3y");--> statement-breakpoint
CREATE INDEX "scheme_metrics_max_drawdown_5y_idx" ON "scheme_metrics" USING btree ("max_drawdown_5y");--> statement-breakpoint
CREATE INDEX "schemes_category_idx" ON "schemes" USING btree ("category");--> statement-breakpoint
CREATE INDEX "schemes_sub_category_idx" ON "schemes" USING btree ("sub_category");--> statement-breakpoint
CREATE INDEX "schemes_amc_idx" ON "schemes" USING btree ("amc");--> statement-breakpoint
CREATE INDEX "schemes_plan_option_idx" ON "schemes" USING btree ("plan","option");