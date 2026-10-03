import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { PLATFORM_LABELS, type Article, type PublishPlatform } from '@smg/shared';
import { configService } from './config.service.js';
import { PATHS } from '../config/env.js';
import { articleService } from './article.service.js';
import { wechatPublisher, WECHAT_API_BASE, DEFAULT_COVER_MEDIA_ID } from './wechat-publisher.service.js';
import { logger } from '../core/logger.js';
import { compressHtml, injectIndent, replaceDivWithSection, sanitizeForWechat, stripTags } from '../utils/content.js';
import { uid } from '../utils/id.js';

export type PublishOutcome = {
  success: boolean;
  message: string;
  publishId?: string | null;
  url?: string | null;
};

type Adapter = {
  id: PublishPlatform;
  label: string;
  /** 该平台是否需要把 HTML 转换为纯文本/标记 */
  transform(content: string, title: string): string;
  publish(article: Article, prepared: string): Promise<PublishOutcome>;
};

/* ============================================================
 * 微信发布
 * ========================================================== */

async function publishToWechat(article: Article, _prepared: string): Promise<PublishOutcome> {
  const creds = configService.validWechatCredentials;
  if (!creds.length) {
    return { success: false, message: '未配置有效的公众号 AppID / AppSecret' };
  }
  const cred = creds[0];
  const verified = await wechatPublisher.isVerified(cred.appid, cred.appsecret);
  const token = await wechatPublisher.ensureToken(cred.appid, cred.appsecret);

  // 封面
  let coverMediaId = DEFAULT_COVER_MEDIA_ID;
  const cover = await wechatPublisher.loadCover(article.coverPath);
  if (cover) {
    const cropped = await wechatPublisher.cropCover(cover);
    const up = await wechatPublisher.uploadImage(
      cropped,
      `${uid(8)}.jpg`,
      'image/jpeg',
      cred.appid,
      cred.appsecret,
      verified,
    );
    coverMediaId = up.mediaId;
  }

  // 正文图片必须先上传到微信服务器
  let body = article.content;
  const images = [...body.matchAll(/<img[^>]*?src=["']([^"']+)["'][^>]*>/gi)].map((m) => m[1]);
  for (const src of [...new Set(images)]) {
    if (src.startsWith('http://mmbiz.qpic.cn')) continue;
    const resolved = await wechatPublisher.resolveImage(src);
    if (!resolved) {
      logger.warn(`正文图片无法读取，将保留原地址：${src}`);
      continue;
    }
    try {
      const up = await wechatPublisher.uploadImage(
        resolved.buf,
        resolved.name,
        resolved.mime,
        cred.appid,
        cred.appsecret,
        verified,
      );
      const local = up.url ?? src;
      body = body.split(src).join(local);
    } catch (err) {
      logger.warn(`正文图片上传失败 ${src}: ${(err as Error).message}`);
    }
  }

  body = sanitizeForWechat(replaceDivWithSection(body));
  if (configService.get().formatPublish) {
    body = compressHtml(body);
  }
  if (configService.get().useCompress) {
    body = injectIndent(body);
  }

  const payload = {
    articles: [
      {
        title: article.title.slice(0, 64),
        author: cred.author || undefined,
        digest: (article.summary || stripTags(body)).slice(0, 120),
        content: body,
        content_source_url: '',
        thumb_media_id: coverMediaId,
        need_open_comment: 0,
        only_fans_can_comment: 0,
      },
    ],
  };

  const endpoint = verified
    ? `${WECHAT_API_BASE}/freepublish/submit?access_token=${token}`
    : `${WECHAT_API_BASE}/material/add_news?access_token=${token}`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(60_000),
  });
  const data = (await res.json()) as any;
  if (data?.errcode) {
    return { success: false, message: `${data.errmsg} (errcode=${data.errcode})` };
  }

  const publishId = data?.publish_id ?? data?.media_id ?? null;

  if (verified && cred.sendall) {
    const sendRes = await fetch(`${WECHAT_API_BASE}/freepublish/publish?access_token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ media_id: publishId }),
      signal: AbortSignal.timeout(30_000),
    });
    const sendData = (await sendRes.json()) as any;
    if (sendData?.errcode) {
      return {
        success: true,
        message: `已提交发布队列但群发失败：${sendData.errmsg}`,
        publishId,
      };
    }
    return { success: true, message: '已发布并群发', publishId };
  }

  return {
    success: true,
    message: verified ? '已提交至发布队列（草稿）' : '已保存至草稿箱（未认证账号）',
    publishId,
  };
}

/* ============================================================
 * 其它平台适配器
 * ========================================================== */

function toPlainText(html: string): string {
  return stripTags(html)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function longImage(article: Article): Promise<Buffer> {
  const text = toPlainText(article.content);
  const width = 750;
  const lineHeight = 40;
  const charsPerLine = 22;
  const lines = text.match(new RegExp(`.{1,${charsPerLine}}`, 'g')) ?? [''];
  const height = Math.max(600, 200 + lines.length * lineHeight);

  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const body = lines
    .map((l, i) => `<div style="font-size:26px;line-height:${lineHeight}px;margin:0;">${esc(l)}</div>`)
    .join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
<rect width="100%" height="100%" fill="#ffffff"/>
<text x="40" y="70" font-size="34" font-weight="700" fill="#1a1a1a" font-family="Microsoft YaHei, sans-serif">${esc(article.title.slice(0, 22))}</text>
<line x1="40" y1="100" x2="${width - 40}" y2="100" stroke="#3a7bd5" stroke-width="4"/>
${body}
</svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

const ADAPTERS: Record<PublishPlatform, Adapter> = {
  wechat: {
    id: 'wechat',
    label: '微信公众号',
    transform: (c) => c,
    publish: publishToWechat,
  },
  xiaohongshu: {
    id: 'xiaohongshu',
    label: '小红书',
    transform: (c, title) => `${title}\n\n${toPlainText(c)}\n\n#AI创作 #自媒体运营 #干货分享`,
    async publish(article) {
      return {
        success: false,
        message: '小红书需在开放平台完成授权后发布，草稿与长图已生成，请在小红书 App 手动粘贴',
      };
    },
  },
  douyin: {
    id: 'douyin',
    label: '抖音',
    transform: (c, title) => buildVideoScript(article0(title, c)),
    async publish() {
      return { success: false, message: '抖音图文需通过开放平台授权发布，脚本已生成可复制使用' };
    },
  },
  toutiao: {
    id: 'toutiao',
    label: '今日头条',
    transform: (c) => stripTags(c),
    async publish(article) {
      const file = saveExport(article, 'md');
      return { success: true, message: `已导出头条格式稿件：${file}（发布需头条号开放平台授权）` };
    },
  },
  baijiahao: {
    id: 'baijiahao',
    label: '百家号',
    transform: (c) => stripTags(c),
    async publish(article) {
      const file = saveExport(article, 'md');
      return { success: true, message: `已导出百家号格式稿件：${file}（发布需百家号 API 授权）` };
    },
  },
  zhihu: {
    id: 'zhihu',
    label: '知乎',
    transform: (c) => toPlainText(c),
    async publish(article) {
      const file = saveExport(article, 'txt');
      return { success: true, message: `已导出知乎长文：${file}` };
    },
  },
  douban: {
    id: 'douban',
    label: '豆瓣',
    transform: (c) => toPlainText(c),
    async publish(article) {
      const file = saveExport(article, 'txt');
      return { success: true, message: `已导出豆瓣长文：${file}` };
    },
  },
  weibo: {
    id: 'weibo',
    label: '微博',
    transform: (c) => toPlainText(c),
    async publish(article) {
      const file = saveExport(article, 'txt');
      return { success: true, message: `已导出微博长文：${file}` };
    },
  },
  fanqie: {
    id: 'fanqie',
    label: '番茄小说',
    transform: (c) => toPlainText(c),
    async publish(article) {
      const file = saveExport(article, 'txt');
      return { success: true, message: `已导出小说章节稿件：${file}（发布需番茄作者后台授权）` };
    },
  },
};

function article0(title: string, content: string): Article {
  return { title, content } as Article;
}

function buildVideoScript(a: Article): string {
  const paragraphs = toPlainText(a.content)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const shots = paragraphs.slice(0, 8);
  const lines = [
    `【${a.title}】`,
    '',
    '钩子（0-3秒）：' + (shots[0] ?? '今天聊个有意思的话题'),
    '',
  ];
  shots.slice(1, 5).forEach((s, i) => {
    lines.push(`第 ${i + 1} 幕（${(i + 1) * 8}-${(i + 2) * 8} 秒）：${s.slice(0, 40)}`);
  });
  lines.push('', '结尾（引导互动）：你怎么看？评论区聊聊');
  return lines.join('\n');
}

function saveExport(article: Article, ext: 'md' | 'txt'): string {
  const dir = PATHS.articles;
  const fileName = `${article.id}_${article.title.replace(/[<>:"/\\|?*]/g, '_').slice(0, 60)}.${ext}`;
  const full = path.join(dir, fileName);
  const adapter = ADAPTERS[article.platform as PublishPlatform];
  const text = adapter ? adapter.transform(article.content, article.title) : article.content;
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(full, `${article.title}\n\n${text}\n`, 'utf-8');
  } catch (err) {
    logger.warn(`导出稿件失败：${(err as Error).message}`);
  }
  return fileName;
}

class PublishService {
  async publish(article: Article, platform?: PublishPlatform): Promise<PublishOutcome> {
    const target = (platform ?? (article.platform as PublishPlatform) ?? 'wechat') as PublishPlatform;
    const adapter = ADAPTERS[target];
    if (!adapter) return { success: false, message: `不支持的平台：${target}` };

    logger.info(`开始发布到「${PLATFORM_LABELS[target] ?? target}」：${article.title}`);

    try {
      const outcome = await adapter.publish(article, adapter.transform(article.content, article.title));
      articleService.addPublishRecord({
        articleId: article.id,
        platform: target,
        accountInfo: { label: adapter.label },
        success: outcome.success,
        error: outcome.success ? null : outcome.message,
        publishId: outcome.publishId ?? null,
        url: outcome.url ?? null,
      });
      articleService.syncStatusFromRecords(article.id);
      return outcome;
    } catch (err) {
      const message = (err as Error).message;
      articleService.addPublishRecord({
        articleId: article.id,
        platform: target,
        accountInfo: { label: adapter.label },
        success: false,
        error: message,
      });
      articleService.syncStatusFromRecords(article.id);
      return { success: false, message };
    }
  }

  /** 生成发布预览（不落库） */
  preview(article: Article, platform: PublishPlatform) {
    const adapter = ADAPTERS[platform];
    if (!adapter) return null;
    return {
      platform,
      label: adapter.label,
      content: adapter.transform(article.content, article.title),
      wordCount: stripTags(adapter.transform(article.content, article.title)).length,
    };
  }

  /** 生成平台长图（base64 data URL） */
  async longImageDataUrl(article: Article): Promise<string> {
    const buf = await longImage(article);
    return `data:image/png;base64,${buf.toString('base64')}`;
  }

  get platforms() {
    return Object.values(ADAPTERS);
  }
}

export const publishService = new PublishService();
