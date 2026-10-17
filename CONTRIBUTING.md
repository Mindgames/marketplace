# Contributing

Thanks for adding to the Cline Marketplace. Each contribution is a single new folder, which keeps reviews focused and avoids merge conflicts.

## Add an entry

1. Pick the type: `plugin`, `skill`, or `mcp`.
2. Create `registry/<type>s/<slug>/entry.json`. The `<slug>` is kebab-case and must equal the `id` field.
3. Point `$schema` at the matching schema so your editor validates as you type:
   - plugins: `../../../schemas/plugin.schema.json`
   - skills: `../../../schemas/skill.schema.json`
   - mcps: `../../../schemas/mcp.schema.json`
4. Fill in the fields (see an existing entry for reference). The important one is `install.args`: everything after `cline <type> install`.
5. Optionally add an `icon.svg` (or `icon.png`) next to `entry.json` and set `"icon": "./icon.svg"`. Absolute https URLs are also allowed.
6. Run validation:

   ```bash
   npm run validate
   ```

7. Open a PR.

## install.args

Store the tokens exactly as a user would type them after the subcommand. The verb comes from `type`, so you never repeat `cline ... install` in the entry.

- plugin: `["goal"]`
- skill (whole repo): `["owner/repo"]`
- skill (one skill from a repo): `["owner/repo", "--skill", "name"]`
- mcp (remote, OAuth): `["name", "--transport", "http", "https://host/mcp"]`
- mcp (remote, static header): `["name", "--transport", "http", "https://host/mcp", "--header", "Authorization: Bearer <token>"]`
- mcp (stdio): `["name", "--", "npx", "-y", "some-mcp-server"]`

Put secrets and runtime environment variables that are not part of the command in `install.env`:

```json
"install": {
  "args": ["web-search"],
  "env": [
    { "name": "EXA_API_KEY", "required": true, "description": "Exa search key", "url": "https://exa.ai" }
  ]
}
```

## Tags

Every entry needs at least one tag, and tags must come from the canonical vocabulary in [`tags.json`](./tags.json). Use the lowercase `id` (for example `productivity`, `software`, `research`), not the display label. Validation fails on an unknown tag.

If your entry needs a category that does not exist yet, add it to `tags.json` in the same PR:

```json
{ "id": "devops", "label": "DevOps" }
```

Order in `tags.json` is the display order for a filter UI, so place new tags thoughtfully.

## Review bar

- Entries should be high quality, maintained, and safe to install.
- `verified: true` is reserved for entries the Cline team has reviewed; leave it `false` in your PR.
- Keep `tagline` short (one sentence). Use `description` for detail.

## Environment placeholders in commands

For an environment value used inside an install argument, use a plain
`${VARIABLE_NAME}` placeholder and declare that name in the same entry's
`install.env`. For example, `"Authorization: Bearer ${SERVICE_TOKEN}"` together
with `{ "name": "SERVICE_TOKEN", "required": true }` renders a double-quoted
argument that expands in the user's POSIX-compatible shell when they run it.
The generator never reads or embeds the environment value, and `install.args`
remains unchanged for clients that handle arguments themselves.

Names use letters, digits, and underscores and cannot start with a digit.
Undeclared placeholders remain literal. If an argument contains other dollar
syntax, such as `$NAME`, `$(...)`, `${NAME:-default}`, or nested placeholders,
the entire argument remains literal. Other text, including quotes and
backslashes, is preserved as literal text. Values with spaces or shell
metacharacters remain one argument and are not evaluated as shell code.

Set the declared variables before running the rendered command. An unset or
empty variable follows the shell's normal double-quoted expansion behavior
(empty in a normal shell; an unset variable may fail with `set -u`).

Run `npm run test:commands` to exercise command rendering with fake values and
a local CLI stub. These tests do not install servers or contact services.
