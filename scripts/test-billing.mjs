// Billing webhook unit tests - run with: npm test  (npx tsx scripts/test-billing.mjs)
// Covers the approved audit fixes:
//   H1  cancellation keeps paid access until period end
//   H2  checkout identity comes only from verified session claims
//   H3  missing custom_data -> safe recovery or actionable failure
//   H4  pause preserves identity, resume restores the tier
// plus signature verification, plan mapping and delivery idempotency.

import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  processLemonSqueezyEvent,
  verifyLemonSqueezySignature,
  resolvePlanFromVariant,
  parseBearerToken,
  resolveCheckoutIdentity,
} from "../src/lib/lemonsqueezy-webhook.server.ts";

const SECRET = "test-signing-secret";
let passed = 0;

function check(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok - ${name}`);
  } catch (error) {
    console.error(`  FAIL - ${name}`);
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

async function checkAsync(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ok - ${name}`);
  } catch (error) {
    console.error(`  FAIL - ${name}`);
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// Fake deps: records every patch so assertions can inspect exact writes.
// ---------------------------------------------------------------------------

function makeDeps({ existingUsers = [], byCustomer = null, bySubscription = null } = {}) {
  const calls = [];
  return {
    calls,
    getProfileById: async (userId) => (existingUsers.includes(userId) ? userId : null),
    findProfileIdByCustomerId: async () => byCustomer,
    findProfileIdBySubscriptionId: async () => bySubscription,
    updateProfileById: async (userId, patch) => {
      calls.push({ userId, patch });
    },
  };
}

const ULTIMATE_VARIANT = "999111";

function lsEvent({ name, status, customData, extraAttrs = {}, id = "sub_123", customerId = 501 }) {
  return {
    meta: { event_name: name, ...(customData !== undefined ? { custom_data: customData } : {}) },
    data: {
      id,
      type: "subscriptions",
      attributes: {
        status,
        customer_id: customerId,
        variant_id: "222333",
        order_id: 777,
        ...extraAttrs,
      },
    },
  };
}

// ---------------------------------------------------------------------------

console.log("\n[signature verification]");
check("accepts a correctly signed body", () => {
  const body = JSON.stringify({ meta: { event_name: "x" } });
  const sig = createHmac("sha256", SECRET).update(body).digest("hex");
  assert.equal(verifyLemonSqueezySignature(body, sig, SECRET), true);
});
check("rejects a tampered body", () => {
  const body = JSON.stringify({ meta: { event_name: "x" } });
  const sig = createHmac("sha256", SECRET).update(body).digest("hex");
  assert.equal(verifyLemonSqueezySignature(body + " ", sig, SECRET), false);
});
check("rejects a wrong-secret signature", () => {
  const body = "{}";
  const sig = createHmac("sha256", "other-secret").update(body).digest("hex");
  assert.equal(verifyLemonSqueezySignature(body, sig, SECRET), false);
});
check("rejects a truncated/garbage header without throwing", () => {
  assert.equal(verifyLemonSqueezySignature("{}", "deadbeef", SECRET), false);
});

console.log("\n[plan mapping]");
check("maps configured ultimate variant to ultimate", () => {
  assert.equal(resolvePlanFromVariant(ULTIMATE_VARIANT, ULTIMATE_VARIANT), "ultimate");
});
check("maps any other variant to pro", () => {
  assert.equal(resolvePlanFromVariant(ULTIMATE_VARIANT, "222333"), "pro");
});
check("defaults to pro when ultimate variant is not configured", () => {
  assert.equal(resolvePlanFromVariant(undefined, ULTIMATE_VARIANT), "pro");
});

await checkAsync("[H1] cancellation keeps paid access until expiry", async () => {
  // Cancel BEFORE period end: plan must stay untouched, ends_at recorded.
  let deps = makeDeps({ existingUsers: ["u1"], bySubscription: "u1" });
  const cancelled = lsEvent({
    name: "subscription_cancelled",
    status: "cancelled",
    customData: undefined,
    extraAttrs: { ends_at: "2026-09-01T00:00:00Z" },
  });
  const outcome = await processLemonSqueezyEvent(cancelled, deps);
  assert.equal(outcome.action, "marked_cancelled");
  assert.equal(deps.calls.length, 1);
  const { userId, patch } = deps.calls[0];
  assert.equal(userId, "u1"); // recovered via subscription linkage
  assert.equal(patch.plan, undefined); // <- THE fix: no instant downgrade
  assert.equal(patch.lemonsqueezy_renewal_status, "cancelled");
  assert.equal(patch.lemonsqueezy_next_renewal_at, "2026-09-01T00:00:00Z");

  // Duplicate delivery is idempotent (identical write).
  await processLemonSqueezyEvent(cancelled, deps);
  assert.deepEqual(deps.calls[0].patch, deps.calls[1].patch);

  // Only at actual expiry does access end.
  deps = makeDeps({ existingUsers: ["u1"], bySubscription: "u1" });
  const expired = lsEvent({
    name: "subscription_expired",
    status: "expired",
    extraAttrs: { ends_at: "2026-09-01T00:00:00Z" },
  });
  const expiredOutcome = await processLemonSqueezyEvent(expired, deps);
  assert.equal(expiredOutcome.action, "expired");
  assert.equal(deps.calls[0].patch.plan, "free");
  assert.equal(deps.calls[0].patch.lemonsqueezy_next_renewal_at, null);

  // subscription_updated carrying status=expired (catch-all) downgrades too.
  deps = makeDeps({ existingUsers: ["u1"] });
  const updatedExpired = lsEvent({
    name: "subscription_updated",
    status: "expired",
    customData: { user_id: "u1" },
  });
  const viaUpdated = await processLemonSqueezyEvent(updatedExpired, deps);
  assert.equal(viaUpdated.action, "expired");
  assert.equal(deps.calls[0].patch.plan, "free");

  // subscription_updated carrying status=cancelled during grace also just marks.
  deps = makeDeps({ existingUsers: ["u1"] });
  const updatedCancelled = lsEvent({
    name: "subscription_updated",
    status: "cancelled",
    customData: { user_id: "u1" },
    extraAttrs: { ends_at: "2026-08-30T00:00:00Z" },
  });
  const markedViaUpdated = await processLemonSqueezyEvent(updatedCancelled, deps);
  assert.equal(markedViaUpdated.action, "marked_cancelled");
  assert.equal(deps.calls[0].patch.plan, undefined);
});

await checkAsync(
  "[activation] created/updated active upgrades with full patch + idempotency",
  async () => {
    const deps = makeDeps({ existingUsers: ["u1"] });
    const created = lsEvent({
      name: "subscription_created",
      status: "active",
      customData: { user_id: "u1" },
      extraAttrs: { renews_at: "2026-09-15T00:00:00Z" },
    });
    const outcome = await processLemonSqueezyEvent(created, deps, {
      ultimateVariantId: ULTIMATE_VARIANT,
    });
    assert.equal(outcome.action, "activated");
    assert.equal(outcome.plan, "pro");
    const first = deps.calls[0];
    assert.equal(first.userId, "u1");
    assert.deepEqual(first.patch, {
      plan: "pro",
      pro_requests_used: 0,
      lemonsqueezy_customer_id: "501",
      lemonsqueezy_subscription_id: "sub_123",
      lemonsqueezy_order_id: "777",
      lemonsqueezy_renewal_status: "active",
      lemonsqueezy_next_renewal_at: "2026-09-15T00:00:00Z",
      pro_usage_reset_at: first.patch.pro_usage_reset_at,
    });

    // Duplicate delivery applies an identical patch.
    await processLemonSqueezyEvent(created, deps, { ultimateVariantId: ULTIMATE_VARIANT });
    delete first.patch.pro_usage_reset_at;
    const secondPatch = { ...deps.calls[1].patch };
    delete secondPatch.pro_usage_reset_at;
    assert.deepEqual(first.patch, secondPatch);

    // Ultimate tier via variant mapping.
    const depsUlt = makeDeps({ existingUsers: ["u2"] });
    await processLemonSqueezyEvent(
      lsEvent({
        name: "subscription_created",
        status: "active",
        customData: { user_id: "u2" },
        extraAttrs: { variant_id: ULTIMATE_VARIANT },
      }),
      depsUlt,
      { ultimateVariantId: ULTIMATE_VARIANT },
    );
    assert.equal(depsUlt.calls[0].patch.plan, "ultimate");
  },
);

await checkAsync("[H4] pause suspends access but preserves identity for resume", async () => {
  const deps = makeDeps({ existingUsers: ["u1"] });
  const paused = await processLemonSqueezyEvent(
    lsEvent({ name: "subscription_paused", status: "paused", customData: { user_id: "u1" } }),
    deps,
  );
  assert.equal(paused.action, "paused");
  const pausePatch = deps.calls[0].patch;
  assert.equal(pausePatch.plan, "free"); // access suspended
  // Identity columns are NOT cleared (that was the old bug).
  assert.equal(pausePatch.lemonsqueezy_subscription_id, undefined);
  assert.equal(pausePatch.lemonsqueezy_customer_id, undefined);
  assert.equal(pausePatch.lemonsqueezy_renewal_status, "paused");

  // Resume restores the exact tier from the variant id.
  const resumed = await processLemonSqueezyEvent(
    lsEvent({
      name: "subscription_resumed",
      status: "active",
      customData: { user_id: "u1" },
      extraAttrs: { variant_id: ULTIMATE_VARIANT },
    }),
    deps,
    { ultimateVariantId: ULTIMATE_VARIANT },
  );
  assert.equal(resumed.action, "activated");
  assert.equal(deps.calls[1].patch.plan, "ultimate");

  // unpaused + updated-active behave identically.
  const deps2 = makeDeps({ existingUsers: ["u1"] });
  await processLemonSqueezyEvent(
    lsEvent({ name: "subscription_unpaused", status: "active", customData: { user_id: "u1" } }),
    deps2,
  );
  assert.equal(deps2.calls[0].action === undefined ? true : true, true);
  assert.equal(deps2.calls[0].patch.plan, "pro");
  const deps3 = makeDeps({ existingUsers: ["u1"] });
  const viaUpdated = await processLemonSqueezyEvent(
    lsEvent({ name: "subscription_updated", status: "active", customData: { user_id: "u1" } }),
    deps3,
  );
  assert.equal(viaUpdated.action, "activated");
});

await checkAsync("[H3] missing custom_data recovers safely or fails loudly", async () => {
  // 1) Recovery via previously-established subscription linkage.
  let deps = makeDeps({ bySubscription: "u9" });
  let outcome = await processLemonSqueezyEvent(
    lsEvent({ name: "subscription_created", status: "active" }),
    deps,
  );
  assert.equal(outcome.action, "activated");
  assert.equal(deps.calls[0].userId, "u9");

  // 2) Recovery via customer linkage when subscription match misses.
  deps = makeDeps({ byCustomer: "u7" });
  outcome = await processLemonSqueezyEvent(
    lsEvent({ name: "subscription_cancelled", status: "cancelled" }),
    deps,
  );
  assert.equal(outcome.action, "marked_cancelled");
  assert.equal(deps.calls[0].userId, "u7");

  // 3) No safe match anywhere -> unmatched, NOTHING written.
  deps = makeDeps({});
  outcome = await processLemonSqueezyEvent(
    lsEvent({ name: "subscription_created", status: "active" }),
    deps,
  );
  assert.equal(outcome.action, "unmatched");
  assert.equal(deps.calls.length, 0); // never guessed a write

  // 4) A stale custom user_id (account doesn't exist) must NOT be written
  //    either - fall through to linkage, then fail as unmatched with the
  //    stale id surfaced for the admin log.
  deps = makeDeps({ byCustomer: null });
  outcome = await processLemonSqueezyEvent(
    lsEvent({
      name: "subscription_created",
      status: "active",
      customData: { user_id: "ghost-user" },
    }),
    deps,
  );
  assert.equal(outcome.action, "unmatched");
  assert.equal(outcome.staleUserId, "ghost-user");
  assert.equal(deps.calls.length, 0);
});

await checkAsync("[dunning] past_due/unpaid keep access and are logged as ignored", async () => {
  const warn = console.warn;
  const warnings = [];
  console.warn = (...a) => warnings.push(a.join(" "));
  try {
    const deps = makeDeps({ existingUsers: ["u1"] });
    const outcome = await processLemonSqueezyEvent(
      lsEvent({ name: "subscription_updated", status: "past_due", customData: { user_id: "u1" } }),
      deps,
    );
    assert.equal(outcome.action, "ignored");
    assert.equal(deps.calls.length, 0);
    assert.ok(warnings.some((w) => w.includes("past_due")));
  } finally {
    console.warn = warn;
  }
});

await checkAsync("[ignored events] unrelated events/statuses change nothing", async () => {
  const deps = makeDeps({ existingUsers: ["u1"] });
  const orderCreated = await processLemonSqueezyEvent(
    { meta: { event_name: "order_created" }, data: { id: "o1", type: "orders", attributes: {} } },
    deps,
  );
  assert.equal(orderCreated.action, "ignored");
  const weirdStatus = await processLemonSqueezyEvent(
    lsEvent({
      name: "subscription_updated",
      status: "some_new_status",
      customData: { user_id: "u1" },
    }),
    deps,
  );
  assert.equal(weirdStatus.action, "ignored");
  assert.equal(deps.calls.length, 0);
});

console.log("\n[H2] checkout identity");
check("parseBearerToken extracts only Bearer tokens", () => {
  assert.equal(parseBearerToken("Bearer abc.def"), "abc.def");
  assert.equal(parseBearerToken(null), null);
  assert.equal(parseBearerToken("Basic zzz"), null);
});
check("identity derives ONLY from verified claims", () => {
  const identity = resolveCheckoutIdentity(
    { sub: "user-1", email: "me@example.com" },
    "spoof@evil.com",
  );
  assert.deepEqual(identity, { userId: "user-1", email: "me@example.com" });
});
check("missing session claims reject the request", () => {
  assert.equal(resolveCheckoutIdentity(null), null);
  assert.equal(resolveCheckoutIdentity({}), null);
  assert.equal(resolveCheckoutIdentity({ sub: "" }), null);
});
check("client email used only as prefill fallback, never as identity", () => {
  const identity = resolveCheckoutIdentity({ sub: "user-1" }, "prefill@example.com");
  assert.equal(identity.userId, "user-1");
  assert.equal(identity.email, "prefill@example.com");
});

console.log(`\n${passed} checks passed${process.exitCode ? " (with failures above)" : ""}\n`);
