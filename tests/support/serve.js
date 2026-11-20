// Serves the app's files as they are, like GitHub Pages does. No build step.
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const port = Number(process.argv[2]) || 4173;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let file = path.join(root, decodeURIComponent(url.pathname));
  if (!file.startsWith(root) || file.includes(path.join(root, 'node_modules')) || file.includes(path.join(root, 'tests'))) { res.writeHead(404).end(); return; }
  if (url.pathname.endsWith('/')) file = path.join(file, 'index.html');
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}).listen(port, '127.0.0.1');
