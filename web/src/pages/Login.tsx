import { useEffect } from 'react';
import { Card, Form, Input, Button, Typography, Alert, Space, Tag, App as AntApp } from 'antd';
import { UserOutlined, LockOutlined, SafetyCertificateOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useAuthStore } from '@/store/auth';
import BrandLogo from '@/components/BrandLogo';

const { Title, Text } = Typography;

type LoginValues = { username: string; password: string };

export default function LoginPage() {
  const { message } = AntApp.useApp();
  const login = useAuthStore((s) => s.login);
  const loading = useAuthStore((s) => s.loading);
  const error = useAuthStore((s) => s.error);
  const defaultAccount = useAuthStore((s) => s.defaultAccount);

  const [form] = Form.useForm<LoginValues>();

  useEffect(() => {
    if (defaultAccount) {
      form.setFieldsValue({ username: defaultAccount.username, password: defaultAccount.password });
    }
  }, [defaultAccount, form]);

  const onFinish = async (values: LoginValues) => {
    const ok = await login(values.username.trim(), values.password);
    if (ok) message.success('登录成功');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface p-4">
      <div className="w-full max-w-[420px]">
        <div className="mb-7 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-500">
            <BrandLogo className="h-9 w-9" />
          </div>
          <Title level={3} className="!mb-1.5 !text-2xl !font-semibold !tracking-tight !text-ink-900">
            智媒工坊
          </Title>
          <Text type="secondary" className="!text-sm">
            AI 自媒体内容创作平台
          </Text>
        </div>

        <Card className="border border-line shadow-none" styles={{ body: { padding: 28 } }}>
          <Form form={form} layout="vertical" size="large" onFinish={onFinish} requiredMark={false}>
            <Form.Item
              name="username"
              label="用户名"
              rules={[{ required: true, message: '请输入用户名' }]}
            >
              <Input prefix={<UserOutlined className="text-ink-400" />} placeholder="请输入用户名" autoComplete="username" autoFocus />
            </Form.Item>

            <Form.Item
              name="password"
              label="密码"
              rules={[{ required: true, message: '请输入密码' }]}
            >
              <Input.Password
                prefix={<LockOutlined className="text-ink-400" />}
                placeholder="请输入密码"
                autoComplete="current-password"
              />
            </Form.Item>

            {error && (
              <Alert type="error" showIcon message={error} className="!mb-4" closable onClose={() => useAuthStore.setState({ error: null })} />
            )}

            <Button type="primary" htmlType="submit" block size="large" loading={loading} icon={<SafetyCertificateOutlined />}>
              登 录
            </Button>
          </Form>

          {defaultAccount && (
            <div className="mt-5 rounded-lg border border-dashed border-line p-3.5 text-xs">
              <Space size={4} className="mb-1">
                <ThunderboltOutlined className="text-ink-500" />
                <Text strong className="!text-xs">
                  首次使用？
                </Text>
                <Tag className="!mr-0 !text-[10px]">
                  默认账号已自动填入
                </Tag>
              </Space>
              <div className="text-ink-600">
                账号 <span className="font-mono font-medium text-ink-800">{defaultAccount.username}</span>
                <span className="mx-1">/</span>
                密码 <span className="font-mono font-medium text-ink-800">{defaultAccount.password}</span>
              </div>
              <div className="mt-1 text-ink-600">可在「系统设置 → 账号安全」中随时修改，是否修改由你决定。</div>
            </div>
          )}
        </Card>

        <div className="mt-5 text-center text-xs text-ink-500">
          智媒工坊 v1.0.0 · 本地部署，数据存储于本机 SQLite
        </div>
      </div>
    </div>
  );
}
