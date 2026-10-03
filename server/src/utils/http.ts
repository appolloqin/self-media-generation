const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

export type FetchOptions = {
  headers?: Record<string, string>;
  timeoutMs?: number;
  method?: string;
  body?: string | Buffer | null;
  referer?: string;
};

export async function httpGet(url: string, opts: FetchOptions = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 20_000);
  try {
    return await fetch(url, {
      method: opts.method ?? 'GET',
      headers: {
        'User-Agent': DEFAULT_UA,
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        ...(opts.referer ? { Referer: opts.referer } : {}),
        ...opts.headers,
      },
      body: opts.body ?? null,
      redirect: 'follow',
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function httpGetJson<T = unknown>(url: string, opts: FetchOptions = {}): Promise<T> {
  const res = await httpGet(url, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

export async function httpGetText(url: string, opts: FetchOptions = {}): Promise<string> {
  const res = await httpGet(url, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return await res.text();
}

/** 下载二进制到 Buffer */
export async function downloadBinary(url: string, opts: FetchOptions = {}): Promise<Buffer> {
  const res = await httpGet(url, opts);
  if (!res.ok) throw new Error(`下载失败 HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}
