import { Card, Button, Tag, Alert, Descriptions } from 'antd';
import { UserOutlined, KeyOutlined } from '@ant-design/icons';

export default function SelfCard({
  me,
  onEdit,
}: {
  me?: { username: string; displayName: string; role: 'admin' | 'editor'; mustChangePassword: boolean } | null;
  onEdit: () => void;
}) {
  return (
    <Card
      size="small"
      title={
        <span>
          <UserOutlined /> 当前账号
        </span>
      }
      extra={
        <Button size="small" type="primary" icon={<KeyOutlined />} onClick={onEdit}>
          修改密码
        </Button>
      }
    >
      <Descriptions column={{ xs: 1, sm: 2, md: 3 }} size="small" bordered>
        <Descriptions.Item label="用户名">{me?.username}</Descriptions.Item>
        <Descriptions.Item label="显示名">{me?.displayName || '—'}</Descriptions.Item>
        <Descriptions.Item label="角色">
          {me?.role === 'admin' ? <Tag color="blue">管理员</Tag> : <Tag>编辑</Tag>}
        </Descriptions.Item>
      </Descriptions>
      {me?.mustChangePassword && (
        <Alert
          className="mt-3"
          type="warning"
          showIcon
          message="你还在使用初始密码 admin123"
          description="为了账号安全建议尽快修改，可在右上角「修改密码」或此处按钮自助完成。"
          action={
            <Button size="small" type="primary" onClick={onEdit}>
              立即修改
            </Button>
          }
        />
      )}
    </Card>
  );
}
