import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const types = { '.html': 'text/html; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.txt': 'text/plain; charset=utf-8' };
http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'previews/interface/';
    let file = path.resolve(root, relative);
    if (url.pathname.endsWith('/')) file = path.join(file, 'index.html');
    if (!['previews', 'assets'].some(dir => file.startsWith(path.join(root, dir) + path.sep)) || !types[path.extname(file)]) {
      res.writeHead(404).end(); return;
    }
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[path.extname(file)], 'Cache-Control': 'no-cache' });
    res.end(data);
  } catch { res.writeHead(404).end('Not found'); }
}).listen(4175, '127.0.0.1', () => console.log('WhereFile 设计预览 http://127.0.0.1:4175/previews/interface/'));
