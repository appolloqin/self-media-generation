import { consumeEventKey, completionEventKey } from './useTaskSocket.ts';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

const key = completionEventKey(12, 17, '《标题》生成完成');
assert(key === 'c:12:17:《标题》生成完成', `key=${key}`);

const first = consumeEventKey('', key);
assert(first.handled, '首次完成应提示');
const second = consumeEventKey(first.key, key);
assert(!second.handled, '同一完成再次进入工作台不应提示');
const next = consumeEventKey(first.key, completionEventKey(13, 18, '《标题》生成完成'));
assert(next.handled, '新任务完成应再次提示');

const nav1 = consumeEventKey('', 'nav:1:选题A:custom');
assert(nav1.handled, '热点带入应提示一次');
const nav2 = consumeEventKey(nav1.key, 'nav:1:选题A:custom');
assert(!nav2.handled, '同一跳转再次进入工作台不应重复提示');
const nav3 = consumeEventKey(nav1.key, 'nav:2:选题A:custom');
assert(nav3.handled, '再次从热点雷达带入应提示');

console.log('useTaskSocket.events.test ok');
