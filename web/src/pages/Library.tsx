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
  Table,
  Tabs,
  Drawer,
  Descriptions,
  Badge,
  Tooltip,
  Statistic,
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  ReloadOutlined,
  LinkOutlined,
  CloudDownloadOutlined,
  EditOutlined,
  SearchOutlined,
  GlobalOutlined,
  FileTextOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { libraryApi } from '@/api';
import HintTip from '@/components/HintTip';
import type { LibraryAccount, LibraryArticle } from '@smg/shared';
import type { SearchResult } from '@/types/search';

const { TextArea } = Input;

type LibrarySearchHit = {
  id: number;
  title: string;
  accountName: string;
  url: string;
  digest: string;
  wordCount: number;
  score: number;
};

function isWide() {
  return typeof window !== 'undefined' && window.innerWidth >= 768;
}

export default function LibraryPage() {
  const { message, modal } = AntApp.useApp();

  const [articles, setArticles] = useState<LibraryArticle[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [keyword, setKeyword] = useState('');
  const [accountName, setAccountName] = useState('');
  const [loading, setLoading] = useState(false);

  const [accounts, setAccounts] = useState<LibraryAccount[]>([]);
  const [accLoading, setAccLoading] = useState(false);
  const [accForm] = Form.useForm();

  const [collectOpen, setCollectOpen] = useState(false);
  const [collectForm] = Form.useForm();
  const [collecting, setCollecting] = useState(false);

  const [detail, setDetail] = useState<LibraryArticle | null>(null);
  const [editing, setEditing] = useState<LibraryArticle | null>(null);
  const [editForm] = Form.useForm();

  const [searchKw, setSearchKw] = useState('');
  const [searchResults, setSearchResults] = useState<LibrarySearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [fetchUrl, setFetchUrl] = useState('');
  const [fetched, setFetched] = useState<SearchResult | null>(null);
  const [fetching, setFetching] = useState(false);

  /* ---------------- 素材列表 ---------------- */

  const loadArticles = async (p = page) => {
    setLoading(true);
    try {
      const res = await libraryApi.list({ page: p, pageSize, keyword: keyword || undefined, accountName: accountName || undefined });
      setArticles(res.items);
      setTotal(res.total);
    } catch (err) {
      message.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const loadAccounts = async () => {
    setAccLoading(true);
    try {
      setAccounts(await libraryApi.accounts());
    } catch (err) {
      message.error((err as Error).message);
    } finally {
      setAccLoading(false);
    }
  };

  useEffect(() => {
    void loadArticles(1);
    void loadAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const search = async () => {
    if (!keyword.trim()) return;
    setPage(1);
    void loadArticles(1);
  };

  /* ---------------- 采集 ---------------- */

  const doCollect = async () => {
    const { urls } = await collectForm.validateFields();
    const list = String(urls ?? '')
      .split('\n')
      .map((u: string) => u.trim())
      .filter(Boolean);
    if (list.length === 0) {
      message.warning('请至少填写一个链接');
      return;
    }
    setCollecting(true);
    try {
      const results = await libraryApi.collect(list);
      const okCount = results.filter((r) => r.ok).length;
      const failed = results.filter((r) => !r.ok);
      if (okCount > 0) message.success(`成功采集 ${okCount} 篇`);
      if (failed.length > 0) {
        modal.warning({
          title: `${failed.length} 个链接采集失败`,
          content: (
            <ul className="mb-0 list-disc pl-5 text-sm">
              {failed.map((f) => (
                <li key={f.url} className="break-all">
                  {f.url}：{f.error}
                </li>
              ))}
            </ul>
          ),
        });
      }
      setCollectOpen(false);
      collectForm.resetFields();
      void loadArticles(1);
    } catch (err) {
      message.error((err as Error).message);
    } finally {
      setCollecting(false);
    }
  };

  /* ---------------- 搜索 / 抓取 ---------------- */

  const doSearch = async () => {
    if (!searchKw.trim()) {
      message.warning('请输入搜索关键词');
      return;
    }
    setSearching(true);
    try {
      setSearchResults(await libraryApi.search(searchKw.trim()));
    } catch (err) {
      message.error((err as Error).message);
    } finally {
      setSearching(false);
    }
  };

  const doFetch = async () => {
    if (!fetchUrl.trim()) {
      message.warning('请输入链接');
      return;
    }
    setFetching(true);
    try {
      setFetched(await libraryApi.fetchUrl(fetchUrl.trim()));
      message.success('抓取成功');
    } catch (err) {
      message.error((err as Error).message);
    } finally {
      setFetching(false);
    }
  };

  /** 打开库内素材（搜索命中项需先取完整数据） */
  const openHit = async (hit: LibrarySearchHit) => {
    try {
      setDetail(await libraryApi.get(hit.id));
    } catch (err) {
      message.error((err as Error).message);
    }
  };

  const trackRow = (acc: LibraryAccount) => {
    modal.confirm({
      title: `跟踪「${acc.name}」`,
      content: (
        <p className="mt-2 text-sm text-gray-600">
          系统将通过该公众号的 <span className="font-mono text-xs">__biz</span> 抓取最近 10 篇文章并入库。
          {acc.biz ? '' : '（该订阅缺少 biz，请先删除后重新添加并填写 biz）'}
        </p>
      ),
      okText: '开始抓取',
      onOk: async () => {
        try {
          const results = await libraryApi.trackAccount(acc.id);
          const okCount = results.filter((r) => r.ok).length;
          if (okCount > 0) message.success(`已新增 ${okCount} 篇`);
          const failed = results.filter((r) => !r.ok);
          if (failed.length) message.warning(`${failed.length} 篇抓取失败：${failed[0].error ?? '未知原因'}`);
          void loadArticles(1);
          void loadAccounts();
        } catch (err) {
          message.error((err as Error).message);
          throw err;
        }
      },
    });
  };

  return (
    <div className="page">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="page-heading !mb-0">
          <h1 className="page-title">素材文库</h1>
          <HintTip title="公众号文章采集 · 本地检索 · 任意网页抓取 · 账号订阅追踪" />
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => { void loadArticles(); void loadAccounts(); }}>
            刷新
          </Button>
          <Button type="primary" icon={<CloudDownloadOutlined />} onClick={() => setCollectOpen(true)}>
            采集素材
          </Button>
        </Space>
      </div>

      <Tabs
        items={[
          {
            key: 'articles',
            label: (
              <span>
                <FileTextOutlined /> 素材库 ({total})
              </span>
            ),
            children: (
              <Card size="small">
                <Row gutter={12} className="mb-3">
                  <Col xs={24} md={10}>
                    <Input
                      placeholder="搜索标题 / 正文 / 标签"
                      allowClear
                      prefix={<SearchOutlined />}
                      value={keyword}
                      onChange={(e) => setKeyword(e.target.value)}
                      onPressEnter={search}
                    />
                  </Col>
                  <Col xs={12} md={7}>
                    <Select
                      allowClear
                      style={{ width: '100%' }}
                      placeholder="按公众号筛选"
                      value={accountName || undefined}
                      onChange={setAccountName}
                      options={accounts.map((a) => ({ value: a.name, label: a.name }))}
                    />
                  </Col>
                  <Col xs={12} md={7} className="flex justify-end">
                    <Space size={0}>
                      <Button type="primary" onClick={search}>
                        查询
                      </Button>
                      <Button
                        onClick={() => {
                          setKeyword('');
                          setAccountName('');
                          void loadArticles(1);
                        }}
                      >
                        重置
                      </Button>
                    </Space>
                  </Col>
                </Row>

                <Table
                  rowKey="id"
                  loading={loading}
                  dataSource={articles}
                  scroll={{ x: 900 }}
                  pagination={{
                    current: page,
                    pageSize,
                    total,
                    showSizeChanger: true,
                    showTotal: (t) => `共 ${t} 篇`,
                    onChange: (p, ps) => {
                      setPage(p);
                      setPageSize(ps);
                      void loadArticles(p);
                    },
                  }}
                  columns={[
                    {
                      title: '标题',
                      dataIndex: 'title',
                      render: (v: string, r) => (
                        <a onClick={() => setDetail(r)} className="line-clamp-2">
                          {v || '(无标题)'}
                        </a>
                      ),
                    },
                    { title: '公众号', dataIndex: 'accountName', width: 150, render: (v: string) => v || <Tag>网页</Tag> },
                    {
                      title: '作者',
                      dataIndex: 'author',
                      width: 100,
                      render: (v: string) => v || <span className="text-gray-400">—</span>,
                    },
                    { title: '字数', dataIndex: 'wordCount', width: 80 },
                    {
                      title: '标签',
                      dataIndex: 'tags',
                      width: 160,
                      render: (v: string) =>
                        v ? (
                          <Space size={4} wrap>
                            {v.split(',').filter(Boolean).map((t) => (
                              <Tag key={t}>{t}</Tag>
                            ))}
                          </Space>
                        ) : (
                          <span className="text-gray-400">—</span>
                        ),
                    },
                    {
                      title: '操作',
                      width: 190,
                      fixed: 'right',
                      render: (_, r) => (
                        <Space size={0}>
                          <Button size="small" type="link" onClick={() => setDetail(r)}>
                            查看
                          </Button>
                          <Button
                            size="small"
                            type="link"
                            icon={<EditOutlined />}
                            onClick={() => {
                              setEditing(r);
                              editForm.setFieldsValue({ title: r.title, tags: r.tags });
                            }}
                          >
                            标注
                          </Button>
                          {r.url && (
                            <Button size="small" type="link" icon={<LinkOutlined />} onClick={() => void window.open(r.url, '_blank')}>
                              原文
                            </Button>
                          )}
                          <Popconfirm
                            title="确认删除该素材？"
                            onConfirm={async () => {
                              await libraryApi.remove(r.id);
                              message.success('已删除');
                              void loadArticles(page);
                            }}
                          >
                            <Button size="small" type="link" danger icon={<DeleteOutlined />} />
                          </Popconfirm>
                        </Space>
                      ),
                    },
                  ]}
                />
              </Card>
            ),
          },
          {
            key: 'accounts',
            label: (
              <span>
                <GlobalOutlined /> 公众号订阅 ({accounts.length})
              </span>
            ),
            children: (
              <Card
                size="small"
                extra={
                  <Button
                    size="small"
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={() => {
                      accForm.resetFields();
                    }}
                  >
                    新增订阅
                  </Button>
                }
              >
                <div className="mb-3 flex items-center gap-1.5 text-sm text-ink-700">
                  公众号跟踪
                  <HintTip title="公众号跟踪：新增订阅后点击「跟踪」按钮，粘贴该公众号任意一篇文章链接即可批量抓取其历史文章。" />
                </div>

                <Form form={accForm} layout="inline" className="mb-3" onFinish={async (v) => {
                  try {
                    await libraryApi.addAccount(v);
                    message.success('订阅已添加');
                    accForm.resetFields();
                    void loadAccounts();
                  } catch (err) {
                    message.error((err as Error).message);
                  }
                }}>
                  <Form.Item name="name" rules={[{ required: true, message: '请填写公众号名称' }]}>
                    <Input placeholder="公众号名称" style={{ width: 180 }} />
                  </Form.Item>
                  <Form.Item name="biz" rules={[{ required: true, message: '请填写 biz 标识' }]}>
                    <Input placeholder="biz（如 Mz...）" style={{ width: 220 }} />
                  </Form.Item>
                  <Form.Item name="wechatId">
                    <Input placeholder="微信号（可选）" style={{ width: 160 }} />
                  </Form.Item>
                  <Form.Item>
                    <Button type="primary" htmlType="submit" icon={<PlusOutlined />}>
                      添加
                    </Button>
                  </Form.Item>
                </Form>

                <Table
                  rowKey="id"
                  loading={accLoading}
                  dataSource={accounts}
                  pagination={false}
                  locale={{ emptyText: <Empty description="暂无订阅" /> }}
                  columns={[
                    { title: '名称', dataIndex: 'name' },
                    {
                      title: 'biz',
                      dataIndex: 'biz',
                      render: (v: string) => <span className="font-mono text-xs">{v || '—'}</span>,
                    },
                    { title: '微信号', dataIndex: 'wechatId', render: (v: string) => v || <span className="text-gray-400">—</span> },
                    {
                      title: '最近抓取',
                      dataIndex: 'lastFetchAt',
                      width: 160,
                      render: (v: string | null) =>
                        v ? (
                          <span className="text-xs text-gray-500">
                            <ClockCircleOutlined /> {v}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">从未抓取</span>
                        ),
                    },
                    {
                      title: '状态',
                      dataIndex: 'enabled',
                      width: 80,
                      render: (v: number) => (v ? <Tag color="green">启用</Tag> : <Tag>停用</Tag>),
                    },
                    {
                      title: '操作',
                      width: 180,
                      render: (_, r) => (
                        <Space size={0}>
                          <Button size="small" type="link" onClick={() => trackRow(r)}>
                            跟踪
                          </Button>
                          <Button
                            size="small"
                            type="link"
                            onClick={async () => {
                              await libraryApi.toggleAccount(r.id, !r.enabled);
                              void loadAccounts();
                            }}
                          >
                            {r.enabled ? '停用' : '启用'}
                          </Button>
                          <Popconfirm
                            title="确认删除该订阅？"
                            onConfirm={async () => {
                              await libraryApi.removeAccount(r.id);
                              message.success('已删除');
                              void loadAccounts();
                            }}
                          >
                            <Button size="small" type="link" danger icon={<DeleteOutlined />} />
                          </Popconfirm>
                        </Space>
                      ),
                    },
                  ]}
                />
              </Card>
            ),
          },
          {
            key: 'discover',
            label: (
              <span>
                <SearchOutlined /> 灵感发现
              </span>
            ),
            children: (
              <div className="space-y-4">
                <Card size="small" title="库内全文检索">
                  <Space.Compact className="w-full">
                    <Input
                      placeholder="输入关键词，在已采集素材中做全文匹配"
                      value={searchKw}
                      onChange={(e) => setSearchKw(e.target.value)}
                      onPressEnter={doSearch}
                    />
                    <Button type="primary" icon={<SearchOutlined />} loading={searching} onClick={doSearch}>
                      搜索
                    </Button>
                  </Space.Compact>
                  {searchResults.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {searchResults.map((r) => (
                        <Card key={r.id} size="small">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <a className="font-medium" onClick={() => openHit(r)}>
                                {r.title}
                              </a>
                              <div className="mt-0.5 text-xs text-gray-500">
                                {r.accountName || '网页'} · {r.wordCount} 字
                                <Tag color="blue" className="ml-2">
                                  相关度 {r.score.toFixed(1)}
                                </Tag>
                              </div>
                              {r.digest && <p className="mb-0 mt-1 line-clamp-2 text-xs text-gray-600">{r.digest}</p>}
                            </div>
                            <Space size={0}>
                              <Button size="small" onClick={() => openHit(r)}>
                                查看
                              </Button>
                              {r.url && (
                                <Button size="small" icon={<LinkOutlined />} onClick={() => void window.open(r.url, '_blank')}>
                                  原文
                                </Button>
                              )}
                            </Space>
                          </div>
                        </Card>
                      ))}
                    </div>
                  )}
                </Card>

                <Card size="small" title="抓取任意网页正文（不落库）">
                  <Space.Compact className="w-full">
                    <Input
                      placeholder="粘贴任意文章链接（需可公开访问）"
                      value={fetchUrl}
                      onChange={(e) => setFetchUrl(e.target.value)}
                      onPressEnter={doFetch}
                    />
                    <Button type="primary" icon={<CloudDownloadOutlined />} loading={fetching} onClick={doFetch}>
                      抓取
                    </Button>
                  </Space.Compact>
                  {fetched && (
                    <Card size="small" className="mt-3" title={fetched.title}>
                      <div className="mb-2 text-xs text-gray-500">
                        {fetched.publishedAt || '发布时间未知'} · {fetched.images.length} 张配图
                        {fetched.url && (
                          <a href={fetched.url} target="_blank" rel="noreferrer" className="ml-2">
                            查看原文
                          </a>
                        )}
                      </div>
                      {fetched.summary && <p className="text-sm text-gray-600">{fetched.summary}</p>}
                      <div
                        className="prose-content max-h-[420px] overflow-y-auto"
                        dangerouslySetInnerHTML={{ __html: fetched.content }}
                      />
                    </Card>
                  )}
                </Card>
              </div>
            ),
          },
        ]}
      />

      {/* 采集弹窗 */}
      <Modal
        open={collectOpen}
        title="采集素材"
        onCancel={() => setCollectOpen(false)}
        onOk={doCollect}
        confirmLoading={collecting}
        okText="开始采集"
        width={600}
      >
        <Form form={collectForm} layout="vertical">
          <Form.Item
            name="urls"
            label={
              <span className="inline-flex items-center gap-1.5">
                文章链接（每行一个）
                <HintTip title="支持微信公众号文章（mp.weixin.qq.com/s/...）等可公开访问的页面" />
              </span>
            }
            rules={[{ required: true, message: '请至少填写一个链接' }]}
          >
            <TextArea rows={8} placeholder={'https://mp.weixin.qq.com/s/xxxxx\nhttps://mp.weixin.qq.com/s/yyyyy'} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 编辑标注 */}
      <Modal
        open={Boolean(editing)}
        title="标注素材"
        onCancel={() => setEditing(null)}
        onOk={async () => {
          if (!editing) return;
          const v = await editForm.validateFields();
          await libraryApi.update(editing.id, v);
          message.success('已保存');
          setEditing(null);
          void loadArticles(page);
        }}
        okText="保存"
      >
        <Form form={editForm} layout="vertical">
          <Form.Item name="title" label="标题">
            <Input />
          </Form.Item>
          <Form.Item name="tags" label="标签（逗号分隔）">
            <Input placeholder="如：爆款,标题技巧,可复用结构" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 素材详情 */}
      <Drawer
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        width={isWide() ? 720 : '100%'}
        title={detail?.title || '素材详情'}
      >
        {detail && (
          <div>
            <Descriptions column={1} size="small" className="mb-4">
              <Descriptions.Item label="公众号">{detail.accountName || '网页'}</Descriptions.Item>
              <Descriptions.Item label="作者">{detail.author || '—'}</Descriptions.Item>
              <Descriptions.Item label="字数">{detail.wordCount}</Descriptions.Item>
              <Descriptions.Item label="发布时间">{detail.publishTime || '—'}</Descriptions.Item>
              {detail.url && (
                <Descriptions.Item label="原文链接">
                  <a href={detail.url} target="_blank" rel="noreferrer">
                    {detail.url}
                  </a>
                </Descriptions.Item>
              )}
            </Descriptions>
            {detail.tags && (
              <Space size={4} wrap className="mb-3">
                {detail.tags.split(',').filter(Boolean).map((t) => (
                  <Tag key={t}>{t}</Tag>
                ))}
              </Space>
            )}
            <div
              className="prose-content"
              dangerouslySetInnerHTML={{ __html: detail.contentHtml || detail.contentText || '' }}
            />
          </div>
        )}
      </Drawer>
    </div>
  );
}
