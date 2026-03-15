import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";

type HostedSupabaseClient = SupabaseClient<Database>;
type CreditLedgerRow = Database["public"]["Tables"]["credit_ledger"]["Row"];

export async function applyHostedCreditLedgerEntry(params: {
  supabase: HostedSupabaseClient;
  userId: string;
  deltaCredits: number;
  reason:
    | "purchase"
    | "purchase_refund"
    | "generation_hold"
    | "generation_settlement"
    | "generation_refund"
    | "admin_adjustment";
  relatedRunId?: string | null;
  idempotencyKey?: string | null;
  sourceEventId?: string | null;
  metadata?: Record<string, unknown>;
  allowNegativeBalance?: boolean;
  activeCreditPack?: number | null;
}) {
  const { data, error } = await params.supabase.rpc(
    "apply_tryplayground_credit_ledger_entry",
    {
      p_user_id: params.userId,
      p_delta_credits: params.deltaCredits,
      p_reason: params.reason,
      p_related_run_id: params.relatedRunId ?? undefined,
      p_idempotency_key: params.idempotencyKey ?? undefined,
      p_source_event_id: params.sourceEventId ?? undefined,
      p_metadata: (params.metadata ?? {}) as Json,
      p_allow_negative_balance: params.allowNegativeBalance ?? false,
      p_active_credit_pack: params.activeCreditPack ?? undefined,
    }
  );

  if (error) {
    throw new Error(error.message);
  }

  const ledger = Array.isArray(data) ? data[0] : data;
  if (!ledger) {
    throw new Error("The hosted credit ledger RPC did not return a row.");
  }

  return ledger as CreditLedgerRow;
}
