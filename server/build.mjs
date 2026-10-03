import { build } from 'esbuild';
import { rmSync } from 'node:fs';

rmSync('dist', { recursive: true, force: true });

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  sourcemap: true,
  // 原生模块 / 二进制模块保持外部引用，由 node_modules 提供
  external: [
    'better-sqlite3',
    'sharp',
    'esbuild',
    '@lmdb/lmdb',
  ],
  banner: {
    js: [
      "import { createRequire as __createRequire } from 'node:module';",
      'const require = __createRequire(import.meta.url);',
    ].join('\n'),
  },
  logLevel: 'info',
});

console.log('✅ 服务端构建完成 -> dist/index.js');
