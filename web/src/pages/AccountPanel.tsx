import { useEffect, useState } from 'react';
import { Card, Modal, Form, Input, Alert, Select, App as AntApp } from 'antd';
import { authApi } from '@/api';
import { useAuthStore } from '@/store/auth';
import SelfCard from './account/SelfCard';
import PolicyCard from './account/PolicyCard';
import UsersCard from './account/UsersCard';
import type { AuthSettings, PublicUser, SessionInfo } from '@smg/shared';

export default function AccountPanel() {
  const { message, modal } = AntApp.useApp();
  const me = useAuthStore((s) => s.user);
  const refreshMe = useAuthStore((s) => s.refresh);
  const isAdmin = me?.role === 'admin';

  const [settings, setSettings] = useState<AuthSettings | null>(null);
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(false);

  const [pwOpen, setPwOpen] = useState(false);
  const [pwForm] = Form.useForm();
  const [userOpen, setUserOpen] = useState(false);
  const [userForm] = Form.useForm();
  const [resetTarget, setResetTarget] = useState<PublicUser | null>(null);
  const [resetForm] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      setSettings(await authApi.settings());
      if (isAdmin) {
        const [u, s] = await Promise.all([authApi.users(), authApi.sessions()]);
        setUsers(u);
        setSessions(s);
      }
    } catch (err) {
      message.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const saveSettings = async (patch: Partial<AuthSettings>) => {
    try {
      setSettings(await authApi.saveSettings(patch));
      message.success('鉴权设置已保存');
    } catch (err) {
      message.error((err as Error).message);
    }
  };

  const submitPassword = async () => {
    const v = await pwForm.validateFields();
    try {
      await authApi.changePassword(v.oldPassword, v.newPassword);
      message.success('密码已修改，请重新登录');
      setPwOpen(false);
      pwForm.resetFields();
      await refreshMe();
      setTimeout(() => window.location.reload(), 800);
    } catch (err) {
      message.error((err as Error).message);
    }
  };

  const submitUser = async () => {
    const v = await userForm.validateFields();
    try {
      await authApi.createUser(v);
      message.success(`账号「${v.username}」已创建`);
      setUserOpen(false);
      userForm.resetFields();
      void load();
    } catch (err) {
      message.error((err as Error).message);
    }
  };

  const submitReset = async () => {
    if (!resetTarget) return;
    const v = await resetForm.validateFields();
    try {
      await authApi.updateUser(resetTarget.id, { password: v.password });
      message.success(`已重置「${resetTarget.username}」的密码，该账号需重新登录`);
      setResetTarget(null);
      resetForm.resetFields();
      void load();
    } catch (err) {
      message.error((err as Error).message);
    }
  };

  if (!settings) return <Card loading />;

  return (
    <div className="space-y-4">
      <SelfCard me={me} onEdit={() => setPwOpen(true)} />
      <PolicyCard
        settings={settings}
        isAdmin={isAdmin}
        onSave={saveSettings}
        onConfirm={modal.confirm}
        onReload={load}
      />
      {isAdmin && (
        <UsersCard
          users={users}
          sessions={sessions}
          meId={me?.id}
          loading={loading}
          onReload={load}
          onNew={() => {
            userForm.resetFields();
            setUserOpen(true);
          }}
          onReset={(u) => {
            resetForm.resetFields();
            setResetTarget(u);
          }}
        />
      )}

      <Modal open={pwOpen} title="修改密码" onCancel={() => setPwOpen(false)} onOk={submitPassword} okText="确认修改">
        <Alert className="mb-4" type="info" showIcon message="修改成功后当前会话会失效，需要用新密码重新登录。" />
        <Form form={pwForm} layout="vertical" preserve={false}>
          <Form.Item name="oldPassword" label="当前密码" rules={[{ required: true, message: '请输入当前密码' }]}>
            <Input.Password placeholder="默认密码为 admin123" />
          </Form.Item>
          <Form.Item
            name="newPassword"
            label="新密码"
            rules={[
              { required: true, message: '请输入新密码' },
              { min: 6, message: '密码至少 6 位' },
            ]}
          >
            <Input.Password placeholder="至少 6 位" />
          </Form.Item>
          <Form.Item
            name="confirm"
            label="确认新密码"
            dependencies={['newPassword']}
            rules={[
              { required: true, message: '请再次输入新密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('newPassword') === value) return Promise.resolve();
                  return Promise.reject(new Error('两次输入的密码不一致'));
                },
              }),
            ]}
          >
            <Input.Password />
          </Form.Item>
        </Form>
      </Modal>

      <Modal open={userOpen} title="新建账号" onCancel={() => setUserOpen(false)} onOk={submitUser} okText="创建">
        <Form form={userForm} layout="vertical" preserve={false} initialValues={{ role: 'editor' }}>
          <Form.Item name="username" label="用户名" rules={[{ required: true, message: '请输入用户名' }, { min: 2, message: '至少 2 位' }]}>
            <Input placeholder="登录时使用，创建后不可修改" />
          </Form.Item>
          <Form.Item name="displayName" label="显示名">
            <Input placeholder="留空则与用户名相同" />
          </Form.Item>
          <Form.Item name="password" label="初始密码" rules={[{ required: true, message: '请输入密码' }, { min: 6, message: '至少 6 位' }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="role" label="角色">
            <Select
              options={[
                { value: 'admin', label: '管理员（可管理账号与系统设置）' },
                { value: 'editor', label: '编辑（仅内容创作）' },
              ]}
            />
          </Form.Item>
          <Alert type="info" showIcon message="新账号登录后会在「账号安全」中看到修改密码的提醒，是否修改由用户自行决定。" />
        </Form>
      </Modal>

      <Modal
        open={Boolean(resetTarget)}
        title={`重置密码：${resetTarget?.username ?? ''}`}
        onCancel={() => setResetTarget(null)}
        onOk={submitReset}
        okText="确认重置"
      >
        <Alert className="mb-4" type="warning" showIcon message="重置后该账号的所有登录会话会立即失效。" />
        <Form form={resetForm} layout="vertical" preserve={false}>
          <Form.Item name="password" label="新密码" rules={[{ required: true, message: '请输入新密码' }, { min: 6, message: '至少 6 位' }]}>
            <Input.Password placeholder="至少 6 位" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

