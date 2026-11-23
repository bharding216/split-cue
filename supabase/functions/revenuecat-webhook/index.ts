/**
 * revenuecat-webhook — handles RevenueCat server-to-server notifications.
 *
 * Upserts the `subscriptions` table so the app's server-side tier checks
 * stay in sync with App Store / Google Play purchase state.
 *
 * Handles both lifetime (non-consumable) and legacy subscription events.
 *
 * Env vars:
 *   REVENUECAT_WEBHOOK_SECRET — shared secret set in RevenueCat dashboard
 *
 * RevenueCat event types handled:
 *   INITIAL_PURCHASE, RENEWAL, CANCELLATION, EXPIRATION,
 *   NON_RENEWING_PURCHASE (lifetime), PRODUCT_CHANGE
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("REVENUECAT_WEBHOOK_SECRET") ?? "";

const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// RevenueCat sends the user's app_user_id which is the Supabase auth user ID
interface RCEvent {
  type: string;
  app_user_id: string;
  product_id?: string;
  store?: string; // APP_STORE | PLAY_STORE
  expiration_at_ms?: number;
  period_type?: string; // NORMAL | TRIAL
  purchased_at_ms?: number;
  is_family_share?: boolean;
}

interface RCWebhookBody {
  api_version: string;
  event: RCEvent;
}

function mapStore(store?: string): "apple" | "google" | null {
  if (store === "APP_STORE") return "apple";
  if (store === "PLAY_STORE") return "google";
  return null;
}

const LIFETIME_EVENT_TYPES = new Set([
  "NON_RENEWING_PURCHASE",
  "INITIAL_PURCHASE",
]);

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Verify webhook secret
  const authHeader = req.headers.get("authorization") ?? "";
  if (WEBHOOK_SECRET && authHeader !== `Bearer ${WEBHOOK_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: RCWebhookBody;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const event = body.event;
  if (!event?.app_user_id || !event?.type) {
    return new Response("Missing event data", { status: 400 });
  }

  const userId = event.app_user_id;
  const provider = mapStore(event.store);
  const now = new Date().toISOString();

  console.log(`[revenuecat-webhook] ${event.type} for user ${userId}, product: ${event.product_id}`);

  try {
    switch (event.type) {
      case "NON_RENEWING_PURCHASE":
      case "INITIAL_PURCHASE": {
        // Determine if this is a lifetime (non-consumable) or subscription purchase
        // Lifetime products don't have an expiration
        const isLifetime = !event.expiration_at_ms || event.type === "NON_RENEWING_PURCHASE";
        const purchaseType = isLifetime ? "lifetime" : "subscription";

        const upsertData: Record<string, unknown> = {
          user_id: userId,
          tier: "pro",
          status: event.period_type === "TRIAL" ? "trialing" : "active",
          purchase_type: purchaseType,
          provider,
          provider_subscription_id: event.product_id ?? null,
          updated_at: now,
        };

        if (isLifetime) {
          upsertData.current_period_start = event.purchased_at_ms
            ? new Date(event.purchased_at_ms).toISOString()
            : now;
          // No period end for lifetime
          upsertData.current_period_end = null;
        } else {
          if (event.purchased_at_ms) {
            upsertData.current_period_start = new Date(event.purchased_at_ms).toISOString();
          }
          if (event.expiration_at_ms) {
            upsertData.current_period_end = new Date(event.expiration_at_ms).toISOString();
          }
        }

        if (event.period_type === "TRIAL") {
          upsertData.trial_started_at = event.purchased_at_ms
            ? new Date(event.purchased_at_ms).toISOString()
            : now;
          upsertData.trial_ends_at = event.expiration_at_ms
            ? new Date(event.expiration_at_ms).toISOString()
            : null;
        }

        const { error } = await adminClient
          .from("subscriptions")
          .upsert(upsertData, { onConflict: "user_id" });

        if (error) throw error;
        break;
      }

      case "RENEWAL": {
        const { error } = await adminClient
          .from("subscriptions")
          .update({
            tier: "pro",
            status: "active",
            current_period_start: event.purchased_at_ms
              ? new Date(event.purchased_at_ms).toISOString()
              : now,
            current_period_end: event.expiration_at_ms
              ? new Date(event.expiration_at_ms).toISOString()
              : null,
            updated_at: now,
          })
          .eq("user_id", userId);

        if (error) throw error;
        break;
      }

      case "CANCELLATION": {
        const { error } = await adminClient
          .from("subscriptions")
          .update({
            status: "canceled",
            canceled_at: now,
            current_period_end: event.expiration_at_ms
              ? new Date(event.expiration_at_ms).toISOString()
              : null,
            updated_at: now,
          })
          .eq("user_id", userId);

        if (error) throw error;
        break;
      }

      case "EXPIRATION": {
        const { error } = await adminClient
          .from("subscriptions")
          .update({
            tier: "free",
            status: "expired",
            updated_at: now,
          })
          .eq("user_id", userId);

        if (error) throw error;
        break;
      }

      case "PRODUCT_CHANGE": {
        // User changed product (e.g. subscription → lifetime)
        const isLifetime = !event.expiration_at_ms;
        const { error } = await adminClient
          .from("subscriptions")
          .update({
            tier: "pro",
            status: "active",
            purchase_type: isLifetime ? "lifetime" : "subscription",
            provider_subscription_id: event.product_id ?? null,
            current_period_start: event.purchased_at_ms
              ? new Date(event.purchased_at_ms).toISOString()
              : now,
            current_period_end: isLifetime
              ? null
              : event.expiration_at_ms
                ? new Date(event.expiration_at_ms).toISOString()
                : null,
            updated_at: now,
          })
          .eq("user_id", userId);

        if (error) throw error;
        break;
      }

      default:
        console.log(`[revenuecat-webhook] Unhandled event type: ${event.type}`);
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(`[revenuecat-webhook] Error processing ${event.type}:`, err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
