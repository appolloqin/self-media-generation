import { llmService } from './llm.service.js';
import { logger } from '../core/logger.js';
import { configService } from './config.service.js';
import { htmlToMarkdown } from '../utils/content.js';
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
    const base = Math.min(18, Math.max(16, p.typography.baseFontSize));
    const lineHeight = Math.max(1.75, p.typography.lineHeight);
    const accent = p.accent.primaryColor;
    const highlight = p.accent.highlightBg;
    const text = p.typography.textColor || '#333333';
    const heading = p.typography.headingColor || '#1a1a1a';
    const maxWidth = Math.min(677, p.container.maxWidth || 677);
    const padX = Math.max(16, p.container.marginHorizontal || 16);

    const source = cfg.articleFormat === 'html' ? htmlToMarkdown(content) : content;
    const blocks = source
      .split(/\n{2,}/)
      .map((b) => b.trim())
      .filter(Boolean);

    const body = blocks
      .map((block) => {
        const headingMatch = block.match(/^(#{1,6})\s+(.*)$/);
        if (headingMatch) {
          const hashes = headingMatch[1].length;
          const level = Math.min(3, hashes + 1);
          const size = hashes <= 1 ? 20 : hashes === 2 ? 18 : 16;
          return `<h${level} style="margin:28px 0 12px;font-size:${size}px;font-weight:700;color:${heading};line-height:1.5;letter-spacing:0.02em;">${escapeText(headingMatch[2])}</h${level}>`;
        }
        if (/^[-*+]\s+/m.test(block) && block.split('\n').every((l) => !l.trim() || /^[-*+]\s+/.test(l))) {
          const items = block
            .split('\n')
            .map((l) => l.replace(/^[-*+]\s+/, ''))
            .filter(Boolean)
            .map((t) => `<li style="margin:6px 0;line-height:${lineHeight};">${inlineFormat(t)}</li>`)
            .join('');
          return `<ul style="margin:8px 0 16px;padding-left:22px;font-size:${base}px;color:${text};">${items}</ul>`;
        }
        if (/^>\s?/m.test(block)) {
          return `<blockquote style="margin:16px 0;padding:10px 14px;border-left:3px solid ${accent};background:${highlight};color:#555;font-size:${base}px;line-height:${lineHeight};">${escapeText(block.replace(/^>\s?/gm, ''))}</blockquote>`;
        }
        return `<p style="margin:0 0 18px;font-size:${base}px;line-height:${lineHeight};color:${text};letter-spacing:0.02em;">${inlineFormat(block)}</p>`;
      })
      .join('\n');

    return [
      `<section style="max-width:${maxWidth}px;margin:0 auto;padding:8px ${padX}px 28px;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;">`,
      `  <h1 style="margin:8px 0 8px;font-size:22px;line-height:1.45;font-weight:700;color:${heading};letter-spacing:0.02em;">${escapeText(title)}</h1>`,
      `  <section style="width:32px;height:2px;background:${accent};margin:0 0 22px;border-radius:1px;"></section>`,
      `  ${body}`,
      `</section>`,
    ].join('\n');
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

function inlineFormat(s: string): string {
  return escapeText(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

function escapeText(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export const layoutService = new LayoutService();
export type { PD };
