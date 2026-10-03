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
  Upload,
  Progress,
  Statistic,
  Tooltip,
  Image as AntImage,
  Divider,
  Pagination,
  Switch,
} from 'antd';
import {
  InboxOutlined,
  DeleteOutlined,
  EditOutlined,
  ReloadOutlined,
  ThunderboltOutlined,
  LinkOutlined,
  PlusOutlined,
  CopyOutlined,
  DownloadOutlined,
} from '@ant-design/icons';
import { imageApi } from '@/api';
import HintTip from '@/components/HintTip';
import type { ImageAsset, ImageStylePreset } from '@smg/shared';
import { IMAGE_SOURCES, IMAGE_SIZE_OPTIONS } from '@smg/shared';
import { useConfigStore } from '@/store/config';

const { TextArea } = Input;

const SOURCE_COLORS: Record<string, string> = {
  upload: 'blue',
  ai: 'purple',
  workflow: 'green',
  render: 'orange',
};

function formatSize(bytes: number) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export default function ImageLibraryPage() {
  const { message } = AntApp.useApp();
  const imgWatermarkDefault = useConfigStore((s) => s.config?.imgApi.watermark ?? false);

  const [items, setItems] = useState<ImageAsset[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(24);
  const [source, setSource] = useState<string | undefined>();
  const [style, setStyle] = useState<string | undefined>();
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<{ total: number; size: number; bySource: { source: string; c: number }[] }>({
    total: 0,
    size: 0,
    bySource: [],
  });

  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genForm] = Form.useForm();
  const [genOpen, setGenOpen] = useState(false);

  const [importOpen, setImportOpen] = useState(false);
  const [importForm] = Form.useForm();

  const [presets, setPresets] = useState<ImageStylePreset[]>([]);
  const [presetOpen, setPresetOpen] = useState(false);
  const [editingPreset, setEditingPreset] = useState<ImageStylePreset | null>(null);
  const [presetForm] = Form.useForm();

  const [preview, setPreview] = useState<ImageAsset | null>(null);
  const [editing, setEditing] = useState<ImageAsset | null>(null);
  const [editForm] = Form.useForm();

  const load = async (p = page) => {
    setLoading(true);
    try {
      const res = await imageApi.list({
        page: p,
        pageSize,
        source,
        style,
        keyword: keyword || undefined,
      });
      setItems(res.items);
      setTotal(res.total);
    } catch (err) {
      message.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      setStats(await imageApi.stats());
    } catch {
      /* 忽略统计失败 */
    }
  };

  const loadPresets = async () => {
    try {
      setPresets(await imageApi.presets());
    } catch (err) {
      message.error((err as Error).message);
    }
  };

  useEffect(() => {
    void load(1);
    void loadStats();
    void loadPresets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = () => {
    void load(page);
    void loadStats();
  };

  const doUpload = async (file: File) => {
    setUploadPct(0);
    try {
      const out = await imageApi.upload([file], setUploadPct);
      message.success(`已上传 ${out.length} 张`);
      refresh();
    } catch (err) {
      message.error((err as Error).message);
    } finally {
      setUploadPct(null);
    }
    return false;
  };

  const doGenerate = async () => {
    const v = await genForm.validateFields();
    setGenerating(true);
    try {
      const out = await imageApi.generate({
        prompt: v.prompt,
        size: v.size,
        style: v.style,
        count: v.count,
        presetId: v.presetId,
        watermark: v.watermark,
      });
      message.success(`已生成 ${out.length} 张`);
      setGenOpen(false);
      genForm.resetFields();
      refresh();
    } catch (err) {
      message.error((err as Error).message);
    } finally {
      setGenerating(false);
    }
  };

  const doImportUrl = async () => {
    const v = await importForm.validateFields();
    try {
      await imageApi.importUrl(v);
      message.success('已导入');
      setImportOpen(false);
      importForm.resetFields();
      refresh();
    } catch (err) {
      message.error((err as Error).message);
    }
  };

  const openPresetEditor = (p?: ImageStylePreset) => {
    setEditingPreset(p ?? null);
    presetForm.setFieldsValue({
      name: p?.name ?? '',
      promptTemplate: p?.promptTemplate ?? '',
      negativePrompt: p?.negativePrompt ?? '',
      category: p?.category ?? '正文',
    });
    setPresetOpen(true);
  };

  const submitPreset = async () => {
    const v = await presetForm.validateFields();
    try {
      if (editingPreset) {
        await imageApi.updatePreset(editingPreset.id, v);
        message.success('预设已更新');
      } else {
        await imageApi.createPreset(v);
        message.success('预设已创建');
      }
      setPresetOpen(false);
      void loadPresets();
    } catch (err) {
      message.error((err as Error).message);
    }
  };

  return (
    <div className="page">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="page-heading !mb-0">
          <h1 className="page-title">资源图库</h1>
          <HintTip title="上传 · AI 生成 · 外链导入 · 风格预设" />
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={refresh}>
            刷新
          </Button>
          <Button icon={<LinkOutlined />} onClick={() => setImportOpen(true)}>
            外链导入
          </Button>
          <Button type="primary" icon={<ThunderboltOutlined />} onClick={() => {
            genForm.setFieldsValue({ watermark: imgWatermarkDefault });
            setGenOpen(true);
          }}>
            AI 生成
          </Button>
        </Space>
      </div>

      <Row gutter={16}>
        <Col xs={24} lg={18} xl={19}>
          <Card size="small">
            <Row gutter={12} className="mb-3">
              <Col xs={24} md={8}>
                <Input
                  placeholder="搜索标题 / 描述 / 标签"
                  allowClear
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  onPressEnter={() => void load(1)}
                />
              </Col>
              <Col xs={12} md={5}>
                <Select
                  allowClear
                  style={{ width: '100%' }}
                  placeholder="按来源筛选"
                  value={source}
                  onChange={setSource}
                  options={IMAGE_SOURCES.map((s) => ({ value: s.value, label: s.label }))}
                />
              </Col>
              <Col xs={12} md={6}>
                <Select
                  allowClear
                  showSearch
                  style={{ width: '100%' }}
                  placeholder="按风格筛选"
                  value={style}
                  onChange={setStyle}
                  options={Array.from(new Set(presets.map((p) => p.name))).map((n) => ({ value: n, label: n }))}
                />
              </Col>
              <Col xs={24} md={5} className="flex justify-end">
                <Space size={0}>
                  <Button type="primary" onClick={() => void load(1)}>
                    查询
                  </Button>
                  <Button
                    onClick={() => {
                      setSource(undefined);
                      setStyle(undefined);
                      setKeyword('');
                      void load(1);
                    }}
                  >
                    重置
                  </Button>
                </Space>
              </Col>
            </Row>

            <Upload.Dragger
              accept="image/*"
              showUploadList={false}
              multiple
              beforeUpload={doUpload}
              disabled={uploadPct !== null}
              className="mb-4"
            >
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">点击或拖拽图片到此处上传</p>
              <p className="ant-upload-hint">支持 JPG / PNG / WebP / GIF，单次最多 20 张，单张不超过 25MB</p>
              {uploadPct !== null && <Progress percent={uploadPct} className="mt-3" />}
            </Upload.Dragger>

            {items.length === 0 && !loading ? (
              <Empty description="图库还是空的，先上传或生成一些图片吧" />
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                {items.map((img) => (
                  <Card
                    key={img.id}
                    size="small"
                    bodyStyle={{ padding: 8 }}
                    className="overflow-hidden"
                    hoverable
                    onClick={() => setPreview(img)}
                  >
                    <div className="aspect-square overflow-hidden rounded bg-gray-100">
                      <AntImage
                        src={img.url}
                        alt={img.title}
                        width="100%"
                        height="100%"
                        style={{ objectFit: 'cover', display: 'block' }}
                        preview={false}
                      />
                    </div>
                    <div className="mt-2 truncate text-xs" title={img.title}>
                      {img.title || img.fileName}
                    </div>
                    <div className="mt-1 flex items-center justify-between">
                      <Tag color={SOURCE_COLORS[img.source] ?? 'default'} className="!mr-0 !text-[10px]">
                        {IMAGE_SOURCES.find((s) => s.value === img.source)?.label ?? img.source}
                      </Tag>
                      <span className="text-[10px] text-gray-400">{formatSize(img.size)}</span>
                    </div>
                  </Card>
                ))}
              </div>
            )}

            <div className="mt-4 flex justify-end">
              <Pagination
                current={page}
                pageSize={pageSize}
                total={total}
                showSizeChanger={false}
                onChange={(p) => {
                  setPage(p);
                  void load(p);
                }}
              />
            </div>
          </Card>
        </Col>

        <Col xs={24} lg={6} xl={5}>
          <div className="space-y-4">
            <Card size="small" title="图库统计">
              <Row gutter={8}>
                <Col span={12}>
                  <Statistic title="图片数" value={stats.total} />
                </Col>
                <Col span={12}>
                  <Statistic title="占用空间" value={formatSize(stats.size)} />
                </Col>
              </Row>
              <Divider className="my-3" />
              <div className="space-y-1">
                {stats.bySource.map((s) => (
                  <div key={s.source} className="flex items-center justify-between text-sm">
                    <Tag color={SOURCE_COLORS[s.source] ?? 'default'} className="!mr-0">
                      {IMAGE_SOURCES.find((x) => x.value === s.source)?.label ?? s.source}
                    </Tag>
                    <span className="text-gray-500">{s.c}</span>
                  </div>
                ))}
                {stats.bySource.length === 0 && <span className="text-xs text-gray-400">暂无数据</span>}
              </div>
            </Card>

            <Card
              size="small"
              title={`风格预设 (${presets.length})`}
              extra={
                <Button size="small" type="link" icon={<PlusOutlined />} onClick={() => openPresetEditor()}>
                  新建
                </Button>
              }
            >
              <div className="space-y-2">
                {presets.map((p) => (
                  <div key={p.id} className="rounded border p-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-1">
                        <Tooltip title={p.promptTemplate}>
                          <span className="truncate text-sm font-medium">{p.name}</span>
                        </Tooltip>
                        {p.builtin === 1 && <Tag color="blue">内置</Tag>}
                      </div>
                      <Space size={0}>
                        <Button
                          size="small"
                          type="link"
                          onClick={() => {
                            genForm.setFieldsValue({ presetId: p.id, prompt: '', size: '1024x1024', count: 1 });
                            setGenOpen(true);
                          }}
                        >
                          用
                        </Button>
                        <Button
                          size="small"
                          type="link"
                          icon={<EditOutlined />}
                          onClick={() => openPresetEditor(p)}
                        >
                          编辑
                        </Button>
                        {p.builtin !== 1 && (
                          <Popconfirm
                            title="确认删除该预设？"
                            onConfirm={async () => {
                              await imageApi.removePreset(p.id);
                              message.success('已删除');
                              void loadPresets();
                            }}
                          >
                            <Button size="small" type="link" danger icon={<DeleteOutlined />} />
                          </Popconfirm>
                        )}
                      </Space>
                    </div>
                    <p className="mb-0 mt-1 line-clamp-2 text-xs text-gray-500">{p.promptTemplate}</p>
                    <div className="mt-1">
                      <Tag className="!mr-0 !text-[10px]">{p.category}</Tag>
                    </div>
                  </div>
                ))}
                {presets.length === 0 && <Empty description="暂无风格预设" />}
              </div>
            </Card>
          </div>
        </Col>
      </Row>

      {/* AI 生成 */}
      <Modal
        open={genOpen}
        title="AI 生成图片"
        onCancel={() => setGenOpen(false)}
        onOk={doGenerate}
        confirmLoading={generating}
        okText="生成"
        width={560}
      >
        <div className="mb-4 flex items-center gap-1.5 text-sm text-ink-700">
          模型配置
          <HintTip title="需在【系统设置 → 图片生成】中配置 OpenAI 兼容网关或阿里万相。" />
        </div>
        <Form form={genForm} layout="vertical" initialValues={{ size: '1024x1024', count: 1, watermark: false }}>
          <Form.Item
            name="presetId"
            label={
              <span className="inline-flex items-center gap-1.5">
                风格预设
                <HintTip title="选择预设后，下方描述会自动套用其提示词模板" />
              </span>
            }
          >
            <Select
              allowClear
              placeholder="不使用预设"
              options={presets.map((p) => ({ value: p.id, label: p.name }))}
            />
          </Form.Item>
          <Form.Item name="prompt" label="图片描述" rules={[{ required: true, message: '请输入图片描述' }]}>
            <TextArea rows={4} placeholder="如：秋日窗边的咖啡与书，暖色调" />
          </Form.Item>
          <Row gutter={12}>
            <Col span={10}>
              <Form.Item name="size" label="尺寸">
                <Select options={IMAGE_SIZE_OPTIONS.map((s) => ({ value: s.value, label: s.label }))} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="style" label="风格备注">
                <Input placeholder="可选" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="count" label="数量">
                <Select options={[1, 2, 3, 4].map((n) => ({ value: n, label: `${n} 张` }))} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            name="watermark"
            label={
              <span className="inline-flex items-center gap-1.5">
                生成水印
                <HintTip title="默认跟随【系统设置 → 图片生成】。Seedream 等模型不传此参数时服务商会自动加水印。" />
              </span>
            }
            valuePropName="checked"
          >
            <Switch checkedChildren="加水印" unCheckedChildren="无水印" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 外链导入 */}
      <Modal
        open={importOpen}
        title="从外链导入图片"
        onCancel={() => setImportOpen(false)}
        onOk={doImportUrl}
        okText="导入"
      >
        <Form form={importForm} layout="vertical">
          <Form.Item name="url" label="图片地址" rules={[{ required: true, message: '请输入图片地址' }]}>
            <Input placeholder="https://example.com/photo.jpg" />
          </Form.Item>
          <Form.Item name="prompt" label="描述">
            <Input placeholder="可选" />
          </Form.Item>
          <Form.Item name="style" label="风格">
            <Input placeholder="可选" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 预设编辑 */}
      <Modal
        open={presetOpen}
        title={editingPreset ? `编辑预设：${editingPreset.name}` : '新建风格预设'}
        onCancel={() => setPresetOpen(false)}
        onOk={submitPreset}
        okText="保存"
        width={560}
      >
        <Form form={presetForm} layout="vertical">
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="name" label="预设名" rules={[{ required: true, message: '请填写预设名' }]}>
                <Input placeholder="如：正文配图-国风" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="category" label="分类">
                <Input placeholder="如：封面 / 正文" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            name="promptTemplate"
            label={
              <span className="inline-flex items-center gap-1.5">
                提示词模板
                <HintTip title={'使用 {prompt} 占位，生成时会被用户填写的描述替换'} />
              </span>
            }
          >
            <TextArea rows={4} placeholder="如：中国风水墨画风格，主题 {prompt}，留白构图" />
          </Form.Item>
          <Form.Item name="negativePrompt" label="反向提示词">
            <TextArea rows={2} placeholder="如：文字、水印、低分辨率" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 图片编辑 */}
      <Modal
        open={Boolean(editing)}
        title="编辑图片信息"
        onCancel={() => setEditing(null)}
        onOk={async () => {
          if (!editing) return;
          const v = await editForm.validateFields();
          await imageApi.update(editing.id, v);
          message.success('已保存');
          setEditing(null);
          refresh();
        }}
        okText="保存"
      >
        <Form form={editForm} layout="vertical">
          <Form.Item name="title" label="标题">
            <Input />
          </Form.Item>
          <Form.Item name="prompt" label="描述">
            <TextArea rows={3} />
          </Form.Item>
          <Form.Item name="style" label="风格">
            <Input />
          </Form.Item>
          <Form.Item name="tags" label="标签（逗号分隔）">
            <Input />
          </Form.Item>
        </Form>
      </Modal>

      {/* 预览 */}
      <Modal
        open={Boolean(preview)}
        onCancel={() => setPreview(null)}
        footer={null}
        width={760}
        title={preview?.title || preview?.fileName}
      >
        {preview && (
          <div>
            <AntImage src={preview.url} alt={preview.title} width="100%" />
            <Row gutter={12} className="mt-3">
              <Col span={6}>
                <Statistic title="尺寸" value={`${preview.width}×${preview.height}`} valueStyle={{ fontSize: 14 }} />
              </Col>
              <Col span={6}>
                <Statistic title="大小" value={formatSize(preview.size)} valueStyle={{ fontSize: 14 }} />
              </Col>
              <Col span={6}>
                <Statistic
                  title="来源"
                  value={IMAGE_SOURCES.find((s) => s.value === preview.source)?.label ?? preview.source}
                  valueStyle={{ fontSize: 14 }}
                />
              </Col>
              <Col span={6} className="flex items-center justify-end">
                <Space size={0}>
                  <Button
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={() => {
                      void navigator.clipboard.writeText(new URL(preview.url, window.location.origin).href);
                      message.success('图片地址已复制');
                    }}
                  >
                    复制地址
                  </Button>
                  <Button
                    size="small"
                    icon={<DownloadOutlined />}
                    onClick={() => {
                      const a = document.createElement('a');
                      a.href = preview.url;
                      a.download = preview.fileName;
                      a.click();
                    }}
                  >
                    下载
                  </Button>
                </Space>
              </Col>
            </Row>
            {preview.prompt && (
              <p className="mb-0 mt-3 text-sm text-gray-600">描述：{preview.prompt}</p>
            )}
            {preview.tags && (
              <div className="mt-2">
                {preview.tags.split(',').filter(Boolean).map((t) => (
                  <Tag key={t}>{t}</Tag>
                ))}
              </div>
            )}
            <Divider className="my-3" />
            <Space>
              <Button
                icon={<EditOutlined />}
                onClick={() => {
                  editForm.setFieldsValue({
                    title: preview.title,
                    prompt: preview.prompt,
                    style: preview.style,
                    tags: preview.tags,
                  });
                  setEditing(preview);
                  setPreview(null);
                }}
              >
                编辑信息
              </Button>
              <Popconfirm
                title="确认删除该图片？"
                onConfirm={async () => {
                  await imageApi.remove(preview.id);
                  message.success('已删除');
                  setPreview(null);
                  refresh();
                }}
              >
                <Button danger icon={<DeleteOutlined />}>
                  删除
                </Button>
              </Popconfirm>
            </Space>
          </div>
        )}
      </Modal>
    </div>
  );
}
