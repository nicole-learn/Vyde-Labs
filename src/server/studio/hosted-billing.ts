import "server-only";

import type Stripe from "stripe";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  buildHostedStripeCheckoutIdempotencyKey,
  calculateHostedRefundAdjustment,
} from "@/server/studio/hosted-billing-logic";
import { applyHostedCreditLedgerEntry } from "@/server/studio/hosted-billing-core";
import {
  getStripeKeyMode,
  getStripeWebhookSecret,
  isStripeCheckoutConfigured,
  isStripeWebhookConfigured,
} from "@/lib/stripe/env";
import { getStripeServerClient } from "@/lib/stripe/server";

const HOSTED_CREDIT_PACK_SLUG = "hosted-100-credits";

type HostedSupabaseClient = SupabaseClient<Database>;
type BillingCustomerRow = Database["public"]["Tables"]["billing_customers"]["Row"];
type CreditPackRow = Database["public"]["Tables"]["credit_packs"]["Row"];
type CreditPurchaseRow = Database["public"]["Tables"]["credit_purchases"]["Row"];
type StripeWebhookEventRow =
  Database["public"]["Tables"]["stripe_webhook_events"]["Row"];

function ensureStripeClient() {
  if (!isStripeCheckoutConfigured()) {
    throw new Error("Stripe is not configured yet. Add STRIPE_SECRET_KEY first.");
  }

  const stripe = getStripeServerClient();
  const keyMode = getStripeKeyMode();

  if (!stripe || !keyMode) {
    throw new Error("Stripe secret key format is invalid.");
  }

  return {
    stripe,
    keyMode,
    livemode: keyMode === "live",
  };
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function parseObjectJson(value: Json, fallback: Record<string, unknown> = {}) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : fallback;
}

function sanitizeRelativePath(path: string | undefined, fallback: string) {
  const candidate = (path ?? "").trim();
  if (!candidate.startsWith("/") || candidate.startsWith("//")) {
    return fallback;
  }

  return candidate;
}

function resolveBaseUrl(request: Request) {
  const nextUrl = new URL(request.url);
  return nextUrl.origin.replace(/\/+$/, "");
}

function buildSuccessUrl(baseUrl: string, path: string) {
  const targetPath = sanitizeRelativePath(path, "/?checkout=success");
  const separator = targetPath.includes("?") ? "&" : "?";
  return `${baseUrl}${targetPath}${separator}checkout=success&session_id={CHECKOUT_SESSION_ID}`;
}

function buildCancelUrl(baseUrl: string, path: string) {
  const targetPath = sanitizeRelativePath(path, "/?checkout=cancelled");
  const separator = targetPath.includes("?") ? "&" : "?";
  return `${baseUrl}${targetPath}${separator}checkout=cancelled`;
}

function toStripeCustomerId(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined
) {
  if (!customer) {
    return null;
  }

  return typeof customer === "string" ? customer : customer.id;
}

function toStripePaymentIntentId(
  paymentIntent: string | Stripe.PaymentIntent | null | undefined
) {
  if (!paymentIntent) {
    return null;
  }

  return typeof paymentIntent === "string" ? paymentIntent : paymentIntent.id;
}

function toStripeChargeId(charge: string | Stripe.Charge | null | undefined) {
  if (!charge) {
    return null;
  }

  return typeof charge === "string" ? charge : charge.id;
}

async function getHostedCreditPack(
  supabase: HostedSupabaseClient,
  slug: string = HOSTED_CREDIT_PACK_SLUG
) {
  const { data, error } = await supabase
    .from("credit_packs")
    .select("*")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Could not load the hosted credit pack.");
  }

  return data satisfies CreditPackRow;
}

function resolveHostedCreditPackStripePrice(
  creditPack: CreditPackRow,
  livemode: boolean
) {
  const stripePriceId = livemode
    ? creditPack.stripe_price_id_live
    : creditPack.stripe_price_id_test;
  const stripeProductId = livemode
    ? creditPack.stripe_product_id_live
    : creditPack.stripe_product_id_test;

  if (!stripePriceId) {
    throw new Error(
      livemode
        ? "The live Stripe price id for the hosted credit pack is missing."
        : "The test Stripe price id for the hosted credit pack is missing."
    );
  }

  return {
    stripePriceId,
    stripeProductId,
  };
}

async function getBillingCustomerForUser(params: {
  supabase: HostedSupabaseClient;
  userId: string;
  livemode: boolean;
}) {
  const { data, error } = await params.supabase
    .from("billing_customers")
    .select("*")
    .eq("user_id", params.userId)
    .eq("livemode", params.livemode)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as BillingCustomerRow | null;
}

async function upsertBillingCustomer(params: {
  supabase: HostedSupabaseClient;
  userId: string;
  stripeCustomerId: string;
  livemode: boolean;
  metadata?: Record<string, unknown>;
}) {
  const now = new Date().toISOString();
  const { error } = await params.supabase.from("billing_customers").upsert(
    {
      user_id: params.userId,
      stripe_customer_id: params.stripeCustomerId,
      livemode: params.livemode,
      metadata: (params.metadata ?? {}) as Json,
      updated_at: now,
    },
    {
      onConflict: "user_id,livemode",
    }
  );

  if (error) {
    throw new Error(error.message);
  }
}

async function getOrCreateStripeCustomer(params: {
  supabase: HostedSupabaseClient;
  user: User;
  stripe: Stripe;
  livemode: boolean;
}) {
  const existing = await getBillingCustomerForUser({
    supabase: params.supabase,
    userId: params.user.id,
    livemode: params.livemode,
  });

  if (existing?.stripe_customer_id) {
    return existing.stripe_customer_id;
  }

  const displayName =
    String(params.user.user_metadata.full_name ?? "").trim() ||
    String(params.user.user_metadata.name ?? "").trim() ||
    (params.user.email?.split("@")[0] ?? "TryPlayground User");

  const customer = await params.stripe.customers.create({
    email: params.user.email ?? undefined,
    name: displayName,
    metadata: {
      tryplayground_user_id: params.user.id,
    },
  });

  await upsertBillingCustomer({
    supabase: params.supabase,
    userId: params.user.id,
    stripeCustomerId: customer.id,
    livemode: customer.livemode,
    metadata: {
      source: "hosted_billing.checkout",
    },
  });

  return customer.id;
}

async function createPendingCreditPurchase(params: {
  supabase: HostedSupabaseClient;
  userId: string;
  creditPack: CreditPackRow;
  livemode: boolean;
  checkoutRequestId?: string;
  metadata?: Record<string, unknown>;
}) {
  if (params.checkoutRequestId) {
    const existing = await findCreditPurchaseByCheckoutRequestId({
      supabase: params.supabase,
      userId: params.userId,
      checkoutRequestId: params.checkoutRequestId,
    });

    if (existing) {
      return existing;
    }
  }

  const { data, error } = await params.supabase
    .from("credit_purchases")
    .insert({
      user_id: params.userId,
      credit_pack_id: params.creditPack.id,
      quantity: 1,
      credits_amount: params.creditPack.credits,
      amount_cents: params.creditPack.price_cents,
      currency: params.creditPack.currency,
      status: "pending",
      livemode: params.livemode,
      checkout_request_id: params.checkoutRequestId ?? null,
      metadata: (params.metadata ?? {}) as Json,
    })
    .select("*")
    .single();

  if (error?.code === "23505" && params.checkoutRequestId) {
    const existing = await findCreditPurchaseByCheckoutRequestId({
      supabase: params.supabase,
      userId: params.userId,
      checkoutRequestId: params.checkoutRequestId,
    });

    if (existing) {
      return existing;
    }
  }

  if (error || !data) {
    throw new Error(error?.message ?? "Could not create the hosted credit purchase.");
  }

  return data satisfies CreditPurchaseRow;
}

async function updateCreditPurchase(params: {
  supabase: HostedSupabaseClient;
  purchaseId: string;
  patch: Database["public"]["Tables"]["credit_purchases"]["Update"];
}) {
  const { data, error } = await params.supabase
    .from("credit_purchases")
    .update(params.patch)
    .eq("id", params.purchaseId)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Could not update the hosted credit purchase.");
  }

  return data satisfies CreditPurchaseRow;
}

async function findCreditPurchaseByCheckoutSessionId(params: {
  supabase: HostedSupabaseClient;
  checkoutSessionId: string;
}) {
  const { data, error } = await params.supabase
    .from("credit_purchases")
    .select("*")
    .eq("stripe_checkout_session_id", params.checkoutSessionId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as CreditPurchaseRow | null;
}

async function findCreditPurchaseByCheckoutRequestId(params: {
  supabase: HostedSupabaseClient;
  userId: string;
  checkoutRequestId: string;
}) {
  const { data, error } = await params.supabase
    .from("credit_purchases")
    .select("*")
    .eq("user_id", params.userId)
    .eq("checkout_request_id", params.checkoutRequestId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as CreditPurchaseRow | null;
}

async function findCreditPurchaseByPaymentIntentId(params: {
  supabase: HostedSupabaseClient;
  paymentIntentId: string;
}) {
  const { data, error } = await params.supabase
    .from("credit_purchases")
    .select("*")
    .eq("stripe_payment_intent_id", params.paymentIntentId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as CreditPurchaseRow | null;
}

async function findCreditPurchaseByChargeId(params: {
  supabase: HostedSupabaseClient;
  chargeId: string;
}) {
  const { data, error } = await params.supabase
    .from("credit_purchases")
    .select("*")
    .eq("stripe_charge_id", params.chargeId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as CreditPurchaseRow | null;
}

export async function deleteHostedBillingCustomersForUser(params: {
  supabase: HostedSupabaseClient;
  userId: string;
}) {
  const { data, error } = await params.supabase
    .from("billing_customers")
    .select("*")
    .eq("user_id", params.userId);

  if (error) {
    throw new Error(error.message);
  }

  if (!data || data.length === 0 || !isStripeCheckoutConfigured()) {
    return;
  }

  const { stripe } = ensureStripeClient();

  for (const customer of data as BillingCustomerRow[]) {
    try {
      await stripe.customers.del(customer.stripe_customer_id);
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "resource_missing"
      ) {
        continue;
      }

      throw error;
    }
  }
}

async function fulfillCreditPurchase(params: {
  supabase: HostedSupabaseClient;
  purchaseId: string;
  stripeCheckoutSessionId: string;
  stripePaymentIntentId: string | null;
  stripeChargeId: string | null;
  stripeCustomerId: string | null;
  sourceEventId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const { data, error } = await params.supabase.rpc(
    "fulfill_tryplayground_credit_purchase",
    {
      p_purchase_id: params.purchaseId,
      p_stripe_checkout_session_id: params.stripeCheckoutSessionId,
      p_stripe_payment_intent_id: params.stripePaymentIntentId ?? undefined,
      p_stripe_charge_id: params.stripeChargeId ?? undefined,
      p_stripe_customer_id: params.stripeCustomerId ?? undefined,
      p_source_event_id: params.sourceEventId ?? undefined,
      p_metadata: (params.metadata ?? {}) as Json,
    }
  );

  if (error) {
    throw new Error(error.message);
  }

  const purchase = Array.isArray(data) ? data[0] : data;
  if (!purchase) {
    throw new Error("The hosted credit purchase fulfillment RPC returned no row.");
  }

  return purchase as CreditPurchaseRow;
}

async function recordStripeWebhookEvent(params: {
  supabase: HostedSupabaseClient;
  stripeEventId: string;
  eventType: string;
  livemode: boolean;
  payload: Record<string, unknown>;
}) {
  const existingResult = await params.supabase
    .from("stripe_webhook_events")
    .select("*")
    .eq("stripe_event_id", params.stripeEventId)
    .maybeSingle();

  if (existingResult.error) {
    throw new Error(existingResult.error.message);
  }

  if (existingResult.data) {
    return {
      row: existingResult.data as StripeWebhookEventRow,
      duplicate: true,
    };
  }

  const { data, error } = await params.supabase
    .from("stripe_webhook_events")
    .insert({
      stripe_event_id: params.stripeEventId,
      event_type: params.eventType,
      livemode: params.livemode,
      status: "processing",
      payload: params.payload as Json,
    })
    .select("*")
    .single();

  if (error?.code === "23505") {
    const duplicateResult = await params.supabase
      .from("stripe_webhook_events")
      .select("*")
      .eq("stripe_event_id", params.stripeEventId)
      .single();

    if (duplicateResult.error || !duplicateResult.data) {
      throw new Error(
        duplicateResult.error?.message ??
          "Could not load the duplicate Stripe webhook event."
      );
    }

    return {
      row: duplicateResult.data as StripeWebhookEventRow,
      duplicate: true,
    };
  }

  if (error || !data) {
    throw new Error(error?.message ?? "Could not record the Stripe webhook event.");
  }

  return {
    row: data satisfies StripeWebhookEventRow,
    duplicate: false,
  };
}

async function markStripeWebhookEventProcessed(params: {
  supabase: HostedSupabaseClient;
  webhookEventId: string;
}) {
  const { error } = await params.supabase
    .from("stripe_webhook_events")
    .update({
      status: "processed",
      error_message: null,
      processed_at: new Date().toISOString(),
    })
    .eq("id", params.webhookEventId);

  if (error) {
    throw new Error(error.message);
  }
}

async function markStripeWebhookEventFailed(params: {
  supabase: HostedSupabaseClient;
  webhookEventId: string;
  errorMessage: string;
}) {
  const { error } = await params.supabase
    .from("stripe_webhook_events")
    .update({
      status: "failed",
      error_message: params.errorMessage.slice(0, 2000),
    })
    .eq("id", params.webhookEventId);

  if (error) {
    throw new Error(error.message);
  }
}

async function resolveStripeChargeId(params: {
  stripe: Stripe;
  paymentIntentId: string | null;
}) {
  if (!params.paymentIntentId) {
    return null;
  }

  const paymentIntent = await params.stripe.paymentIntents.retrieve(
    params.paymentIntentId,
    {
      expand: ["latest_charge"],
    }
  );

  return toStripeChargeId(paymentIntent.latest_charge);
}

async function resolveCreditPurchaseFromCheckoutSession(params: {
  supabase: HostedSupabaseClient;
  session: Stripe.Checkout.Session;
}) {
  const metadata = params.session.metadata ?? {};
  const purchaseId = String(metadata.tryplayground_credit_purchase_id ?? "").trim();

  if (purchaseId) {
    const { data, error } = await params.supabase
      .from("credit_purchases")
      .select("*")
      .eq("id", purchaseId)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (data) {
      return data as CreditPurchaseRow;
    }
  }

  return findCreditPurchaseByCheckoutSessionId({
    supabase: params.supabase,
    checkoutSessionId: params.session.id,
  });
}

async function refundCreditPurchaseFromCharge(params: {
  supabase: HostedSupabaseClient;
  charge: Stripe.Charge;
  eventId: string;
}) {
  const chargeId = params.charge.id;
  const paymentIntentId =
    typeof params.charge.payment_intent === "string"
      ? params.charge.payment_intent
      : params.charge.payment_intent?.id ?? null;
  const latestRefundId = params.charge.refunds?.data?.[0]?.id ?? null;

  const purchase =
    (await findCreditPurchaseByChargeId({
      supabase: params.supabase,
      chargeId,
    })) ??
    (paymentIntentId
      ? await findCreditPurchaseByPaymentIntentId({
          supabase: params.supabase,
          paymentIntentId,
        })
      : null);

  if (!purchase || purchase.status === "refunded") {
    return purchase;
  }

  const refundAdjustment = calculateHostedRefundAdjustment({
    purchaseAmountCents: purchase.amount_cents,
    purchaseCredits: purchase.credits_amount,
    refundedAmountCents: purchase.refunded_amount_cents,
    refundedCredits: purchase.refunded_credits,
    targetRefundAmountCents: params.charge.amount_refunded,
  });

  if (refundAdjustment.deltaCredits <= 0) {
    if (
      purchase.refunded_amount_cents !== refundAdjustment.nextRefundedAmountCents ||
      purchase.refunded_credits !== refundAdjustment.nextRefundedCredits
    ) {
      await updateCreditPurchase({
        supabase: params.supabase,
        purchaseId: purchase.id,
        patch: {
          refunded_amount_cents: refundAdjustment.nextRefundedAmountCents,
          refunded_credits: refundAdjustment.nextRefundedCredits,
          status: refundAdjustment.fullyRefunded ? "refunded" : purchase.status,
          stripe_charge_id: chargeId,
          stripe_payment_intent_id: paymentIntentId,
          stripe_refund_id: latestRefundId,
          refunded_at: new Date().toISOString(),
        },
      });
    }

    return purchase;
  }

  const refundLedger = await applyHostedCreditLedgerEntry({
    supabase: params.supabase,
    userId: purchase.user_id,
    deltaCredits: -refundAdjustment.deltaCredits,
    reason: "purchase_refund",
    idempotencyKey: `stripe:credit_purchase:${purchase.id}:refund:amount:${refundAdjustment.nextRefundedAmountCents}`,
    sourceEventId: `stripe.event:${params.eventId}`,
    metadata: {
      credit_purchase_id: purchase.id,
      stripe_charge_id: chargeId,
      stripe_payment_intent_id: paymentIntentId,
      stripe_refund_id: latestRefundId,
      refunded_amount_cents: refundAdjustment.nextRefundedAmountCents,
      refunded_credits: refundAdjustment.nextRefundedCredits,
    },
    allowNegativeBalance: true,
  });

  await updateCreditPurchase({
    supabase: params.supabase,
    purchaseId: purchase.id,
    patch: {
      status: refundAdjustment.fullyRefunded ? "refunded" : purchase.status,
      refunded_amount_cents: refundAdjustment.nextRefundedAmountCents,
      refunded_credits: refundAdjustment.nextRefundedCredits,
      stripe_charge_id: chargeId,
      stripe_payment_intent_id: paymentIntentId,
      stripe_refund_id: latestRefundId,
      refund_ledger_entry_id: refundLedger.id,
      refunded_at: new Date().toISOString(),
      metadata: {
        ...parseObjectJson(purchase.metadata),
        refunded_by_event: params.eventId,
        refunded_amount_cents: refundAdjustment.nextRefundedAmountCents,
        refunded_credits: refundAdjustment.nextRefundedCredits,
      } as Json,
    },
  });

  return purchase;
}

export async function createHostedCreditCheckoutSession(params: {
  request: Request;
  supabase: HostedSupabaseClient;
  user: User;
  successPath?: string;
  cancelPath?: string;
  checkoutRequestId?: string;
}) {
  const { livemode, stripe } = ensureStripeClient();
  const baseUrl = resolveBaseUrl(params.request);
  const creditPack = await getHostedCreditPack(params.supabase);
  const { stripePriceId } = resolveHostedCreditPackStripePrice(creditPack, livemode);
  const stripeCustomerId = await getOrCreateStripeCustomer({
    supabase: params.supabase,
    user: params.user,
    stripe,
    livemode,
  });

  let purchase = await createPendingCreditPurchase({
    supabase: params.supabase,
    userId: params.user.id,
    creditPack,
    livemode,
    checkoutRequestId: params.checkoutRequestId,
    metadata: {
      source: "hosted_billing.checkout",
    },
  });

  if (purchase.status === "completed" || purchase.status === "refunded") {
    throw new Error("This hosted checkout request has already been completed.");
  }

  if (purchase.status !== "pending") {
    purchase = await updateCreditPurchase({
      supabase: params.supabase,
      purchaseId: purchase.id,
      patch: {
        status: "pending",
        stripe_checkout_url: null,
        metadata: {
          ...parseObjectJson(purchase.metadata),
          checkout_restarted_at: new Date().toISOString(),
        } as Json,
      },
    });
  }

  if (
    purchase.status === "pending" &&
    purchase.stripe_checkout_session_id &&
    purchase.stripe_checkout_url
  ) {
    return {
      checkoutUrl: purchase.stripe_checkout_url,
      purchaseId: purchase.id,
      checkoutSessionId: purchase.stripe_checkout_session_id,
    };
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: stripeCustomerId,
      client_reference_id: purchase.id,
      success_url: buildSuccessUrl(baseUrl, params.successPath ?? "/"),
      cancel_url: buildCancelUrl(baseUrl, params.cancelPath ?? "/"),
      payment_method_types: ["card"],
      allow_promotion_codes: false,
      line_items: [
        {
          price: stripePriceId,
          quantity: 1,
        },
      ],
      metadata: {
        tryplayground_checkout_mode: "credit_pack",
        tryplayground_credit_pack_slug: creditPack.slug,
        tryplayground_credit_purchase_id: purchase.id,
        tryplayground_user_id: params.user.id,
      },
    }, {
      idempotencyKey: buildHostedStripeCheckoutIdempotencyKey(purchase.id),
    });

    await updateCreditPurchase({
      supabase: params.supabase,
      purchaseId: purchase.id,
      patch: {
        checkout_request_id: params.checkoutRequestId ?? purchase.checkout_request_id,
        stripe_checkout_url: session.url,
        stripe_checkout_session_id: session.id,
        stripe_customer_id: stripeCustomerId,
        metadata: {
          ...parseObjectJson(purchase.metadata),
          checkout_url_created_at: new Date().toISOString(),
        } as Json,
      },
    });

    if (!session.url) {
      throw new Error("Stripe Checkout did not return a redirect url.");
    }

    return {
      checkoutUrl: session.url,
      purchaseId: purchase.id,
      checkoutSessionId: session.id,
    };
  } catch (error) {
    await updateCreditPurchase({
      supabase: params.supabase,
      purchaseId: purchase.id,
      patch: {
        status: "failed",
        metadata: {
          ...parseObjectJson(purchase.metadata),
          checkout_error: getErrorMessage(error, "Stripe Checkout session creation failed."),
        } as Json,
      },
    });
    throw error;
  }
}

export async function completeHostedCreditCheckoutSession(params: {
  checkoutSessionId: string;
  expectedUserId?: string;
}) {
  const { stripe } = ensureStripeClient();
  const supabase = createSupabaseAdminClient();
  const session = await stripe.checkout.sessions.retrieve(params.checkoutSessionId);

  if (session.mode !== "payment") {
    throw new Error("The Stripe checkout session is not a one-time payment session.");
  }

  const purchase = await resolveCreditPurchaseFromCheckoutSession({
    supabase,
    session,
  });

  if (!purchase) {
    throw new Error("Could not resolve the hosted credit purchase for this checkout session.");
  }

  if (params.expectedUserId && purchase.user_id !== params.expectedUserId) {
    throw new Error("This checkout session does not belong to the signed-in user.");
  }

  if (session.payment_status !== "paid") {
    return {
      status: session.status ?? "open",
      paymentStatus: session.payment_status,
      purchase,
    };
  }

  const stripeCustomerId = toStripeCustomerId(session.customer);
  if (stripeCustomerId) {
    await upsertBillingCustomer({
      supabase,
      userId: purchase.user_id,
      stripeCustomerId,
      livemode: session.livemode,
      metadata: {
        source: "hosted_billing.complete_checkout_session",
      },
    });
  }

  const stripePaymentIntentId = toStripePaymentIntentId(session.payment_intent);
  const stripeChargeId = await resolveStripeChargeId({
    stripe,
    paymentIntentId: stripePaymentIntentId,
  });

  const fulfilledPurchase = await fulfillCreditPurchase({
    supabase,
    purchaseId: purchase.id,
    stripeCheckoutSessionId: session.id,
    stripePaymentIntentId,
    stripeChargeId,
    stripeCustomerId,
    sourceEventId: `stripe.checkout_session:${session.id}:grant`,
    metadata: {
      source: "hosted_billing.complete_checkout_session",
    },
  });

  return {
    status: "completed" as const,
    paymentStatus: session.payment_status,
    purchase: fulfilledPurchase,
  };
}

export async function handleHostedStripeWebhook(request: Request) {
  if (!isStripeWebhookConfigured()) {
    throw new Error(
      "Stripe webhook endpoint is configured in code but missing STRIPE_SECRET_KEY and/or STRIPE_WEBHOOK_SECRET."
    );
  }

  const stripe = getStripeServerClient();
  const webhookSecret = getStripeWebhookSecret();
  if (!stripe || !webhookSecret) {
    throw new Error("Stripe webhook configuration is incomplete.");
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    throw new Error("Missing stripe-signature header.");
  }

  const rawBody = await request.text();
  const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  const supabase = createSupabaseAdminClient();

  const recorded = await recordStripeWebhookEvent({
    supabase,
    stripeEventId: event.id,
    eventType: event.type,
    livemode: event.livemode,
    payload: event.data.object as unknown as Record<string, unknown>,
  });

  if (recorded.duplicate && recorded.row.status === "processed") {
    return {
      duplicate: true,
      eventId: event.id,
      type: event.type,
    };
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "payment") {
          await completeHostedCreditCheckoutSession({
            checkoutSessionId: session.id,
          });
        }
        break;
      }
      case "checkout.session.async_payment_failed":
      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;
        const purchase = await findCreditPurchaseByCheckoutSessionId({
          supabase,
          checkoutSessionId: session.id,
        });

        if (purchase && purchase.status === "pending") {
          await updateCreditPurchase({
            supabase,
            purchaseId: purchase.id,
            patch: {
              status:
                event.type === "checkout.session.expired" ? "expired" : "failed",
              metadata: {
                ...parseObjectJson(purchase.metadata),
                stripe_event_id: event.id,
                checkout_session_status: session.status,
                checkout_payment_status: session.payment_status,
              } as Json,
            },
          });
        }
        break;
      }
      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        await refundCreditPurchaseFromCharge({
          supabase,
          charge,
          eventId: event.id,
        });
        break;
      }
      default:
        break;
    }

    await markStripeWebhookEventProcessed({
      supabase,
      webhookEventId: recorded.row.id,
    });

    return {
      duplicate: recorded.duplicate,
      eventId: event.id,
      type: event.type,
    };
  } catch (error) {
    await markStripeWebhookEventFailed({
      supabase,
      webhookEventId: recorded.row.id,
      errorMessage: getErrorMessage(error, "Stripe webhook processing failed."),
    });
    throw error;
  }
}
