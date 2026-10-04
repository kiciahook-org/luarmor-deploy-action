import assert from "node:assert/strict";
import test from "node:test";

import { requireSuccessfulResponse } from "./response.mjs";

test("accepts successful responses", async () => {
  const response = new Response("", { status: 200 });
  assert.equal(await requireSuccessfulResponse(response), response);
});

test("rejects a Luarmor error with its bounded message", async () => {
  const response = new Response(JSON.stringify({ success: false, message: "Script is too large for this channel." }), {
    status: 500,
    headers: { "content-type": "application/json" },
  });
  await assert.rejects(requireSuccessfulResponse(response), {
    message: "Luarmor request failed (HTTP 500): Script is too large for this channel.",
  });
});

test("allows only explicitly handled gateway timeouts", async () => {
  const accepted = new Response("", { status: 504 });
  assert.equal(await requireSuccessfulResponse(accepted, { allowGatewayTimeout: true }), accepted);
  await assert.rejects(requireSuccessfulResponse(new Response("", { status: 504 })), /HTTP 504/);
});

test("does not expose arbitrary response bodies", async () => {
  const response = new Response("secret body", { status: 422 });
  await assert.rejects(requireSuccessfulResponse(response), {
    message: "Luarmor request failed (HTTP 422)",
  });
});
