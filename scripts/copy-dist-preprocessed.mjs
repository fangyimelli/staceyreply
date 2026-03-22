import { access, cp, mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import officialConfig from '../src/config/official-config.json' with { type: 'json' };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const publicPreprocessedRoot = path.join(repoRoot, 'public', 'preprocessed');
const distRoot = path.join(repoRoot, 'dist');
const distPreprocessedRoot = path.join(distRoot, 'preprocessed');
const manifestPath = path.join(distPreprocessedRoot, 'manifest.json');
const officialPairKeys = officialConfig.pairs.map((pair) => pair.pairKey);

const ensureReadable = async (targetPath, label) => {
  try {
    await access(targetPath);
  } catch {
    throw new Error(`${label} is missing: ${path.relative(repoRoot, targetPath).replace(/\\/g, '/')}`);
  }
};

const main = async () => {
  await ensureReadable(publicPreprocessedRoot, 'public/preprocessed source directory');
  await ensureReadable(path.join(publicPreprocessedRoot, 'manifest.json'), 'public/preprocessed manifest');
  await ensureReadable(distRoot, 'dist output directory');

  await rm(distPreprocessedRoot, { recursive: true, force: true });
  await mkdir(distPreprocessedRoot, { recursive: true });
  await cp(publicPreprocessedRoot, distPreprocessedRoot, { recursive: true });

  await ensureReadable(manifestPath, 'dist/preprocessed manifest');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const manifestPairKeys = manifest?.diagnostics?.manifestPairKeys ?? manifest?.pairs?.map((pair) => pair.pairKey) ?? [];
  const missingManifestPairs = officialPairKeys.filter((pairKey) => !manifestPairKeys.includes(pairKey));
  if (missingManifestPairs.length > 0) {
    throw new Error(`dist/preprocessed manifest is missing official pair(s): ${missingManifestPairs.join(', ')}`);
  }

  for (const pairKey of officialPairKeys) {
    const pairIndexPath = path.join(distPreprocessedRoot, pairKey, 'index.json');
    await ensureReadable(pairIndexPath, `dist/preprocessed/${pairKey}/index.json`);
  }

  console.log(`Copied public/preprocessed to dist/preprocessed and verified manifest + ${officialPairKeys.length} official pair index file(s).`);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
