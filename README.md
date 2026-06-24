# mf-vite-comment-trap

Minimal reproduction for a bug in `@module-federation/vite`: the plugin rewrites federated `import('remote/x')` text wherever it shows up in a file's raw source — including inside comments and string literals. The rewrite is multi-line, so it spills out of the comment or string and either breaks the parser or silently corrupts the surrounding text.

I hit this in a SvelteKit + Module Federation host. A `+page.ts` had a comment mentioning `import('quizzes/App')` for documentation. The plugin rewrote that text in place, hover-preload silently stopped working, and there was no error anywhere. Took a side-by-side diff against a sibling MFE to find it.

## Run it

```bash
pnpm install
pnpm dev
```

Then in another terminal:

```bash
curl -i http://localhost:5173/src/trap_string.js     # HTTP 500
curl    http://localhost:5173/src/trap_block.js      # HTTP 200, body corrupted
curl    http://localhost:5173/src/trap_template.js   # HTTP 200, body corrupted
```

`trap_string.js` returns a 500 — Vite's `vite:import-analysis` rejects the transformed output. The other two return 200 but with `__mf_remote_pending` / `__mf_m__` glue code spliced into the middle of the comment or template literal.

## What's in here

Four files under `src/`, each putting `import('remoteApp/App')` in a different non-code position:

- `trap.js` — inside a `//` line comment
- `trap_block.js` — inside a `/* */` block comment
- `trap_string.js` — inside a `"double-quoted string"`
- `trap_template.js` — inside a `` `template literal` ``

None of them call `import()` for real. The plugin should leave them alone.

## About `trap.js`

On `1.15.5` and earlier this one reproduced loudly too. On `1.16.10` it currently returns 200 — the line-comment file gets routed through a different transform path (the entry-bootstrap shim) and never reaches the buggy regex tier. That's not an upstream fix, just a side effect of PR #797's lexer-removal refactor. The buggy code in `collectFromRegex` is unchanged, and a future dispatcher change can flip `trap.js` back.

## Versions

```
@module-federation/vite  1.16.10   (current `latest` on npm)
vite                     8.0.12
node                     24.12.0
pnpm                     10.26.2
```

The remote URL in `vite.config.js` is deliberately unreachable — the bug fires at transform time, before any network call.
