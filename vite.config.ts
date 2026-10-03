import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const BUILD = (process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 12).toLowerCase();

/** Art the menu and a Training match need offline (best effort, ~3 MB). */
const CORE_GLOBS: [dir: string, test: RegExp][] = [
  ['icons', /^(favicon-48|icon-192|apple-touch-icon)\.png$/],
  ['assets/titles', /^(app-cover|menu-atelier)\.jpg$/],
  ['assets/menu', /\.jpg$/],
  ['assets/images', /\.png$/],
  ['assets/maps', /(\.svg|^ashen-cross\.jpg)$/],
  ['assets/lore', /\.(jpg|png|webp)$/],
];

/**
 * Writes dist/sw.js from scripts/sw.template.js with this build's id and file
 * list, so the worker's bytes change on every deploy (the browser's update
 * check compares bytes) and it knows which hashed files are the app shell.
 */
function serviceWorker(): Plugin {
  let outDir = 'dist';
  let root = process.cwd();
  return {
    name: 'ow-service-worker',
    apply: 'build',
    configResolved(c) {
      root = c.root;
      outDir = resolve(c.root, c.build.outDir);
    },
    writeBundle(_opts, bundle) {
      const shell = ['/index.html', '/manifest.webmanifest'];
      for (const f of Object.keys(bundle)) if (/\.(js|css)$/.test(f)) shell.push('/' + f);
      const core: string[] = [];
      for (const [dir, test] of CORE_GLOBS) {
        const abs = join(outDir, dir);
        if (!existsSync(abs)) continue;
        for (const f of readdirSync(abs)) if (test.test(f)) core.push(`/${dir}/${f}`);
      }
      const version = createHash('sha256')
        .update(BUILD + shell.join('|') + core.join('|'))
        .digest('hex')
        .slice(0, 12);
      const src = readFileSync(resolve(root, 'scripts/sw.template.js'), 'utf8')
        .replace('__OW_SW_BUILD__', JSON.stringify(BUILD))
        .replace('__OW_SW_VERSION__', JSON.stringify(version))
        .replace('__OW_SW_SHELL__', JSON.stringify(shell))
        .replace('__OW_SW_CORE__', JSON.stringify(core));
      writeFileSync(join(outDir, 'sw.js'), src);
    },
  };
}

export default defineConfig({
  plugins: [react(), serviceWorker()],
  // The deployed commit, so an old tab can tell a new deploy is out.
  define: {
    __OW_BUILD__: JSON.stringify(BUILD),
  },
});
