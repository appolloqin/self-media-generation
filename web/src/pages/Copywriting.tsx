import { useEffect, useMemo, useState } from 'react';
import {
  Card,
  Button,
  Space,
  Input,
  Select,
  Tag,
  Modal,
  Form,
  Popconfirm,
  App as AntApp,
  Empty,
  Row,
  Col,
  Radio,
  Divider,
  Statistic,
  Tabs,
  Alert,
  Tooltip,
  Checkbox,
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  ThunderboltOutlined,
  CopyOutlined,
  SaveOutlined,
  ReloadOutlined,
  ExperimentOutlined,
  FileAddOutlined,
  BulbOutlined,
} from '@ant-design/icons';
import HintTip from '@/components/HintTip';
import { useNavigate } from 'react-router-dom';
import { copywritingApi, type SceneWithKnobs, type ScenePreset } from '@/api';
import type { CopywritingKnob, CopywritingQuality } from '@smg/shared';
import { KNOB_LABELS, SCENE_CATEGORIES, PUBLISH_PLATFORMS, PLATFORM_LABELS } from '@smg/shared';

const { TextArea } = Input;

const MODE_TEXT: Record<'original' | 'imitate' | 'transform', string> = {
  original: '原创：完全基于主题自由创作',
  imitate: '模仿：学习参考内容的结构与语气',
  transform: '改写：保留核心信息，重构表达',
};

const EMPTY_QUALITY: CopywritingQuality = {
  score: 0,
  hookScore: 0,
  rhythmScore: 0,
  detailScore: 0,
  deAiScore: 0,
  issues: [],
  passed: false,
};

export default function CopywritingPage() {
  const { message, modal } = AntApp.useApp();
  const navigate = useNavigate();

  const [scenes, setScenes] = useState<SceneWithKnobs[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [detail, setDetail] = useState<(SceneWithKnobs & { presets: ScenePreset[] }) | null>(null);
  const [loading, setLoading] = useState(false);

  const [mode, setMode] = useState<'original' | 'imitate' | 'transform'>('original');
  const [topic, setTopic] = useState('');
  const [referenceContent, setReferenceContent] = useState('');
  const [targetForm, setTargetForm] = useState('');
  const [knobValues, setKnobValues] = useState<Partial<Record<CopywritingKnob, string>>>({});
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{ content: string; quality: CopywritingQuality } | null>(null);

  const [sceneModalOpen, setSceneModalOpen] = useState(false);
  const [editingScene, setEditingScene] = useState<SceneWithKnobs | null>(null);
  const [presetModalOpen, setPresetModalOpen] = useState(false);
  const [toArticleOpen, setToArticleOpen] = useState(false);
  const [sceneForm] = Form.useForm();
  const [presetForm] = Form.useForm();
  const [toArticleForm] = Form.useForm();

  const loadScenes = async () => {
    setLoading(true);
    try {
      const list = await copywritingApi.scenes();
      setScenes(list);
      setActiveId((prev) => prev ?? list[0]?.id ?? null);
    } catch (err) {
      message.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const loadDetail = async (id: number) => {
    try {
      setDetail(await copywritingApi.get(id));
    } catch (err) {
      message.error((err as Error).message);
    }
  };

  useEffect(() => {
    void loadScenes();
  }, []);

  useEffect(() => {
    if (activeId) void loadDetail(activeId);
    else setDetail(null);
  }, [activeId]);

  const active = useMemo(() => scenes.find((s) => s.id === activeId) ?? null, [scenes, activeId]);

  /* ---------------- 场景管理 ---------------- */

  const openSceneEditor = (s?: SceneWithKnobs) => {
    setEditingScene(s ?? null);
    sceneForm.setFieldsValue({
      name: s?.name ?? '',
      category: s?.category ?? SCENE_CATEGORIES[0].name,
      categoryLabel: s?.categoryLabel ?? SCENE_CATEGORIES[0].label,
      description: s?.description ?? '',
      structure: s?.structure ?? '',
      hooks: s?.hooks ?? '',
      tone: s?.tone ?? '',
      forbidden: s?.forbidden ?? '',
      compliance: s?.compliance ?? '',
      needLineBreak: s?.needLineBreak === 1,
    });
    setSceneModalOpen(true);
  };

  const submitScene = async () => {
    const v = await sceneForm.validateFields();
    try {
      if (editingScene) {
        await copywritingApi.update(editingScene.id, v);
        message.success('场景已更新');
      } else {
        const created = await copywritingApi.create(v);
        message.success('场景已创建');
        setActiveId(created.id);
      }
      setSceneModalOpen(false);
      void loadScenes();
    } catch (err) {
      message.error((err as Error).message);
    }
  };

  const saveKnobs = async (knob: CopywritingKnob, values: string[]) => {
    if (!activeId) return;
    try {
      await copywritingApi.setKnobs(activeId, knob, values);
      message.success(`${KNOB_LABELS[knob]} 档位已保存`);
      void loadDetail(activeId);
    } catch (err) {
      message.error((err as Error).message);
    }
  };

  /* ---------------- 生成 ---------------- */

  const doGenerate = async () => {
    if (!activeId) return;
    if (!topic.trim()) {
      message.warning('请填写主题');
      return;
    }
    if (mode !== 'original' && !referenceContent.trim()) {
      message.warning('模仿 / 改写模式需要填写参考内容');
      return;
    }
    setGenerating(true);
    try {
      const out = await copywritingApi.generate({
        sceneId: activeId,
        mode,
        topic: topic.trim(),
        referenceContent: referenceContent.trim() || undefined,
        targetForm: targetForm.trim() || undefined,
        knobs: knobValues,
      });
      setResult({ content: out.content, quality: out.quality });
      message.success('文案生成完成');
    } catch (err) {
      message.error((err as Error).message);
    } finally {
      setGenerating(false);
    }
  };

  const doEvaluate = async (content: string) => {
    if (!activeId) return;
    try {
      const q = await copywritingApi.evaluate(content, activeId);
      setResult((prev) => (prev ? { ...prev, quality: q } : { content, quality: q }));
      modal.info({ title: '文案质量评估', width: 440, content: <QualityBlock q={q} /> });
    } catch (err) {
      message.error((err as Error).message);
    }
  };

  const doEvaluateManual = async () => {
    if (!result) return;
    await doEvaluate(result.content);
  };

  const loadPreset = (p: ScenePreset) => {
    setResult({ content: p.body, quality: EMPTY_QUALITY });
    setMode('imitate');
    setReferenceContent(p.body);
    message.success('已载入到生成参数，可继续模仿或改写');
  };

  return (
    <div className="page">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="page-heading !mb-0">
          <h1 className="page-title">文案武库</h1>
          <HintTip title="场景化生成 · 五档位调控 · 质量评估 · 成品沉淀" />
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={loadScenes}>
            刷新
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openSceneEditor()}>
            新建场景
          </Button>
        </Space>
      </div>

      <Row gutter={16}>
        <Col xs={24} lg={7} xl={6}>
          <Card size="small" title={`场景库 (${scenes.length})`} loading={loading}>
            <div className="space-y-2">
              {scenes.map((s) => (
                <Card
                  key={s.id}
                  size="small"
                  hoverable
                  className={`card-interactive ${s.id === activeId ? 'is-active' : ''}`}
                  onClick={() => setActiveId(s.id)}
                >
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="truncate font-medium">{s.name}</span>
                    {s.builtIn === 1 && <Tag color="blue">内置</Tag>}
                    {s.enabled === 0 && <Tag>停用</Tag>}
                  </div>
                  <div className="mt-0.5 text-xs text-gray-500">{s.categoryLabel}</div>
                  {s.description && <p className="mt-1 line-clamp-2 text-xs text-gray-500">{s.description}</p>}
                </Card>
              ))}
              {scenes.length === 0 && !loading && <Empty description="暂无场景" />}
            </div>
          </Card>
        </Col>

        <Col xs={24} lg={17} xl={18}>
          {!active ? (
            <Card>
              <Empty description="请先在左侧选择或创建场景" />
            </Card>
          ) : (
            <div className="space-y-4">
              <Card size="small">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Space wrap>
                      <span className="text-base font-semibold">{active.name}</span>
                      <Tag color="cyan">{active.categoryLabel}</Tag>
                      {active.builtIn === 1 && <Tag color="blue">内置</Tag>}
                    </Space>
                    <p className="mb-0 mt-1 text-sm text-gray-600">{active.description || '（无描述）'}</p>
                  </div>
                  <Space size={0}>
                    <Button size="small" icon={<EditOutlined />} onClick={() => openSceneEditor(active)}>
                      编辑
                    </Button>
                    {active.builtIn !== 1 && (
                      <Popconfirm
                        title="确认删除该场景？"
                        onConfirm={async () => {
                          await copywritingApi.remove(active.id);
                          message.success('已删除');
                          setActiveId(null);
                          setResult(null);
                          void loadScenes();
                        }}
                      >
                        <Button size="small" type="link" danger icon={<DeleteOutlined />} />
                      </Popconfirm>
                    )}
                  </Space>
                </div>
              </Card>

              <Tabs
                defaultActiveKey="generate"
                items={[
                  {
                    key: 'generate',
                    label: (
                      <span>
                        <BulbOutlined /> 生成
                      </span>
                    ),
                    children: (
                      <div className="space-y-4">
                        <Card size="small" title="生成设置">
                          <Row gutter={12}>
                            <Col span={24}>
                              <div className="mb-2 text-sm font-medium">生成模式</div>
                              <Radio.Group
                                value={mode}
                                onChange={(e) => setMode(e.target.value)}
                                optionType="button"
                                buttonStyle="solid"
                              >
                                <Radio.Button value="original">原创</Radio.Button>
                                <Radio.Button value="imitate">模仿</Radio.Button>
                                <Radio.Button value="transform">改写</Radio.Button>
                              </Radio.Group>
                              <div className="mt-1 text-xs text-gray-500">{MODE_TEXT[mode]}</div>
                            </Col>

                            <Col span={24}>
                              <div className="mb-2 text-sm font-medium">主题</div>
                              <Input
                                placeholder="如：秋冬敏感肌护肤三件套"
                                value={topic}
                                onChange={(e) => setTopic(e.target.value)}
                                showCount
                                maxLength={120}
                              />
                            </Col>

                            {mode !== 'original' && (
                              <Col span={24}>
                                <div className="mb-2 text-sm font-medium">
                                  参考内容 <span className="text-red-500">*</span>
                                </div>
                                <TextArea
                                  rows={6}
                                  placeholder="粘贴需要模仿或改写的原文"
                                  value={referenceContent}
                                  onChange={(e) => setReferenceContent(e.target.value)}
                                />
                              </Col>
                            )}

                            <Col span={24}>
                              <div className="mb-2 text-sm font-medium">目标载体（可选）</div>
                              <Input
                                placeholder="如：小红书图文 / 抖音口播 / 朋友圈九宫格"
                                value={targetForm}
                                onChange={(e) => setTargetForm(e.target.value)}
                              />
                            </Col>

                            {detail && detail.knobs.length > 0 ? (
                              <Col span={24}>
                                <Divider className="my-2" />
                                <div className="mb-2 text-sm font-medium">五档位调控</div>
                                <Row gutter={[12, 12]}>
                                  {detail.knobs.map((k) => (
                                    <Col xs={24} md={12} xl={8} key={k.knob}>
                                      <KnobSelector
                                        knob={k.knob}
                                        values={k.value.split('|').filter(Boolean)}
                                        current={knobValues[k.knob]}
                                        onChange={(v) => setKnobValues((p) => ({ ...p, [k.knob]: v }))}
                                      />
                                    </Col>
                                  ))}
                                </Row>
                              </Col>
                            ) : (
                              <Col span={24}>
                                <Alert
                                  type="info"
                                  showIcon
                                  message="该场景未配置档位"
                                  description="可先正常生成；如需精细调控，请在「档位配置」中为场景添加档位。"
                                  className="mt-2"
                                />
                              </Col>
                            )}
                          </Row>

                          <Divider className="my-3" />
                          <Space>
                            <Button type="primary" icon={<ThunderboltOutlined />} loading={generating} onClick={doGenerate}>
                              开始生成
                            </Button>
                            <Button
                              onClick={() => {
                                setResult(null);
                                setKnobValues({});
                              }}
                            >
                              重置
                            </Button>
                            {result && (
                              <Button icon={<ExperimentOutlined />} onClick={doEvaluateManual}>
                                重新评估
                              </Button>
                            )}
                            <Tooltip title="复制全文">
                              <Button
                                icon={<CopyOutlined />}
                                onClick={() => {
                                  void navigator.clipboard.writeText(result?.content ?? '');
                                  message.success('已复制');
                                }}
                              >
                                复制
                              </Button>
                            </Tooltip>
                          </Space>
                        </Card>

                        {result && (
                          <Card
                            size="small"
                            title="生成结果（可编辑）"
                            extra={
                              <Space size={0}>
                                <Button size="small" icon={<SaveOutlined />} onClick={() => {
                                  presetForm.setFieldsValue({
                                    title: topic.trim() || '优秀文案',
                                    body: result.content,
                                    source: '本次生成',
                                  });
                                  setPresetModalOpen(true);
                                }}>
                                  沉淀
                                </Button>
                                <Button size="small" type="primary" icon={<FileAddOutlined />} onClick={() => {
                                  toArticleForm.setFieldsValue({
                                    title: topic.trim() || '未命名文案',
                                    platform: 'wechat',
                                  });
                                  setToArticleOpen(true);
                                }}>
                                  转文章
                                </Button>
                              </Space>
                            }
                          >
                            <TextArea
                              rows={16}
                              value={result.content}
                              onChange={(e) => setResult({ ...result, content: e.target.value })}
                              className="font-mono text-xs"
                            />
                            <Divider className="my-3" />
                            <QualityBlock q={result.quality} />
                          </Card>
                        )}
                      </div>
                    ),
                  },
                  {
                    key: 'knobs',
                    label: (
                      <span>
                        <ExperimentOutlined /> 档位配置
                      </span>
                    ),
                    children: (
                      <Card
                        size="small"
                        title="五档位调控（hook / emotion / rhythm / ending / colloquial）"
                        extra={<Tag color="blue">{detail?.knobs.length ?? 0} 项已配置</Tag>}
                      >
                        {detail && detail.knobs.length > 0 ? (
                          <Row gutter={[12, 12]}>
                            {detail.knobs.map((k) => (
                              <Col xs={24} md={12} key={k.knob}>
                                <KnobSelector
                                  knob={k.knob}
                                  values={k.value.split('|').filter(Boolean)}
                                  current={knobValues[k.knob]}
                                  onChange={(v) => setKnobValues((p) => ({ ...p, [k.knob]: v }))}
                                  onSave={(values) => saveKnobs(k.knob, values)}
                                />
                              </Col>
                            ))}
                          </Row>
                        ) : (
                          <Empty description="该场景暂无档位配置，可在「生成」页正常使用" />
                        )}
                      </Card>
                    ),
                  },
                  {
                    key: 'presets',
                    label: (
                      <span>
                        <SaveOutlined /> 成品沉淀 ({detail?.presets.length ?? 0})
                      </span>
                    ),
                    children: (
                      <Card
                        size="small"
                        title="优秀成品库"
                        bodyStyle={{ padding: 0 }}
                        extra={
                          <Button
                            size="small"
                            type="primary"
                            icon={<PlusOutlined />}
                            onClick={() => {
                              presetForm.setFieldsValue({
                                title: topic.trim() || '优秀文案',
                                body: result?.content ?? '',
                                source: '本次生成',
                              });
                              setPresetModalOpen(true);
                            }}
                          >
                            沉淀当前文案
                          </Button>
                        }
                      >
                        {detail && detail.presets.length > 0 ? (
                          <div className="divide-y">
                            {detail.presets.map((p) => (
                              <div key={p.id} className="p-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="font-medium">{p.title}</div>
                                    <div className="mt-0.5 text-xs text-gray-500">
                                      结构：{p.structure || '—'} · 钩子：{p.hooks || '—'} · 来源：{p.source || '—'}
                                    </div>
                                  </div>
                                  <Space size={0}>
                                    <Button size="small" type="link" icon={<CopyOutlined />} onClick={() => loadPreset(p)}>
                                      载入
                                    </Button>
                                    <Popconfirm
                                      title="确认删除该成品？"
                                      onConfirm={async () => {
                                        await copywritingApi.removePreset(p.id);
                                        message.success('已删除');
                                        void loadDetail(activeId!);
                                      }}
                                    >
                                      <Button size="small" type="link" danger icon={<DeleteOutlined />} />
                                    </Popconfirm>
                                  </Space>
                                </div>
                                <p className="mb-0 mt-2 line-clamp-3 text-xs text-gray-600">{p.body}</p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <Empty description="暂无沉淀文案" />
                        )}
                      </Card>
                    ),
                  },
                ]}
              />
            </div>
          )}
        </Col>
      </Row>

      {/* 场景编辑 */}
      <Modal
        open={sceneModalOpen}
        title={editingScene ? `编辑场景：${editingScene.name}` : '新建场景'}
        onCancel={() => setSceneModalOpen(false)}
        onOk={submitScene}
        okText="保存"
        width={720}
      >
        <Form form={sceneForm} layout="vertical">
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="name" label="场景名" rules={[{ required: true, message: '请填写场景名' }]}>
                <Input placeholder="如：双十一美妆种草" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="category" label="分类" rules={[{ required: true, message: '请选择分类' }]}>
                <Select options={SCENE_CATEGORIES.map((c) => ({ value: c.name, label: c.label }))} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="categoryLabel" label="分类显示名" rules={[{ required: true, message: '请填写显示名' }]}>
                <Input placeholder="如：商业种草" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="tone" label="语气">
                <Input placeholder="如：亲切、闺蜜感" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="description" label="场景描述">
            <Input placeholder="一句话说明该场景适用情况" />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="structure" label="结构骨架">
                <TextArea rows={4} placeholder="如：痛点 → 方案 → 证据 → 行动" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="hooks" label="钩子类型">
                <TextArea rows={4} placeholder="如：痛点提问、身份标签、结果前置" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="forbidden" label="违禁词（| 分隔）">
                <TextArea rows={3} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="compliance" label="合规要求">
                <TextArea rows={3} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="needLineBreak" valuePropName="checked">
            <Checkbox>输出需手动换行（适配手机阅读）</Checkbox>
          </Form.Item>
        </Form>
      </Modal>

      {/* 沉淀成品 */}
      <Modal
        open={presetModalOpen}
        title="沉淀为优秀成品"
        onCancel={() => setPresetModalOpen(false)}
        onOk={async () => {
          const v = await presetForm.validateFields();
          if (!activeId) return;
          try {
            await copywritingApi.addPreset(activeId, v);
            message.success('已沉淀');
            setPresetModalOpen(false);
            presetForm.resetFields();
            void loadDetail(activeId);
          } catch (err) {
            message.error((err as Error).message);
          }
        }}
        okText="沉淀"
      >
        <Form form={presetForm} layout="vertical">
          <Form.Item name="title" label="标题" rules={[{ required: true, message: '请填写标题' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="body" label="正文" rules={[{ required: true, message: '正文不能为空' }]}>
            <TextArea rows={10} />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="structure" label="结构">
                <Input placeholder="如：痛点-方案-证据" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="hooks" label="钩子">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="source" label="来源">
            <Input placeholder="如：本次生成 / 人工撰写" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 转文章 */}
      <Modal
        open={toArticleOpen}
        title="转为文章"
        onCancel={() => setToArticleOpen(false)}
        onOk={async () => {
          if (!result) return;
          const v = await toArticleForm.validateFields();
          try {
            const art = await copywritingApi.toArticle({
              content: result.content,
              title: v.title,
              sceneId: activeId ?? undefined,
              platform: v.platform,
              format: 'html',
            });
            message.success('已转为文章');
            setToArticleOpen(false);
            navigate(`/articles/${art.id}`);
          } catch (err) {
            message.error((err as Error).message);
          }
        }}
        okText="转换"
      >
        <Form form={toArticleForm} layout="vertical">
          <Form.Item name="title" label="文章标题" rules={[{ required: true, message: '请填写标题' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="platform" label="目标平台">
            <Select
              options={PUBLISH_PLATFORMS.map((p) => ({ value: p, label: PLATFORM_LABELS[p] }))}
              placeholder="选择平台"
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

/* ---------------- 子组件 ---------------- */

function KnobSelector({
  knob,
  values,
  current,
  onChange,
  onSave,
}: {
  knob: CopywritingKnob;
  values: string[];
  current?: string;
  onChange: (v: string) => void;
  onSave?: (values: string[]) => void;
}) {
  const { message } = AntApp.useApp();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(values.join('|'));
  const key = values.join('|');

  useEffect(() => {
    setDraft(key);
  }, [key]);

  if (!editing) {
    return (
      <div className="rounded-lg border p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium">
            {KNOB_LABELS[knob]} <span className="text-xs text-gray-400">({knob})</span>
          </span>
          {onSave && (
            <Button size="small" type="link" icon={<EditOutlined />} onClick={() => setEditing(true)}>
              配置
            </Button>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          {values.length > 0 ? (
            values.map((v) => (
              <Button
                key={v}
                size="small"
                type={current === v ? 'primary' : 'default'}
                onClick={() => onChange(v)}
                className="!px-2 !text-xs"
              >
                {v}
              </Button>
            ))
          ) : (
            <span className="text-xs text-gray-400">未配置档位</span>
          )}
        </div>
        {current && <div className="mt-2 text-xs text-blue-600">已选：{current}</div>}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-blue-300 bg-blue-50/40 p-3">
      <div className="mb-2 text-sm font-medium">{KNOB_LABELS[knob]}</div>
      <TextArea rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="每行一个档位，或用 | 分隔" className="text-xs" />
      <Space className="mt-2" size={0}>
        <Button
          size="small"
          type="primary"
          onClick={() => {
            const list = draft
              .split(/[|\n]/)
              .map((x) => x.trim())
              .filter(Boolean);
            if (list.length === 0) {
              message.warning('至少填写一个档位');
              return;
            }
            onSave?.(list);
            setEditing(false);
          }}
        >
          保存
        </Button>
        <Button
          size="small"
          onClick={() => {
            setDraft(key);
            setEditing(false);
          }}
        >
          取消
        </Button>
      </Space>
    </div>
  );
}

function QualityBlock({ q }: { q: CopywritingQuality }) {
  return (
    <div className="rounded-lg border bg-gray-50/60 p-3">
      <Row gutter={12}>
        <Col span={6}>
          <Statistic title="综合分" value={q.score} suffix="/100" valueStyle={{ fontSize: 20, color: q.passed ? '#16a34a' : '#ea580c' }} />
        </Col>
        <Col span={4}>
          <Statistic title="钩子" value={q.hookScore} valueStyle={{ fontSize: 18 }} />
        </Col>
        <Col span={4}>
          <Statistic title="节奏" value={q.rhythmScore} valueStyle={{ fontSize: 18 }} />
        </Col>
        <Col span={4}>
          <Statistic title="细节" value={q.detailScore} valueStyle={{ fontSize: 18 }} />
        </Col>
        <Col span={6}>
          <Statistic title="去AI味" value={q.deAiScore} valueStyle={{ fontSize: 18 }} />
        </Col>
      </Row>
      {q.issues.length > 0 && (
        <>
          <Divider className="my-2" />
          <ul className="mb-0 list-disc pl-5 text-xs text-orange-600">
            {q.issues.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
