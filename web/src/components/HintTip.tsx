import { Tooltip } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import type { ReactNode } from 'react';

type HintTipProps = {
  title: ReactNode;
  className?: string;
};

/** 说明文案悬停提示：纯展示，无业务状态 */
export default function HintTip({ title, className = '' }: HintTipProps) {
  return (
    <Tooltip title={title} overlayInnerStyle={{ maxWidth: 300 }}>
      <button
        type="button"
        aria-label="说明"
        className={[
          'inline-flex cursor-pointer items-center justify-center border-0 bg-transparent p-0',
          'text-ink-500 transition-colors duration-150 hover:text-ink-800',
          className,
        ].join(' ')}
      >
        <QuestionCircleOutlined className="text-sm" />
      </button>
    </Tooltip>
  );
}
