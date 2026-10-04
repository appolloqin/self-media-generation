import { looksLikeHtml, markdownToPreviewHtml, toPreviewHtml } from './mdPreview.ts';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

const md = `# MiniMaxH3两步入画

开篇说明。

## 上手步骤

- 2步PDMDLoRA：363MB
`;

const html = markdownToPreviewHtml(md);
assert(html.includes('<h1>'), `应有 h1: ${html}`);
assert(html.includes('<h2>'), `应有 h2: ${html}`);
assert(html.includes('<ul>'), `应有列表: ${html}`);
assert(!html.includes('**'), '预览 HTML 不得露出星号');

const leftover = markdownToPreviewHtml('步骤2 | 按显存选主模型**\n\n先看版本。');
assert(!leftover.includes('**'), `未配对星号应去掉: ${leftover}`);
assert(leftover.includes('按显存选主模型'), '标题文本应保留');

assert(looksLikeHtml('<section><p>x</p></section>'), 'HTML 正文应识别为 HTML');
assert(!looksLikeHtml('# 标题\n\n正文'), 'Markdown 不应被当成 HTML');
assert(toPreviewHtml('# 标题').includes('<h1>'), 'toPreviewHtml 应渲染 Markdown');
assert(toPreviewHtml('<p>已是HTML</p>').includes('<p>已是HTML</p>'), 'HTML 预览应原样使用');

console.log('mdPreview.test ok');
