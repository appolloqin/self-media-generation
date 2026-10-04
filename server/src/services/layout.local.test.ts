import { composeLocalHtml } from './layout.service.js';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

const sample = `# MiniMaxH3极速出片

做AI视频的朋友最近都在打听同一件事。

## ✨ 核心亮点

- 2步PDMD LoRA：363MB
- 4步PDMD：533MB
w6a8的Ref2VA：16,753,960,844字节，约15.60GiB

## 🚀 5分钟上手流程
确认版本：先看你的ComfyUI版本，主模型至少要0.31.0
按显存选主模型：显存宽裕走w6a8
挂LoRA：把文件放进loras目录

## 👥 适合谁看
想压低采样步数的程序员
显存吃紧想跑H3的玩家
开源地址，直接自取
https://hf-mirror.com/Kijai/MiniMax-H3-experimental
`;

const mashedHeading = `## ✨ 5分钟上手流程确认版本：先看你的ComfyUI版本，主模型至少要0.31.0`;

const html = composeLocalHtml(sample, '测试标题');
const headingFix = composeLocalHtml(mashedHeading, '测试标题');

assert(html.includes('<ul'), `应渲染无序列表，实际:\n${html}`);
assert((html.match(/<li /g) ?? []).length >= 3, `规格行应进列表，实际:\n${html}`);
assert(html.includes('<h2'), `应有二级标题，实际:\n${html}`);
assert(!html.includes('适合谁看想压低'), '中文换行不得被粘成「适合谁看想压低」');
assert(!html.includes('流程确认版本'), '标题与正文换行不得粘连');
assert(html.includes('5分钟上手流程'), '应保留小节标题');
assert(
  headingFix.includes('5分钟上手流程') && headingFix.includes('先看你的ComfyUI版本'),
  `过长标题应拆开，实际:\n${headingFix}`,
);
assert(!html.includes('<li style="margin:0 0 10px;line-height:1.85;">- '), '列表项不应残留 Markdown 减号');
assert(
  html.includes('确认版本：先看你的ComfyUI版本') && !html.includes('<li style="margin:0 0 10px;line-height:1.85;">确认版本'),
  '步骤说明不应被误判成规格列表',
);

console.log('layout.local.test ok');
console.log('--- html snippet ---');
console.log(html);
