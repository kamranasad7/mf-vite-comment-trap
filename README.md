# mf-vite-comment-trap

Minimal reproduction for a bug in `@module-federation/vite`. The plugin rewrites federated `import('remote/x')` text wherever it shows up in a file's raw source, even inside comments and string literals. The rewrite is multi-line, so it spills out of the comment or string and either breaks the parser or silently corrupts the surrounding text.

I hit this in a SvelteKit + MF host. A `+page.ts` had a comment mentioning `import('quizzes/App')` as docs. The plugin rewrote the comment, hover-preload broke silently, no console error. Found it by diffing against a sibling MFE.

## Run it

```bash
pnpm install
pnpm dev
```

Then in another terminal:

```bash
curl -i http://localhost:5173/src/trap_string.js                # HTTP 500
curl    http://localhost:5173/src/trap_block.js                 # HTTP 200, body corrupted
curl    http://localhost:5173/src/trap_template.js              # HTTP 200, body corrupted
curl -i http://localhost:5173/src/trap.js?mf-entry-bootstrap    # HTTP 500
```

`trap_string.js` returns 500; `vite:import-analysis` rejects the transformed output. `trap_block.js` and `trap_template.js` return 200 with `__mf_remote_pending` / `__mf_m__` glue code spliced into the middle of the comment or template literal. `trap.js` looks fine on a direct GET because the plugin treats it as an entry and serves a bootstrap shim first; the actual transform happens on the `?mf-entry-bootstrap` re-import, where it 500s the same way.

## What's in here

Four files under `src/`, each putting `import('remoteApp/App')` in a different place:

- `trap.js` inside a `//` line comment
- `trap_block.js` inside a `/* */` block comment
- `trap_string.js` inside a `"double-quoted string"`
- `trap_template.js` inside a `` `template literal` ``

None of them call `import()` for real. The plugin should leave them alone.

## Versions

```
@module-federation/vite  1.16.10   (current `latest` on npm)
vite                     8.0.12
node                     24.12.0
pnpm                     10.26.2
```

The remote URL in `vite.config.js` is deliberately unreachable. The bug fires at transform time, before any network call.
