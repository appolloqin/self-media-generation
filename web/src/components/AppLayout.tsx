import { useEffect, useMemo, useRef, useState } from 'react';
import { Layout, Menu, Typography, Badge, Tooltip, Button, Drawer, Grid, Space, Dropdown, Avatar, App as AntApp } from 'antd';
import {
  ThunderboltOutlined,
  FireOutlined,
  FileTextOutlined,
  HighlightOutlined,
  EditOutlined,
  BookOutlined,
  PictureOutlined,
  SettingOutlined,
  MenuOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  ClearOutlined,
  WifiOutlined,
  DisconnectOutlined,
  DownOutlined,
  LogoutOutlined,
  KeyOutlined,
} from '@ant-design/icons';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTaskStore } from '@/hooks/useTaskSocket';
import { useAuthStore } from '@/store/auth';
import LogTerminal from './LogTerminal';
import { BrandMark } from './BrandLogo';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

export type NavItem = { key: string; label: string; icon: React.ReactNode };

export const NAV_GROUPS: { group: string; items: NavItem[] }[] = [
  {
    group: '创作',
    items: [
      { key: '/', label: '创作工作台', icon: <ThunderboltOutlined /> },
      { key: '/hot', label: '热点雷达', icon: <FireOutlined /> },
      { key: '/copywriting', label: '文案武库', icon: <EditOutlined /> },
      { key: '/novel', label: '小说连载', icon: <BookOutlined /> },
    ],
  },
  {
    group: '资产',
    items: [
      { key: '/articles', label: '文章管理', icon: <FileTextOutlined /> },
      { key: '/templates', label: '模板中心', icon: <HighlightOutlined /> },
      { key: '/tracks', label: '专家赛道', icon: <BookOutlined /> },
      { key: '/library', label: '素材文库', icon: <BookOutlined /> },
      { key: '/images', label: '资源图库', icon: <PictureOutlined /> },
    ],
  },
  {
    group: '系统',
    items: [{ key: '/settings', label: '系统设置', icon: <SettingOutlined /> }],
  },
];

const ALL_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

export default function AppLayout() {
  const { message } = AntApp.useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.lg;

  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);

  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const required = useAuthStore((s) => s.required);

  const connected = useTaskStore((s) => s.connected);
  const running = useTaskStore((s) => s.running);
  const progress = useTaskStore((s) => s.progress);
  const logCount = useTaskStore((s) => s.logs.length);
  const clearLogs = useTaskStore((s) => s.clearLogs);

  const handleLogout = async () => {
    await logout();
    if (required) message.success('已退出登录');
  };

  // 日志有新增且正在运行时自动打开抽屉
  const prevCount = useRef(0);
  useEffect(() => {
    if (running && logCount > prevCount.current && logCount > 0) setLogOpen(true);
    prevCount.current = logCount;
  }, [logCount, running]);

  const selectedKey = useMemo(() => {
    const match = ALL_ITEMS.filter((i) => (i.key === '/' ? location.pathname === '/' : location.pathname.startsWith(i.key)));
    return match.length ? match[match.length - 1].key : location.pathname;
  }, [location.pathname]);

  const menuContent = (
    <Menu
      mode="inline"
      selectedKeys={[selectedKey]}
      onClick={({ key }) => {
        navigate(key);
        setDrawerOpen(false);
      }}
      style={{ borderInlineEnd: 'none' }}
    >
      {NAV_GROUPS.map((g) => (
        <Menu.ItemGroup key={g.group} title={collapsed && !isMobile ? undefined : g.group}>
          {g.items.map((item) => (
            <Menu.Item key={item.key} icon={item.icon}>
              {item.label}
            </Menu.Item>
          ))}
        </Menu.ItemGroup>
      ))}
    </Menu>
  );

  return (
    <Layout className="min-h-screen">
      {isMobile ? (
        <Drawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          placement="left"
          width={240}
          title={
            <span className="flex items-center gap-2">
              <BrandMark className="h-7 w-7" />
              <span className="font-semibold tracking-tight text-ink-900">智媒工坊</span>
            </span>
          }
          styles={{ body: { padding: 0 } }}
        >
          {menuContent}
        </Drawer>
      ) : (
        <Sider
          width={220}
          collapsible
          collapsed={collapsed}
          onCollapse={setCollapsed}
          trigger={null}
          className="border-r border-line !bg-white"
          style={{ overflow: 'auto' }}
        >
          <div
            className={[
              'flex h-14 items-center border-b border-line transition-all duration-200',
              collapsed ? 'flex-col justify-center gap-0.5 py-1' : 'justify-between gap-2 px-3',
            ].join(' ')}
          >
            {collapsed ? (
              <Tooltip title="展开导航" placement="right">
                <Button
                  type="text"
                  size="small"
                  aria-label="展开导航"
                  className="!flex h-9 w-9 items-center justify-center !text-ink-500 hover:!bg-surface-sunken hover:!text-ink-800"
                  icon={<MenuUnfoldOutlined className="text-base" />}
                  onClick={() => setCollapsed(false)}
                />
              </Tooltip>
            ) : (
              <>
                <div className="flex min-w-0 items-center gap-2.5">
                  <BrandMark className="h-8 w-8 shrink-0" />
                  <span className="truncate text-base font-semibold tracking-tight text-ink-900">智媒工坊</span>
                </div>
                <Tooltip title="收起导航" placement="right">
                  <Button
                    type="text"
                    size="small"
                    aria-label="收起导航"
                    className="!flex h-8 w-8 shrink-0 items-center justify-center !text-ink-500 hover:!bg-surface-sunken hover:!text-ink-800"
                    icon={<MenuFoldOutlined />}
                    onClick={() => setCollapsed(true)}
                  />
                </Tooltip>
              </>
            )}
          </div>
          {menuContent}
        </Sider>
      )}

      <Layout>
        <Header className="flex items-center justify-between px-4 lg:px-6">
          <Space>
            {isMobile && (
              <Button type="text" icon={<MenuOutlined />} onClick={() => setDrawerOpen(true)} />
            )}
            <div className="min-w-0">
              <Text strong ellipsis className="block max-w-[40vw] text-base leading-tight text-ink-900">
                {ALL_ITEMS.find((i) => i.key === selectedKey)?.label ?? '智媒工坊'}
              </Text>
              {running && (
                <Text type="secondary" className="text-xs">
                  {progress.message || progress.stage} · {progress.progress}%
                </Text>
              )}
            </div>
          </Space>

          <Space size={8}>
            {running && (
              <Badge status="processing" text={<span className="text-xs text-ink-600">生成中 {progress.progress}%</span>} />
            )}
            <Tooltip title={connected ? '实时日志已连接' : '实时日志已断开'}>
              <Badge status={connected ? 'success' : 'error'} text={connected ? <WifiOutlined /> : <DisconnectOutlined />} />
            </Tooltip>
            <Tooltip title="运行日志">
              <Badge count={logCount > 99 ? '99+' : logCount} size="small" offset={[-2, 2]}>
                <Button size="small" onClick={() => setLogOpen(true)}>
                  日志
                </Button>
              </Badge>
            </Tooltip>
            <Tooltip title="清空日志">
              <Button size="small" type="text" icon={<ClearOutlined />} onClick={clearLogs} />
            </Tooltip>

            {user && (
              <Dropdown
                menu={{
                  items: [
                    {
                      key: 'info',
                      label: (
                        <div className="py-1">
                          <div className="font-medium text-ink-900">{user.displayName || user.username}</div>
                          <div className="text-xs text-ink-600">
                            {user.username} · {user.role === 'admin' ? '管理员' : '编辑'}
                          </div>
                        </div>
                      ),
                      disabled: true,
                    },
                    { type: 'divider' },
                    ...(user.mustChangePassword
                      ? [{ key: 'password', icon: <KeyOutlined />, label: '修改密码' }]
                      : []),
                    { key: 'settings', icon: <SettingOutlined />, label: '账号安全' },
                    { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', danger: true },
                  ],
                  onClick: ({ key }) => {
                    if (key === 'logout') void handleLogout();
                    if (key === 'password' || key === 'settings') navigate('/settings?tab=account');
                  },
                }}
              >
                <Button size="small" type="text" className="!px-2 hover:!bg-surface-sunken">
                  <Space size={6}>
                    {user.mustChangePassword && (
                      <Tooltip title="你还在使用初始密码，建议尽快修改">
                        <Badge status="warning" />
                      </Tooltip>
                    )}
                    <Avatar
                      size={26}
                      style={{ background: '#1F2937', fontSize: 13 }}
                    >
                      {(user.displayName || user.username).slice(0, 1).toUpperCase()}
                    </Avatar>
                    {!isMobile && <span className="text-sm text-ink-800">{user.displayName || user.username}</span>}
                    <DownOutlined className="text-[10px] text-ink-400" />
                  </Space>
                </Button>
              </Dropdown>
            )}
          </Space>
        </Header>

        <Content className="overflow-y-auto">
          <Outlet />
        </Content>
      </Layout>

      <Drawer
        open={logOpen}
        onClose={() => setLogOpen(false)}
        placement="right"
        width={isMobile ? '100%' : 460}
        title="运行日志"
        extra={
          <Button size="small" icon={<ClearOutlined />} onClick={clearLogs}>
            清空
          </Button>
        }
      >
        <LogTerminal />
      </Drawer>
    </Layout>
  );
}
