/**
 * Node built-in test runner: npx tsx --test src/lib/skill-sandbox.test.ts
 * Node sandbox: jail + read/readdir + kısıtlı exec (gerçek tmpdir).
 */
import assert from "node:assert/strict";
import { describe, it, before } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createNodeSandbox } from "./skill-sandbox.ts";

let root = "";

before(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "yula-sandbox-"));
  fs.mkdirSync(path.join(root, "ay-kapanis"), { recursive: true });
  fs.writeFileSync(path.join(root, "ay-kapanis", "SKILL.md"), "# Ay kapanış\n");
  fs.writeFileSync(
    path.join(root, "hello.mjs"),
    'console.log(JSON.stringify({ ok: true, arg: process.argv[2] ?? null }));\n',
  );
});

describe("createNodeSandbox", () => {
  it("reads files and lists dirs inside root", async () => {
    const sb = createNodeSandbox(root);
    assert.equal(
      await sb.readFile("ay-kapanis/SKILL.md", "utf-8"),
      "# Ay kapanış\n",
    );
    const names = (await sb.readdir(".", { withFileTypes: true })).map((e) => e.name).sort();
    assert.deepEqual(names, ["ay-kapanis", "hello.mjs"]);
  });
  it("rejects jail escapes", async () => {
    const sb = createNodeSandbox(root);
    await assert.rejects(sb.readFile("../outside.txt", "utf-8"));
    await assert.rejects(sb.exec({ script: "../evil.mjs" }));
  });
  it("rejects non-mjs scripts", async () => {
    const sb = createNodeSandbox(root);
    await assert.rejects(sb.exec({ script: "ay-kapanis/SKILL.md" }));
  });
  it("executes .mjs under root without shell", async () => {
    const sb = createNodeSandbox(root);
    const { stdout } = await sb.exec({ script: "hello.mjs", args: ["x"] });
    assert.deepEqual(JSON.parse(stdout), { ok: true, arg: "x" });
  });
  it("fails failing scripts with stderr hint", async () => {
    const sb = createNodeSandbox(root);
    fs.writeFileSync(
      path.join(root, "boom.mjs"),
      'console.error("patladı"); process.exit(3);\n',
    );
    await assert.rejects(sb.exec({ script: "boom.mjs" }), /3.*patladı|patladı.*3/s);
  });
});
