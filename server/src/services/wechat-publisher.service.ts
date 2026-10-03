import path from 'node:path';
import fs from 'node:fs';
import sharp from 'sharp';
import { uid as nanoid } from '../utils/id.js';
import { configService } from './config.service.js';
import { logger } from '../core/logger.js';
import { PATHS } from '../config/env.js';
import { downloadBinary } from '../utils/http.js';
import type { ImageApiConfig, WechatCredential } from '@smg/shared';

export const WECHAT_API_BASE = 'https://api.weixin.qq.com/cgi-bin';
export const DEFAULT_COVER_MEDIA_ID =
  'SwCSRjrdGJNaWioRQUHzgF68BHFkSlb_f5xlTquvsOSA6Yy0ZRjFo0aW9eS3JJu_';

export type WechatPublishOutcome = {
  success: boolean;
  message: string;
  publishId?: string | null;
};

type TokenCache = { token: string; expiresAt: number };

class WechatPublisher {
  private tokenCache = new Map<string, TokenCache>();

  async ensureToken(appid: string, appsecret: string): Promise<string> {
    const cached = this.tokenCache.get(appid);
    if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

    const url = `${WECHAT_API_BASE}/token?grant_type=client_credential&appid=${appid}&secret=${appsecret}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    const data = (await res.json()) as any;

    if (!data?.access_token) {
      throw new Error(`获取 access_token 失败: ${data?.errmsg ?? '未知错误'} (errcode=${data?.errcode})`);
    }
    this.tokenCache.set(appid, {
      token: data.access_token,
      expiresAt: Date.now() + Number(data.expires_in ?? 7200) * 1000,
    });
    return data.access_token;
  }

  async isVerified(appid: string, appsecret: string): Promise<boolean> {
    try {
      const token = await this.ensureToken(appid, appsecret);
      const res = await fetch(`${WECHAT_API_BASE}/account/getaccountbasicinfo?access_token=${token}`, {
        signal: AbortSignal.timeout(10_000),
      });
      const data = (await res.json()) as any;
      return Boolean(data?.wx_verify_info?.qualification_verify);
    } catch {
      return false;
    }
  }

  async cropCover(input: Buffer): Promise<Buffer> {
    const targetW = 900;
    const targetH = 384;
    const meta = await sharp(input, { failOn: 'none' }).metadata();
    const w = meta.width ?? targetW;
    const h = meta.height ?? targetH;
    const scale = Math.max(targetW / w, targetH / h);
    const nw = Math.round(w * scale);
    const nh = Math.round(h * scale);
    const resized = await sharp(input, { failOn: 'none' })
      .resize(nw, nh, { fit: 'fill' })
      .toBuffer();
    return sharp(resized)
      .extract({
        left: Math.max(0, Math.round((nw - targetW) / 2)),
        top: Math.max(0, Math.round((nh - targetH) / 2)),
        width: targetW,
        height: targetH,
      })
      .jpeg({ quality: 92 })
      .toBuffer();
  }

  async generateCover(title: string, digest: string, cfg: ImageApiConfig): Promise<Buffer | null> {
    const prompt = `主题:${title}。内容:${digest}。高质量中文公众号封面图，简洁高级，无文字。`;
    try {
      // 复用统一生图服务（含 OpenAI 兼容 / 阿里万相）
      const { imageService } = await import('./image.service.js');
      const asset = await imageService.generateCover(prompt);
      const file = path.join(PATHS.images, path.basename(asset.url));
      if (fs.existsSync(file)) return fs.readFileSync(file);
    } catch (err) {
      logger.warn(`生成封面失败: ${(err as Error).message}`);
    }

    try {
      if (cfg.type === 'pollinations') {
        return await downloadBinary(
          `https://image.pollinations.ai/prompt/${encodeURIComponent(title)}?width=900&height=384&nologo=true`,
        );
      }
      if (cfg.type === 'picsum' || cfg.type === 'none') {
        return await downloadBinary(
          `https://picsum.photos/900/384?random=${encodeURIComponent(title.slice(0, 20))}`,
        );
      }
    } catch (err) {
      logger.warn(`封面降级失败: ${(err as Error).message}`);
    }

    return sharp({
      create: { width: 900, height: 384, channels: 3, background: { r: 58, g: 123, b: 213 } },
    })
      .jpeg({ quality: 88 })
      .toBuffer();
  }

  async uploadImage(
    buffer: Buffer,
    fileName: string,
    mime: string,
    appid: string,
    appsecret: string,
    verified: boolean,
  ): Promise<{ mediaId: string; url?: string }> {
    const token = await this.ensureToken(appid, appsecret);
    const endpoint = verified
      ? `${WECHAT_API_BASE}/media/upload?access_token=${token}&type=image`
      : `${WECHAT_API_BASE}/material/add_material?access_token=${token}&type=image`;

    const form = new FormData();
    form.append('media', new Blob([new Uint8Array(buffer)], { type: mime }), fileName);

    const res = await fetch(endpoint, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(60_000),
    });
    const data = (await res.json()) as any;

    if (data?.errcode && data.errcode !== 0) {
      throw new Error(`图片上传失败: ${data.errmsg} (errcode=${data.errcode})`);
    }
    if (!data?.media_id) throw new Error('图片上传失败: 响应缺少 media_id');
    return { mediaId: data.media_id, url: data.url };
  }

  async resolveImage(src: string): Promise<{ buf: Buffer; mime: string; name: string } | null> {
    try {
      if (src.startsWith('/uploads/images/')) {
        const file = path.join(PATHS.images, path.basename(src));
        if (!fs.existsSync(file)) return null;
        return { buf: fs.readFileSync(file), mime: mimeOf(file), name: path.basename(file) };
      }
      if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('//')) {
        const url = src.startsWith('//') ? `https:${src}` : src;
        const buf = await downloadBinary(url, { timeoutMs: 30_000 });
        return { buf, mime: mimeOf(url), name: `${nanoid(8)}${extOf(url)}` };
      }
      if (fs.existsSync(src)) {
        return { buf: fs.readFileSync(src), mime: mimeOf(src), name: path.basename(src) };
      }
    } catch (err) {
      logger.warn(`图片读取失败 ${src}: ${(err as Error).message}`);
    }
    return null;
  }

  async cacheImage(src: string): Promise<string | null> {
    if (src.startsWith('/uploads/images/')) return src;
    const resolved = await this.resolveImage(src);
    if (!resolved) return null;
    const fileName = `${nanoid(12)}${extOf(src)}`;
    try {
      fs.writeFileSync(path.join(PATHS.images, fileName), resolved.buf);
      return `/uploads/images/${fileName}`;
    } catch {
      return null;
    }
  }

  async loadCover(coverPath: string | null): Promise<Buffer | null> {
    if (!coverPath) return null;
    try {
      if (coverPath.startsWith('/uploads/images/')) {
        const file = path.join(PATHS.images, path.basename(coverPath));
        return fs.existsSync(file) ? fs.readFileSync(file) : null;
      }
      if (coverPath.startsWith('http')) return await downloadBinary(coverPath);
      if (fs.existsSync(coverPath)) return fs.readFileSync(coverPath);
    } catch {
      return null;
    }
    return null;
  }

  async testCredential(cred: WechatCredential): Promise<{ ok: boolean; message: string }> {
    try {
      await this.ensureToken(cred.appid, cred.appsecret);
      const verified = await this.isVerified(cred.appid, cred.appsecret);
      return {
        ok: true,
        message: `凭据有效${verified ? '（已认证账号，可同步到文章列表）' : '（未认证账号，将保存至草稿箱）'}`,
      };
    } catch (err) {
      return { ok: false, message: (err as Error).message };
    }
  }
}

function safePathname(p: string): string {
  try {
    return new URL(p, 'http://x').pathname;
  } catch {
    return p;
  }
}

export function mimeOf(p: string): string {
  const ext = path.extname(safePathname(p)).toLowerCase();
  const map: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
  };
  return map[ext] ?? 'image/jpeg';
}

export function extOf(p: string): string {
  const ext = path.extname(safePathname(p)).toLowerCase();
  return ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext) ? ext : '.jpg';
}

export const wechatPublisher = new WechatPublisher();
export { configService };
