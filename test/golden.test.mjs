import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

globalThis.utils = {
  base64URL: (s) => Buffer.from(String(s)).toString("base64url"),
  base64URLDecode: (s) => Buffer.from(String(s), "base64url").toString(),
};

const plugin = await import("../plugin.js");
const fixture = JSON.parse(readFileSync(new URL("./golden.json", import.meta.url), "utf8"));

for (const entry of fixture.cases) {
  test("golden: " + entry.name, () => {
    const hook = entry.hook.split(".").reduce((value, key) => value[key], plugin);
    assert.equal(typeof hook, "function", entry.hook);
    const invoke = () => hook(...structuredClone(entry.args));
    if (entry.expectedError) {
      assert.throws(invoke, (error) => error.message.includes(entry.expectedError));
    } else {
      assert.deepEqual(invoke(), entry.expected);
    }
  });
}
