import { Card, Table, Button, Space, Tag, Switch, Popconfirm, Select, Tooltip, Empty, App as AntApp } from 'antd';
import { UserOutlined, PlusOutlined, DeleteOutlined, ReloadOutlined, KeyOutlined, LogoutOutlined, UnlockOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { authApi } from '@/api';
import type { PublicUser, SessionInfo } from '@smg/shared';

dayjs.extend(relativeTime);

type Props = {
  users: PublicUser[];
  sessions: SessionInfo[];
  meId?: number;
  loading: boolean;
  onReload: () => void;
  onNew: () => void;
  onReset: (u: PublicUser) => void;
};

export default function UsersCard({ users, sessions, meId, loading, onReload, onNew, onReset }: Props) {
  const { message, modal } = AntApp.useApp();

  const act = async (fn: () => Promise<unknown>, okMsg: string) => {
    try {
      await fn();
      message.success(okMsg);
      onReload();
    } catch (err) {
      message.error((err as Error).message);
    }
  };

  return (
    <>
      <Card
        size="small"
        title={<span><UserOutlined /> 账号管理 ({users.length})</span>}
        extra={
          <Button size="small" type="primary" icon={<PlusOutlined />} onClick={onNew}>
            新建账号
          </Button>
        }
      >
        <Table
          rowKey="id"
          size="small"
          loading={loading}
          dataSource={users}
          pagination={false}
          columns={[
            { title: 'ID', dataIndex: 'id', width: 55 },
            {
              title: '用户名',
              dataIndex: 'username',
              render: (v: string, r) => (
                <Space size={4}>
                  <span className="font-medium">{v}</span>
                  {r.id === meId && <Tag color="blue">当前</Tag>}
                  {!r.enabled && <Tag>已停用</Tag>}
                </Space>
              ),
            },
            { title: '显示名', dataIndex: 'displayName', render: (v: string) => v || <span className="text-gray-400">—</span> },
            {
              title: '角色',
              dataIndex: 'role',
              width: 105,
              render: (v: string, r) => (
                <Select
                  size="small"
                  value={v}
                  disabled={r.id === meId}
                  style={{ width: 92 }}
                  onChange={() =>
                    modal.confirm({
                      title: '确认修改角色？',
                      content: '该操作会立即生效。',
                      onOk: () => act(() => authApi.updateUser(r.id, { role: v as 'admin' | 'editor' }), '角色已更新'),
                    })
                  }
                  options={[
                    { value: 'admin', label: '管理员' },
                    { value: 'editor', label: '编辑' },
                  ]}
                />
              ),
            },
            {
              title: '最近登录',
              dataIndex: 'lastLoginAt',
              width: 140,
              render: (v: string | null) =>
                v ? (
                  <Tooltip title={dayjs(v).format('YYYY-MM-DD HH:mm:ss')}>
                    <span className="text-xs text-gray-500">{dayjs(v).fromNow()}</span>
                  </Tooltip>
                ) : (
                  <span className="text-xs text-gray-400">从未登录</span>
                ),
            },
            {
              title: '启用',
              width: 65,
              render: (_, r) => (
                <Switch
                  size="small"
                  checked={Boolean(r.enabled)}
                  disabled={r.id === meId}
                  onChange={(v) => act(() => authApi.updateUser(r.id, { enabled: v }), v ? '已启用' : '已停用')}
                />
              ),
            },
            {
              title: '操作',
              width: 150,
              render: (_, r) => (
                <Space size={0}>
                  <Button size="small" type="link" icon={<KeyOutlined />} onClick={() => onReset(r)}>
                    改密
                  </Button>
                  <Button
                    size="small"
                    type="link"
                    icon={<UnlockOutlined />}
                    onClick={() =>
                      act(() => authApi.unlockUser(r.id), `已解除「${r.username}」的登录锁定`)
                    }
                  >
                    解锁
                  </Button>
                  <Popconfirm
                    title="确认删除该账号？"
                    description="该账号的所有登录会话会立即失效"
                    onConfirm={() => act(() => authApi.removeUser(r.id), '已删除')}
                    disabled={r.id === meId}
                  >
                    <Button size="small" type="link" danger icon={<DeleteOutlined />} disabled={r.id === meId} />
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />
      </Card>

      <Card
        size="small"
        title={<span><LogoutOutlined /> 在线会话 ({sessions.length})</span>}
        extra={
          <Space size={0}>
            <Button size="small" onClick={() => act(() => authApi.purgeSessions(), '已清理过期会话')}>
              清理过期
            </Button>
            <Button size="small" icon={<ReloadOutlined />} onClick={onReload}>
              刷新
            </Button>
          </Space>
        }
      >
        {sessions.length > 0 ? (
          <Table
            rowKey="id"
            size="small"
            dataSource={sessions}
            pagination={{ pageSize: 8 }}
            columns={[
              { title: '用户', dataIndex: 'username', width: 100, render: (v: string) => <span className="font-medium">{v}</span> },
              { title: 'IP', dataIndex: 'ip', width: 130, render: (v: string) => <span className="font-mono text-xs">{v || '—'}</span> },
              {
                title: '设备',
                dataIndex: 'userAgent',
                ellipsis: true,
                render: (v: string) => (
                  <Tooltip title={v}>
                    <span className="text-xs text-gray-500">{shortUa(v)}</span>
                  </Tooltip>
                ),
              },
              { title: '登录时间', dataIndex: 'createdAt', width: 120, render: (v: string) => <span className="text-xs">{dayjs(v).format('MM-DD HH:mm')}</span> },
              {
                title: '过期时间',
                dataIndex: 'expiresAt',
                width: 120,
                render: (v: string) => {
                  const expired = dayjs(v).isBefore(dayjs());
                  return <span className={`text-xs ${expired ? 'text-gray-400 line-through' : 'text-gray-500'}`}>{dayjs(v).format('MM-DD HH:mm')}</span>;
                },
              },
              {
                title: '',
                width: 60,
                render: (_, r) => (
                  <Button size="small" type="link" danger onClick={() => act(() => authApi.revokeSession(r.id), '已强制下线')}>
                    下线
                  </Button>
                ),
              },
            ]}
          />
        ) : (
          <Empty description="暂无在线会话" />
        )}
      </Card>
    </>
  );
}

function shortUa(ua: string): string {
  if (!ua) return '未知设备';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) && !/Chrome/.test(ua) ? 'Safari' : /Firefox\//.test(ua) ? 'Firefox' : '浏览器';
  const os = /Windows NT/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Linux/.test(ua) ? 'Linux' : '未知系统';
  return `${browser} · ${os}`;
}
