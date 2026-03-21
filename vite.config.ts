import fs from 'node:fs';
import path from 'node:path';

import { defineConfig, type Connect, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const PUBLIC_DIR = 'public';
const BUILD_OUT_DIR = 'dist';
const PREPROCESSED_ROUTE = '/preprocessed';
const PREPROCESSED_OUTPUT_DIR = path.resolve(process.cwd(), PUBLIC_DIR, 'preprocessed');
const JSON_CONTENT_TYPE = 'application/json; charset=utf-8';

const isPathInsideRoot = (candidatePath: string, rootPath: string) => {
  const relativePath = path.relative(rootPath, candidatePath);
  return relativePath !== '' && !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
};

const preprocessedStaticMiddleware = (): Connect.NextHandleFunction => (req, res, next) => {
  const requestUrl = req.url;
  if (!requestUrl) {
    next();
    return;
  }

  const pathname = requestUrl.split('?')[0] ?? requestUrl;
  if (!pathname.startsWith(`${PREPROCESSED_ROUTE}/`) && pathname !== PREPROCESSED_ROUTE) {
    next();
    return;
  }

  const relativeAssetPath = pathname
    .slice(PREPROCESSED_ROUTE.length)
    .replace(/^\/+/, '')
    .trim();
  const resolvedAssetPath = path.resolve(PREPROCESSED_OUTPUT_DIR, relativeAssetPath || 'index.html');

  if (
    resolvedAssetPath !== PREPROCESSED_OUTPUT_DIR &&
    !isPathInsideRoot(resolvedAssetPath, PREPROCESSED_OUTPUT_DIR)
  ) {
    res.statusCode = 403;
    res.end('Forbidden');
    return;
  }

  let stat: fs.Stats;
  try {
    stat = fs.statSync(resolvedAssetPath);
  } catch {
    next();
    return;
  }

  if (stat.isDirectory()) {
    next();
    return;
  }

  if (resolvedAssetPath.endsWith('.json')) {
    res.setHeader('Content-Type', JSON_CONTENT_TYPE);
  }
  res.statusCode = 200;
  fs.createReadStream(resolvedAssetPath).pipe(res);
};

const mountPreprocessedStaticFiles = (): Plugin => ({
  name: 'mount-preprocessed-static-files',
  configureServer(server) {
    server.middlewares.use(preprocessedStaticMiddleware());
  },
  configurePreviewServer(server) {
    server.middlewares.use(preprocessedStaticMiddleware());
  },
});

export default defineConfig({
  publicDir: PUBLIC_DIR,
  build: {
    outDir: BUILD_OUT_DIR,
  },
  plugins: [react(), mountPreprocessedStaticFiles()],
});
