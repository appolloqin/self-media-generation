import { countChineseWords } from '@smg/shared';

/* ============================================================
 * 文本处理
 * ========================================================== */

export function removeCodeBlocks(content: string): string {
  let out = content.replace(/```\w*\s*/g, '').replace(/`([^`]*)`/g, '$1');
  // 去掉模型爱加的"（全文约1200字）"之类尾注
  out = out.replace(
    /[\(\[【]\s*(全文\s*)?(约|共|总计|合计)?\s*\d+\s*字\s*[\)\]】]\s*$/gm,
    '',
  );
  return out.trim();
}

export function extractTitle(content: string, fallback = '无标题'): string {
  // Markdown 一级标题
  const md = content.match(/^\s*#\s+(.+)$/m);
  if (md) return md[1].trim();
  // HTML title / h1
  const title = content.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (title) return stripTags(title[1]).trim();
  const h1 = content.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) return stripTags(h1[1]).trim();
  // 首行非空
  const firstLine = content.split('\n').find((l) => l.trim().length > 0);
  if (firstLine) return firstLine.replace(/^#+\s*/, '').trim().slice(0, 60);
  return fallback;
}

export function extractSummary(content: string, maxLen = 120): string {
  const text = htmlToText(content).replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text;
}

export function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function htmlToText(html: string): string {
  return stripTags(html)
    .replace(/\s*\n\s*/g, '\n')
    .replace(/ {2,}/g, ' ')
    .trim();
}

export function countWords(text: string): number {
  return countChineseWords(text);
}

export function sanitizeFilename(name: string): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 120);
  return cleaned || 'untitled';
}

/* ============================================================
 * Markdown -> HTML（轻量实现，覆盖常用语法）
 * ========================================================== */

export function markdownToHtml(md: string): string {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const html: string[] = [];
  let inCode = false;
  let inList = false;
  let listType: 'ul' | 'ol' = 'ul';
  let inQuote = false;

  const inline = (text: string) =>
    text
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%;display:block;margin:12px auto;border-radius:6px;" />')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:#3a7bd5;">$1</a>')
      .replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
      .replace(/~~([^~]+)~~/g, '<del>$1</del>')
      .replace(/`([^`]+)`/g, '<code style="background:#f5f5f5;padding:2px 5px;border-radius:3px;font-size:0.9em;">$1</code>');

  const closeList = () => {
    if (inList) {
      html.push(`</${listType}>`);
      inList = false;
    }
  };
  const closeQuote = () => {
    if (inQuote) {
      html.push('</blockquote>');
      inQuote = false;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (/^```/.test(line)) {
      if (inCode) {
        html.push('</code></pre>');
        inCode = false;
      } else {
        closeList();
        closeQuote();
        html.push('<pre style="background:#f7f7f7;padding:12px;border-radius:6px;overflow-x:auto;"><code>');
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      html.push(escapeHtml(line));
      continue;
    }

    if (!line.trim()) {
      closeList();
      closeQuote();
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      closeList();
      closeQuote();
      const level = heading[1].length;
      const sizes = ['26px', '22px', '19px', '17px', '16px', '15px'];
      html.push(
        `<h${level} style="font-size:${sizes[level - 1]};font-weight:700;margin:24px 0 12px;line-height:1.4;">${inline(
          heading[2].trim(),
        )}</h${level}>`,
      );
      continue;
    }

    if (/^\s*>/.test(line)) {
      closeList();
      if (!inQuote) {
        html.push(
          '<blockquote style="border-left:4px solid #3a7bd5;padding:8px 14px;margin:16px 0;color:#555;background:#f7faff;">',
        );
        inQuote = true;
      }
      html.push(`<p style="margin:6px 0;">${inline(line.replace(/^\s*>\s?/, ''))}</p>`);
      continue;
    }
    closeQuote();

    const ul = line.match(/^\s*[-*+]\s+(.*)$/);
    if (ul) {
      if (inList && listType !== 'ul') closeList();
      if (!inList) {
        html.push('<ul style="margin:12px 0;padding-left:24px;line-height:1.8;">');
        inList = true;
        listType = 'ul';
      }
      html.push(`<li>${inline(ul[1])}</li>`);
      continue;
    }

    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ol) {
      if (inList && listType !== 'ol') closeList();
      if (!inList) {
        html.push('<ol style="margin:12px 0;padding-left:24px;line-height:1.8;">');
        inList = true;
        listType = 'ol';
      }
      html.push(`<li>${inline(ol[1])}</li>`);
      continue;
    }

    closeList();
    html.push(`<p style="margin:14px 0;line-height:1.8;">${inline(line)}</p>`);
  }

  if (inCode) html.push('</code></pre>');
  closeList();
  closeQuote();

  return html.join('\n');
}

/* ============================================================
 * HTML -> Markdown
 * ========================================================== */

export function htmlToMarkdown(html: string): string {
  let out = html;
  out = out.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
  out = out.replace(/<!--[\s\S]*?-->/g, '');

  out = out.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_m, c) => `\n# ${stripTags(c)}\n`);
  out = out.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_m, c) => `\n## ${stripTags(c)}\n`);
  out = out.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_m, c) => `\n### ${stripTags(c)}\n`);
  out = out.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, (_m, c) => `\n#### ${stripTags(c)}\n`);

  out = out.replace(/<img[^>]*?src=["']([^"']+)["'][^>]*?alt=["']([^"']*)["'][^>]*>/gi, '\n![$2]($1)\n');
  out = out.replace(/<img[^>]*?src=["']([^"']+)["'][^>]*>/gi, '\n![]($1)\n');

  out = out.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_m, c) => `\n- ${stripTags(c).trim()}`);
  out = out.replace(/<\/?ul[^>]*>/gi, '\n');
  out = out.replace(/<\/?ol[^>]*>/gi, '\n');

  out = out.replace(
    /<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi,
    (_m, c) => `\n${stripTags(c).trim().split('\n').map((l) => `> ${l}`).join('\n')}\n`,
  );

  out = out.replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, (_m, _t, c) => `**${stripTags(c)}**`);
  out = out.replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi, (_m, _t, c) => `*${stripTags(c)}*`);
  out = out.replace(/<(del|s)[^>]*>([\s\S]*?)<\/\1>/gi, (_m, _t, c) => `~~${stripTags(c)}~~`);

  out = out.replace(/<br\s*\/?>/gi, '\n');
  out = out.replace(/<\/(p|div|section|tr)>/gi, '\n\n');

  // 剩余残余标签
  out = out.replace(/<[^>]+>/g, '');

  out = decodeEntities(out);
  out = out.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+$/gm, '');
  return out.trim();
}

/* ============================================================
 * HTML 清洗 / 微信适配
 * ========================================================== */

/** div -> section（微信对 section 兼容性更好） */
export function replaceDivWithSection(html: string): string {
  return html
    .replace(/<div\b([^>]*)>/gi, '<section$1>')
    .replace(/<\/div\s*>/gi, '</section>');
}

/** 移除微信不支持的标签与属性 */
export function sanitizeForWechat(html: string): string {
  let out = html;
  out = out.replace(/<!--[\s\S]*?-->/g, '');
  out = out.replace(/<script[\s\S]*?<\/script>/gi, '');
  out = out.replace(/<style[\s\S]*?<\/style>/gi, '');
  out = out.replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  out = out.replace(/<button[\s\S]*?<\/button>/gi, '');
  out = out.replace(/<form[\s\S]*?<\/form>/gi, '');
  // 渐变文字：微信会移除 id，这里降级为纯色
  out = out.replace(/-webkit-background-clip:\s*text;?/gi, '');
  out = out.replace(/background-clip:\s*text;?/gi, '');
  out = out.replace(/color:\s*transparent;?/gi, '');
  // 绝对定位微信不支持
  out = out.replace(/position:\s*absolute;?/gi, 'position: relative;');
  return out;
}

/** 压缩 HTML：去除换行与标签间幽灵空格 */
export function compressHtml(html: string): string {
  let out = html;
  out = out.replace(/<!--[\s\S]*?-->/g, '');
  out = out.replace(/>[\n\r]+\s*/g, '>');
  out = out.replace(/\s+</g, '<');
  out = out.replace(/>\s+</g, '><');
  out = out.replace(/[\n\r]/g, '');
  return out;
}

/** 为正文段落注入首行缩进（带卡片/引用/居中等豁免） */
export function injectIndent(html: string): string {
  return html.replace(/<p(\s[^>]*)?>([\s\S]*?)<\/p>/gi, (match, attrs, inner) => {
    const text = stripTags(inner);
    if (!text || text.length < 30) return match;
    if (/^(\/|●|-|>|•|\*|\d+\.|#)/.test(text.trim())) return match;

    const styleMatch = (attrs ?? '').match(/style\s*=\s*["']([^"']*)["']/i);
    const style = (styleMatch?.[1] ?? '').toLowerCase();
    if (style.includes('text-indent')) return match;
    if (style.includes('text-align') && (style.includes('center') || style.includes('right')))
      return match;
    if (
      style.includes('display:flex') ||
      style.includes('display: flex') ||
      style.includes('grid') ||
      style.includes('inline-block')
    )
      return match;
    if (style.includes('background') || style.includes('border') || style.includes('box-shadow'))
      return match;

    if (attrs && /style\s*=/i.test(attrs)) {
      return `<p${attrs.replace(/style\s*=\s*(["'])([^"']*)\1/i, (_m: string, q: string, v: string) => `style=${q}text-indent: 2em; ${v}${q}`)}>${inner}</p>`;
    }
    return `<p style="text-indent: 2em;"${attrs ? ` ${attrs.trim()}` : ''}>${inner}</p>`;
  });
}

/** 提取 HTML 中的图片地址 */
export function extractImageUrls(html: string): string[] {
  const urls: string[] = [];
  const patterns = [
    /<img[^>]*?src=["']([^"']+)["']/gi,
    /<img[^>]*?srcset=["']([^"']+)["']/gi,
    /<img[^>]*?data-(?:src|image)=["']([^"']+)["']/gi,
    /background(?:-image)?\s*:\s*url\(['"]?([^'")]+)['"]?\)/gi,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      for (const part of m[1].split(',')) {
        const u = part.trim().split(/\s+/)[0];
        if (u) urls.push(u);
      }
    }
  }
  return [...new Set(urls)];
}

/** 纯文本 -> HTML 段落 */
export function textToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((block) =>
      block
        .trim()
        .split('\n')
        .filter((l) => l.trim())
        .map((l) => `<p style="margin:14px 0;line-height:1.8;">${escapeHtml(l.trim())}</p>`)
        .join(''),
    )
    .join('');
}

export function formatArticle(ext: string, content: string): string {
  const lower = ext.toLowerCase();
  if (lower === '.md' || lower === '.markdown') return markdownToHtml(content);
  if (lower === '.txt') return textToHtml(content);
  return content;
}

export function extractTitleDigest(content: string, ext: string): { title: string; digest: string } {
  const lower = ext.toLowerCase();
  if (lower === '.html') {
    const titleTag = content.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const h1 = content.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const title = stripTags(titleTag?.[1] ?? h1?.[1] ?? '').trim() || extractTitle(content);
    return { title: title.slice(0, 64), digest: extractSummary(content, 120) };
  }
  if (lower === '.md' || lower === '.markdown') {
    const titleMatch = content.match(/^\s*#\s+(.+)$/m);
    return {
      title: (titleMatch?.[1] ?? extractTitle(content)).trim().slice(0, 64),
      digest: extractSummary(content, 120),
    };
  }
  const lines = content.split('\n').filter((l) => l.trim());
  return {
    title: (lines[0] ?? '无标题').trim().slice(0, 64),
    digest: extractSummary(content, 120),
  };
}

/* ============================================================
 * 工具函数
 * ========================================================== */

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function decodeEntities(str: string): string {
  return str
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&ldquo;/g, '“')
    .replace(/&rdquo;/g, '”')
    .replace(/&mdash;/g, '—')
    .replace(/&hellip;/g, '…');
}

export function isValidUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function weightedRandom<T>(items: T[], weightFn: (item: T, index: number) => number): T {
  if (items.length === 0) throw new Error('没有可选项');
  const weights = items.map((item, i) => Math.max(0, weightFn(item, i)));
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return items[Math.floor(Math.random() * items.length)];

  let rand = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    rand -= weights[i];
    if (rand <= 0) return items[i];
  }
  return items[items.length - 1];
}

export function slugify(input: string): string {
  const map: Record<string, string> = {
    健康养生: 'health',
    科技数码: 'tech',
    财经投资: 'finance',
    教育学习: 'education',
    美食旅行: 'food-travel',
    时尚生活: 'fashion',
    职场发展: 'career',
    情感心理: 'emotion',
    娱乐八卦: 'entertainment',
    新闻时事: 'news',
  };
  if (map[input]) return map[input];
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'custom'
  );
}
