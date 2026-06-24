// =====================================================================
// COMMENT-TRAP
// The line below is *only* a comment, but the @module-federation/vite
// source transform rewrites the literal `import('remoteApp/App')` text
// inside it, producing invalid JS:
//
//   await import('remoteApp/App');
//
// Vite's import-analysis plugin then chokes:
//   "Failed to parse source for import analysis because the content
//    contains invalid JS syntax. If you are using JSX, make sure to
//    name the file with the .jsx or .tsx extension."
//
// Delete or rephrase the line above (e.g. concat the specifier:
// `import('remoteApp' + '/App')`) and the file parses cleanly.
// =====================================================================

console.log('trap.js loaded — if you see this in the browser, the bug did NOT reproduce.');
