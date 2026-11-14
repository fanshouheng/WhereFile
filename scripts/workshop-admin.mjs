import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const [command, id, ...words] = args;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

async function main() {
  if (!['list', 'inspect', 'approve', 'reject', 'reports'].includes(command)) {
    console.log('用法：npm run workshop:admin -- list [pending|approved|rejected]\n      npm run workshop:admin -- inspect <主题ID>\n      npm run workshop:admin -- approve <主题ID>\n      npm run workshop:admin -- reject <主题ID> <原因>\n      npm run workshop:admin -- reports\n默认连接官网；WHEREFILE_WORKSHOP_URL 可指定本地测试地址。');
    return;
  }
  const credentials = JSON.parse(await readFile(path.join(root, '.local/workshop-admin.json'), 'utf8'));
  const base = new URL(process.env.WHEREFILE_WORKSHOP_URL || credentials.baseUrl);
  if (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(base.hostname))) {
    throw new Error('审核地址必须使用 HTTPS 或本机测试地址。');
  }
  async function request(route, init = {}) {
    const response = await fetch(new URL(`/api/workshop${route}`, base), {
      ...init, redirect: 'error', headers: { Authorization: `Bearer ${credentials.token}`, ...(init.headers || {}) },
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.error?.message || `请求失败 (${response.status})`);
    }
    return response;
  }
  if (command === 'list') {
    const status = id || 'pending';
    if (!['pending', 'approved', 'rejected'].includes(status)) throw new Error('请选择 pending、approved 或 rejected。');
    const { submissions } = await (await request(`/moderation?status=${status}`)).json();
    console.log(JSON.stringify(submissions.map(({ id, title, author, status, createdAt }) => ({ id, title, author, status, createdAt })), null, 2));
  } else if (command === 'reports') {
    console.log(JSON.stringify(await (await request('/moderation/reports')).json(), null, 2));
  } else {
    if (!uuid.test(id || '')) throw new Error('请提供有效的主题 ID。');
    if (command === 'inspect') {
      const { submission } = await (await request(`/moderation/${id}`)).json();
      const directory = path.join(root, 'output/workshop-review', id);
      await mkdir(directory, { recursive: true });
      for (const [key, filename] of [['background', submission.config.background], ['sprite', 'object.png']]) {
        // Paths are fixed by the server; never use uploaded filenames as local paths.
        if (!/^(background\.(png|jpg|webp)|object\.png)$/.test(filename)) throw new Error('素材文件名不符合约定。');
        const response = await request(`/moderation/${id}/assets/${key}`);
        await writeFile(path.join(directory, filename), new Uint8Array(await response.arrayBuffer()));
      }
      await writeFile(path.join(directory, 'metadata.json'), JSON.stringify(submission, null, 2) + '\n');
      console.log(`审核素材已保存：${directory}`);
      console.log(JSON.stringify(submission, null, 2));
    } else {
      const status = command === 'approve' ? 'approved' : 'rejected';
      const reason = words.join(' ').trim();
      if (status === 'rejected' && !reason) throw new Error('退回或下架时请填写原因。');
      const response = await request(`/moderation/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, reason }) });
      const { submission } = await response.json();
      console.log(`${submission.title}：${submission.status}${submission.reason ? `（${submission.reason}）` : ''}`);
    }
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
