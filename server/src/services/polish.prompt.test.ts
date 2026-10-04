import { buildPolishChat } from './polish.service.js';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

const instruction = [
  '按照微信公众号爆款文案风格改写文章',
  '减少生硬列表模板感',
  '用一级标题、二级标题、加粗重点、项目符号分段',
  '适合公众号编辑器直接粘贴',
  '直接输出改写完成的公众号正文，不要额外解释',
].join('\n');

const { system, user } = buildPolishChat({
  content: '原文：ComfyUI0.31.0 即可加载 MiniMaxH3。',
  instruction,
  preset: 'custom',
});

assert(user.includes(instruction), '用户改写要求必须原样进入 user 消息');
assert(user.includes('ComfyUI0.31.0'), '原文必须进入 user 消息');
assert(!system.includes('🔥'), `自定义润色不得塞 emoji 小节剧本，system=\n${system}`);
assert(!user.includes('🔥/✨'), `自定义润色 user 不得塞 emoji 小节模板，user=\n${user}`);
assert(!`${system}\n${user}`.includes('禁止照抄段落'), '自定义润色不得强制「禁止照抄」');
assert(!`${system}\n${user}`.includes('推荐成稿结构'), '自定义润色不得覆盖用户结构要求');
assert(system.includes('用户改写要求'), 'system 应声明以用户要求为准');

const preset = buildPolishChat({
  content: '原文一段。',
  preset: 'professional',
});
assert(preset.user.includes('更专业克制'), '非自定义预设仍应带预设方向');
assert(!preset.system.includes('🔥'), '预设润色也不再套 emoji 爆款剧本');

console.log('polish.prompt.test ok');
