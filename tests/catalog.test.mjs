import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function filesBelow(directory) {
  const files = [];
  const stack = [directory];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(absolute);
      else if (entry.isFile()) files.push(absolute);
    }
  }
  return files.sort();
}

async function treeHash(directory) {
  const hash = crypto.createHash("sha256");
  for (const file of await filesBelow(directory)) {
    hash.update(path.relative(directory, file));
    hash.update(await fs.readFile(file));
  }
  return hash.digest("hex");
}

function run(...args) {
  return spawnSync(process.execPath, [path.join(root, "scripts", "fleet.mjs"), ...args], {
    cwd: root,
    encoding: "utf8",
  });
}

test("the audit partitions all 325 original skills exactly once", async () => {
  const manifest = JSON.parse(await fs.readFile(path.join(root, "fleet.json"), "utf8"));
  assert.equal(manifest.skills.implicit.length, 22);
  assert.equal(manifest.skills.explicit.length, 218);
  assert.equal(manifest.skills.projectOnly.length, 15);
  assert.equal(manifest.skills.removed.length, 70);
  const all = Object.values(manifest.skills).flat();
  assert.equal(all.length, 325);
  assert.equal(new Set(all).size, 325);
});

test("Fleet validates its loose catalog and PStack adapters", () => {
  const result = run("validate");
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /Validated 240 loose skills and three PStack adapters/);
});

test("PStack preparation is idempotent", async () => {
  const pstack = path.join(root, "plugins", "pstack");
  const before = await treeHash(pstack);
  const first = run("prepare-pstack");
  assert.equal(first.status, 0, `${first.stdout}\n${first.stderr}`);
  const second = run("prepare-pstack");
  assert.equal(second.status, 0, `${second.stdout}\n${second.stderr}`);
  assert.equal(await treeHash(pstack), before);
});
