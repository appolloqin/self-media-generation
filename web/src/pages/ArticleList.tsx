import { useEffect, useState } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Input,
  Select,
  Tag,
  Dropdown,
  Modal,
  Form,
  Upload,
  Row,
  Col,
  Statistic,
  Popconfirm,
  App as AntApp,
  Segmented,
} from 'antd';
import {
  PlusOutlined,
  UploadOutlined,
  DownloadOutlined,
  DeleteOutlined,
  EditOutlined,
  ReloadOutlined,
  EyeOutlined,
  SendOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { PLATFORM_LABELS, PUBLISH_PLATFORMS, platformLabel, formatBytes } from '@smg/shared';
import { articleApi, type ArticleQuery, type ArticleStats } from '@/api';
import type { Article } from '@smg/shared';

const STATUS_META: Record<string, { label: string; color: string }> = {
  draft: { label: '草稿', color: 'default' },
  published: { label: '已发布', color: 'green' },
  failed: { label: '发布失败', color: 'red' },
  unpublished: { label: '未发布', color: 'orange' },
};

const SOURCE_META: Record<string, string> = {
  ai: 'AI 生成',
  manual: '手动录入',
  library: '素材库',
  novel: '小说',
  copywriting: '文案武库',
};

export default function ArticleListPage() {
  const { message } = AntApp.useApp();
  const navigate = useNavigate();

  const [data, setData] = useState<{ items: Article[]; total: number }>({ items: [], total: 0 });
  const [stats, setStats] = useState<ArticleStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm();
  const [query, setQuery] = useState<ArticleQuery>({ page: 1, pageSize: 20 });

  const load = async () => {
    setLoading(true);
    try {
      const [list, s] = await Promise.all([articleApi.list(query), articleApi.stats()]);
      setData({ items: list.items, total: list.total });
      setStats(s);
    } catch (err) {
      message.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const handleCreate = async () => {
    const values = await form.validateFields();
    try {
      const article = await articleApi.create({
        title: values.title,
        content: values.content,
        format: values.format ?? 'html',
        platform: values.platform ?? 'wechat',
        category: values.category || '手动录入',
      });
      message.success('文章已创建');
      setCreateOpen(false);
      form.resetFields();
      navigate(`/articles/${article.id}`);
    } catch (err) {
      message.error((err as Error).message);
    }
  };

  const handleDelete = async (ids: number[]) => {
    try {
      if (ids.length === 1) await articleApi.remove(ids[0]);
      else await articleApi.batchRemove(ids);
      message.success(`已删除 ${ids.length} 篇`);
      setSelected([]);
      void load();
    } catch (err) {
      message.error((err as Error).message);
    }
  };

  return (
    <div className="page">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title mb-0">文章管理</h1>
          <p className="page-subtitle mb-0">共 {data.total} 篇 · 累计 {stats?.words?.toLocaleString() ?? 0} 字</p>
        </div>
        <Space wrap>
          <Button icon={<UploadOutlined />} onClick={() => navigate('/library')}>
            从素材库导入
          </Button>
          <Button icon={<PlusOutlined />} type="primary" onClick={() => setCreateOpen(true)}>
            新建文章
          </Button>
        </Space>
      </div>

      <Row gutter={12} className="mb-4">
        <Col span={6}>
          <Card size="small">
            <Statistic title="文章总数" value={stats?.total ?? 0} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic title="已发布" value={stats?.published ?? 0} valueStyle={{ color: '#52c41a' }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic title="总字数" value={stats?.words ?? 0} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <div className="flex flex-wrap gap-1">
              {(stats?.byPlatform ?? []).slice(0, 4).map((p) => (
                <Tag key={p.platform}>{platformLabel(p.platform)}: {p.c}</Tag>
              ))}
              {stats?.bySource?.length ? (
                <Tag color="blue">
                  {(stats.bySource ?? []).map((s) => SOURCE_META[s.source] ?? s.source).slice(0, 2).join('/')}
                </Tag>
              ) : null}
            </div>
          </Card>
        </Col>
      </Row>

      <Card>
        <Space wrap className="mb-3">
          <Input.Search
            placeholder="搜索标题 / 选题 / 摘要"
            allowClear
            style={{ width: 240 }}
            onSearch={(v) => setQuery((q) => ({ ...q, keyword: v || undefined, page: 1 }))}
          />
          <Select
            allowClear
            placeholder="平台"
            style={{ width: 140 }}
            options={PUBLISH_PLATFORMS.map((p) => ({ value: p, label: PLATFORM_LABELS[p] }))}
            onChange={(v) => setQuery((q) => ({ ...q, platform: v, page: 1 }))}
          />
          <Select
            allowClear
            placeholder="状态"
            style={{ width: 120 }}
            options={Object.entries(STATUS_META).map(([value, m]) => ({ value, label: m.label }))}
            onChange={(v) => setQuery((q) => ({ ...q, status: v, page: 1 }))}
          />
          <Select
            allowClear
            placeholder="来源"
            style={{ width: 130 }}
            options={Object.entries(SOURCE_META).map(([value, label]) => ({ value, label }))}
            onChange={(v) => setQuery((q) => ({ ...q, source: v, page: 1 }))}
          />
          <Button icon={<ReloadOutlined />} onClick={() => setQuery({ page: 1, pageSize: 20 })}>
            重置
          </Button>

          <div className="ml-auto">
            {selected.length > 0 && (
              <Popconfirm
                title={`确认删除选中的 ${selected.length} 篇文章？`}
                onConfirm={() => handleDelete(selected)}
              >
                <Button danger icon={<DeleteOutlined />}>
                  批量删除（{selected.length}）
                </Button>
              </Popconfirm>
            )}
          </div>
        </Space>

        <Table
          rowKey="id"
          loading={loading}
          dataSource={data.items}
          rowSelection={{ selectedRowKeys: selected, onChange: (keys) => setSelected(keys as number[]) }}
          pagination={{
            current: query.page,
            pageSize: query.pageSize,
            total: data.total,
            showSizeChanger: true,
            showTotal: (t) => `共 ${t} 篇`,
            onChange: (page, pageSize) => setQuery((q) => ({ ...q, page, pageSize })),
          }}
          columns={[
            {
              title: '标题',
              dataIndex: 'title',
              ellipsis: true,
              render: (v: string, r) => (
                <a onClick={() => navigate(`/articles/${r.id}`)} className="text-sm font-medium">
                  {v}
                </a>
              ),
            },
            {
              title: '平台',
              dataIndex: 'platform',
              width: 110,
              render: (v: string) => <Tag>{platformLabel(v)}</Tag>,
            },
            {
              title: '来源',
              dataIndex: 'source',
              width: 100,
              render: (v: string) => <Tag color="blue">{SOURCE_META[v] ?? v}</Tag>,
            },
            {
              title: '分类',
              dataIndex: 'category',
              width: 110,
              ellipsis: true,
              render: (v: string) => v || '—',
            },
            {
              title: '字数',
              dataIndex: 'wordCount',
              width: 80,
              align: 'right',
              render: (v: number) => v.toLocaleString(),
            },
            {
              title: '状态',
              dataIndex: 'status',
              width: 100,
              render: (v: string) => {
                const m = STATUS_META[v] ?? { label: v, color: 'default' };
                return <Tag color={m.color}>{m.label}</Tag>;
              },
            },
            {
              title: '创建时间',
              dataIndex: 'createdAt',
              width: 160,
              render: (v: string) => <span className="text-xs text-gray-500">{v}</span>,
            },
            {
              title: '操作',
              width: 190,
              fixed: 'right',
              render: (_, r) => (
                <Space size={0}>
                  <Button size="small" type="link" icon={<EditOutlined />} onClick={() => navigate(`/articles/${r.id}`)}>
                    编辑
                  </Button>
                  <Button
                    size="small"
                    type="link"
                    icon={<SendOutlined />}
                    onClick={() => navigate(`/articles/${r.id}?tab=publish`)}
                  >
                    发布
                  </Button>
                  <Button
                    size="small"
                    type="link"
                    icon={<DownloadOutlined />}
                    href={articleApi.exportUrl(r.id)}
                  />
                  <Popconfirm title="确认删除？" onConfirm={() => handleDelete([r.id])}>
                    <Button size="small" type="link" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        open={createOpen}
        title="新建文章"
        onCancel={() => setCreateOpen(false)}
        onOk={handleCreate}
        okText="创建并编辑"
        width={720}
      >
        <Form form={form} layout="vertical" initialValues={{ format: 'html', platform: 'wechat' }}>
          <Form.Item name="title" label="标题" rules={[{ required: true, message: '请填写标题' }]}>
            <Input placeholder="文章标题" />
          </Form.Item>
          <Space className="w-full" size={12}>
            <Form.Item name="platform" label="平台" className="flex-1">
              <Select options={PUBLISH_PLATFORMS.map((p) => ({ value: p, label: PLATFORM_LABELS[p] }))} />
            </Form.Item>
            <Form.Item name="format" label="格式" className="flex-1">
              <Select
                options={[
                  { value: 'html', label: 'HTML' },
                  { value: 'markdown', label: 'Markdown' },
                  { value: 'txt', label: '纯文本' },
                ]}
              />
            </Form.Item>
            <Form.Item name="category" label="分类" className="flex-1">
              <Input placeholder="可选" />
            </Form.Item>
          </Space>
          <Form.Item name="content" label="正文" rules={[{ required: true, message: '请填写正文' }]}>
            <Input.TextArea rows={10} placeholder="支持 HTML / Markdown / 纯文本" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
