#!/usr/bin/env node

import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skillsRoot = path.join(root, "skills");
const manifestPath = path.join(root, "fleet.json");
const lockPath = path.join(root, "catalog.lock.json");
const home = os.homedir();
const stateRoot = path.join(home, ".fleet");
const statePath = path.join(stateRoot, "state.json");

const renamedSkills = new Map([
  ["Obsidian Automation", "obsidian-automation"],
  ["Pandas Data Analysis", "pandas-data-analysis"],
]);

const descriptionOverrides = new Map([
  [
    "latex-document-skill",
    "Create and edit LaTeX documents, papers, reports, theses, presentations, posters, and diagrams. Invoke for substantial LaTeX authoring or formatting work.",
  ],
  [
    "model-pruning",
    "Prune neural networks with structured or unstructured sparsity, including magnitude pruning, SparseGPT, Wanda, and N:M patterns.",
  ],
]);

function fail(message) {
  throw new Error(message);
}

async function exists(target) {
  try {
    await fs.lstat(target);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function readJson(target) {
  return JSON.parse(await fs.readFile(target, "utf8"));
}

async function writeJson(target, value) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${JSON.stringify(value, null, 2)}\n`);
}

function normalizeSkillName(name) {
  return renamedSkills.get(name) ?? name;
}

function unquote(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed.slice(1, -1);
    }
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replaceAll("''", "'");
  }
  return trimmed;
}

function parseFrontmatter(text, file) {
  const lines = text.replaceAll("\r\n", "\n").split("\n");
  if (lines[0] !== "---") fail(`${file}: missing YAML frontmatter`);
  const end = lines.indexOf("---", 1);
  if (end === -1) fail(`${file}: unterminated YAML frontmatter`);
  const values = new Map();
  for (let index = 1; index < end; index += 1) {
    const match = lines[index].match(/^([A-Za-z0-9_-]+):(?:\s*(.*))?$/);
    if (!match) continue;
    const [, key, raw = ""] = match;
    if (raw === "" || raw === "|" || raw === ">" || raw.startsWith("|-")) {
      const chunks = [];
      while (index + 1 < end && /^\s+/.test(lines[index + 1])) {
        index += 1;
        chunks.push(lines[index].trim());
      }
      values.set(key, chunks.join(" ").replace(/\s+/g, " ").trim());
    } else {
      values.set(key, unquote(raw));
    }
  }
  return { end, lines, values };
}

function rewriteFrontmatter(text, file, updates) {
  const parsed = parseFrontmatter(text, file);
  const lines = parsed.lines;
  let end = parsed.end;
  for (const [key, value] of Object.entries(updates)) {
    let index = -1;
    for (let cursor = 1; cursor < end; cursor += 1) {
      if (new RegExp(`^${key}:`).test(lines[cursor])) {
        index = cursor;
        break;
      }
    }
    const rendered = typeof value === "string" && key !== "name" ? JSON.stringify(value) : String(value);
    if (index === -1) {
      lines.splice(end, 0, `${key}: ${rendered}`);
      end += 1;
      continue;
    }
    const rawValue = lines[index].match(/^.+:\s*(.*)$/)?.[1] ?? "";
    const blockValue = rawValue === "" || /^[>|][+-]?$/.test(rawValue);
    lines[index] = `${key}: ${rendered}`;
    if (blockValue) {
      let removeCount = 0;
      while (index + 1 + removeCount < end && /^\s+/.test(lines[index + 1 + removeCount])) {
        removeCount += 1;
      }
      lines.splice(index + 1, removeCount);
      end -= removeCount;
    }
  }
  return lines.join("\n");
}

async function walkFiles(directory, predicate = () => true) {
  if (!(await exists(directory))) return [];
  const results = [];
  const stack = [directory];
  const visited = new Set();
  while (stack.length > 0) {
    const current = stack.pop();
    const real = await fs.realpath(current);
    if (visited.has(real)) continue;
    visited.add(real);
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(absolute);
      else if (entry.isFile() && predicate(absolute)) results.push(absolute);
      else if (entry.isSymbolicLink()) {
        const target = await fs.stat(absolute);
        if (target.isDirectory()) stack.push(absolute);
        else if (target.isFile() && predicate(absolute)) results.push(absolute);
      }
    }
  }
  return results.sort();
}

async function loadSkillRecords(directory) {
  const files = await walkFiles(directory, (file) => path.basename(file) === "SKILL.md");
  const records = [];
  for (const file of files) {
    const text = await fs.readFile(file, "utf8");
    const frontmatter = parseFrontmatter(text, file).values;
    const rawName = frontmatter.get("name") ?? path.basename(path.dirname(file));
    records.push({
      file,
      directory: path.dirname(file),
      rawName,
      name: normalizeSkillName(rawName),
      description: frontmatter.get("description") ?? "",
      text,
    });
  }
  return records;
}

function classification(manifest) {
  const result = new Map();
  for (const bucket of ["implicit", "explicit", "projectOnly", "removed"]) {
    for (const name of manifest.skills[bucket]) {
      if (result.has(name)) fail(`fleet.json classifies ${name} more than once`);
      result.set(name, bucket);
    }
  }
  return result;
}

function shortDescription(description, name) {
  const plain = description
    .replace(/[`*_#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  let result = plain || `Use the ${name} workflow explicitly.`;
  if (result.length > 64) result = `${result.slice(0, 61).trimEnd()}...`;
  if (result.length < 25) result = `${result} workflow guidance`.slice(0, 64);
  return result;
}

function displayName(name) {
  return name
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function yamlString(value) {
  return JSON.stringify(value);
}

async function writeOpenAiMetadata(record, mode) {
  const content = [
    "interface:",
    `  display_name: ${yamlString(displayName(record.name))}`,
    `  short_description: ${yamlString(shortDescription(record.description, record.name))}`,
    `  default_prompt: ${yamlString(`Use $${record.name} for this request.`)}`,
    "policy:",
    `  allow_implicit_invocation: ${mode === "implicit" ? "true" : "false"}`,
    "",
  ].join("\n");
  const target = path.join(record.directory, "agents", "openai.yaml");
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content);
}

async function sha256(target) {
  const hash = crypto.createHash("sha256");
  hash.update(await fs.readFile(target));
  return hash.digest("hex");
}

async function generateLock(manifest) {
  const classes = classification(manifest);
  const records = await loadSkillRecords(skillsRoot);
  const skills = [];
  for (const record of records) {
    skills.push({
      name: record.name,
      mode: classes.get(record.name),
      path: path.relative(root, record.directory),
      sha256: await sha256(record.file),
    });
  }
  await writeJson(lockPath, {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    skills,
  });
}

function shouldCopy(source) {
  const excluded = new Set([
    ".DS_Store",
    ".git",
    ".mypy_cache",
    ".pytest_cache",
    ".ruff_cache",
    ".venv",
    "__pycache__",
    "node_modules",
  ]);
  return !source.split(path.sep).some((part) => excluded.has(part));
}

async function importCurrent(args) {
  const manifest = await readJson(manifestPath);
  const classes = classification(manifest);
  const sourceFlag = args.indexOf("--source");
  const source = path.resolve(sourceFlag === -1 ? path.join(home, ".agents", "skills") : args[sourceFlag + 1]);
  const force = args.includes("--force");
  if (!(await exists(source))) fail(`skill source does not exist: ${source}`);
  if (await exists(skillsRoot)) {
    const entries = await fs.readdir(skillsRoot);
    if (entries.length > 0 && !force) fail("skills/ is not empty; rerun with --force to replace the imported catalog");
    await fs.rm(skillsRoot, { recursive: true, force: true });
  }
  await fs.mkdir(skillsRoot, { recursive: true });

  const sourceRecords = await loadSkillRecords(source);
  const byName = new Map();
  for (const record of sourceRecords) {
    if (byName.has(record.name)) fail(`duplicate source skill name: ${record.name}`);
    byName.set(record.name, record);
  }
  const selected = [...manifest.skills.implicit, ...manifest.skills.explicit];
  for (const name of selected) {
    if (!byName.has(name)) fail(`source is missing kept skill: ${name}`);
  }

  const roots = new Map();
  for (const name of selected) {
    const record = byName.get(name);
    const relative = path.relative(source, record.directory);
    const sourceRootName = relative.split(path.sep)[0];
    const sourceRoot = path.join(source, sourceRootName);
    if (roots.has(sourceRootName)) continue;
    const rootSkillFile = path.join(sourceRoot, "SKILL.md");
    let targetRootName = sourceRootName;
    if (await exists(rootSkillFile)) {
      const rootRecord = (await loadSkillRecords(sourceRoot)).find((candidate) => candidate.file === rootSkillFile);
      if (rootRecord) targetRootName = rootRecord.name;
    }
    roots.set(sourceRootName, { sourceRoot, targetRootName });
  }

  for (const { sourceRoot, targetRootName } of roots.values()) {
    const target = path.join(skillsRoot, targetRootName);
    if (await exists(target)) fail(`two source roots map to ${targetRootName}`);
    await fs.cp(sourceRoot, target, { recursive: true, dereference: true, filter: shouldCopy });
  }

  let imported = await loadSkillRecords(skillsRoot);
  for (const record of [...imported].sort((a, b) => b.directory.length - a.directory.length)) {
    const folder = path.basename(record.directory);
    if (folder === record.name) continue;
    const destination = path.join(path.dirname(record.directory), record.name);
    if (await exists(destination)) fail(`${record.file}: cannot normalize folder to ${record.name}; destination exists`);
    await fs.rename(record.directory, destination);
  }

  imported = await loadSkillRecords(skillsRoot);
  const importedNames = new Set(imported.map((record) => record.name));
  for (const name of selected) {
    if (!importedNames.has(name)) fail(`import lost expected skill: ${name}`);
  }
  for (const record of imported) {
    const mode = classes.get(record.name);
    if (mode !== "implicit" && mode !== "explicit") fail(`imported unclassified skill: ${record.name}`);
    const description = descriptionOverrides.get(record.name) ?? record.description.replace(/\s+/g, " ").trim();
    if (!description) fail(`${record.file}: empty description`);
    const rewritten = rewriteFrontmatter(record.text, record.file, {
      name: record.name,
      description,
      "disable-model-invocation": mode === "explicit",
    });
    await fs.writeFile(record.file, rewritten);
    record.description = description;
    await writeOpenAiMetadata(record, mode);
  }

  await generateLock(manifest);
  console.log(`Imported ${imported.length} skills from ${source}.`);
  console.log(`Kept ${manifest.skills.implicit.length} implicit and ${manifest.skills.explicit.length} explicit-only skills.`);
}

async function validateLooseSkills(manifest) {
  const errors = [];
  const warnings = [];
  const classes = classification(manifest);
  const expected = new Set([...manifest.skills.implicit, ...manifest.skills.explicit]);
  const records = await loadSkillRecords(skillsRoot);
  const seen = new Set();
  for (const record of records) {
    if (seen.has(record.name)) errors.push(`duplicate skill name: ${record.name}`);
    seen.add(record.name);
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(record.name)) errors.push(`${record.file}: invalid skill name ${record.name}`);
    if (path.basename(record.directory) !== record.name) errors.push(`${record.file}: folder must match skill name ${record.name}`);
    if (!expected.has(record.name)) errors.push(`${record.file}: skill is not kept by fleet.json`);
    if (!record.description) errors.push(`${record.file}: empty description`);
    if (record.description.length > 1024) errors.push(`${record.file}: description exceeds 1024 characters`);
    const mode = classes.get(record.name);
    const disabled = parseFrontmatter(record.text, record.file).values.get("disable-model-invocation");
    const expectedDisabled = mode === "explicit" ? "true" : "false";
    if (disabled !== expectedDisabled) errors.push(`${record.file}: disable-model-invocation must be ${expectedDisabled}`);
    const openAi = path.join(record.directory, "agents", "openai.yaml");
    if (!(await exists(openAi))) {
      errors.push(`${record.file}: missing agents/openai.yaml`);
    } else {
      const metadata = await fs.readFile(openAi, "utf8");
      const expectedPolicy = mode === "implicit" ? "true" : "false";
      if (!metadata.includes(`allow_implicit_invocation: ${expectedPolicy}`)) {
        errors.push(`${openAi}: allow_implicit_invocation must be ${expectedPolicy}`);
      }
      if (!metadata.includes(`$${record.name}`)) errors.push(`${openAi}: default prompt must mention $${record.name}`);
    }
    if (/\/Users\/[A-Za-z0-9._-]+\//.test(record.text)) warnings.push(`${record.file}: contains a macOS user-specific path`);
  }
  for (const name of expected) {
    if (!seen.has(name)) errors.push(`missing kept skill: ${name}`);
  }
  return { errors, warnings, records };
}

async function validatePstack() {
  const errors = [];
  const adapters = ["codex", "cursor", "claude"];
  const expectedCounts = { codex: 44, cursor: 45, claude: 52 };
  for (const adapter of adapters) {
    const adapterRoot = path.join(root, "plugins", "pstack", adapter);
    if (!(await exists(adapterRoot))) {
      errors.push(`missing PStack ${adapter} adapter`);
      continue;
    }
    const records = await loadSkillRecords(path.join(adapterRoot, "skills"));
    if (records.length === 0) errors.push(`PStack ${adapter} adapter has no skills`);
    if (records.length !== expectedCounts[adapter]) {
      errors.push(`PStack ${adapter} adapter has ${records.length} skills; expected ${expectedCounts[adapter]}`);
    }
    for (const record of records) {
      const values = parseFrontmatter(record.text, record.file).values;
      if (adapter === "codex") {
        const metadata = path.join(record.directory, "agents", "openai.yaml");
        if (!(await exists(metadata))) errors.push(`${record.file}: Codex PStack skill lacks agents/openai.yaml`);
        else if (!(await fs.readFile(metadata, "utf8")).includes("allow_implicit_invocation: false")) {
          errors.push(`${metadata}: PStack skills must remain explicit-only`);
        }
      } else if (values.get("disable-model-invocation") !== "true") {
        errors.push(`${record.file}: ${adapter} PStack skills must remain explicit-only`);
      }
    }
    if (adapter === "claude" && (await exists(path.join(adapterRoot, "hooks", "hooks.json")))) {
      errors.push("Claude PStack SessionStart hook must stay removed to avoid always-on context");
    }
    if (adapter === "claude" && (await exists(path.join(adapterRoot, "commands")))) {
      errors.push("Claude PStack command trampolines must stay removed to avoid skill collisions");
    }
    const manifestFile = path.join(
      adapterRoot,
      adapter === "cursor" ? ".cursor-plugin" : adapter === "claude" ? ".claude-plugin" : ".codex-plugin",
      "plugin.json",
    );
    if (!(await exists(manifestFile))) errors.push(`PStack ${adapter} adapter is missing its plugin manifest`);
    else if ((await readJson(manifestFile)).name !== "pstack") errors.push(`PStack ${adapter} namespace must be pstack`);
  }
  return errors;
}

async function makeAdapterExplicit(adapter) {
  const adapterRoot = path.join(root, "plugins", "pstack", adapter);
  const records = await loadSkillRecords(path.join(adapterRoot, "skills"));
  for (const record of records) {
    const rewritten = rewriteFrontmatter(record.text, record.file, {
      "disable-model-invocation": true,
    });
    await fs.writeFile(record.file, rewritten);
  }
}

async function preparePstack() {
  const codexRoot = path.join(root, "plugins", "pstack", "codex");
  const cursorRoot = path.join(root, "plugins", "pstack", "cursor");
  const claudeRoot = path.join(root, "plugins", "pstack", "claude");
  for (const target of [codexRoot, cursorRoot, claudeRoot]) {
    if (!(await exists(target))) fail(`missing imported PStack adapter: ${target}`);
  }

  await fs.rm(path.join(codexRoot, ".agents"), { recursive: true, force: true });
  await fs.rm(path.join(codexRoot, "automations"), { recursive: true, force: true });
  await fs.rm(path.join(codexRoot, "hooks"), { recursive: true, force: true });
  await fs.rm(path.join(codexRoot, "skills", "setup-benny"), { recursive: true, force: true });
  for (const record of await loadSkillRecords(path.join(codexRoot, "skills"))) {
    const metadata = path.join(record.directory, "agents", "openai.yaml");
    const normalized = (await fs.readFile(metadata, "utf8")).replace(/^  products:\n(?:    - .+\n)+/m, "");
    await fs.writeFile(metadata, normalized);
  }
  const codexManifestPath = path.join(codexRoot, ".codex-plugin", "plugin.json");
  const codexManifest = await readJson(codexManifestPath);
  await writeJson(codexManifestPath, {
    ...codexManifest,
    name: "pstack",
    version: "0.14.3+fleet.1",
    description: "Codex-native PStack workflows, namespaced and explicit-only to avoid global skill conflicts.",
    interface: {
      ...codexManifest.interface,
      displayName: "PStack",
      shortDescription: "Explicit Codex engineering workflows",
      longDescription:
        "A Codex-native PStack adapter for deliberate planning, implementation, review, verification, and orchestration. Every skill is explicit-only.",
      developerName: "Lauren Tan, Aqua-123, and Fleet maintainers",
    },
  });

  await makeAdapterExplicit("cursor");
  const cursorManifestPath = path.join(cursorRoot, ".cursor-plugin", "plugin.json");
  const cursorManifest = await readJson(cursorManifestPath);
  await writeJson(cursorManifestPath, {
    ...cursorManifest,
    version: "0.14.3+fleet.1",
    description:
      "PStack engineering workflows for Cursor. Fleet keeps every skill namespaced and explicit-only.",
  });

  await fs.rm(path.join(claudeRoot, "commands"), { recursive: true, force: true });
  await fs.rm(path.join(claudeRoot, "hooks"), { recursive: true, force: true });
  await fs.rm(path.join(claudeRoot, ".codex-plugin"), { recursive: true, force: true });
  await makeAdapterExplicit("claude");
  const claudeManifestPath = path.join(claudeRoot, ".claude-plugin", "plugin.json");
  const claudeManifest = await readJson(claudeManifestPath);
  await writeJson(claudeManifestPath, {
    ...claudeManifest,
    displayName: "PStack",
    version: "0.9.12+fleet.1",
    description:
      "Claude Code PStack workflows derived from upstream 0.14.2. Fleet removes auto-fire hooks and exposes every workflow explicitly.",
  });

  console.log("Prepared explicit-only PStack adapters for Codex, Cursor, and Claude Code.");
}

async function validate() {
  const manifest = await readJson(manifestPath);
  const loose = await validateLooseSkills(manifest);
  const pluginErrors = await validatePstack();
  const errors = [...loose.errors, ...pluginErrors];
  if (errors.length > 0) {
    console.error(errors.map((error) => `ERROR ${error}`).join("\n"));
    fail(`validation failed with ${errors.length} error(s)`);
  }
  for (const warning of loose.warnings) console.warn(`WARN ${warning}`);
  console.log(`Validated ${loose.records.length} loose skills and three PStack adapters.`);
  console.log(`${manifest.skills.implicit.length} skills are implicit; ${manifest.skills.explicit.length} are explicit-only.`);
  return { manifest, ...loose };
}

function timestamp() {
  return new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
}

async function sameLink(target, expected) {
  try {
    const stats = await fs.lstat(target);
    if (!stats.isSymbolicLink()) return false;
    const raw = await fs.readlink(target);
    return path.resolve(path.dirname(target), raw) === path.resolve(expected);
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function moveToBackup(original, backup, operations) {
  if (!(await exists(original))) return;
  await fs.mkdir(path.dirname(backup), { recursive: true });
  await fs.rename(original, backup);
  operations.push({ original, backup });
}

async function install() {
  await validate();
  const agentsSkills = path.join(home, ".agents", "skills");
  const claudeSkills = path.join(home, ".claude", "skills");
  const cursorSkills = path.join(home, ".cursor", "skills");
  const codexSkills = path.join(home, ".codex", "skills");
  const cursorPlugin = path.join(home, ".cursor", "plugins", "local", "pstack");
  const fleetCursorPlugin = path.join(root, "plugins", "pstack", "cursor");
  const previousState = (await exists(statePath)) ? await readJson(statePath) : { installations: [] };
  if (
    previousState.active?.repository === root &&
    (await sameLink(agentsSkills, skillsRoot)) &&
    (await sameLink(claudeSkills, skillsRoot)) &&
    (await sameLink(cursorPlugin, fleetCursorPlugin))
  ) {
    console.log(`Fleet is already installed from ${root}.`);
    console.log(`Rollback snapshot: ${previousState.active.backupRoot}`);
    return;
  }
  const backupId = timestamp();
  const backupRoot = path.join(stateRoot, "backups", backupId);
  const operations = [];

  if (!(await sameLink(agentsSkills, skillsRoot))) {
    await moveToBackup(agentsSkills, path.join(backupRoot, ".agents", "skills"), operations);
    await fs.mkdir(path.dirname(agentsSkills), { recursive: true });
    await fs.symlink(skillsRoot, agentsSkills, "dir");
  }
  const oldLock = path.join(home, ".agents", ".skill-lock.json");
  await moveToBackup(oldLock, path.join(backupRoot, ".agents", ".skill-lock.json"), operations);

  if (!(await sameLink(claudeSkills, skillsRoot))) {
    await moveToBackup(claudeSkills, path.join(backupRoot, ".claude", "skills"), operations);
    await fs.mkdir(path.dirname(claudeSkills), { recursive: true });
    await fs.symlink(skillsRoot, claudeSkills, "dir");
  }

  if (await exists(cursorSkills)) {
    const entries = await fs.readdir(cursorSkills);
    if (entries.length > 0 || (await fs.lstat(cursorSkills)).isSymbolicLink()) {
      await moveToBackup(cursorSkills, path.join(backupRoot, ".cursor", "skills"), operations);
    }
  }
  await fs.mkdir(cursorSkills, { recursive: true });

  await fs.mkdir(codexSkills, { recursive: true });
  for (const entry of await fs.readdir(codexSkills)) {
    if (entry === ".system") continue;
    await moveToBackup(
      path.join(codexSkills, entry),
      path.join(backupRoot, ".codex", "skills", entry),
      operations,
    );
  }

  if (!(await sameLink(cursorPlugin, fleetCursorPlugin))) {
    await moveToBackup(cursorPlugin, path.join(backupRoot, ".cursor", "plugins", "local", "pstack"), operations);
    await fs.mkdir(path.dirname(cursorPlugin), { recursive: true });
    await fs.symlink(fleetCursorPlugin, cursorPlugin, "dir");
  }

  const installation = {
    backupId,
    backupRoot,
    installedAt: new Date().toISOString(),
    repository: root,
    operations,
  };
  await writeJson(statePath, {
    version: 1,
    active: installation,
    installations: [...(previousState.installations ?? []), installation],
  });
  console.log(`Installed Fleet from ${root}.`);
  console.log(`Rollback snapshot: ${backupRoot}`);
}

async function restore(args) {
  if (!(await exists(statePath))) fail("no Fleet installation state exists");
  const state = await readJson(statePath);
  const requested = args[0];
  const installation = requested
    ? state.installations.find((candidate) => candidate.backupId === requested)
    : state.active;
  if (!installation) fail(`unknown backup id: ${requested}`);

  for (const operation of [...installation.operations].reverse()) {
    if (!(await exists(operation.backup))) continue;
    if (await exists(operation.original)) {
      const stats = await fs.lstat(operation.original);
      if (stats.isSymbolicLink()) {
        await fs.unlink(operation.original);
      } else if (stats.isDirectory() && (await fs.readdir(operation.original)).length === 0) {
        await fs.rmdir(operation.original);
      } else {
        fail(`refusing to overwrite changed path during restore: ${operation.original}`);
      }
    }
    await fs.mkdir(path.dirname(operation.original), { recursive: true });
    await fs.rename(operation.backup, operation.original);
  }
  if (installation.pluginChanges) {
    const codexPlugins = runCli("codex", ["plugin", "list", "--json"], { json: true });
    for (const selector of codexPlugins.installed.filter((plugin) => plugin.name === "pstack").map((plugin) => plugin.pluginId)) {
      runCli("codex", ["plugin", "remove", selector, "--json"]);
    }
    for (const selector of installation.pluginChanges.previousCodex ?? []) {
      runCli("codex", ["plugin", "add", selector, "--json"]);
    }
    const claudePlugins = runCli("claude", ["plugin", "list", "--json"], { json: true });
    for (const selector of claudePlugins.filter((plugin) => plugin.id.startsWith("pstack@")).map((plugin) => plugin.id)) {
      runCli("claude", ["plugin", "uninstall", selector, "--scope", "user", "--yes"]);
    }
    for (const selector of installation.pluginChanges.previousClaude ?? []) {
      runCli("claude", ["plugin", "install", selector, "--scope", "user", "--yes"]);
    }
  }
  await writeJson(statePath, { ...state, active: null });
  console.log(`Restored Fleet snapshot ${installation.backupId}.`);
}

function runCli(command, args, { json = false } = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) {
    fail(`${command} ${args.join(" ")} failed:\n${result.stderr || result.stdout}`);
  }
  if (!json) {
    if (result.stdout.trim()) console.log(result.stdout.trim());
    return result.stdout;
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    fail(`${command} ${args.join(" ")} did not return JSON`);
  }
}

async function installPlugins() {
  await validate();
  const state = (await exists(statePath)) ? await readJson(statePath) : null;
  const recordedPluginChanges = state?.active?.pluginChanges;
  const codexMarketplaces = runCli("codex", ["plugin", "marketplace", "list", "--json"], { json: true });
  if (!codexMarketplaces.marketplaces.some((marketplace) => marketplace.name === "fleet")) {
    runCli("codex", ["plugin", "marketplace", "add", root, "--json"]);
  }
  const codexPlugins = runCli("codex", ["plugin", "list", "--json"], { json: true });
  const previousCodex = recordedPluginChanges?.previousCodex ?? codexPlugins.installed
    .filter((plugin) => plugin.name === "pstack" && plugin.marketplaceName !== "fleet")
    .map((plugin) => plugin.pluginId);
  for (const selector of codexPlugins.installed.filter((plugin) => plugin.name === "pstack").map((plugin) => plugin.pluginId)) {
    runCli("codex", ["plugin", "remove", selector, "--json"]);
  }
  runCli("codex", ["plugin", "add", "pstack@fleet", "--json"]);

  const claudeMarketplaces = runCli("claude", ["plugin", "marketplace", "list", "--json"], { json: true });
  if (!claudeMarketplaces.some((marketplace) => marketplace.name === "fleet")) {
    runCli("claude", ["plugin", "marketplace", "add", root, "--scope", "user"]);
  }
  const claudePlugins = runCli("claude", ["plugin", "list", "--json"], { json: true });
  const previousClaude = recordedPluginChanges?.previousClaude ?? claudePlugins
    .filter((plugin) => plugin.id.startsWith("pstack@") && plugin.id !== "pstack@fleet")
    .map((plugin) => plugin.id);
  for (const selector of claudePlugins.filter((plugin) => plugin.id.startsWith("pstack@")).map((plugin) => plugin.id)) {
    runCli("claude", ["plugin", "uninstall", selector, "--scope", "user", "--yes"]);
  }
  runCli("claude", ["plugin", "install", "pstack@fleet", "--scope", "user", "--yes"]);

  if (state?.active) {
    state.active.pluginChanges = { previousCodex, previousClaude };
    const index = state.installations.findIndex((candidate) => candidate.backupId === state.active.backupId);
    if (index !== -1) state.installations[index] = state.active;
    await writeJson(statePath, state);
  }
  console.log("Installed Fleet PStack for Codex and Claude Code.");
  console.log(`Cursor loads the Fleet adapter from ${path.join(home, ".cursor", "plugins", "local", "pstack")}.`);
}

async function doctor() {
  const { manifest, records, warnings } = await validate();
  const roots = [
    path.join(home, ".agents", "skills"),
    path.join(home, ".claude", "skills"),
    path.join(home, ".cursor", "skills"),
    path.join(home, ".codex", "skills"),
  ];
  console.log("\nDiscovery roots");
  for (const target of roots) {
    if (!(await exists(target))) {
      console.log(`- ${target}: missing`);
      continue;
    }
    const stats = await fs.lstat(target);
    const resolved = await fs.realpath(target);
    console.log(`- ${target}: ${stats.isSymbolicLink() ? "symlink" : "directory"} -> ${resolved}`);
  }
  console.log("\nCatalog");
  console.log(`- ${records.length} installed loose skills`);
  console.log(`- ${manifest.skills.implicit.length} implicit descriptions`);
  console.log(`- ${manifest.skills.explicit.length} explicit-only skills`);
  console.log(`- ${manifest.skills.projectOnly.length} project/plugin-only exclusions`);
  console.log(`- ${manifest.skills.removed.length} removed or consolidated skills`);
  console.log(`- ${warnings.length} portability warning(s)`);
}

const [command = "doctor", ...args] = process.argv.slice(2);
const commands = {
  doctor,
  "import-current": () => importCurrent(args),
  install,
  "install-plugins": installPlugins,
  "prepare-pstack": preparePstack,
  restore: () => restore(args),
  validate,
};

if (!commands[command]) fail(`unknown command: ${command}`);
await commands[command]();
