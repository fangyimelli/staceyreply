import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';

const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 4173);
const root = resolve(process.cwd());

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8'
};

function safePath(urlPath) {
  const noQuery = urlPath.split('?')[0];
  const normalized = normalize(decodeURIComponent(noQuery)).replace(/^([.][.][/\\])+/, '');
  return join(root, normalized);
}

const server = createServer((req, res) => {
  const target = safePath(req.url || '/');
  let filePath = target;

  if (!existsSync(filePath)) {
    filePath = join(root, 'index.html');
  } else {
    const st = statSync(filePath);
    if (st.isDirectory()) {
      filePath = join(filePath, 'index.html');
    }
  }

  if (!existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
    return;
  }

  const type = mime[extname(filePath)] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type });
  createReadStream(filePath).pipe(res);
});

server.listen(port, host, () => {
  console.log(`Static server running at http://${host}:${port}`);
});
