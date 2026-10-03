import { useEffect, useMemo, useRef, useState } from 'react';
import { Segmented, Empty, Button } from 'antd';
import { useTaskStore } from '@/hooks/useTaskSocket';

const FILTERS = {
  all: '全部',
  important: '关键',
  error: '错误',
} as const;

type FilterKey = keyof typeof FILTERS;

const IMPORTANT: Set<string> = new Set(['success', 'warning', 'error', 'status']);

export default function LogTerminal() {
  const logs = useTaskStore((s) => s.logs);
  const running = useTaskStore((s) => s.running);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [autoScroll, setAutoScroll] = useState(true);
  const boxRef = useRef<HTMLDivElement>(null);

  const visible = useMemo(() => {
    if (filter === 'all') return logs;
    if (filter === 'error') return logs.filter((l) => l.type === 'error');
    return logs.filter((l) => IMPORTANT.has(l.type));
  }, [logs, filter]);

  useEffect(() => {
    if (!autoScroll || !boxRef.current) return;
    boxRef.current.scrollTop = boxRef.current.scrollHeight;
  }, [visible, autoScroll]);

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <Segmented
          size="small"
          value={filter}
          onChange={(v) => setFilter(v as FilterKey)}
          options={Object.entries(FILTERS).map(([value, label]) => ({ value, label }))}
        />
        <div className="flex items-center gap-2">
          {running && <span className="text-xs text-blue-600">● 任务执行中</span>}
          <Button size="small" type={autoScroll ? 'primary' : 'default'} onClick={() => setAutoScroll((v) => !v)}>
            {autoScroll ? '自动滚动' : '手动滚动'}
          </Button>
        </div>
      </div>

      <div ref={boxRef} className="log-terminal flex-1">
        {visible.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无日志" />
        ) : (
          visible.map((entry, i) => {
            const time = new Date(entry.timestamp).toTimeString().slice(0, 8);
            return (
              <div key={`${entry.timestamp}-${i}`} className="whitespace-pre-wrap break-words">
                <span className="t-internal">[{time}]</span>{' '}
                <span className={clsFor(entry.type)}>{entry.message}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function clsFor(type: string): string {
  switch (type) {
    case 'success':
      return 't-success';
    case 'warning':
      return 't-warning';
    case 'error':
      return 't-error';
    case 'status':
      return 't-status';
    case 'internal':
      return 't-internal';
    default:
      return 't-info';
  }
}
