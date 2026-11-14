import http from 'node:http';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../output/site');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.exe': 'application/octet-stream' };

export function createSiteServer() {
  return http.createServer(async (req, res) => {
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }).end(); return; }
    try {
      const pathname = decodeURIComponent(req.url.split('?')[0]);
      if (!pathname.startsWith('/') || pathname.includes('\\') || pathname.includes('\0') ||
        pathname.split('/').some(segment => segment.startsWith('.'))) throw new Error('Invalid path');
      let file = path.resolve(root, '.' + pathname);
      if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
      const resolvedRoot = await realpath(root);
      file = await realpath(file);
      if (!file.startsWith(resolvedRoot + path.sep) || !types[path.extname(file)]) throw new Error('Not a public file');
      const info = await stat(file);
      if (!info.isFile()) throw new Error('Not a file');
      const headers = { 'Content-Type': types[path.extname(file)], 'Content-Length': info.size,
        'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'X-WhereFile-Static-Preview': '1' };
      if (path.extname(file) === '.exe') headers['Content-Disposition'] = `attachment; filename="${path.basename(file)}"`;
      res.writeHead(200, headers);
      if (req.method === 'HEAD') res.end();
      else createReadStream(file).on('error', () => res.destroy()).pipe(res);
    } catch { res.writeHead(404).end('Not found'); }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createSiteServer();
  server.on('error', error => { console.error(error.message); process.exitCode = 1; });
  server.listen(Number(process.env.SITE_PORT) || 4177, '127.0.0.1', () => console.log(`WhereFile website http://127.0.0.1:${server.address().port}`));
}
