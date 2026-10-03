import { useEffect, useState } from 'react';
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
  Descriptions,
  Divider,
  Switch,
  Table,
  Tooltip,
  Alert,
  InputNumber,
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  CopyOutlined,
  ReloadOutlined,
  PlusCircleOutlined,
} from '@ant-design/icons';
import { trackApi } from '@/api';
import HintTip from '@/components/HintTip';
import type { ExpertTrack, ExpertTrackTemplate } from '@smg/shared';
import { TRACK_DEPTHS, PUBLISH_PLATFORMS, PLATFORM_LABELS, platformLabel } from '@smg/shared';

const { TextArea } = Input;

const FIELD_LABELS: Record<keyof ExpertTrack, string> = {
  id: 'ID',
  name: '赛道名',
  slug: '标识',
  description: '描述',
  audience: '目标读者',
  boundary: '内容边界',
  structure: '结构规范',
  style: '语言风格',
  qualityBar: '质量底线',
  compliance: '合规要求',
  examples: '优质样例',
  defaultParams: '默认参数',
  enabled: '启用',
  isBuiltin: '内置',
  createdAt: '创建时间',
  updatedAt: '更新时间',
};

export default function TrackPage() {
  const { message } = AntApp.useApp();

  const [tracks, setTracks] = useState<ExpertTrack[]>([]);
  const [templates, setTemplates] = useState<ExpertTrackTemplate[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<ExpertTrack | null>(null);
  const [form] = Form.useForm();
  const [tplModalOpen, setTplModalOpen] = useState(false);
  const [editingTpl, setEditingTpl] = useState<ExpertTrackTemplate | null>(null);
  const [tplForm] = Form.useForm();

  const loadAll = async () => {
    setLoading(true);
    try {
      const [t, tpl] = await Promise.all([trackApi.list(), trackApi.templates()]);
      setTracks(t);
      setTemplates(tpl);
      setActiveId((prev) => prev ?? t[0]?.id ?? null);
    } catch (err) {
      message.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
  }, []);

  const active = tracks.find((t) => t.id === activeId) ?? null;
  const activeTemplates = templates.filter((t) => t.trackId === activeId);

  const openEditor = (t?: ExpertTrack) => {
    setEditing(t ?? null);
    form.setFieldsValue({
      name: t?.name ?? '',
      description: t?.description ?? '',
      audience: t?.audience ?? '',
      boundary: t?.boundary ?? '',
      structure: t?.structure ?? '',
      style: t?.style ?? '',
      qualityBar: t?.qualityBar ?? '',
      compliance: t?.compliance ?? '',
      examples: t?.examples ?? '',
      enabled: t ? t.enabled : true,
    });
    setEditorOpen(true);
  };

  const submit = async () => {
    const v = await form.validateFields();
    try {
      if (editing) {
        await trackApi.update(editing.id, v);
        message.success('赛道已更新');
      } else {
        const created = await trackApi.create(v);
        message.success('赛道已创建');
        setActiveId(created.id);
      }
      setEditorOpen(false);
      void loadAll();
    } catch (err) {
      message.error((err as Error).message);
    }
  };

  const openTplEditor = (tpl?: ExpertTrackTemplate) => {
    setEditingTpl(tpl ?? null);
    tplForm.setFieldsValue({
      name: tpl?.name ?? '',
      audience: tpl?.audience ?? active?.audience ?? '',
      depth: tpl?.depth ?? 'standard',
      platform: tpl?.platform ?? 'wechat',
      style: tpl?.style ?? active?.style ?? '',
      strategy: tpl?.strategy ?? '',
      wordMin: tpl?.wordMin ?? 1500,
      wordMax: tpl?.wordMax ?? 2500,
    });
    setTplModalOpen(true);
  };

  const submitTpl = async () => {
    if (!activeId) return;
    const v = await tplForm.validateFields();
    try {
      if (editingTpl) {
        await trackApi.updateTemplate(editingTpl.id, v);
        message.success('模板已更新');
      } else {
        await trackApi.createTemplate({ ...v, trackId: activeId });
        message.success('模板已创建');
      }
      setTplModalOpen(false);
      void loadAll();
    } catch (err) {
      message.error((err as Error).message);
    }
  };

  const renderField = (key: keyof ExpertTrack, value: unknown) => {
    if (key === 'defaultParams') {
      let obj: unknown = value ?? {};
      if (typeof obj === 'string') {
        try {
          obj = JSON.parse(obj);
        } catch {
          obj = {};
        }
      }
      const text = JSON.stringify(obj ?? {}, null, 2);
      return text === '{}' ? '—' : <pre className="mb-0 whitespace-pre-wrap text-xs">{text}</pre>;
    }
    if (key === 'enabled') return value ? <Tag color="green">已启用</Tag> : <Tag>已停用</Tag>;
    if (key === 'isBuiltin') return value ? <Tag color="blue">内置</Tag> : <Tag>自定义</Tag>;
    const str = String(value ?? '');
    return str ? (
      <span className="whitespace-pre-wrap">{str}</span>
    ) : (
      <span className="text-gray-400">—</span>
    );
  };

  return (
    <div className="page">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="page-heading !mb-0">
          <h1 className="page-title">专家赛道</h1>
          <HintTip title="为不同内容领域配置专属的读者画像、结构规范与写作模板" />
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={loadAll}>
            刷新
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openEditor()}>
            新建赛道
          </Button>
        </Space>
      </div>

      <Row gutter={16}>
        <Col xs={24} lg={8} xl={7}>
          <Card size="small" title={`赛道列表 (${tracks.length})`} loading={loading}>
            <div className="space-y-2">
              {tracks.map((t) => (
                <Card
                  key={t.id}
                  size="small"
                  hoverable
                  className={`card-interactive ${t.id === activeId ? 'is-active' : ''}`}
                  onClick={() => setActiveId(t.id)}
                >
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="truncate font-medium">{t.name}</span>
                    {t.isBuiltin === 1 && <Tag color="blue">内置</Tag>}
                    {!t.enabled && <Tag>停用</Tag>}
                  </div>
                  <div className="mt-0.5 text-xs text-gray-500">
                    {templates.filter((x) => x.trackId === t.id).length} 个模板
                  </div>
                  {t.description && <p className="mb-0 mt-1 line-clamp-2 text-xs text-gray-500">{t.description}</p>}
                </Card>
              ))}
              {tracks.length === 0 && !loading && <Empty description="暂无赛道" />}
            </div>
          </Card>
        </Col>

        <Col xs={24} lg={16} xl={17}>
          {!active ? (
            <Card>
              <Empty description="请选择左侧赛道" />
            </Card>
          ) : (
            <div className="space-y-4">
              <Card
                size="small"
                extra={
                  <Space size={0}>
                    <Button size="small" icon={<EditOutlined />} onClick={() => openEditor(active)}>
                      编辑
                    </Button>
                    <Button
                      size="small"
                      icon={<CopyOutlined />}
                      onClick={async () => {
                        await trackApi.copy(active.id, `${active.name} 副本`);
                        message.success('已复制为自定义赛道');
                        void loadAll();
                      }}
                    >
                      复制
                    </Button>
                    {active.isBuiltin !== 1 && (
                      <Popconfirm
                        title="确认删除该赛道？"
                        onConfirm={async () => {
                          try {
                            await trackApi.remove(active.id);
                            message.success('已删除');
                            setActiveId(null);
                            void loadAll();
                          } catch (err) {
                            message.error((err as Error).message);
                          }
                        }}
                      >
                        <Button size="small" type="link" danger icon={<DeleteOutlined />} />
                      </Popconfirm>
                    )}
                  </Space>
                }
              >
                <Space wrap>
                  <span className="text-base font-semibold">{active.name}</span>
                  <Tag>{active.slug}</Tag>
                  {active.isBuiltin === 1 && <Tag color="blue">内置</Tag>}
                  <Tooltip title="启用后可在创作工作台选择">
                    <Switch
                      size="small"
                      checked={Boolean(active.enabled)}
                      onChange={async (checked) => {
                        try {
                          await trackApi.update(active.id, { enabled: checked });
                          void loadAll();
                        } catch (err) {
                          message.error((err as Error).message);
                        }
                      }}
                    />
                  </Tooltip>
                </Space>
                {active.isBuiltin === 1 && (
                  <div className="mt-3 flex items-center gap-1.5 text-sm text-ink-700">
                    内置赛道
                    <HintTip title="内置赛道仅可修改名称、描述、读者画像与启用状态，其余字段请先「复制」为自定义赛道后编辑。" />
                  </div>
                )}
              </Card>

              <Card size="small" title="赛道配置">
                <Descriptions column={1} size="small" bordered>
                  {(['description', 'audience', 'boundary', 'structure', 'style', 'qualityBar', 'compliance', 'examples'] as const).map(
                    (key) => (
                      <Descriptions.Item key={key} label={FIELD_LABELS[key]}>
                        {renderField(key, active[key])}
                      </Descriptions.Item>
                    ),
                  )}
                  <Descriptions.Item label={FIELD_LABELS.defaultParams}>
                    {renderField('defaultParams', active.defaultParams)}
                  </Descriptions.Item>
                </Descriptions>
              </Card>

              <Card
                size="small"
                title={`赛道模板 (${activeTemplates.length})`}
                extra={
                  <Button size="small" type="primary" icon={<PlusCircleOutlined />} onClick={() => openTplEditor()}>
                    新建模板
                  </Button>
                }
              >
                {activeTemplates.length > 0 ? (
                  <Table
                    rowKey="id"
                    size="small"
                    pagination={false}
                    dataSource={activeTemplates}
                    columns={[
                      {
                        title: '模板名',
                        dataIndex: 'name',
                        render: (v: string, r) => (
                          <Space>
                            <span className="font-medium">{v}</span>
                            {r.enabled !== 1 && <Tag>停用</Tag>}
                          </Space>
                        ),
                      },
                      {
                        title: '平台',
                        dataIndex: 'platform',
                        width: 110,
                        render: (v: string) => <Tag>{platformLabel(v)}</Tag>,
                      },
                      {
                        title: '深度',
                        dataIndex: 'depth',
                        width: 90,
                        render: (v: string) => TRACK_DEPTHS.find((d) => d.value === v)?.label.split('（')[0] ?? v,
                      },
                      { title: '字数', width: 120, render: (_, r) => `${r.wordMin}~${r.wordMax}` },
                      {
                        title: '操作',
                        width: 110,
                        render: (_, r) => (
                          <Space size={0}>
                            <Button size="small" type="link" icon={<EditOutlined />} onClick={() => openTplEditor(r)}>
                              编辑
                            </Button>
                            <Popconfirm
                              title="确认删除该模板？"
                              onConfirm={async () => {
                                await trackApi.removeTemplate(r.id);
                                message.success('已删除');
                                void loadAll();
                              }}
                            >
                              <Button size="small" type="link" danger icon={<DeleteOutlined />} />
                            </Popconfirm>
                          </Space>
                        ),
                      },
                    ]}
                  />
                ) : (
                  <Empty description="该赛道暂无模板" />
                )}
              </Card>
            </div>
          )}
        </Col>
      </Row>

      {/* 赛道编辑 */}
      <Modal
        open={editorOpen}
        title={editing ? `编辑赛道：${editing.name}` : '新建赛道'}
        onCancel={() => setEditorOpen(false)}
        onOk={submit}
        okText="保存"
        width={760}
      >
        {editing?.isBuiltin === 1 && (
          <Alert
            className="mb-4"
            type="warning"
            showIcon
            message="内置赛道仅可修改名称、描述、读者画像与启用状态。"
          />
        )}
        <Form form={form} layout="vertical">
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="name" label="赛道名" rules={[{ required: true, message: '请填写赛道名' }]}>
                <Input placeholder="如：数码测评" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="audience" label="目标读者">
                <Input placeholder="如：25-40 岁男性数码爱好者" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="description" label="赛道描述">
            <Input placeholder="一句话说明该赛道覆盖什么内容" />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="structure" label="结构规范">
                <TextArea rows={4} placeholder="如：结论前置 → 参数对比 → 实测体验 → 适用人群 → 购买建议" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="style" label="语言风格">
                <TextArea rows={4} placeholder="如：冷静、数据驱动、少形容词" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="boundary" label="内容边界">
                <TextArea rows={3} placeholder="不能碰的话题" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="compliance" label="合规要求">
                <TextArea rows={3} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="qualityBar" label="质量底线">
                <TextArea rows={3} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="examples" label="优质样例">
                <TextArea rows={3} placeholder="作为 few-shot 参考的示例文本" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="enabled" valuePropName="checked">
            <Switch checkedChildren="启用" unCheckedChildren="停用" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 模板编辑 */}
      <Modal
        open={tplModalOpen}
        title={editingTpl ? `编辑模板：${editingTpl.name}` : '新建赛道模板'}
        onCancel={() => setTplModalOpen(false)}
        onOk={submitTpl}
        okText="保存"
        width={640}
      >
        <Form form={tplForm} layout="vertical">
          <Form.Item name="name" label="模板名" rules={[{ required: true, message: '请填写模板名' }]}>
            <Input placeholder="如：深度测评-长文版" />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="platform" label="目标平台">
                <Select
                  options={PUBLISH_PLATFORMS.map((p) => ({ value: p, label: PLATFORM_LABELS[p] }))}
                  placeholder="选择平台"
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="depth" label="内容深度">
                <Select options={TRACK_DEPTHS.map((d) => ({ value: d.value, label: d.label }))} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="wordMin" label="最少字数">
                <InputNumber className="w-full" min={300} step={100} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="wordMax" label="最多字数">
                <InputNumber className="w-full" min={500} step={100} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="enabled" label="启用" valuePropName="checked" initialValue>
                <Switch size="small" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="audience" label="读者侧重（覆盖赛道默认）">
            <Input placeholder="留空则继承赛道设置" />
          </Form.Item>
          <Form.Item name="style" label="语言风格（覆盖赛道默认）">
            <Input placeholder="留空则继承赛道设置" />
          </Form.Item>
          <Form.Item name="strategy" label="写作策略">
            <TextArea rows={4} placeholder="该模板下的具体写作策略与结构要求" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
