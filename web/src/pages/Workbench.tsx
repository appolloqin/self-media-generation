import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Card,
  Form,
  Input,
  Select,
  Button,
  Space,
  Tag,
  Progress,
  Steps,
  Switch,
  Slider,
  Collapse,
  Tooltip,
  Alert,
  Empty,
  Divider,
  Row,
  Col,
  Typography,
  Spin,
  Segmented,
  Drawer,
  Tabs,
  App as AntApp,
} from 'antd';
import {
  ThunderboltOutlined,
  FireOutlined,
  StopOutlined,
  BulbOutlined,
  RobotOutlined,
  HistoryOutlined,
  FileTextOutlined,
  ReloadOutlined,
  EditOutlined,
  LinkOutlined,
} from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import { WORKFLOW_STAGES, DIMENSION_CATEGORIES, PLATFORM_LABELS, PUBLISH_PLATFORMS, templateCategoryLabel as categoryLabel } from '@smg/shared';
import type { PublishPlatform, SelectedDimension } from '@smg/shared';
import { generateApi, hotApi, trackApi, articleApi, templateApi, type GeneratePayload } from '@/api';
import { useTaskStore, useTaskEvents } from '@/hooks/useTaskSocket';
import { useConfigStore } from '@/store/config';
import LogTerminal from '@/components/LogTerminal';
import HintTip from '@/components/HintTip';

const { Text, Paragraph } = Typography;
const { TextArea } = Input;

type Mode = 'hot' | 'custom' | 'reference';

type WorkbenchNavState = { topic?: string; mode?: Mode };

export default function WorkbenchPage() {
  const { message } = AntApp.useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [form] = Form.useForm();

  const config = useConfigStore((s) => s.config);
  const patchConfig = useConfigStore((s) => s.patch);

  const running = useTaskStore((s) => s.running);
  const progress = useTaskStore((s) => s.progress);
  const status = useTaskStore((s) => s.status);
  const error = useTaskStore((s) => s.error);
  const resetTask = useTaskStore((s) => s.reset);

  const [mode, setMode] = useState<Mode>('hot');
  const [submitting, setSubmitting] = useState(false);
  const [tracks, setTracks] = useState<Awaited<ReturnType<typeof trackApi.list>>>([]);
  const [trackTemplates, setTrackTemplates] = useState<Awaited<ReturnType<typeof trackApi.templates>>>([]);
  const [templateCategories, setTemplateCategories] = useState<{ name: string }[]>([]);
  const [refUrls, setRefUrls] = useState<string[]>([]);
  const [refInput, setRefInput] = useState('');
  const [dimensions, setDimensions] = useState<SelectedDimension[]>([]);
  const [resultId, setResultId] = useState<number | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [t, tc] = await Promise.all([trackApi.list(true), templateApi.categories()]);
        setTracks(t);
        setTemplateCategories(tc);
      } catch {
        /* 忽略 */
      }
    })();
  }, []);

  // 热点雷达等入口：路由 state 直传选题 → 自动切换模式并回填
  useEffect(() => {
    const nav = (location.state ?? null) as WorkbenchNavState | null;
    const topic = nav?.topic?.trim();
    if (!topic) return;

    const nextMode: Mode = nav?.mode === 'hot' || nav?.mode === 'reference' || nav?.mode === 'custom' ? nav.mode : 'custom';
    setMode(nextMode);
    form.setFieldsValue({ topic });
    message.success(`已带入选题：${topic}`);
    // 清掉 state，避免刷新/再次进入时重复套用
    navigate('.', { replace: true, state: null });
  }, [location.state, form, message, navigate]);

  useEffect(() => {
    const trackId = form.getFieldValue('trackId');
    if (!trackId) {
      setTrackTemplates([]);
      return;
    }
    void trackApi
      .templates(trackId)
      .then(setTrackTemplates)
      .catch(() => setTrackTemplates([]));
  }, [form, dimensions]);

  useTaskEvents({
    onCompleted: (articleId) => {
      setSubmitting(false);
      setResultId(articleId);
      message.success('文章生成完成');
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 200);
    },
    onFailed: (msg) => {
      setSubmitting(false);
      message.error(msg);
    },
  });

  const currentStageIndex = useMemo(() => {
    const i = WORKFLOW_STAGES.findIndex((s) => s.key === progress.stage);
    return i < 0 ? 0 : i;
  }, [progress.stage]);

  const llmReady = config?.llmReady ?? false;

  const handleSubmit = async (values: Record<string, any>) => {
    if (!llmReady) {
      message.warning('请先在【系统设置 → 大模型 API】配置可用的 API Key');
      navigate('/settings');
      return;
    }

    const payload: GeneratePayload = {
      topic: values.topic?.trim() ?? '',
      platform: values.platform,
      mode,
      trackId: values.trackId || undefined,
      trackTemplateId: values.trackTemplateId || undefined,
      autoPublish: values.autoPublish,
      deAi: values.deAi,
      dimensions: dimensions.length ? dimensions : undefined,
    };

    if (mode === 'reference' && refUrls.length) {
      payload.reference = {
        urls: refUrls,
        templateCategory: values.templateCategory || undefined,
        templateName: values.templateName || undefined,
      };
    }

    resetTask();
    setSubmitting(true);
    try {
      await generateApi.run(payload);
    } catch (err) {
      setSubmitting(false);
      message.error((err as Error).message);
    }
  };

  const handleStop = async () => {
    try {
      await generateApi.stop();
      message.info('已发送停止信号，将在当前段完成后终止');
    } catch (err) {
      message.error((err as Error).message);
    }
  };

  const handlePickHot = async () => {
    try {
      const picked = await hotApi.pick(5);
      form.setFieldValue('topic', picked.topic);
      message.success(`已选自【${picked.platform}】：${picked.topic}`);
    } catch (err) {
      message.error((err as Error).message);
    }
  };

  const toggleDimension = (catKey: string, option: string, label: string, description?: string) => {
    setDimensions((prev) => {
      const exists = prev.find((d) => d.category === catKey && d.option === option);
      if (exists) return prev.filter((d) => !(d.category === catKey && d.option === option));
      const max = config?.dimensionalCreative.maxDimensions ?? 5;
      if (prev.length >= max) {
        message.warning(`最多启用 ${max} 个维度`);
        return prev;
      }
      return [...prev, { category: catKey, categoryLabel: label, option, description }];
    });
  };

  return (
    <div className="page">
      <div className="page-heading">
        <h1 className="page-title">创作工作台</h1>
        <HintTip title="多智能体流水线：选题 → 搜索 → 规划 → 写作 → 创意变换 → 去 AI 味 → 排版 → 入库 → 发布" />
      </div>

      {!llmReady && (
        <Alert
          type="warning"
          showIcon
          className="mb-4"
          message="尚未配置可用的大模型 API"
          description="请前往【系统设置 → 大模型 API】填写 API Key 后再开始创作。"
          action={
            <Button size="small" type="primary" onClick={() => navigate('/settings')}>
              去配置
            </Button>
          }
        />
      )}

      <Row gutter={16}>
        <Col xs={24} xl={14}>
          <Card
            title={
              <Space>
                <RobotOutlined />
                生成参数
              </Space>
            }
          >
            <Segmented
              block
              value={mode}
              onChange={(v) => setMode(v as Mode)}
              options={[
                { value: 'hot', label: <span className="inline-flex items-center gap-1.5"><FireOutlined />热点自动选题</span> },
                { value: 'custom', label: <span className="inline-flex items-center gap-1.5"><EditOutlined />手动指定选题</span> },
                { value: 'reference', label: <span className="inline-flex items-center gap-1.5"><LinkOutlined />参考文章仿写</span> },
              ]}
            />

            <Form
              form={form}
              layout="vertical"
              className="mt-4"
              initialValues={{
                platform: (config?.publishPlatform ?? 'wechat') as PublishPlatform,
                autoPublish: config?.autoPublish ?? false,
                deAi: config?.deAi,
              }}
              onFinish={handleSubmit}
              disabled={running}
            >
              <Form.Item
                name="topic"
                label={
                  <Space size={6}>
                    选题
                    {mode !== 'hot' && <span className="text-xs text-red-500">*</span>}
                    <HintTip
                      title={
                        mode === 'hot'
                          ? '留空则由系统按平台权重自动抽取当日热榜话题'
                          : mode === 'reference'
                            ? '说明你想基于参考文章写什么方向'
                            : '直接描述你想写的内容'
                      }
                    />
                  </Space>
                }
              >
                <TextArea
                  rows={3}
                  placeholder={
                    mode === 'hot'
                      ? '（可选）指定选题方向，留空自动抓取热点'
                      : mode === 'reference'
                        ? '例如：参考这三篇爆款的角度，写一篇关于年轻人反内耗的新文章'
                        : '例如：写一篇关于 AI 工具如何改变中小商家的实操指南'
                  }
                />
              </Form.Item>

              {mode === 'hot' && (
                <Button icon={<FireOutlined />} onClick={handlePickHot} className="mb-4" disabled={running}>
                  随机抽取一个热点
                </Button>
              )}

              <Row gutter={12}>
                <Col span={8}>
                  <Form.Item name="platform" label="目标平台">
                    <Select
                      options={PUBLISH_PLATFORMS.map((p) => ({ value: p, label: PLATFORM_LABELS[p] }))}
                    />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="trackId" label="专家赛道">
                    <Select
                      allowClear
                      placeholder="不使用赛道"
                      onChange={() => {
                        const id = form.getFieldValue('trackId');
                        if (!id) setTrackTemplates([]);
                      }}
                      options={tracks.map((t) => ({ value: t.id, label: t.name }))}
                    />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="trackTemplateId" label="赛道模板">
                    <Select
                      allowClear
                      placeholder={trackTemplates.length ? '选择模板' : '先选赛道'}
                      disabled={!trackTemplates.length}
                      options={trackTemplates.map((t) => ({
                        value: t.id,
                        label: `${t.name}（${t.wordMin}~${t.wordMax}字）`,
                      }))}
                    />
                  </Form.Item>
                </Col>
              </Row>

              {mode === 'reference' && (
                <>
                  <Form.Item label="参考文章链接">
                    <Space.Compact className="w-full">
                      <Input
                        placeholder="粘贴公众号文章或网页链接，回车添加"
                        value={refInput}
                        onChange={(e) => setRefInput(e.target.value)}
                        onPressEnter={() => {
                          if (refInput.trim()) {
                            setRefUrls((u) => [...new Set([...u, refInput.trim()])]);
                            setRefInput('');
                          }
                        }}
                      />
                      <Button
                        onClick={() => {
                          if (refInput.trim()) {
                            setRefUrls((u) => [...new Set([...u, refInput.trim()])]);
                            setRefInput('');
                          }
                        }}
                      >
                        添加
                      </Button>
                    </Space.Compact>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {refUrls.map((u) => (
                        <Tag
                          key={u}
                          closable
                          onClose={() => setRefUrls((list) => list.filter((x) => x !== u))}
                        >
                          {u.length > 46 ? `${u.slice(0, 46)}…` : u}
                        </Tag>
                      ))}
                    </div>
                  </Form.Item>

                  <Row gutter={12}>
                    <Col span={12}>
                      <Form.Item name="templateCategory" label="参考模板分类">
                        <Select
                          allowClear
                          placeholder="不限"
                          options={templateCategories.map((c) => ({ value: c.name, label: categoryLabel(c.name) }))}
                        />
                      </Form.Item>
                    </Col>
                  </Row>
                </>
              )}

              <Collapse
                ghost
                size="small"
                items={[
                  {
                    key: 'dimension',
                    label: (
                      <Space>
                        <BulbOutlined />
                        维度化创意
                        {dimensions.length > 0 && <Tag color="blue">{dimensions.length} 个</Tag>}
                      </Space>
                    ),
                    children: (
                      <div className="space-y-2">
                        <Text type="secondary" className="text-xs">
                          勾选后由「创意智能体」按维度重写全文。留空则由系统依据选题自动搭配。
                        </Text>
                        {config?.dimensionalCreative?.autoDimensionSelection && (
                          <div className="mb-2">
                            <Switch
                              size="small"
                              checked={config.dimensionalCreative.enabled}
                              onChange={(v) => patchConfig({ dimensionalCreative: { enabled: v } })}
                            />
                            <Text className="ml-2 text-xs">自动维度搭配</Text>
                          </div>
                        )}
                        <div className="max-h-[280px] overflow-y-auto pr-1">
                          {DIMENSION_CATEGORIES.map((cat) => (
                            <div key={cat.key} className="mb-3">
                              <Text strong className="text-xs">
                                {cat.label}
                              </Text>
                              <div className="mt-1 flex flex-wrap gap-1">
                                {cat.options.map((opt) => {
                                  const active = dimensions.some(
                                    (d) => d.category === cat.key && d.option === opt.value,
                                  );
                                  return (
                                    <Tag
                                      key={opt.name}
                                      color={active ? 'blue' : undefined}
                                      className="cursor-pointer select-none transition-all duration-150 hover:!border-brand-400 hover:!text-brand-600 active:scale-95"
                                      onClick={() =>
                                        toggleDimension(cat.key, opt.value, cat.label, opt.description)
                                      }
                                    >
                                      {opt.value}
                                    </Tag>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ),
                  },
                  {
                    key: 'deai',
                    label: (
                      <Space>
                        去 AI 味
                        <Tag color={config?.deAi?.enabled ? 'green' : 'default'}>
                          目标 {config?.deAi?.targetHumanScore ?? 75}%
                        </Tag>
                      </Space>
                    ),
                    children: (
                      <div className="space-y-3">
                        <Form.Item name={['deAi', 'enabled']} valuePropName="checked" className="mb-2">
                          <Switch checkedChildren="开启" unCheckedChildren="关闭" />
                        </Form.Item>
                        <Form.Item name={['deAi', 'intensity']} label="去 AI 强度" className="mb-2">
                          <Slider min={0} max={1} step={0.1} marks={{ 0: '弱', 0.5: '中', 1: '强' }} />
                        </Form.Item>
                        <Form.Item name={['deAi', 'targetHumanScore']} label="目标人工率(%)" className="mb-0">
                          <Slider min={50} max={95} step={5} />
                        </Form.Item>
                      </div>
                    ),
                  },
                  {
                    key: 'advanced',
                    label: '高级选项',
                    children: (
                      <div className="space-y-3">
                        <Form.Item name="autoPublish" valuePropName="checked" className="mb-0">
                          <Switch checkedChildren="生成后自动发布" unCheckedChildren="仅入库不发布" />
                        </Form.Item>
                        <div className="text-xs text-gray-500">
                          模板排版：{config?.useTemplate ? '开启（优先使用模板）' : '关闭（使用 AI 自动排版）'}；
                          文章格式：{config?.articleFormat === 'html' ? 'HTML' : config?.articleFormat === 'markdown' ? 'Markdown' : '纯文本'}
                        </div>
                      </div>
                    ),
                  },
                ]}
              />

              <Divider className="my-3" />

              <Space className="w-full justify-between">
                <Button icon={<HistoryOutlined />} onClick={() => navigate('/articles')}>
                  历史文章
                </Button>
                <Space>
                  {running && (
                    <Button danger icon={<StopOutlined />} onClick={handleStop}>
                      停止
                    </Button>
                  )}
                  <Button
                    type="primary"
                    htmlType="submit"
                    icon={<ThunderboltOutlined />}
                    loading={submitting || running}
                    disabled={!llmReady}
                  >
                    开始生成
                  </Button>
                </Space>
              </Space>
            </Form>
          </Card>
        </Col>

        <Col xs={24} xl={10}>
          <Card
            title={
              <Space>
                执行状态
                {status === 'completed' && <Tag color="green">已完成</Tag>}
                {status === 'failed' && <Tag color="red">失败</Tag>}
                {status === 'running' && <Tag color="processing">执行中</Tag>}
              </Space>
            }
            extra={
              <Button
                size="small"
                type="text"
                icon={<ReloadOutlined />}
                onClick={resetTask}
                disabled={running}
              />
            }
          >
            <Progress
              percent={progress.progress}
              status={
                status === 'failed' ? 'exception' : running ? 'active' : progress.progress >= 100 ? 'success' : 'normal'
              }
              format={(p) => `${p}%`}
            />
            <div className="mb-4 text-center text-xs text-gray-500">
              {progress.message || '等待开始'}
            </div>

            <Steps
              direction="vertical"
              size="small"
              current={currentStageIndex}
              status={status === 'failed' ? 'error' : running ? 'process' : 'finish'}
              items={WORKFLOW_STAGES.filter((s) => s.key !== 'done').map((s) => ({
                title: s.label,
                status:
                  currentStageIndex > WORKFLOW_STAGES.findIndex((x) => x.key === s.key)
                    ? 'finish'
                    : undefined,
              }))}
            />

            {error && (
              <Alert type="error" showIcon message="任务失败" description={error} className="mt-3" />
            )}

            {resultId && (
              <Button
                type="primary"
                block
                className="mt-4"
                icon={<FileTextOutlined />}
                onClick={() => navigate(`/articles/${resultId}`)}
              >
                查看生成的文章
              </Button>
            )}
          </Card>

          <Card title="运行日志" className="mt-4" styles={{ body: { height: 340 } }}>
            <LogTerminal />
          </Card>
        </Col>
      </Row>

      <div ref={resultRef} />
    </div>
  );
}
