// Tsx/Node preload that turns `import 'server-only'` into a no-op so
// verification scripts can import server-side modules. Used ONLY by scripts/*.
const Module = require('module');
const path = require('path');

const noopPath = path.join(__dirname, 'server-only-noop.cjs');
const originalResolve = Module._resolveFilename;

Module._resolveFilename = function (request, ...rest) {
  if (request === 'server-only') return noopPath;
  return originalResolve.call(this, request, ...rest);
};
