import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const icon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>\n';

for (const name of ["ordinary", "with spaces", "caf\u00e9-\u65e5\u672c", "hash#name", "percent%20name"]) {
  test(`validate and generate from checkout path ${JSON.stringify(name)}`, (t) => {
    const temporary = mkdtempSync(join(tmpdir(), "marketplace-test-"));
    t.after(() => rmSync(temporary, { recursive: true, force: true }));
    const checkout = join(temporary, name);
    const entryDirectory = join(checkout, "registry", "plugins", "test-plugin");
    mkdirSync(entryDirectory, { recursive: true });
    mkdirSync(join(checkout, "scripts"));
    const script = join(checkout, "scripts", "generate.mjs");
    copyFileSync(join(root, "scripts", "generate.mjs"), script);
    writeFileSync(join(checkout, "tags.json"), JSON.stringify({
      tags: [{ id: "software", label: "Software" }],
    }));
    writeFileSync(join(entryDirectory, "entry.json"), JSON.stringify({
      id: "test-plugin",
      type: "plugin",
      name: "Test plugin",
      tagline: "A test fixture.",
      description: "Offline generator fixture.",
      tags: ["software"],
      icon: "./icon.svg",
      install: { args: ["test-plugin"] },
    }));
    writeFileSync(join(entryDirectory, "icon.svg"), icon);

    const run = (...args) => spawnSync(process.execPath, [script, ...args], {
      // The script must locate its checkout independently of the invoking cwd.
      cwd: temporary,
      encoding: "utf8",
      env: { ...process.env, MARKETPLACE_BASE_URL: "https://example.invalid/catalog/" },
    });
    const validation = run("--check");
    assert.equal(validation.status, 0, validation.stderr);
    assert.match(validation.stdout, /Validation passed: 1 entries\./);
    assert.equal(existsSync(join(checkout, "dist")), false);

    const generated = run();
    assert.equal(generated.status, 0, generated.stderr);
    const catalog = JSON.parse(readFileSync(join(checkout, "dist", "catalog.json"), "utf8"));
    assert.deepEqual(catalog.counts, { total: 1, plugins: 1 });
    assert.equal(catalog.entries[0].install.command, "cline plugin install test-plugin");
    assert.equal(catalog.entries[0].icon, "https://example.invalid/catalog/icons/plugin/test-plugin.svg");
    assert.equal(readFileSync(join(checkout, "dist", "icons", "plugin", "test-plugin.svg"), "utf8"), icon);
  });
}
