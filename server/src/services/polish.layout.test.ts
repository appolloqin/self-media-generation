import { composeLocalHtml, composePolishHtml } from './layout.service.js';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

const md = `# MiniMaxH3两步入画

开篇说明ComfyUI0.31.0即可挂。

## 上手步骤

先看版本，主模型至少要0.31.0。

- 2步PDMDLoRA：363MB
- 开源地址：https://hf-mirror.com/Kijai/MiniMax-H3-experimental
`;

const polish = composePolishHtml(md, 'MiniMaxH3两步入画');
const other = composeLocalHtml(md, 'MiniMaxH3两步入画');

assert(polish.includes('<h1'), '润色应保留一级标题');
assert(polish.includes('<h2'), '润色应保留二级标题');
assert(polish.includes('<ul'), '润色应保留项目符号');
assert(polish.includes('<li'), '润色列表项应进 li');
assert(!polish.includes('width:36px'), `润色不得加装饰蓝条，实际:\n${polish}`);
assert(!polish.includes('border-radius:8px'), `润色列表不得套圆角底框，实际:\n${polish}`);
assert(!polish.includes('background:#f3f7fc') && !polish.includes('background:#f0f7ff'), '润色不得套高亮卡片底');

assert(other.includes('width:36px'), '其他模式本地排版仍保留装饰条，避免误改');
assert(other.includes('<ul'), '其他模式列表排版不得被这次改动破坏');

const leftover = composePolishHtml(
  ['**步骤1 | 确认版本**', '', '先看你的ComfyUI版本，主模型至少要0.31.0。', '', '步骤2 | 按显存选主模型**'].join('\n'),
  '测试',
);
assert(!leftover.includes('**'), `润色成品不得露出星号，实际:\n${leftover}`);
assert(leftover.includes('确认版本'), '步骤标题文本应保留');
assert(leftover.includes('按显存选主模型'), '未闭合加粗的步骤标题应保留文本');

console.log('polish.layout.test ok');
