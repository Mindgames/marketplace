import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const fakeValue = 'fake value with spaces, "quotes", \'apostrophes\', \\backslash, $HOME, $(printf injected), `printf injected`, * and\na newline';
const UNDECLARED_PLACEHOLDER = "${UNDECLARED}";

function generate(t, entries) {
  const temporary = mkdtempSync(join(tmpdir(), "marketplace-command-"));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  mkdirSync(join(temporary, "scripts"));
  copyFileSync(join(root, "scripts", "generate.mjs"), join(temporary, "scripts", "generate.mjs"));
  copyFileSync(join(root, "tags.json"), join(temporary, "tags.json"));
  for (const entry of entries) {
    const directory = join(temporary, "registry", `${entry.type}s`, entry.id);
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, "entry.json"), JSON.stringify(entry));
  }
  const run = spawnSync(process.execPath, [join(temporary, "scripts", "generate.mjs")], {
    encoding: "utf8",
    // Deliberately no placeholder values: generation must not resolve secrets.
    env: { MARKETPLACE_BASE_URL: "https://example.invalid" },
  });
  assert.equal(run.status, 0, run.stderr);
  return JSON.parse(readFileSync(join(temporary, "dist", "catalog.json"), "utf8")).entries;
}

function execute(command, env = {}) {
  // A shell function replaces the real CLI. Nothing is installed or contacted.
  const capture = 'cline() { "$NODE" -e \'process.stdout.write(JSON.stringify(process.argv.slice(1)))\' -- "$@"; }; ';
  const run = spawnSync("/bin/sh", ["-c", capture + command], {
    encoding: "utf8",
    env: { NODE: process.execPath, ...env },
  });
  assert.equal(run.status, 0, run.stderr);
  return JSON.parse(run.stdout);
}

const affected = [
  "cockroachdb-cloud", "greptile", "pagerduty", "sonatype-guide", "terraform", "zoom-docs", "zoom-whiteboard",
];
for (const id of affected) {
  test(`render declared environment placeholders for ${id}`, (t) => {
    const entry = JSON.parse(readFileSync(join(root, "registry", "mcps", id, "entry.json"), "utf8"));
    const [generated] = generate(t, [entry]);
    const env = Object.fromEntries(entry.install.env.map(({ name }) => [name, fakeValue]));
    const expectedArgs = entry.install.args.map((arg) => arg.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, name) => env[name]));
    assert.deepEqual(generated.install.args, entry.install.args);
    assert.equal(generated.install.command.includes(fakeValue), false);
    assert.deepEqual(execute(generated.install.command, env), ["mcp", "install", ...expectedArgs]);
  });
}

function fixture(args, env = [{ name: "TOKEN" }]) {
  return {
    id: "test-server", type: "mcp", name: "Test", tagline: "Test", description: "Offline test",
    tags: ["software"], install: { args: ["test-server", "--", ...args], env },
  };
}

test("expand repeated declared placeholders and preserve undeclared placeholders", (t) => {
  const args = ["${TOKEN}", "prefix=${TOKEN}/${TOKEN}", "${UNDECLARED}", "${TOKEN}:${UNDECLARED}"];
  const [entry] = generate(t, [fixture(args)]);
  assert.deepEqual(execute(entry.install.command, { TOKEN: fakeValue, UNDECLARED: "must-not-expand" }), [
    "mcp", "install", "test-server", "--", fakeValue, `prefix=${fakeValue}/${fakeValue}`, "${UNDECLARED}", `${fakeValue}:${UNDECLARED_PLACEHOLDER}`,
  ]);
});

test("literal quotes, backslashes and backticks adjacent to placeholders stay inert", (t) => {
  const args = ['"${TOKEN}"', "\\${TOKEN}", "\\\\${TOKEN}", "`${TOKEN}`", "'${TOKEN}'", ";${TOKEN}|&"];
  const [entry] = generate(t, [fixture(args)]);
  assert.deepEqual(execute(entry.install.command, { TOKEN: fakeValue }), [
    "mcp", "install", "test-server", "--", ...args.map((arg) => arg.replace("${TOKEN}", fakeValue)),
  ]);
});

test("ordinary arguments and unsupported shell expressions remain literal", (t) => {
  const args = [
    "plain", "", "with spaces", 'quote" and \' and \\', "$HOME", "${UNDECLARED}",
    "${TOKEN:-fallback}", "${TOKEN:+alternative}", "${#TOKEN}", "${TOKEN:1}",
    "${OTHER:-${TOKEN}${TOKEN}}", "${TOKEN", "$((1 + 2))", "$(printf injected)",
    "$(printf ${TOKEN})", "`printf injected`", "${TOKEN} $HOME", "literal$ ${TOKEN}",
    "a;b|c&d<>e", "*?[abc]", "line\nbreak", "${INVALID-NAME}",
  ];
  const [entry] = generate(t, [fixture(args, [{ name: "TOKEN" }, { name: "INVALID-NAME" }])]);
  assert.deepEqual(execute(entry.install.command, { TOKEN: "must-not-expand", HOME: "must-not-expand", UNDECLARED: "must-not-expand" }), [
    "mcp", "install", "test-server", "--", ...args,
  ]);
});

test("unset and empty declared variables retain ordinary quoted shell behavior", (t) => {
  const [entry] = generate(t, [fixture(["${TOKEN}", "prefix=${TOKEN}"])]);
  for (const env of [{}, { TOKEN: "" }]) {
    assert.deepEqual(execute(entry.install.command, env), ["mcp", "install", "test-server", "--", "", "prefix="]);
  }
});

test("arguments without environment declarations keep placeholders literal", (t) => {
  const original = fixture(["${TOKEN}"]);
  delete original.install.env;
  const [entry] = generate(t, [original]);
  assert.deepEqual(execute(entry.install.command, { TOKEN: "must-not-expand" }), ["mcp", "install", "test-server", "--", "${TOKEN}"]);
});
