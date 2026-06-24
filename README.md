# `@module-federation/vite` comment-trap — minimal repro

The plugin's source transform rewrites the literal text of federated dynamic-import specifiers (e.g. `import('remoteApp/App')`) **anywhere it appears in the file's raw text — including inside comments and string literals**. Because the substitution expands one expression into a multi-line block, the continuation lines escape the surrounding `//` comment and become invalid top-level JavaScript. Vite's `vite:import-analysis` plugin then aborts the file.

Versions reproduced on:

- `@module-federation/vite@1.15.4`
- `vite@8.0.12`
- Node 24.12.0 / pnpm 10.26.2 / Windows 11

(Also confirmed in `1.15.2` against `vite@7.x` in the upstream project — this is not new.)

---

## TL;DR repro

```bash
pnpm install
pnpm dev
# visit the printed http://localhost:5174  (or curl /src/trap.js)
```

You will see, with the file unchanged:

```
[vite] Internal server error: Failed to parse source for import analysis because the
content contains invalid JS syntax. If you are using JSX, make sure to name the file
with the .jsx or .tsx extension.
  Plugin: vite:import-analysis
  File: src/trap.js
```

Now open [`src/trap.js`](src/trap.js) and delete the lines mentioning `import('remoteApp/App')` — they are **only inside a `//` comment**. Save. The error disappears and `console.log` from `trap.js` runs in the browser.

---

## Expected vs actual

| | Expected | Actual |
|---|---|---|
| Federated specifier inside `//` comment | Ignored (it's a comment) | Rewritten, breaks parse |
| Federated specifier inside string literal | Ignored (it's data) | Same — rewritten |
| Federated specifier in real code | Rewritten | Rewritten ✓ |

The plugin should only rewrite **actual** `ImportExpression` (a.k.a. dynamic `import()`) AST nodes whose argument is a string literal matching a configured remote. It currently matches at the source-text level.

---

## What the plugin produces (verbatim)

Source (`src/trap.js`):

```js
// The line below is *only* a comment, but the @module-federation/vite
// source transform rewrites the literal `import('remoteApp/App')` text
// inside it, producing invalid JS:
//
//   await import('remoteApp/App');
//
// ...
```

After transform — the in-comment specifier was expanded into multiple lines of code. Only the **first** line of the expansion retains the `//` prefix; everything after spills out of the comment:

```js
// The line below is *only* a comment, but the @module-federation/vite
// source transform rewrites the literal `import('remoteApp/App').then(function(__mf_m__) {
  var __mf_ready__ = __mf_m__ && __mf_m__.__mf_remote_pending ? __mf_m__.__mf_remote_pending.then(function(__mf_resolved__) { return __mf_resolved__ || __mf_m__; }) : __mf_m__;
  return Promise.resolve(__mf_ready__).then(function(__mf_m__) {
    // ...many more lines of expansion...
    return __mf_ns__;
  });
})` text
// inside it, producing invalid JS:
// ...
```

That stray `})` text` line at column 0 is what `vite:import-analysis` rejects.

---

## Real-world impact

Caught in a SvelteKit + Module Federation host. A `+page.ts` had a *comment* describing the bootstrap flow that mentioned `` `import('quizzes/App')` `` in backticks for documentation purposes. The plugin rewrote the literal text inside the comment, the file silently produced corrupted output, and hover-preload stopped working — with **no error**. Took a side-by-side diff against a sibling MFE to spot it.

This repro reproduces the *loud* failure mode (parse error). A *silent* failure mode also exists when the rewrite happens to land in a position where the resulting JS still parses but executes unexpected runtime logic. That one is much harder to debug.

---

## Likely fix

The transform should walk the AST and only substitute on real dynamic-import call expressions, e.g.:

1. Parse the module with `acorn` (Vite already exposes a fast parser via `this.parse` inside a Rollup/Vite transform plugin).
2. Walk the program looking for `ImportExpression` (TC39) nodes — that is, `node.type === 'ImportExpression'` — whose `source` is a `Literal` (string) starting with a known remote name.
3. Replace **only those specific node ranges** in the original source, using `magic-string` so the source map stays correct.

Any walker — `estree-walker`, manual recursion, or `acorn-walk` — is fine; the key change is moving from regex-on-source to AST-aware replacement.

A defensive interim mitigation (without the AST rewrite): before applying the regex, strip `//` and `/* */` comments and template-literal/string contents from a *cloned* source string, find the offsets where matches still exist in the cloned string, and only substitute at those offsets in the original. This is fragile but doesn't require pulling in a parser.

---

## Where to look in the plugin source

The transform that rewrites dynamic imports lives in `packages/vite/src/` of [`module-federation/core`](https://github.com/module-federation/core). The relevant transform is invoked from the `transform` hook of the plugin returned by `federation()`. Grep for either the helper name (`__mf_m__`, `__mf_remote_pending`, `__mf_ns__`, all visible in the expanded output above) or for the import-call rewriting helper — that's where the regex-vs-AST decision was made.

---

## Repo layout

```
mf-vite-comment-trap/
├── package.json         ← only deps: vite + @module-federation/vite
├── vite.config.js       ← single remote, unreachable URL (the bug fires before any fetch)
├── index.html
├── src/
│   ├── main.js          ← entry — clean. imports trap.js
│   └── trap.js          ← the file with the in-comment specifier
└── README.md            ← this file
```

`trap.js` is intentionally a non-entry module: when the plugin sees an entry file it replaces the whole body wholesale (bootstrap shim), which would mask the in-place transform. Importing `trap.js` from `main.js` puts it through the regular transform path that real route files go through.

---

## Workarounds for users hitting this

While waiting for an upstream fix:

- **Delete commented-out federated imports**, don't leave them as `//` lines.
- If you must reference a specifier in prose, break the literal: e.g. write `` `import('remoteApp' + '/App')` `` or `import("remoteApp/App")` (double quotes are matched separately and may or may not trip the regex depending on the version; double-check on your install).
- Don't put federated specifiers inside string literals you don't actually want rewritten — same hazard.

---

## Agent playbook — picking this up cold

If you're an agent invoked to land a fix, here's the path from zero to merged PR. Don't skip steps — each one has a reason.

### 1. Confirm the bug is still real

```bash
cd <this repo>
pnpm install
pnpm dev
```

Visit the printed URL (default `http://localhost:5174`). You should see the Vite overlay with `Failed to parse source for import analysis...` pointing at `src/trap.js`. If you don't, the upstream has likely already shipped a fix — check the latest `@module-federation/vite` release notes and stop.

### 2. Check the issue tracker before opening anything

Search [`module-federation/core` issues](https://github.com/module-federation/core/issues) for terms like:

- `import-analysis comment`
- `Failed to parse source for import analysis`
- `__mf_remote_pending`
- `vite:import-analysis`
- `comment trap` / `regex transform`

If a tracking issue already exists, comment with a link to this repro and proceed straight to a PR referencing it. If not, open a new issue first with the link to this repro — maintainers usually want an issue to anchor the PR.

### 3. Clone the plugin repo and locate the transform

The plugin source lives in the `module-federation/core` monorepo. Standard setup:

```bash
git clone https://github.com/module-federation/core
cd core
pnpm install
```

The package you're editing is `@module-federation/vite` — typically at `packages/vite/`. Inside that package, find the file that owns the dynamic-import rewrite. Fastest grep targets:

- `__mf_remote_pending` (unique to the expansion shown above)
- `__moduleExports` plus `__mf_m__`
- `'__esModule'` plus `__mf_ns__`
- A regex literal that matches `import\(['"]`

Whichever file contains the helper that generates the multi-line expansion in section [What the plugin produces](#what-the-plugin-produces-verbatim) is the file you change. The current implementation will look like a regex `.replace()` over the raw source string.

### 4. Implement the AST-aware rewrite

Recommended approach:

1. Parse with `this.parse()` (the Rollup transform context exposes Vite's parser).
2. Walk with `estree-walker` or `acorn-walk`.
3. Match nodes shaped `{ type: 'ImportExpression', source: { type: 'Literal', value: string } }` where `source.value` starts with a configured remote name followed by `/` or equals it.
4. Use `magic-string`'s `overwrite(start, end, replacement)` for each matched node, keyed on `node.start` / `node.end`.
5. Return `{ code: ms.toString(), map: ms.generateMap({ hires: true }) }` from the transform hook.

`magic-string` is almost certainly already a dependency — check `package.json` before adding it.

### 5. Add tests

Tests for `@module-federation/vite` live with the package (likely `packages/vite/__tests__/` or similar — confirm). Add a test that runs the plugin's transform on a synthetic source containing the federated specifier in each of these contexts and asserts the output is **byte-identical to the input** in cases (a)–(d):

- (a) inside a `//` line comment
- (b) inside a `/* */` block comment
- (c) inside a template literal: `` `import('remoteApp/App')` ``
- (d) inside a single-quoted string: `"import('remoteApp/App')"` and `'import(\\'remoteApp/App\\')'`

Then add a positive test: a real `await import('remoteApp/App')` call **must** still be rewritten exactly as before.

### 6. Verify the fix against this repro

The cleanest verification loop without publishing:

```bash
# in the core repo
cd packages/vite
pnpm build               # or whatever the local build script is

# in this repro
pnpm add -D <abs-path-to>/module-federation-core/packages/vite
# or pnpm link --global / pnpm link there + pnpm link --global here
pnpm dev
```

The Vite overlay should disappear and the browser console should print `trap.js loaded — if you see this in the browser, the bug did NOT reproduce.` That string is your green light.

### 7. Open the PR

- Reference the issue from step 2 in the PR description.
- Quote the verbatim transform output from this README so reviewers see the failure shape without running anything.
- Link this repro repo.
- Check `CONTRIBUTING.md` in the core repo for changeset / commit-format requirements. The repo uses **changesets** historically — `pnpm changeset` from the root and pick `patch`.

---

## Notes for human contributors

If you're proposing a PR by hand, the agent playbook above still applies — items 1, 2, 4, 5, 6, 7 in particular. The main thing the playbook adds over reading the rest of this README is the *order of operations* and the link-local verification loop, which is easy to do wrong.

This repo is intentionally tiny so it can be cited verbatim in the issue body — the failure is deterministic on the versions listed above.
