const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/** 生成指定长度的随机 ID（用于文件名去重） */
export function uid(size = 12): string {
  const bytes = new Uint8Array(size);
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < size; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  let out = '';
  for (let i = 0; i < size; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}
