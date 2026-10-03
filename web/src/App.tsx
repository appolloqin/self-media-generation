import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Spin, Result, Button } from 'antd';
import AppLayout from '@/components/AppLayout';
import LoginPage from '@/pages/Login';
import { connectTaskSocket } from '@/hooks/useTaskSocket';
import { useConfigStore } from '@/store/config';
import { useAuthStore } from '@/store/auth';
import { setUnauthorizedHandler, getToken } from '@/api/client';

import WorkbenchPage from '@/pages/Workbench';
import HotRadarPage from '@/pages/HotRadar';
import ArticleListPage from '@/pages/ArticleList';
import ArticleEditorPage from '@/pages/ArticleEditor';
import CopywritingPage from '@/pages/Copywriting';
import TemplatePage from '@/pages/Templates';
import TrackPage from '@/pages/Tracks';
import LibraryPage from '@/pages/Library';
import ImageLibraryPage from '@/pages/Images';
import NovelPage from '@/pages/Novel';
import SettingsPage from '@/pages/Settings';

function Booting({ text }: { text: string }) {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-3">
      <Spin size="large" />
      <span className="text-sm text-gray-500">{text}</span>
    </div>
  );
}

export default function App() {
  const configReady = useConfigStore((s) => s.ready);
  const loadConfig = useConfigStore((s) => s.load);

  const initialized = useAuthStore((s) => s.initialized);
  const required = useAuthStore((s) => s.required);
  const user = useAuthStore((s) => s.user);
  const initAuth = useAuthStore((s) => s.init);
  const clearAuth = useAuthStore((s) => s.clear);

  // 初始探测登录态
  useEffect(() => {
    void initAuth();
  }, [initAuth]);

  // 任意请求返回 401 时清空本地用户，切回登录页
  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearAuth();
    });
    return () => setUnauthorizedHandler(null);
  }, [clearAuth]);

  // 登录态就绪后再连接日志 WebSocket（鉴权开启时需要带 token）
  const wsReady = !required || Boolean(user) || Boolean(getToken());
  useEffect(() => {
    if (!wsReady) return;
    return connectTaskSocket();
  }, [wsReady]);

  useEffect(() => {
    if (user) void loadConfig(true);
  }, [user, loadConfig]);

  if (!initialized) return <Booting text="正在检查登录状态…" />;

  // 服务端关闭了鉴权：直接进入系统
  if (!required) return <AppRoutes />;

  if (!user) return <LoginPage />;

  if (!configReady) return <Booting text="正在连接智媒工坊服务…" />;

  return <AppRoutes />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<WorkbenchPage />} />
        <Route path="/hot" element={<HotRadarPage />} />
        <Route path="/articles" element={<ArticleListPage />} />
        <Route path="/articles/:id" element={<ArticleEditorPage />} />
        <Route path="/copywriting" element={<CopywritingPage />} />
        <Route path="/templates" element={<TemplatePage />} />
        <Route path="/tracks" element={<TrackPage />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/images" element={<ImageLibraryPage />} />
        <Route path="/novel" element={<NovelPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route
          path="*"
          element={
            <Result
              status="404"
              title="404"
              subTitle="页面不存在"
              extra={
                <Button type="primary" onClick={() => window.location.assign('/')}>
                  返回首页
                </Button>
              }
            />
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
