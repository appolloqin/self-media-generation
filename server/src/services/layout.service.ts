import { llmService } from './llm.service.js';
import { logger } from '../core/logger.js';
import { configService } from './config.service.js';
import { htmlToMarkdown, markdownToHtml, sanitizeBrokenMarkdown } from '../utils/content.js';
import type { PageDesignConfig, PublishPlatform } from '@smg/shared';

const WECHAT_SYSTEM = [
  '你是微信公众号排版编辑，目标是「像认真排过的长文」，不是海报，也不是后台卡片。',
  '## 设计目标：',
  '- 白底、单栏、适合手机阅读的中文正文',
  '- 纯内联样式：不使用外部 CSS、JavaScript，也不使用 <style> 标签',
  '- 模块化：内容用 <section> 包裹，不要 <header>/<footer>',
  '',
  '## 风格（必须克制）',
  '- 配色不超过两种：正文深灰 + 一个主色用于小标题或分隔线',
  '- 禁止大色块背景、禁止整页灰底套白卡片、禁止炫彩渐变',
  '- 禁止装饰性 SVG、emoji 堆砌、大圆角阴影卡片墙',
  '- 标题左对齐，22px 左右，不要居中巨号标题',
  '- 正文 16–17px，行高 1.8–1.9，段间距明显，不要两端对齐撑出大空隙',
  '- 小标题 18px、加粗、与上文留白，不要再做成另一条文章标题',
  '',
  '## 技术要求：',
  '- 只使用 HTML 基本标签与内联样式',
  '- 非必要不配图；不要用 picsum 占位图',
  '- 不要作者、版权、URL、END 装饰',
  '- 不能使用 position: absolute',
  '- 输出放在 ``` 代码块中，主体必须是中文',
].join('\n');

const PLATFORM_REQUIREMENTS: Record<string, string> = {
  wechat: '微信公众号HTML设计要求：使用内联CSS样式；采用适合移动端阅读的字体大小和行距；确保在微信客户端中显示效果良好',
  xiaohongshu: '小红书平台设计要求：注重视觉美感，年轻化设计风格；适当使用emoji；排版简洁清新',
  zhihu: '知乎平台设计要求：专业简洁的学术风格；重视逻辑性和可读性；适合长文阅读',
  toutiao: '今日头条设计要求：信息密度适中，段落分明，重点加粗，适合信息流阅读',
  baijiahao: '百家号设计要求：专业稳重，结构清晰，适合搜索流量与长尾阅读',
};

type PD = PageDesignConfig;

class LayoutService {
  async designHtml(
    content: string,
    title: string,
    platform: PublishPlatform = 'wechat',
    design?: PageDesignConfig,
  ): Promise<string> {
    const cfg = configService.get();
    const pd = design ?? cfg.pageDesign;
    const requirement = PLATFORM_REQUIREMENTS[platform] ?? '通用HTML设计要求：简洁美观，注重用户体验';
    const source = cfg.articleFormat === 'html' ? htmlToMarkdown(content) : content;
    const styleGuide = buildStyleGuide(pd);

    const system =
      platform === 'wechat'
        ? WECHAT_SYSTEM + '\n\n' + requirement + styleGuide
        : [
            `你是网页排版专家，为「${platform}」平台设计精美的移动端 HTML。${requirement}`,
            '',
            '## 硬性要求',
            '- 纯内联样式，不使用 <style> 标签与外部 CSS/JS',
            '- 所有内容用 <section style="..."> 包裹，不使用 <header>/<footer>',
            '- 移动优先，10 屏以内',
            '- 主体内容为中文',
            '- 不能使用 position: absolute',
            '- 输出放在 \`\`\` 标签中' + styleGuide,
          ].join('\n');

    try {
      const out = await llmService.chat({
        system,
        user: `请为下面内容设计排版。\n\n标题：${title}\n\n正文：\n${source}`,
        temperature: 0.4,
        maxTokens: 16000,
      });
      const html = extractHtmlBlock(out);
      if (!html.includes('<section') && !html.includes('<p')) {
        throw new Error('排版结果缺少正文结构');
      }
      return html;
    } catch (err) {
      logger.warn(`AI 排版失败，降级为本地排版: ${(err as Error).message}`);
      return this.localHtml(content, title, pd);
    }
  }

  localHtml(content: string, title: string, pd?: PageDesignConfig): string {
    const cfg = configService.get();
    const p = pd ?? cfg.pageDesign;
    const raw = cfg.articleFormat === 'html' ? htmlToMarkdown(content) : content;
    return composeLocalHtml(raw, title, frameFromDesign(p));
  }

  /** 润色专用：按 Markdown 直出，不套装饰条/高亮列表框 */
  polishHtml(content: string, title: string, pd?: PageDesignConfig): string {
    const cfg = configService.get();
    const p = pd ?? cfg.pageDesign;
    const raw = cfg.articleFormat === 'html' && /<[a-z][\s\S]*>/i.test(content)
      ? htmlToMarkdown(content)
      : content;
    return composePolishHtml(raw, title, frameFromDesign(p));
  }

  renderContentHtml(content: string, title: string): string {
    const cfg = configService.get();
    if (cfg.articleFormat === 'html') return content;
    return this.localHtml(content, title);
  }
}

function buildStyleGuide(pd?: PageDesignConfig): string {
  if (!pd || pd.useOriginalStyles) return '';
  return [
    '',
    '## 页面风格参数（必须严格遵守）',
    `- 内容最大宽度：${pd.container.maxWidth}px，左右边距 ${pd.container.marginHorizontal}px`,
    `- 容器背景：${pd.container.backgroundColor}`,
    `- 卡片：圆角 ${pd.card.borderRadius}px，阴影 ${pd.card.boxShadow}，内边距 ${pd.card.padding}px，背景 ${pd.card.backgroundColor}`,
    `- 正文：${pd.typography.baseFontSize}px，行高 ${pd.typography.lineHeight}，颜色 ${pd.typography.textColor}`,
    `- 标题：颜色 ${pd.typography.headingColor}，字号缩放 ${pd.typography.headingScale}`,
    `- 主色：${pd.accent.primaryColor}；辅助色：${pd.accent.secondaryColor}；高亮底色：${pd.accent.highlightBg}`,
    `- 段落间距 ${pd.spacing.elementMargin}px，模块间距 ${pd.spacing.sectionMargin}px`,
  ].join('\n');
}

function extractHtmlBlock(text: string): string {
  const fenced = text.match(/```(?:html)?\s*\n?([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const firstSection = body.indexOf('<section');
  if (firstSection === -1) return body.trim();
  const lastSection = body.lastIndexOf('</section>');
  if (lastSection === -1) return body.trim();
  return body.slice(firstSection, lastSection + '</section>'.length);
}

type LocalStyle = {
  base: number;
  lineHeight: number;
  accent: string;
  highlight: string;
  text: string;
  heading: string;
};

type LocalFrame = LocalStyle & { maxWidth: number; padX: number };

const DEFAULT_FRAME: LocalFrame = {
  base: 17,
  lineHeight: 1.85,
  accent: '#3a7bd5',
  highlight: '#f3f7fc',
  text: '#333333',
  heading: '#1a1a1a',
  maxWidth: 677,
  padX: 18,
};

function frameFromDesign(p: PageDesignConfig): LocalFrame {
  return {
    base: Math.min(17, Math.max(16, p.typography.baseFontSize)),
    lineHeight: Math.max(1.8, p.typography.lineHeight),
    accent: p.accent.primaryColor || '#3a7bd5',
    highlight: p.accent.highlightBg || '#f3f7fc',
    text: p.typography.textColor || '#333333',
    heading: p.typography.headingColor || '#1a1a1a',
    maxWidth: Math.min(677, p.container.maxWidth || 677),
    padX: Math.max(18, p.container.marginHorizontal || 16),
  };
}

/** 润色成稿：Markdown 语义 HTML，不加装饰条/高亮列表框 */
export function composePolishHtml(content: string, title: string, frame: Partial<LocalFrame> = {}): string {
  const s: LocalFrame = { ...DEFAULT_FRAME, ...frame };
  const source = normalizeArticleText(sanitizeBrokenMarkdown(content));
  let body = markdownToHtml(source);
  body = body.replace(/>([^<]*)</g, (_m, text: string) => `>${text.replace(/[*＊]+/g, '')}<`);
  if (!/<h1[\s>]/i.test(body) && title.trim()) {
    body = `<h1 style="font-size:22px;font-weight:700;margin:0 0 16px;line-height:1.4;color:${s.heading};">${escapeText(title.trim())}</h1>\n${body}`;
  }
  return [
    `<section style="max-width:${s.maxWidth}px;margin:0 auto;padding:22px ${s.padX}px 40px;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif;box-sizing:border-box;word-break:break-word;color:${s.text};font-size:${s.base}px;line-height:${s.lineHeight};">`,
    body,
    `</section>`,
  ].join('\n');
}

/** 仅去掉同行内中文夹空格，绝不能用 \\s（会吞掉换行，把段落粘成一团） */
function normalizeArticleText(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/([\u4e00-\u9fff])[ \t\u3000]+(?=[\u4e00-\u9fff])/g, '$1')
    .replace(/([\u4e00-\u9fff])[ \t]+(?=[A-Za-z0-9])/g, '$1')
    .replace(/([A-Za-z0-9])[ \t]+(?=[\u4e00-\u9fff])/g, '$1')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** 供单测 / 流水线共用：Markdown → 公众号内联 HTML */
export function composeLocalHtml(content: string, title: string, frame: Partial<LocalFrame> = {}): string {
  const s: LocalFrame = { ...DEFAULT_FRAME, ...frame };
  const source = normalizeArticleText(preprocessPlainStructure(content));
  const body = renderLocalBody(source, s);
  return [
    `<section style="max-width:${s.maxWidth}px;margin:0 auto;padding:22px ${s.padX}px 40px;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif;box-sizing:border-box;word-break:break-word;">`,
    `  <h1 style="margin:0 0 12px;font-size:22px;line-height:1.4;font-weight:700;color:${s.heading};">${escapeText(title)}</h1>`,
    `  <div style="width:36px;height:3px;background:${s.accent};margin:0 0 22px;border-radius:2px;"></div>`,
    `  ${body}`,
    `</section>`,
  ].join('\n');
}

/**
 * 把常见「伪结构」转成可排版块：
 * - 【小标题】
 * - ✅ / • 开头的要点行
 * - 「xxx：123MB」一类对比行
 */
function preprocessPlainStructure(md: string): string {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) {
      out.push('');
      continue;
    }
    const headingLine = t.match(/^(#{1,6})\s+(.+)$/);
    if (headingLine && headingLine[2].length > 28 && /[：:]/.test(headingLine[2])) {
      const [left, ...rest] = headingLine[2].split(/[：:]/);
      const tail = rest.join('：').trim();
      if (left.trim().length >= 4 && tail.length > 8) {
        out.push('', `${headingLine[1]} ${left.trim()}`, tail, '');
        continue;
      }
    }
    // 整行 【标题】 或带破损星号的标题行 → ##
    const onlyBracket = t.match(/^\*{0,2}\s*【\s*(.+?)\s*】\s*\*{0,2}\s*$/);
    if (onlyBracket) {
      out.push('', `## ${onlyBracket[1]}`, '');
      continue;
    }
    const starBracket = t.match(/^\*+\s*\**\s*【\s*(.+?)\s*】\s*\**\s*(.*)$/);
    if (starBracket) {
      const rest = starBracket[2]?.trim();
      out.push('', rest ? `## ${starBracket[1]} ${rest}` : `## ${starBracket[1]}`, '');
      continue;
    }
    if (/^(✅|☑️|✔️|✔|□|■|●|•|◆|◎)\s*/u.test(t)) {
      out.push(`- ${t.replace(/^(✅|☑️|✔️|✔|□|■|●|•|◆|◎)\s*/u, '')}`);
      continue;
    }
    if (isListLine(t)) {
      out.push(t);
      continue;
    }
    if (looksLikeSpecItem(t)) {
      out.push(`- ${t}`);
      continue;
    }
    out.push(line);
  }
  return out.join('\n');
}

function isListLine(t: string): { ordered: boolean; text: string } | null {
  const ul = t.match(/^[-*+]\s+(.+)$/);
  if (ul) return { ordered: false, text: ul[1] };
  const ol = t.match(/^\d+\.\s+(.+)$/);
  if (ol) return { ordered: true, text: ol[1] };
  return null;
}

function looksLikeSpecItem(t: string): boolean {
  return (
    t.length <= 80 &&
    /[：:]/.test(t) &&
    /(\d[\d,]*\s*(MB|GiB|GB|KB)|字节)/i.test(t) &&
    !/[。！？]$/.test(t)
  );
}

function openList(html: string[], ordered: boolean, s: LocalStyle): void {
  const tag = ordered ? 'ol' : 'ul';
  html.push(
    `<${tag} style="margin:8px 0 20px;padding:12px 14px 6px 28px;background:${s.highlight};border-radius:8px;font-size:${s.base}px;color:${s.text};list-style:${ordered ? 'decimal' : 'disc'};">`,
  );
}

function closeList(html: string[], ordered: boolean | null): boolean | null {
  if (ordered == null) return null;
  html.push(ordered ? '</ol>' : '</ul>');
  return null;
}

function pushItem(html: string[], text: string, s: LocalStyle): void {
  html.push(
    `<li style="margin:0 0 10px;line-height:${s.lineHeight};">${inlineFormat(text)}</li>`,
  );
}

/** 按行解析，避免「列表 + 普通句」混在同一段时把 `-` 当纯文本 */
function renderLocalBody(source: string, s: LocalStyle): string {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const html: string[] = [];
  let listOrdered: boolean | null = null;
  let para: string[] = [];

  const flushPara = () => {
    if (!para.length) return;
    const text = para.join('\n').trim();
    para = [];
    if (!text) return;
    if (/^【.+】$/.test(text)) {
      const inner = text.replace(/^【\s*|\s*】$/g, '');
      html.push(
        `<section style="margin:18px 0;padding:12px 14px;background:${s.highlight};border-left:3px solid ${s.accent};border-radius:0 8px 8px 0;">` +
          `<p style="margin:0;font-size:${s.base + 1}px;font-weight:700;color:${s.heading};line-height:1.5;">${escapeText(inner)}</p>` +
          `</section>`,
      );
      return;
    }
    html.push(
      `<p style="margin:0 0 16px;font-size:${s.base}px;line-height:${s.lineHeight};color:${s.text};text-align:left;">${inlineFormat(text).replace(/\n/g, '<br/>')}</p>`,
    );
  };

  for (const raw of lines) {
    const t = raw.trim();

    if (!t) {
      listOrdered = closeList(html, listOrdered);
      flushPara();
      continue;
    }

    const heading = t.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      listOrdered = closeList(html, listOrdered);
      flushPara();
      const hashes = heading[1].length;
      const size = hashes <= 2 ? 18 : 16;
      const level = hashes <= 1 ? 2 : Math.min(3, hashes);
      html.push(
        `<h${level} style="margin:26px 0 12px;font-size:${size}px;font-weight:700;color:${s.heading};line-height:1.45;">${inlineFormat(heading[2])}</h${level}>`,
      );
      continue;
    }

    if (/^>\s?/.test(t)) {
      listOrdered = closeList(html, listOrdered);
      flushPara();
      html.push(
        `<blockquote style="margin:16px 0;padding:12px 14px;border-left:3px solid ${s.accent};background:${s.highlight};color:#555;font-size:${s.base}px;line-height:${s.lineHeight};border-radius:0 8px 8px 0;text-align:left;">${inlineFormat(t.replace(/^>\s?/, ''))}</blockquote>`,
      );
      continue;
    }

    const listed = isListLine(t);
    const asSpec = !listed && looksLikeSpecItem(t);
    if (listed || asSpec) {
      flushPara();
      const ordered = listed?.ordered ?? false;
      const text = listed?.text ?? t;
      if (listOrdered == null) {
        openList(html, ordered, s);
        listOrdered = ordered;
      } else if (listOrdered !== ordered) {
        listOrdered = closeList(html, listOrdered);
        openList(html, ordered, s);
        listOrdered = ordered;
      }
      pushItem(html, text, s);
      continue;
    }

    listOrdered = closeList(html, listOrdered);
    html.push(
      `<p style="margin:0 0 16px;font-size:${s.base}px;line-height:${s.lineHeight};color:${s.text};text-align:left;">${inlineFormat(t)}</p>`,
    );
  }

  listOrdered = closeList(html, listOrdered);
  flushPara();
  return html.join('\n');
}

function inlineFormat(s: string): string {
  let t = s
    // 先保护合法加粗
    .replace(/\*\*\s*([^*]+?)\s*\*\*/g, '\u0001$1\u0002')
    // 清掉残留星号（含半边 **、列表误伤）
    .replace(/\*+/g, '');
  t = escapeText(t)
    .replace(/\u0001/g, '<strong>')
    .replace(/\u0002/g, '</strong>')
    .replace(
      /`([^`]+)`/g,
      '<code style="background:#f0f2f5;padding:1px 5px;border-radius:3px;font-size:0.92em;color:#1f2329;">$1</code>',
    );
  return t;
}

function escapeText(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export const layoutService = new LayoutService();
export type { PD };
