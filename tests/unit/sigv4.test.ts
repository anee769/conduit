import { test } from "node:test";
import assert from "node:assert/strict";
import { signRequest, deriveSigningKey } from "../../apps/gateway/src/adapters/sigv4";

/**
 * Verified against the published AWS Signature Version 4 test suite "get-vanilla"
 * vector (credential AKIDEXAMPLE / wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY,
 * region us-east-1, service "service", 2015-08-30T12:36:00Z). This proves the
 * full canonical-request → string-to-sign → signature chain, not just a piece.
 */
test("SigV4 get-vanilla vector reproduces AWS's published signature", () => {
  const headers = signRequest({
    accessKeyId: "AKIDEXAMPLE",
    secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
    region: "us-east-1",
    service: "service",
    method: "GET",
    host: "example.amazonaws.com",
    path: "/",
    query: "",
    body: "",
    includeContentSha256: false, // get-vanilla signs only host;x-amz-date
    now: new Date("2015-08-30T12:36:00Z"),
  });

  const auth = headers.authorization!;
  assert.equal(headers["x-amz-date"]!, "20150830T123600Z");
  assert.match(auth, /SignedHeaders=host;x-amz-date/);
  assert.match(auth, /Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31/);
  assert.match(auth, /Credential=AKIDEXAMPLE\/20150830\/us-east-1\/service\/aws4_request/);
});

test("deriveSigningKey is deterministic and chains date→region→service", () => {
  const a = deriveSigningKey("secret", "20240101", "us-east-1", "bedrock").toString("hex");
  const b = deriveSigningKey("secret", "20240101", "us-east-1", "bedrock").toString("hex");
  const c = deriveSigningKey("secret", "20240101", "us-west-2", "bedrock").toString("hex");
  assert.equal(a, b, "deterministic");
  assert.notEqual(a, c, "region changes the key");
});

test("Bedrock signing includes x-amz-content-sha256 by default", () => {
  const headers = signRequest({
    accessKeyId: "AKIDEXAMPLE",
    secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
    region: "us-east-1",
    service: "bedrock",
    method: "POST",
    host: "bedrock-runtime.us-east-1.amazonaws.com",
    path: "/model/anthropic.claude-sonnet-4-20250514-v1%3A0/invoke",
    body: JSON.stringify({ anthropic_version: "bedrock-2023-05-31", max_tokens: 10 }),
    extraHeaders: { "content-type": "application/json" },
  });
  assert.ok(headers["x-amz-content-sha256"], "payload hash header present");
  assert.match(headers.authorization!, /SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date/);
});
