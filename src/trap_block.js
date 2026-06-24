/*
  Block-comment variant: the literal text below is inside a /* ... *\/ block,
  but the @module-federation/vite transform should still rewrite it via the
  regex fallback when AST/lexer find no real ImportExpression.

  Example: import('remoteApp/App')
*/
console.log('trap_block.js loaded — if you see this in the browser, the block-comment variant did NOT reproduce.');
