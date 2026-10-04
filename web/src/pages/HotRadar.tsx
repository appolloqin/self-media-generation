import { useEffect, useState } from 'react';
import {
  Card,
  Table,
  Tabs,
  Tag,
  Button,
  Space,
  Input,
  Typography,
  Empty,
  Spin,
  Row,
  Col,
  Statistic,
  Progress,
  Alert,
  App as AntApp,
  List,
  Popconfirm,
  Drawer,
} from 'antd';
import { FireOutlined, ReloadOutlined, ThunderboltOutlined, BulbOutlined, DeleteOutlined, CheckOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { hotApi, type BlackHorse, type TrendPrediction, type TopicIdea } from '@/api';
import { useConfigStore } from '@/store/config';
import HintTip from '@/components/HintTip';

const { Text, Paragraph } = Typography;

export default function HotRadarPage() {
  const { message } = AntApp.useApp();
  const navigate = useNavigate();
  const patchConfig = useConfigStore((s) => s.patch);

  const [groups, setGroups] = useState<Awaited<ReturnType<typeof hotApi.list>>>([]);
  const [horses, setHorses] = useState<BlackHorse[]>([]);
  const [trends, setTrends] = useState<TrendPrediction[]>([]);
  const [ideas, setIdeas] = useState<TopicIdea[]>([]);
  const [loading, setLoading] = useState(false);
  const [ideaLoading, setIdeaLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [detail, setDetail] = useState<{ title: string; body: string } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [g, h, t, i] = await Promise.all([
        hotApi.list(15),
        hotApi.blackHorses(15, 12),
        hotApi.trend(15),
        hotApi.ideas(20),
      ]);
      setGroups(g);
      setHorses(h);
      setTrends(t);
      setIdeas(i);
    } catch (err) {
      message.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalTopics = groups.reduce((a, g) => a + g.topics.length, 0);
  const okPlatforms = groups.filter((g) => g.ok).length;

  const handleGenerateIdeas = async () => {
    if (!keyword.trim()) {
      message.warning('请输入关键词');
      return;
    }
    setIdeaLoading(true);
    try {
      const created = await hotApi.generateIdeas(keyword, 6);
      setIdeas((prev) => [...created, ...prev]);
      message.success(`已生成 ${created.length} 个选题灵感`);
    } catch (err) {
      message.error((err as Error).message);
    } finally {
      setIdeaLoading(false);
    }
  };

  const useTopic = (topic: string) => {
    const current = useConfigStore.getState().config;
    void patchConfig({ publishPlatform: current?.publishPlatform ?? 'wechat' });
    // 通过路由 state 直传选题，工作台自动切到「手动指定选题」并回填
    navigate('/', { state: { topic, mode: 'custom', nonce: Date.now() } });
  };

  return (
    <div className="page">
      <div className="page-heading">
        <h1 className="page-title">热点雷达</h1>
        <HintTip title="聚合微博 / 抖音 / 小红书 / 头条等平台热榜，挖掘黑马话题与趋势走向" />
      </div>

      <Row gutter={12} className="mb-4">
        <Col span={6}>
          <Card>
            <Statistic title="接入平台" value={groups.length} suffix={`/ ${okPlatforms} 正常`} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="话题总数" value={totalTopics} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="黑马话题" value={horses.length} valueStyle={{ color: '#fa8c16' }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Space direction="vertical" className="w-full">
              <Button block icon={<ReloadOutlined />} loading={loading} onClick={load}>
                刷新热榜
              </Button>
              <Button
                block
                icon={<ThunderboltOutlined />}
                onClick={async () => {
                  try {
                    const picked = await hotApi.pick(5);
                    useTopic(picked.topic);
                  } catch (err) {
                    message.error((err as Error).message);
                  }
                }}
              >
                随机选题创作
              </Button>
            </Space>
          </Card>
        </Col>
      </Row>

      <Card>
        <Tabs
          items={[
            {
              key: 'lists',
              label: `热榜（${groups.length}）`,
              children: (
                <Spin spinning={loading}>
                  {groups.length === 0 ? (
                    <Empty description="暂无数据，点击右上角刷新" />
                  ) : (
                    <Row gutter={12}>
                      {groups.map((g) => (
                        <Col xs={24} md={12} xl={8} key={g.platform} className="mb-3 min-w-0">
                          <Card
                            size="small"
                            className="hot-platform-card"
                            title={
                              <div className="flex min-w-0 items-center gap-2 overflow-hidden">
                                <span className="truncate">{g.platform}</span>
                                <Tag color={g.ok ? 'green' : 'red'} className="m-0 shrink-0">
                                  {g.ok ? `${g.topics.length} 条` : '失败'}
                                </Tag>
                              </div>
                            }
                            extra={<Text type="secondary" className="text-xs shrink-0">{g.source}</Text>}
                          >
                            {g.error && <Alert type="error" message={g.error} className="mb-2" />}
                            <List
                              size="small"
                              className="hot-topic-list"
                              dataSource={g.topics}
                              locale={{ emptyText: '暂无数据' }}
                              renderItem={(t, i) => (
                                <List.Item
                                  className="hot-topic-item cursor-pointer"
                                  onClick={() =>
                                    setDetail({
                                      title: t.name,
                                      body: `平台：${t.platform}\n排名：第 ${t.rank} 位\n热度：${t.heat}\n来源：${t.source}\n链接：${t.url || '无'}\n\n点击「用于创作」把该话题带入工作台。`,
                                    })
                                  }
                                >
                                  <div className="hot-topic-row">
                                    <Tag
                                      color={i < 3 ? 'red' : i < 10 ? 'orange' : 'default'}
                                      className="m-0 shrink-0"
                                    >
                                      {i + 1}
                                    </Tag>
                                    <span className="hot-topic-title" title={t.name}>
                                      {t.name}
                                    </span>
                                  </div>
                                </List.Item>
                              )}
                            />
                          </Card>
                        </Col>
                      ))}
                    </Row>
                  )}
                </Spin>
              ),
            },
            {
              key: 'horses',
              label: `黑马挖掘（${horses.length}）`,
              children: (
                <Spin spinning={loading}>
                  <div className="mb-3 flex items-center gap-1.5 text-sm text-ink-700">
                    黑马话题
                    <HintTip title="黑马话题 = 热度显著高于榜单均值，但排名仍在中后段，通常有 12 小时内的上升窗口" />
                  </div>
                  <Table
                    rowKey={(r) => `${r.platform}-${r.topic}`}
                    dataSource={horses}
                    pagination={false}
                    columns={[
                      { title: '平台', dataIndex: 'platform', width: 100 },
                      { title: '话题', dataIndex: 'topic', ellipsis: true },
                      { title: '当前排名', dataIndex: 'rank', width: 90, align: 'right' },
                      {
                        title: '爆发指数',
                        dataIndex: 'score',
                        width: 130,
                        render: (v: number) => (
                          <Progress percent={Math.min(100, Math.round(v * 40))} size="small" format={() => v.toFixed(2)} />
                        ),
                      },
                      {
                        title: '分析',
                        dataIndex: 'reason',
                        width: 320,
                        render: (v: string) => (
                          <Text type="secondary" ellipsis={{ tooltip: v }} className="text-xs">
                            {v}
                          </Text>
                        ),
                      },
                      {
                        title: '操作',
                        width: 90,
                        fixed: 'right',
                        render: (_, r) => (
                          <Button size="small" type="link" onClick={() => useTopic(r.topic)}>
                            用于创作
                          </Button>
                        ),
                      },
                    ]}
                  />
                </Spin>
              ),
            },
            {
              key: 'trend',
              label: `趋势预测（${trends.length}）`,
              children: (
                <Spin spinning={loading}>
                  <Table
                    rowKey={(r) => `${r.platform}-${r.topic}`}
                    dataSource={trends}
                    pagination={{ pageSize: 20 }}
                    columns={[
                      { title: '平台', dataIndex: 'platform', width: 110 },
                      { title: '话题', dataIndex: 'topic', ellipsis: true },
                      {
                        title: '走向',
                        dataIndex: 'direction',
                        width: 90,
                        render: (v: string, r) => (
                          <Tag color={v === 'up' ? 'red' : v === 'down' ? 'green' : 'default'}>
                            {v === 'up' ? `↑ 上升 ${r.delta}` : v === 'down' ? `↓ 下降 ${Math.abs(r.delta)}` : '持平'}
                          </Tag>
                        ),
                      },
                      { title: '热度', dataIndex: 'heat', width: 110, align: 'right' },
                      {
                        title: '操作',
                        width: 90,
                        render: (_, r) => (
                          <Button size="small" type="link" onClick={() => useTopic(r.topic)}>
                            用于创作
                          </Button>
                        ),
                      },
                    ]}
                  />
                </Spin>
              ),
            },
            {
              key: 'ideas',
              label: `选题灵感（${ideas.length}）`,
              children: (
                <div>
                  <Space className="mb-3 w-full">
                    <Input
                      placeholder="输入关键词，基于素材文库挖掘选题"
                      value={keyword}
                      onChange={(e) => setKeyword(e.target.value)}
                      onPressEnter={handleGenerateIdeas}
                      style={{ maxWidth: 320 }}
                    />
                    <Button
                      type="primary"
                      icon={<BulbOutlined />}
                      loading={ideaLoading}
                      onClick={handleGenerateIdeas}
                    >
                      生成选题
                    </Button>
                  </Space>
                  {ideas.length === 0 ? (
                    <Empty description="还没有选题灵感，先去素材文库采集一些参考文章" />
                  ) : (
                    <List
                      dataSource={ideas}
                      renderItem={(idea) => (
                        <List.Item
                          actions={[
                            <Button key="use" size="small" type="link" onClick={() => useTopic(idea.topic)}>
                              用于创作
                            </Button>,
                            <Popconfirm
                              key="del"
                              title="删除该选题？"
                              onConfirm={async () => {
                                await hotApi.removeIdea(idea.id);
                                setIdeas((prev) => prev.filter((i) => i.id !== idea.id));
                              }}
                            >
                              <Button size="small" type="link" danger icon={<DeleteOutlined />} />
                            </Popconfirm>,
                          ]}
                        >
                          <List.Item.Meta
                            title={
                              <div className="flex min-w-0 flex-wrap items-center gap-2">
                                <span className="min-w-0 break-words">{idea.topic}</span>
                                <Tag color={idea.score >= 80 ? 'green' : idea.score >= 60 ? 'blue' : 'default'} className="m-0 shrink-0">
                                  {idea.score} 分
                                </Tag>
                                {idea.status === 1 && <Tag color="purple" className="m-0 shrink-0">已采用</Tag>}
                              </div>
                            }
                            description={
                              <div className="min-w-0 text-xs">
                                {idea.reason && (
                                  <Paragraph ellipsis={{ rows: 2, tooltip: idea.reason }} className="!mb-1">
                                    {idea.reason}
                                  </Paragraph>
                                )}
                                {idea.angles && (
                                  <Text type="secondary" ellipsis={{ tooltip: idea.angles }} className="block">
                                    切入角度：{idea.angles}
                                  </Text>
                                )}
                              </div>
                            }
                          />
                        </List.Item>
                      )}
                    />
                  )}
                </div>
              ),
            },
          ]}
        />
      </Card>

      <Drawer
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title="话题详情"
        width={480}
        extra={
          <Button
            type="primary"
            size="small"
            onClick={() => {
              const topic = detail?.title ?? '';
              setDetail(null);
              useTopic(topic);
            }}
          >
            用于创作
          </Button>
        }
      >
        {detail && (
          <div>
            <h3 className="mb-3 text-base font-semibold">{detail.title}</h3>
            <pre className="whitespace-pre-wrap text-xs text-gray-600">{detail.body}</pre>
          </div>
        )}
      </Drawer>
    </div>
  );
}
