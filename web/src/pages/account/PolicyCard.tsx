import { Card, Switch, InputNumber, Alert, Divider, Row, Col, Button } from 'antd';
import { SafetyOutlined, ReloadOutlined } from '@ant-design/icons';
import type { AuthSettings } from '@smg/shared';

type ConfirmFn = (cfg: { title: string; content: string; okType?: 'primary' | 'danger'; onOk: () => void }) => void;

type Props = {
  settings: AuthSettings;
  isAdmin: boolean;
  onSave: (patch: Partial<AuthSettings>) => void;
  onConfirm: ConfirmFn;
  onReload: () => void;
};

export default function PolicyCard({ settings, isAdmin, onSave, onConfirm, onReload }: Props) {
  return (
    <Card
      size="small"
      title={<span><SafetyOutlined /> 登录策略</span>}
      extra={isAdmin ? <Button size="small" icon={<ReloadOutlined />} onClick={onReload}>刷新</Button> : null}
    >
      {!isAdmin ? (
        <Alert type="info" showIcon message="仅管理员可修改登录策略" />
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">启用登录鉴权</div>
              <div className="text-xs text-gray-500">关闭后所有接口可匿名访问，仅建议本地调试时使用</div>
            </div>
            <Switch
              checked={settings.enabled}
              onChange={(v) =>
                onConfirm({
                  title: v ? '确认开启登录鉴权？' : '确认关闭登录鉴权？',
                  content: v ? '开启后所有接口都需要登录才能访问。' : '关闭后任何人可以直接访问全部接口和数据，仅建议临时调试使用。',
                  okType: v ? 'primary' : 'danger',
                  onOk: () => onSave({ enabled: v }),
                })
              }
            />
          </div>
          <Divider className="!my-2" />
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">允许访客只读</div>
              <div className="text-xs text-gray-500">未登录用户可浏览公开接口，敏感操作仍需登录</div>
            </div>
            <Switch checked={settings.allowGuest} disabled={!settings.enabled} onChange={(v) => onSave({ allowGuest: v })} />
          </div>
          <Row gutter={16} className="!mt-4">
            <Col span={8}>
              <div className="mb-1 text-sm font-medium">最大失败次数</div>
              <InputNumber className="w-full" min={0} max={100} disabled={!settings.enabled} value={settings.maxAttempts} onChange={(v) => onSave({ maxAttempts: Number(v) || 0 })} addonAfter="次" />
            </Col>
            <Col span={8}>
              <div className="mb-1 text-sm font-medium">锁定时长</div>
              <InputNumber className="w-full" min={1} max={1440} disabled={!settings.enabled} value={settings.lockMinutes} onChange={(v) => onSave({ lockMinutes: Number(v) || 15 })} addonAfter="分钟" />
            </Col>
            <Col span={8}>
              <div className="mb-1 text-sm font-medium">会话有效期</div>
              <InputNumber className="w-full" min={1} max={8760} disabled={!settings.enabled} value={settings.sessionHours} onChange={(v) => onSave({ sessionHours: Number(v) || 168 })} addonAfter="小时" />
            </Col>
          </Row>
          <p className="mt-2 text-xs text-gray-500">失败次数设为 0 表示不限制。数值调整后立即保存并生效。</p>
        </div>
      )}
    </Card>
  );
}
