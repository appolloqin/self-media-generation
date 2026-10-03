import { runSeed } from './seed.js';
import { closeDb } from './connection.js';

const reset = process.argv.includes('--reset');

try {
  const result = runSeed(reset);
  console.log('\n[OK] 种子数据初始化完成', JSON.stringify(result, null, 2), '\n');
  closeDb();
  process.exit(0);
} catch (err) {
  console.error('[FAIL] 种子数据初始化失败：', err);
  process.exit(1);
}
