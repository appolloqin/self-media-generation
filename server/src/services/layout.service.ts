import { llmService } from './llm.service.js';
import { logger } from '../core/logger.js';
import { configService } from './config.service.js';
import { htmlToMarkdown } from '../utils/content.js';
import type { PageDesignConfig, PublishPlatform } from '@smg/shared';

const WECHAT_SYSTEM = [
  '你是微信公众号排版设计专家，请严格按照以下要求设计：',
  '## 设计目标：',
  '- 创建一个美观、现代、易读的"中文"移动端网页',
  '- 纯内联样式：不使用任何外部 CSS、JavaScript，也不使用 <style> 标签',
  '- 移动优先：专为移动设备设计',
  '- 模块化结构：所有内容都包裹在 <section style="xx"> 标签中',
  '- 简洁结构：不包含 <header> 与 <footer> 标签',
  '- 视觉吸引力：视觉上令人印象深刻',
  '',
  '## 设计风格指导：',
  '- 色彩方案：使用大胆、酷炫配色，吸引眼球，但不超过三种色系，层次合理',
  '- 读者感受：一眼喜欢，很高级，易读易懂',
  '- 排版：符合中文最佳排版实践，利用字号、字重、间距建立清晰视觉层次',
  '- 卡片式布局：使用圆角、阴影、边距创建卡片 UI 元素',
  '- 图片处理：大图展示，配合适当圆角与阴影',
  '',
  '## 技术要求：',
  '- 纯 HTML 结构：只使用 HTML 基本标签与内联样式',
  '- 内联样式：所有样式通过 style 属性应用在 <section> 上',
  '- 模块化：使用 <section> 包裹不同内容模块',
  '- 图片：非必要不配图；若必须配图且找不到有效链接，使用 https://picsum.photos/[宽]/[高]?random=1',
  '- 可生成炫酷 SVG 动画用于帮助理解或给用户小惊喜',
  '- 只基于核心主题，不包含作者、版权、URL 等信息',
  '',
  '## 其他要求：',
  '- 先思考排版布局，再填充内容',
  '- 输出长度：10 屏以内（移动端）',
  '- 代码必须放在 \`\`\` 标签中',
  '- 主体内容必须是中文',
  '- 不能使用 position: absolute',
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
        temperature: 0.7,
        maxTokens: 16000,
      });
      return extractHtmlBlock(out);
    } catch (err) {
      logger.warn(`AI 排版失败，降级为本地排版: ${(err as Error).message}`);
      return this.localHtml(content, title, pd);
    }
  }

  localHtml(content: string, title: string, pd?: PageDesignConfig): string {
    const cfg = configService.get();
    const p = pd ?? cfg.pageDesign;
    const base = p.typography.baseFontSize;
    const lineHeight = p.typography.lineHeight;
    const accent = p.accent.primaryColor;
    const highlight = p.accent.highlightBg;

    const source = cfg.articleFormat === 'html' ? htmlToMarkdown(content) : content;
    const blocks = source
      .split(/\n{2,}/)
      .map((b) => b.trim())
      .filter(Boolean);

    const body = blocks
      .map((block) => {
        const heading = block.match(/^(#{1,6})\s+(.*)$/);
        if (heading) {
          const level = Math.min(6, heading[1].length + 1);
          const size = Math.round(base * Math.pow(p.typography.headingScale, heading[1].length - 1));
          return `<h${level} style="margin:${p.spacing.sectionMargin}px 0 ${p.spacing.elementMargin}px;font-size:${size}px;font-weight:700;color:${p.typography.headingColor};line-height:1.5;">${escapeText(heading[2])}</h${level}>`;
        }
        if (/^[-*+]\s+/m.test(block)) {
          const items = block
            .split('\n')
            .map((l) => l.replace(/^[-*+]\s+/, ''))
            .filter(Boolean)
            .map((t) => `<li style="margin:6px 0;line-height:${lineHeight};">${escapeText(t)}</li>`)
            .join('');
          return `<ul style="margin:${p.spacing.elementMargin}px 0;padding-left:22px;">${items}</ul>`;
        }
        if (/^>\s?/m.test(block)) {
          return `<blockquote style="margin:${p.spacing.elementMargin}px 0;padding:10px 14px;border-left:3px solid ${accent};background:${highlight};color:#555;">${escapeText(block.replace(/^>\s?/gm, ''))}</blockquote>`;
        }
        return `<p style="margin:${p.spacing.elementMargin}px 0;font-size:${base}px;line-height:${lineHeight};color:${p.typography.textColor};text-align:justify;">${escapeText(block)}</p>`;
      })
      .join('\n');

    return [
      `<section style="max-width:${p.container.maxWidth}px;margin:0 auto;padding:${p.card.padding}px ${p.container.marginHorizontal}px;background:${p.container.backgroundColor};font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;">`,
      `  <section style="padding:${p.card.padding}px;background:${p.card.backgroundColor};border-radius:${p.card.borderRadius}px;box-shadow:${p.card.boxShadow};">`,
      `    <h1 style="margin:0 0 ${p.spacing.sectionMargin}px;font-size:${Math.round(base * p.typography.headingScale * 1.6)}px;line-height:1.4;font-weight:700;color:${p.typography.headingColor};text-align:center;">${escapeText(title)}</h1>`,
      `    <section style="width:48px;height:3px;background:${accent};margin:0 auto ${p.spacing.sectionMargin}px;border-radius:2px;"></section>`,
      `    ${body}`,
      `  </section>`,
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
  return body.slice(firstSection, lastSection + '</section>'.length);
}

function escapeText(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:#3a7bd5;">$1</strong>');
}

export const layoutService = new LayoutService();
export type { PD };
