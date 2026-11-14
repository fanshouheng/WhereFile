import { createHash } from 'node:crypto';
import { copyFile, cp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function buildSite() {
  const source = path.join(root, 'website');
  const output = path.join(root, 'output/site');
  const { version } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const filename = `WhereFile-v${version}-Setup-x64.exe`;
  const externalUrl = process.env.WHEREFILE_DOWNLOAD_URL;
  const download = { version, url: externalUrl || `downloads/${filename}`, size: null, sha256: null, verified: false };

  await stat(path.join(source, 'index.html'));
  if (externalUrl) {
    if (new URL(externalUrl).protocol !== 'https:') throw new Error('WHEREFILE_DOWNLOAD_URL must use HTTPS.');
  } else {
    const installer = await readFile(path.join(root, 'output/installer', filename));
    download.size = installer.length;
    download.sha256 = createHash('sha256').update(installer).digest('hex');
    download.verified = true;
    await mkdir(path.join(output, 'downloads'), { recursive: true });
    await writeFile(path.join(output, 'downloads', filename), installer);
    await writeFile(path.join(output, 'downloads/SHA256SUMS.txt'), `${download.sha256}  ${filename}\n`);
  }

  await cp(source, output, { recursive: true });
  await mkdir(path.join(output, 'assets'), { recursive: true });
  for (const asset of ['coast-hd.webp', 'coast-snow.webp', 'coast-autumn.webp', 'boat-hd.png']) {
    await copyFile(path.join(root, 'assets', asset), path.join(output, 'assets', asset));
  }
  const grassland = path.join(output, 'previews/grassland');
  await mkdir(path.join(grassland, 'assets'), { recursive: true });
  for (const file of ['index.html', 'grassland.css', 'grassland.js', 'assets/grassland.webp', 'assets/sheep.png']) {
    await copyFile(path.join(root, 'previews/grassland', file), path.join(grassland, file));
  }
  await writeFile(path.join(output, 'download.json'), JSON.stringify(download, null, 2) + '\n');
  console.log(`WhereFile website: ${output}`);
  console.log(externalUrl ? `External download URL (not verified): ${externalUrl}` : `Installer: ${filename} (${download.size} bytes)`);
  return download;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildSite().catch(error => { console.error(error.message); process.exitCode = 1; });
}
