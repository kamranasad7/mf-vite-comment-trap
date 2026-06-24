// Entry — keeps the comment-trap out of an entry-treated module.
// The plugin's bootstrap rewrite replaces entry files wholesale, which masks
// the in-place source transform bug. The bug surfaces in non-entry modules.
//
// Each import below is a separate variant of the same root cause: a federated
// import specifier in a non-code position (comment / string / template) being
// rewritten as if it were a real `import()` call expression.
//
//   trap.js          — specifier inside a `//` line comment   (loud: parse error)
//   trap_block.js    — specifier inside a `/* */` block comment (silent corruption)
//   trap_string.js   — specifier inside a "double-quoted" string literal (loud)
//   trap_template.js — specifier inside a `template` literal (silent corruption)
//
// On the buggy plugin, requesting `trap.js` and `trap_string.js` returns
// HTTP 500 from `vite:import-analysis`; `trap_block.js` and `trap_template.js`
// return HTTP 200 but with their comment/template contents replaced by the
// federated import expansion (worse — runs without an error). On a fixed
// plugin all four are served unchanged.
import './trap.js';
import './trap_block.js';
import './trap_string.js';
import './trap_template.js';
