import { useEffect, useState } from 'react';
import {
  Card,
  Tabs,
  Form,
  Input,
  Select,
  Button,
  Space,
  Tag,
  Table,
  Switch,
  Slider,
  Divider,
  Row,
  Col,
  InputNumber,
  Popconfirm,
  App as AntApp,
  Tooltip,
  Descriptions,
  Statistic,
} from 'antd';
import {
  ApiOutlined,
  WechatOutlined,
  FireOutlined,
  ExperimentOutlined,
  ThunderboltOutlined,
  PictureOutlined,
  PlusOutlined,
  DeleteOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  LockOutlined,
} from '@ant-design/icons';
import { useSearchParams } from 'react-router-dom';
import { configApi, type RssItem } from '@/api';
import AccountPanel from './AccountPanel';
import LlmPanel from './LlmPanel';
import ImagePanel from './ImagePanel';
import HintTip from '@/components/HintTip';
import { useConfigStore } from '@/store/config';
import { PLATFORM_LABELS, PUBLISH_PLATFORMS, platformLabel, templateCategoryLabel as categoryLabel, type WechatCredential } from '@smg/shared';

export default function SettingsPage() {
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') ?? 'llm');

  // 支持从顶部头像菜单跳转「/settings?tab=account」
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab) setActiveTab(tab);
  }, [searchParams]);

  return (
    <div className="page">
      <div className="page-heading">
        <h1 className="page-title">系统设置</h1>
        <HintTip title="配置大模型、图片生成、微信公众号凭据、热点来源、文案参数、排版风格与账号安全" />
      </div>
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          { key: 'llm', label: <span><ApiOutlined /> 大模型 API</span>, children: <LlmPanel /> },
          { key: 'image', label: <span><PictureOutlined /> 图片生成</span>, children: <ImagePanel /> },
          { key: 'wechat', label: <span><WechatOutlined /> 微信公众号</span>, children: <WechatPanel /> },
          { key: 'hot', label: <span><FireOutlined /> 热点来源</span>, children: <HotPanel /> },
          { key: 'content', label: <span><ExperimentOutlined /> 内容参数</span>, children: <ContentPanel /> },
          { key: 'layout', label: <span><ThunderboltOutlined /> 排版风格</span>, children: <LayoutPanel /> },
          { key: 'tasks', label: '任务记录', children: <TaskPanel /> },
          { key: 'account', label: <span><LockOutlined /> 账号安全</span>, children: <AccountPanel /> },
        ]}
      />
    </div>
  );
}

/* ================= 微信 ================= */

function WechatPanel() {
  const { message } = AntApp.useApp();
  const config = useConfigStore((s) => s.config);
  const load = useConfigStore((s) => s.load);
  const [testing, setTesting] = useState<number>(-1);
  const [form] = Form.useForm();

  if (!config) return null;

  const creds = config.wechat.credentials;

  const save = async (values: WechatCredential) => {
    try {
      await configApi.saveWechat(values);
      message.success('凭据已保存');
      await load(true);
    } catch (err) {
      message.error((err as Error).message);
    }
  };

  const test = async (cred: WechatCredential, index: number) => {
    setTesting(index);
    try {
      const res = await configApi.testWechat(cred);
      if (res.ok) message.success(res.message);
      else message.error(res.message);
    } catch (err) {
      message.error((err as Error).message);
    } finally {
      setTesting(-1);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1.5 text-sm text-ink-700">
        微信公众号凭据
        <HintTip title="微信公众号需要「认证服务号」或具备接口权限的订阅号，才能调用草稿箱 / 发布接口。未认证账号将自动降级为仅保存草稿。" />
      </div>

      {creds.map((cred, index) => (
        <Card
          key={index}
          title={`公众号 ${index + 1}`}
          extra={
            <Space>
              <Button
                size="small"
                loading={testing === index}
                onClick={() => test(cred, index)}
              >
                测试连接
              </Button>
              {creds.length > 1 && (
                <Button
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={async () => {
                    await configApi.removeWechat(index);
                    await load(true);
                  }}
                />
              )}
            </Space>
          }
        >
          <Form
            layout="vertical"
            initialValues={cred}
            onFinish={save}
            key={JSON.stringify(cred)}
          >
            <Row gutter={12}>
              <Col span={8}>
                <Form.Item name="appid" label="AppID" rules={[{ required: true, message: '请填写 AppID' }]}>
                  <Input placeholder="wx..." />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="appsecret" label="AppSecret" rules={[{ required: true, message: '请填写 AppSecret' }]}>
                  <Input.Password placeholder="AppSecret" />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="author" label="作者署名">
                  <Input placeholder="选填" />
                </Form.Item>
              </Col>
            </Row>
            <Space size="large">
              <Form.Item name="sendall" valuePropName="checked" className="mb-0">
                <Switch checkedChildren="发布后群发" unCheckedChildren="仅存草稿" />
              </Form.Item>
              <Form.Item name="callSendall" valuePropName="checked" className="mb-0">
                <Switch checkedChildren="自动调用群发" unCheckedChildren="不自动群发" />
              </Form.Item>
            </Space>
            <Button type="primary" htmlType="submit" className="mt-3">
              保存凭据
            </Button>
          </Form>
        </Card>
      ))}

      <Button
        icon={<PlusOutlined />}
        onClick={async () => {
          await configApi.saveWechat({ appid: '', appsecret: '', author: '', sendall: true, callSendall: false, tagId: 0 });
          await load(true);
        }}
      >
        添加公众号
      </Button>
    </div>
  );
}

/* ================= 热点 ================= */

function HotPanel() {
  const { message } = AntApp.useApp();
  const config = useConfigStore((s) => s.config);
  const patch = useConfigStore((s) => s.patch);
  const [rss, setRss] = useState<RssItem[]>([]);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');

  const loadRss = async () => {
    try {
      setRss(await configApi.rss());
    } catch (err) {
      message.error((err as Error).message);
    }
  };

  useEffect(() => {
    void loadRss();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!config) return null;

  return (
    <div className="space-y-4">
      <Card
        title={
          <span className="inline-flex items-center gap-1.5">
            热榜平台权重
            <HintTip title="权重决定自动选题的命中概率" />
          </span>
        }
      >
        <Table
          rowKey="name"
          size="small"
          pagination={false}
          dataSource={config.platforms}
          columns={[
            {
              title: '平台',
              dataIndex: 'name',
              width: 140,
              render: (v: string) => <span className="font-medium">{v}</span>,
            },
            {
              title: '权重',
              dataIndex: 'weight',
              width: 260,
              render: (v: number, r) => (
                <Slider
                  min={0}
                  max={1}
                  step={0.01}
                  value={v}
                  onChange={(nv) =>
                    patch({
                      platforms: config.platforms.map((p) => (p.name === r.name ? { ...p, weight: nv } : p)),
                    })
                  }
                />
              ),
            },
            {
              title: '数据源',
              dataIndex: 'zhiweiId',
              width: 160,
              render: (v: string | null, r) => (
                <Space size={2}>
                  {v && <Tag color="blue">智微</Tag>}
                  {r.tophubId && <Tag color="cyan">今日热榜</Tag>}
                  {r.type === 'rss' && <Tag color="purple">RSS</Tag>}
                </Space>
              ),
            },
            {
              title: '启用',
              width: 80,
              render: (_, r) => (
                <Switch
                  size="small"
                  checked={r.enabled !== false}
                  onChange={(nv) =>
                    patch({
                      platforms: config.platforms.map((p) => (p.name === r.name ? { ...p, enabled: nv } : p)),
                    })
                  }
                />
              ),
            },
          ]}
        />
      </Card>

      <Card title="RSS 订阅源">
        <Space className="mb-3 w-full">
          <Input placeholder="名称，如：少数派" value={name} onChange={(e) => setName(e.target.value)} style={{ width: 180 }} />
          <Input
            placeholder="https://sspai.com/feed"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            style={{ width: 320 }}
          />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={async () => {
              if (!name.trim() || !url.trim()) {
                message.warning('请填写名称与地址');
                return;
              }
              try {
                await configApi.addRss({ name, url });
                setName('');
                setUrl('');
                void loadRss();
              } catch (err) {
                message.error((err as Error).message);
              }
            }}
          >
            添加
          </Button>
        </Space>

        <Table
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={rss}
          locale={{ emptyText: '暂无 RSS 订阅' }}
          columns={[
            { title: '名称', dataIndex: 'name', width: 160 },
            { title: '地址', dataIndex: 'url', ellipsis: true },
            {
              title: '权重',
              dataIndex: 'weight',
              width: 100,
              render: (v: number) => <span className="text-xs">{v}</span>,
            },
            {
              title: '启用',
              width: 80,
              render: (_, r) => (
                <Switch
                  size="small"
                  checked={Boolean(r.enabled)}
                  onChange={async (nv) => {
                    await configApi.patchRss(r.id, { enabled: nv });
                    void loadRss();
                  }}
                />
              ),
            },
            {
              title: '',
              width: 50,
              render: (_, r) => (
                <Button
                  size="small"
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={async () => {
                    await configApi.removeRss(r.id);
                    void loadRss();
                  }}
                />
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}

/* ================= 内容参数 ================= */

function ContentPanel() {
  const config = useConfigStore((s) => s.config);
  const patch = useConfigStore((s) => s.patch);
  if (!config) return null;

  return (
    <Card title="内容生成参数">
      <Row gutter={24}>
        <Col span={12}>
          <Form layout="vertical">
            <Form.Item label="默认发布平台">
              <Select
                value={config.publishPlatform}
                onChange={(v) => patch({ publishPlatform: v })}
                options={PUBLISH_PLATFORMS.map((p) => ({ value: p, label: PLATFORM_LABELS[p] }))}
              />
            </Form.Item>
            <Form.Item label="文章格式">
              <Select
                value={config.articleFormat}
                onChange={(v) => patch({ articleFormat: v })}
                options={[
                  { value: 'html', label: 'HTML（推荐，适配排版与发布）' },
                  { value: 'markdown', label: 'Markdown' },
                  { value: 'txt', label: '纯文本' },
                ]}
              />
            </Form.Item>
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item label="最少字数">
                  <InputNumber
                    min={100}
                    max={10000}
                    step={100}
                    className="w-full"
                    value={config.minArticleLen}
                    onChange={(v) => patch({ minArticleLen: Number(v) || 1000 })}
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="最多字数">
                  <InputNumber
                    min={200}
                    max={20000}
                    step={100}
                    className="w-full"
                    value={config.maxArticleLen}
                    onChange={(v) => patch({ maxArticleLen: Number(v) || 2000 })}
                  />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item label="使用模板排版">
              <Switch
                checked={config.useTemplate}
                onChange={(v) => patch({ useTemplate: v })}
                checkedChildren="优先使用模板"
                unCheckedChildren="AI 自动排版"
              />
            </Form.Item>
            <Form.Item label="模板分类">
              <Select
                allowClear
                placeholder="不限（按选题匹配分类）"
                value={config.templateCategory || undefined}
                onChange={(v) => patch({ templateCategory: v ?? '' })}
                options={(config.templateCategories ?? []).map((c) => ({ value: c.name, label: categoryLabel(c.name) }))}
              />
            </Form.Item>
            <Form.Item label="指定模板">
              <Input
                value={config.template}
                placeholder="模板名（选填）"
                onChange={(e) => patch({ template: e.target.value })}
              />
            </Form.Item>
            <Form.Item label="发布时压缩 HTML">
              <Switch checked={config.useCompress} onChange={(v) => patch({ useCompress: v })} />
            </Form.Item>
            <Form.Item label="段落首行缩进">
              <Switch checked={config.formatPublish} onChange={(v) => patch({ formatPublish: v })} />
            </Form.Item>
            <Form.Item label="生成后自动发布">
              <Switch checked={config.autoPublish} onChange={(v) => patch({ autoPublish: v })} />
            </Form.Item>
          </Form>
        </Col>

        <Col span={12}>
          <Card size="small" title="去 AI 味引擎">
            <Form layout="vertical">
              <Form.Item label="启用">
                <Switch checked={config.deAi.enabled} onChange={(v) => patch({ deAi: { enabled: v } })} />
              </Form.Item>
              <Form.Item label={`强度：${config.deAi.intensity.toFixed(1)}`}>
                <Slider
                  min={0}
                  max={1}
                  step={0.1}
                  value={config.deAi.intensity}
                  onChange={(v) => patch({ deAi: { intensity: v } })}
                />
              </Form.Item>
              <Form.Item label={`目标人工率：${config.deAi.targetHumanScore}%`}>
                <Slider
                  min={50}
                  max={95}
                  step={5}
                  value={config.deAi.targetHumanScore}
                  onChange={(v) => patch({ deAi: { targetHumanScore: v } })}
                />
              </Form.Item>
              <Form.Item label="最大重写轮数">
                <InputNumber
                  min={1}
                  max={6}
                  className="w-full"
                  value={config.deAi.maxAttempts}
                  onChange={(v) => patch({ deAi: { maxAttempts: Number(v) || 3 } })}
                />
              </Form.Item>
              <Divider className="my-2" />
              {(
                [
                  ['breakLists', '打散列表结构'],
                  ['varySentenceLength', '长短句交错'],
                  ['injectEmotion', '注入情感色彩'],
                  ['removeConnectors', '移除 AI 味连接词'],
                  ['referenceStyle', '参考文风'],
                ] as const
              ).map(([key, label]) => (
                <Form.Item key={key} className="mb-2">
                  <Switch
                    size="small"
                    checked={config.deAi[key]}
                    onChange={(v) => patch({ deAi: { [key]: v } })}
                  />
                  <span className="ml-2 text-sm">{label}</span>
                </Form.Item>
              ))}
            </Form>
          </Card>

          <Card size="small" title="维度化创意" className="mt-3">
            <Form layout="vertical">
              <Form.Item label="启用">
                <Switch
                  checked={config.dimensionalCreative.enabled}
                  onChange={(v) => patch({ dimensionalCreative: { enabled: v } })}
                />
              </Form.Item>
              <Form.Item label="自动挑选维度">
                <Switch
                  checked={config.dimensionalCreative.autoDimensionSelection}
                  onChange={(v) => patch({ dimensionalCreative: { autoDimensionSelection: v } })}
                />
              </Form.Item>
              <Form.Item label="保留核心信息">
                <Switch
                  checked={config.dimensionalCreative.preserveCoreInfo}
                  onChange={(v) => patch({ dimensionalCreative: { preserveCoreInfo: v } })}
                />
              </Form.Item>
              <Form.Item label={`最多维度数：${config.dimensionalCreative.maxDimensions}`}>
                <Slider
                  min={1}
                  max={8}
                  value={config.dimensionalCreative.maxDimensions}
                  onChange={(v) => patch({ dimensionalCreative: { maxDimensions: v } })}
                />
              </Form.Item>
            </Form>
          </Card>
        </Col>
      </Row>
    </Card>
  );
}

/* ================= 排版 ================= */

function LayoutPanel() {
  const config = useConfigStore((s) => s.config);
  const patch = useConfigStore((s) => s.patch);
  if (!config) return null;
  const pd = config.pageDesign;

  const setPd = (part: keyof typeof pd, value: unknown) =>
    patch({ pageDesign: { ...pd, [part]: value } });

  return (
    <Card title="页面风格（AI 排版时严格遵守）">
      <Form layout="vertical">
        <Form.Item label="使用自定义风格参数">
          <Switch checked={!pd.useOriginalStyles} onChange={(v) => setPd('useOriginalStyles', !v)} />
        </Form.Item>

        <Row gutter={16}>
          <Col span={8}>
            <Card size="small" title="容器">
              <Form.Item label={`最大宽度：${pd.container.maxWidth}px`}>
                <Slider min={480} max={900} value={pd.container.maxWidth} onChange={(v) => setPd('container', { ...pd.container, maxWidth: v })} />
              </Form.Item>
              <Form.Item label={`左右边距：${pd.container.marginHorizontal}px`}>
                <Slider min={0} max={40} value={pd.container.marginHorizontal} onChange={(v) => setPd('container', { ...pd.container, marginHorizontal: v })} />
              </Form.Item>
              <Form.Item label="背景色">
                <Input type="color" value={pd.container.backgroundColor} onChange={(e) => setPd('container', { ...pd.container, backgroundColor: e.target.value })} />
              </Form.Item>
            </Card>
          </Col>
          <Col span={8}>
            <Card size="small" title="卡片">
              <Form.Item label={`圆角：${pd.card.borderRadius}px`}>
                <Slider min={0} max={28} value={pd.card.borderRadius} onChange={(v) => setPd('card', { ...pd.card, borderRadius: v })} />
              </Form.Item>
              <Form.Item label={`内边距：${pd.card.padding}px`}>
                <Slider min={8} max={48} value={pd.card.padding} onChange={(v) => setPd('card', { ...pd.card, padding: v })} />
              </Form.Item>
              <Form.Item label="阴影">
                <Input value={pd.card.boxShadow} onChange={(e) => setPd('card', { ...pd.card, boxShadow: e.target.value })} />
              </Form.Item>
            </Card>
          </Col>
          <Col span={8}>
            <Card size="small" title="配色">
              <Form.Item label="主色">
                <Input type="color" value={pd.accent.primaryColor} onChange={(e) => setPd('accent', { ...pd.accent, primaryColor: e.target.value })} />
              </Form.Item>
              <Form.Item label="辅助色">
                <Input type="color" value={pd.accent.secondaryColor} onChange={(e) => setPd('accent', { ...pd.accent, secondaryColor: e.target.value })} />
              </Form.Item>
              <Form.Item label="高亮底色">
                <Input type="color" value={pd.accent.highlightBg} onChange={(e) => setPd('accent', { ...pd.accent, highlightBg: e.target.value })} />
              </Form.Item>
            </Card>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={8}>
            <Card size="small" title="排版">
              <Form.Item label={`正文字号：${pd.typography.baseFontSize}px`}>
                <Slider min={13} max={20} value={pd.typography.baseFontSize} onChange={(v) => setPd('typography', { ...pd.typography, baseFontSize: v })} />
              </Form.Item>
              <Form.Item label={`行高：${pd.typography.lineHeight}`}>
                <Slider min={1.3} max={2.2} step={0.05} value={pd.typography.lineHeight} onChange={(v) => setPd('typography', { ...pd.typography, lineHeight: v })} />
              </Form.Item>
              <Form.Item label={`标题缩放：${pd.typography.headingScale}`}>
                <Slider min={1.1} max={2.2} step={0.05} value={pd.typography.headingScale} onChange={(v) => setPd('typography', { ...pd.typography, headingScale: v })} />
              </Form.Item>
            </Card>
          </Col>
          <Col span={8}>
            <Card size="small" title="间距">
              <Form.Item label={`模块间距：${pd.spacing.sectionMargin}px`}>
                <Slider min={8} max={56} value={pd.spacing.sectionMargin} onChange={(v) => setPd('spacing', { ...pd.spacing, sectionMargin: v })} />
              </Form.Item>
              <Form.Item label={`段落间距：${pd.spacing.elementMargin}px`}>
                <Slider min={6} max={36} value={pd.spacing.elementMargin} onChange={(v) => setPd('spacing', { ...pd.spacing, elementMargin: v })} />
              </Form.Item>
            </Card>
          </Col>
          <Col span={8}>
            <Card size="small" title="文字颜色">
              <Form.Item label="正文色">
                <Input type="color" value={pd.typography.textColor} onChange={(e) => setPd('typography', { ...pd.typography, textColor: e.target.value })} />
              </Form.Item>
              <Form.Item label="标题色">
                <Input type="color" value={pd.typography.headingColor} onChange={(e) => setPd('typography', { ...pd.typography, headingColor: e.target.value })} />
              </Form.Item>
            </Card>
          </Col>
        </Row>
      </Form>
    </Card>
  );
}

/* ================= 任务 ================= */

function TaskPanel() {
  const { message } = AntApp.useApp();
  const [tasks, setTasks] = useState<Awaited<ReturnType<typeof configApi.tasks>> | null>(null);
  const [metrics, setMetrics] = useState<Awaited<ReturnType<typeof configApi.metrics>>>([]);

  const load = async () => {
    try {
      const [t, m] = await Promise.all([configApi.tasks(1, 50), configApi.metrics()]);
      setTasks(t);
      setMetrics(m);
    } catch (err) {
      message.error((err as Error).message);
    }
  };

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      <Row gutter={12}>
        {metrics.map((m) => (
          <Col span={6} key={m.workflow}>
            <Card size="small">
              <Statistic
                title={m.workflow}
                value={m.count}
                suffix={`/ 成功 ${m.successCount}`}
              />
              <div className="mt-1 text-xs text-gray-400">
                平均耗时 {m.count ? Math.round(m.totalMs / m.count / 1000) : 0}s
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      <Card title="任务历史" extra={<Button size="small" icon={<ReloadOutlined />} onClick={load} />}>
        <Table
          rowKey="id"
          size="small"
          dataSource={tasks?.items ?? []}
          pagination={{ pageSize: 20 }}
          columns={[
            { title: 'ID', dataIndex: 'id', width: 60 },
            { title: '选题', dataIndex: 'topic', ellipsis: true },
            { title: '平台', dataIndex: 'platform', width: 110, render: (v: string) => platformLabel(v) },
            {
              title: '状态',
              dataIndex: 'status',
              width: 90,
              render: (v: string) => (
                <Tag
                  color={
                    v === 'completed' ? 'green' : v === 'failed' ? 'red' : v === 'running' ? 'blue' : 'default'
                  }
                >
                  {v}
                </Tag>
              ),
            },
            { title: '阶段', dataIndex: 'stage', width: 100 },
            {
              title: '进度',
              dataIndex: 'progress',
              width: 90,
              align: 'right',
              render: (v: number) => `${v}%`,
            },
            {
              title: '耗时',
              dataIndex: 'durationMs',
              width: 90,
              align: 'right',
              render: (v: number | null) => (v ? `${(v / 1000).toFixed(1)}s` : '—'),
            },
            {
              title: '开始时间',
              dataIndex: 'startedAt',
              width: 150,
              render: (v: string) => <span className="text-xs">{v}</span>,
            },
            { title: '错误', dataIndex: 'error', ellipsis: true, render: (v: string | null) => <span className="text-xs text-red-500">{v || '—'}</span> },
          ]}
        />
      </Card>
    </div>
  );
}
