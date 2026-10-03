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
  Tabs,
  Table,
  Drawer,
  Descriptions,
  Statistic,
  Progress,
  Divider,
  Tooltip,
  InputNumber,
  Switch,
  Badge,
  Timeline,
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  ReloadOutlined,
  ThunderboltOutlined,
  FileTextOutlined,
  UserOutlined,
  BookOutlined,
  EyeOutlined,
  CopyOutlined,
  ExperimentOutlined,
  ExportOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { novelApi, type NovelDetail } from '@/api';
import HintTip from '@/components/HintTip';
import type { Novel, NovelChapter, NovelForeshadow, NovelMemory, NovelVolume, NovelCharacter } from '@smg/shared';
import { NOVEL_THEMES } from '@smg/shared';

const { TextArea } = Input;

const CHAPTER_STATUS: Record<NovelChapter['status'], { label: string; color: string }> = {
  outline: { label: '待写', color: 'default' },
  draft: { label: '草稿', color: 'processing' },
  done: { label: '完成', color: 'success' },
};

const NOVEL_STATUS: Record<Novel['status'], { label: string; color: string }> = {
  writing: { label: '连载中', color: 'processing' },
  paused: { label: '暂停', color: 'default' },
  finished: { label: '已完结', color: 'success' },
};

const MEMORY_SCOPE: Record<NovelMemory['scope'], { label: string; color: string }> = {
  short: { label: '短期', color: 'blue' },
  mid: { label: '中期', color: 'cyan' },
  global: { label: '全局', color: 'purple' },
};

export default function NovelPage() {
  const { message } = AntApp.useApp();
  const navigate = useNavigate();

  const [novels, setNovels] = useState<Novel[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [detail, setDetail] = useState<NovelDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [themes, setThemes] = useState<{ name: string; label: string; css: string; builtin: number }[]>([]);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Novel | null>(null);
  const [form] = Form.useForm();

  const [volModalOpen, setVolModalOpen] = useState(false);
  const [volForm] = Form.useForm();
  const [charModalOpen, setCharModalOpen] = useState(false);
  const [charForm] = Form.useForm();
  const [editingChar, setEditingChar] = useState<NovelCharacter | null>(null);
  const [chapterModalOpen, setChapterModalOpen] = useState(false);
  const [chapterForm] = Form.useForm();
  const [editingChapter, setEditingChapter] = useState<NovelChapter | null>(null);
  const [foreshadowModalOpen, setForeshadowModalOpen] = useState(false);
  const [foreshadowForm] = Form.useForm();
  const [memoryModalOpen, setMemoryModalOpen] = useState(false);
  const [memoryForm] = Form.useForm();
  const [busy, setBusy] = useState(false);

  const loadNovels = async () => {
    setLoading(true);
    try {
      const list = await novelApi.list();
      setNovels(list);
      setActiveId((prev) => prev ?? list[0]?.id ?? null);
    } catch (err) {
      message.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const loadDetail = async (id: number) => {
    try {
      setDetail(await novelApi.get(id));
    } catch (err) {
      message.error((err as Error).message);
    }
  };

  useEffect(() => {
    void loadNovels();
    void novelApi
      .themes()
      .then(setThemes)
      .catch(() => setThemes(NOVEL_THEMES));
  }, []);

  useEffect(() => {
    if (activeId) void loadDetail(activeId);
    else setDetail(null);
  }, [activeId]);

  const refresh = () => {
    void loadNovels();
    if (activeId) void loadDetail(activeId);
  };

  const active = novels.find((n) => n.id === activeId) ?? null;

  /* ---------------- 小说 ---------------- */

  const openEditor = (n?: Novel) => {
    setEditing(n ?? null);
    form.setFieldsValue({
      title: n?.title ?? '',
      genre: n?.genre ?? '',
      synopsis: n?.synopsis ?? '',
      worldSetting: n?.worldSetting ?? '',
      style: n?.style ?? '',
      theme: n?.theme ?? 'paper',
      targetWords: n?.targetWords ?? 300000,
      status: n?.status ?? 'writing',
    });
    setEditorOpen(true);
  };

  const submit = async () => {
    const v = await form.validateFields();
    try {
      if (editing) {
        await novelApi.update(editing.id, v);
        message.success('已更新');
      } else {
        const created = await novelApi.create(v);
        message.success('已创建');
        setActiveId(created.id);
      }
      setEditorOpen(false);
      refresh();
    } catch (err) {
      message.error((err as Error).message);
    }
  };

  /* ---------------- 卷 ---------------- */

  const openVolEditor = (v?: NovelVolume) => {
    volForm.setFieldsValue({ title: v?.title ?? '', summary: v?.summary ?? '' });
    setVolModalOpen(true);
    void v;
  };

  /* ---------------- 章节 ---------------- */

  const openChapterEditor = (c?: NovelChapter) => {
    setEditingChapter(c ?? null);
    chapterForm.setFieldsValue({
      title: c?.title ?? '',
      outline: c?.outline ?? '',
      volumeId: c?.volumeId ?? undefined,
      content: c?.content ?? '',
      status: c?.status ?? 'outline',
    });
    setChapterModalOpen(true);
  };

  const submitChapter = async () => {
    if (!activeId) return;
    const v = await chapterForm.validateFields();
    try {
      if (editingChapter) {
        await novelApi.updateChapter(editingChapter.id, v);
        message.success('章节已更新');
      } else {
        await novelApi.addChapter(activeId, { title: v.title, outline: v.outline, volumeId: v.volumeId ?? null });
        message.success('章节已创建');
      }
      setChapterModalOpen(false);
      refresh();
    } catch (err) {
      message.error((err as Error).message);
    }
  };

  const writeChapter = async (c: NovelChapter) => {
    setBusy(true);
    try {
      const updated = await novelApi.writeChapter(c.id);
      message.success(`已生成 ${updated.wordCount} 字初稿`);
      refresh();
    } catch (err) {
      message.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const planNext = async () => {
    if (!activeId) return;
    setBusy(true);
    try {
      const created = await novelApi.planNext(activeId, 1);
      message.success(`已规划下一章：${created[0]?.title ?? ''}`);
      refresh();
    } catch (err) {
      message.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const chapterToArticle = async (c: NovelChapter) => {
    try {
      const art = await novelApi.chapterToArticle(c.id, 'fanqie', 'txt');
      message.success('已转为文章');
      navigate(`/articles/${art.id}`);
    } catch (err) {
      message.error((err as Error).message);
    }
  };

  const distill = async () => {
    if (!activeId) return;
    setBusy(true);
    try {
      const res = await novelApi.distill(activeId);
      message.success(res.created > 0 ? `已提炼 ${res.created} 条记忆` : '暂无可提炼的内容');
      refresh();
    } catch (err) {
      message.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="page-heading !mb-0">
          <h1 className="page-title">小说连载</h1>
          <HintTip title="长篇创作 · 人物设定 · 伏笔管理 · 记忆蒸馏 · 章节转稿" />
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={refresh}>
            刷新
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openEditor()}>
            新建小说
          </Button>
        </Space>
      </div>

      <Row gutter={16}>
        <Col xs={24} lg={7} xl={6}>
          <Card size="small" title={`作品列表 (${novels.length})`} loading={loading}>
            <div className="space-y-2">
              {novels.map((n) => (
                <Card
                  key={n.id}
                  size="small"
                  hoverable
                  className={`card-interactive ${n.id === activeId ? 'is-active' : ''}`}
                  onClick={() => setActiveId(n.id)}
                >
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="truncate font-medium">{n.title}</span>
                    <Badge status={NOVEL_STATUS[n.status].color as 'processing'} text={NOVEL_STATUS[n.status].label} />
                  </div>
                  <div className="mt-0.5 text-xs text-gray-500">
                    {n.genre || '未分类'} · {n.finishedWords.toLocaleString()} 字
                  </div>
                  {n.targetWords > 0 && (
                    <Progress
                      percent={Math.min(100, Math.round((n.finishedWords / n.targetWords) * 100))}
                      size="small"
                      showInfo={false}
                      className="!mb-0 !mt-1"
                    />
                  )}
                </Card>
              ))}
              {novels.length === 0 && !loading && <Empty description="暂无作品" />}
            </div>
          </Card>
        </Col>

        <Col xs={24} lg={17} xl={18}>
          {!active || !detail ? (
            <Card>
              <Empty description="请选择或创建一部作品" />
            </Card>
          ) : (
            <div className="space-y-4">
              {/* 概览 */}
              <Card
                size="small"
                extra={
                  <Space size={0}>
                    <Button size="small" icon={<EditOutlined />} onClick={() => openEditor(active)}>
                      编辑
                    </Button>
                    <Popconfirm
                      title="确认删除该作品？"
                      description="将同时删除其卷、人物、章节、伏笔与记忆"
                      onConfirm={async () => {
                        await novelApi.remove(active.id);
                        message.success('已删除');
                        setActiveId(null);
                        refresh();
                      }}
                    >
                      <Button size="small" type="link" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                  </Space>
                }
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-base font-semibold">{active.title}</span>
                  <Tag color="blue">{active.genre || '未分类'}</Tag>
                  <Tag>{NOVEL_STATUS[active.status].label}</Tag>
                  {themes.find((t) => t.name === active.theme) && (
                    <Tag color="purple">{(themes.find((t) => t.name === active.theme) as { label: string }).label}</Tag>
                  )}
                </div>
                {active.synopsis && <p className="mb-0 mt-1 text-sm text-gray-600">{active.synopsis}</p>}
                <Row gutter={12} className="mt-3">
                  <Col span={6}>
                    <Statistic title="已写字数" value={active.finishedWords} valueStyle={{ fontSize: 18 }} />
                  </Col>
                  <Col span={6}>
                    <Statistic title="目标字数" value={active.targetWords} valueStyle={{ fontSize: 18 }} />
                  </Col>
                  <Col span={6}>
                    <Statistic title="章节数" value={detail.chapters.length} valueStyle={{ fontSize: 18 }} />
                  </Col>
                  <Col span={6}>
                    <Statistic title="人物数" value={detail.characters.length} valueStyle={{ fontSize: 18 }} />
                  </Col>
                </Row>
              </Card>

              <Tabs
                defaultActiveKey="chapters"
                items={[
                  {
                    key: 'chapters',
                    label: (
                      <span>
                        <FileTextOutlined /> 章节 ({detail.chapters.length})
                      </span>
                    ),
                    children: (
                      <Card
                        size="small"
                        extra={
                          <Space size={0}>
                            <Button size="small" icon={<ThunderboltOutlined />} loading={busy} onClick={planNext}>
                              AI 规划下一章
                            </Button>
                            <Button
                              size="small"
                              type="primary"
                              icon={<PlusOutlined />}
                              onClick={() => openChapterEditor()}
                            >
                              新建章节
                            </Button>
                          </Space>
                        }
                      >
                        {detail.chapters.length > 0 ? (
                          <Table
                            rowKey="id"
                            size="small"
                            pagination={{ pageSize: 12 }}
                            dataSource={detail.chapters}
                            columns={[
                              {
                                title: '标题',
                                dataIndex: 'title',
                                render: (v: string, r) => (
                                  <Space>
                                    <span className="text-xs text-gray-400">#{r.orderIndex}</span>
                                    <span className="font-medium">{v}</span>
                                    <Tag color={CHAPTER_STATUS[r.status].color}>{CHAPTER_STATUS[r.status].label}</Tag>
                                  </Space>
                                ),
                              },
                              { title: '字数', dataIndex: 'wordCount', width: 80 },
                              {
                                title: '所属卷',
                                width: 130,
                                render: (_, r) => {
                                  const vol = detail.volumes.find((v) => v.id === r.volumeId);
                                  return vol ? <Tag>{vol.title}</Tag> : <span className="text-xs text-gray-400">—</span>;
                                },
                              },
                              {
                                title: '操作',
                                width: 230,
                                render: (_, r) => (
                                  <Space size={0}>
                                    <Button
                                      size="small"
                                      type="link"
                                      icon={<ThunderboltOutlined />}
                                      loading={busy}
                                      disabled={r.status === 'done' && r.wordCount > 0}
                                      onClick={() => writeChapter(r)}
                                    >
                                      续写
                                    </Button>
                                    <Button size="small" type="link" icon={<EditOutlined />} onClick={() => openChapterEditor(r)}>
                                      编辑
                                    </Button>
                                    <Button size="small" type="link" icon={<ExportOutlined />} onClick={() => chapterToArticle(r)}>
                                      转稿
                                    </Button>
                                    <Popconfirm
                                      title="确认删除该章节？"
                                      onConfirm={async () => {
                                        await novelApi.removeChapter(r.id);
                                        message.success('已删除');
                                        refresh();
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
                          <Empty description="暂无章节，点击「AI 规划下一章」或「新建章节」开始" />
                        )}
                      </Card>
                    ),
                  },
                  {
                    key: 'volumes',
                    label: (
                      <span>
                        <BookOutlined /> 分卷 ({detail.volumes.length})
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
                              volForm.resetFields();
                              setVolModalOpen(true);
                            }}
                          >
                            新建卷
                          </Button>
                        }
                      >
                        {detail.volumes.length > 0 ? (
                          <div className="space-y-2">
                            {detail.volumes.map((v) => {
                              const chs = detail.chapters.filter((c) => c.volumeId === v.id);
                              const words = chs.reduce((a, c) => a + c.wordCount, 0);
                              return (
                                <div key={v.id} className="rounded border p-3">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <Space>
                                      <Tag>{v.orderIndex}</Tag>
                                      <span className="font-medium">{v.title}</span>
                                      <span className="text-xs text-gray-500">
                                        {chs.length} 章 · {words.toLocaleString()} 字
                                      </span>
                                    </Space>
                                    <Space size={0}>
                                      <Button
                                        size="small"
                                        type="link"
                                        icon={<EditOutlined />}
                                        onClick={() => openVolEditor(v)}
                                      >
                                        编辑
                                      </Button>
                                      <Popconfirm
                                        title="确认删除该卷？"
                                        onConfirm={async () => {
                                          await novelApi.removeVolume(v.id);
                                          message.success('已删除');
                                          refresh();
                                        }}
                                      >
                                        <Button size="small" type="link" danger icon={<DeleteOutlined />} />
                                      </Popconfirm>
                                    </Space>
                                  </div>
                                  {v.summary && <p className="mb-0 mt-1 text-sm text-gray-600">{v.summary}</p>}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <Empty description="暂无分卷" />
                        )}
                      </Card>
                    ),
                  },
                  {
                    key: 'characters',
                    label: (
                      <span>
                        <UserOutlined /> 人物 ({detail.characters.length})
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
                              setEditingChar(null);
                              charForm.resetFields();
                              setCharModalOpen(true);
                            }}
                          >
                            新建人物
                          </Button>
                        }
                      >
                        {detail.characters.length > 0 ? (
                          <div className="grid gap-3 md:grid-cols-2">
                            {detail.characters.map((c) => (
                              <Card key={c.id} size="small">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <Space>
                                    <span className="font-medium">{c.name}</span>
                                    {c.role && <Tag color="blue">{c.role}</Tag>}
                                  </Space>
                                  <Space size={0}>
                                    <Button
                                      size="small"
                                      type="link"
                                      icon={<EditOutlined />}
                                      onClick={() => {
                                        setEditingChar(c);
                                        charForm.setFieldsValue({
                                          name: c.name,
                                          role: c.role,
                                          appearance: c.appearance,
                                          personality: c.personality,
                                          background: c.background,
                                          motivation: c.motivation,
                                          speechStyle: c.speechStyle,
                                          arc: c.arc,
                                        });
                                        setCharModalOpen(true);
                                      }}
                                    >
                                      编辑
                                    </Button>
                                    <Popconfirm
                                      title="确认删除该人物？"
                                      onConfirm={async () => {
                                        await novelApi.removeCharacter(c.id);
                                        message.success('已删除');
                                        refresh();
                                      }}
                                    >
                                      <Button size="small" type="link" danger icon={<DeleteOutlined />} />
                                    </Popconfirm>
                                  </Space>
                                </div>
                                <div className="mt-2 space-y-1 text-xs text-gray-600">
                                  {c.appearance && <div>外貌：{c.appearance}</div>}
                                  {c.personality && <div>性格：{c.personality}</div>}
                                  {c.motivation && <div>动机：{c.motivation}</div>}
                                  {c.speechStyle && <div>语言风格：{c.speechStyle}</div>}
                                  {c.background && <div>背景：{c.background}</div>}
                                  {c.arc && <div>成长弧线：{c.arc}</div>}
                                </div>
                              </Card>
                            ))}
                          </div>
                        ) : (
                          <Empty description="暂无人物设定" />
                        )}
                      </Card>
                    ),
                  },
                  {
                    key: 'foreshadows',
                    label: (
                      <span>
                        <EyeOutlined /> 伏笔 ({detail.foreshadows.length})
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
                              foreshadowForm.resetFields();
                              setForeshadowModalOpen(true);
                            }}
                          >
                            埋设伏笔
                          </Button>
                        }
                      >
                        {detail.foreshadows.length > 0 ? (
                          <Table
                            rowKey="id"
                            size="small"
                            pagination={false}
                            dataSource={detail.foreshadows}
                            columns={[
                              {
                                title: '伏笔',
                                dataIndex: 'name',
                                render: (v: string, r) => (
                                  <Space>
                                    <span className="font-medium">{v}</span>
                                    <Tag color={r.status === 'resolved' ? 'green' : 'orange'}>
                                      {r.status === 'resolved' ? '已回收' : '待回收'}
                                    </Tag>
                                  </Space>
                                ),
                              },
                              {
                                title: '埋设',
                                dataIndex: 'plantChapter',
                                width: 140,
                                render: (v: string) => v || <span className="text-xs text-gray-400">—</span>,
                              },
                              {
                                title: '回收',
                                dataIndex: 'payoffChapter',
                                width: 140,
                                render: (v: string) => v || <span className="text-xs text-gray-400">—</span>,
                              },
                              {
                                title: '说明',
                                dataIndex: 'description',
                                render: (v: string) => v || <span className="text-xs text-gray-400">—</span>,
                              },
                              {
                                title: '操作',
                                width: 170,
                                render: (_, r) => (
                                  <Space size={0}>
                                    <Button
                                      size="small"
                                      type="link"
                                      onClick={async () => {
                                        await novelApi.updateForeshadow(r.id, {
                                          status: r.status === 'resolved' ? 'planted' : 'resolved',
                                        });
                                        refresh();
                                      }}
                                    >
                                      {r.status === 'resolved' ? '标记未回收' : '标记已回收'}
                                    </Button>
                                    <Popconfirm
                                      title="确认删除该伏笔？"
                                      onConfirm={async () => {
                                        await novelApi.removeForeshadow(r.id);
                                        message.success('已删除');
                                        refresh();
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
                          <Empty description="暂无伏笔" />
                        )}
                      </Card>
                    ),
                  },
                  {
                    key: 'memories',
                    label: (
                      <span>
                        <ExperimentOutlined /> 记忆 ({detail.memories.length})
                      </span>
                    ),
                    children: (
                      <Card
                        size="small"
                        extra={
                          <Space size={0}>
                            <Button size="small" icon={<ThunderboltOutlined />} loading={busy} onClick={distill}>
                              AI 提炼记忆
                            </Button>
                            <Button
                              size="small"
                              type="primary"
                              icon={<PlusOutlined />}
                              onClick={() => {
                                memoryForm.resetFields();
                                setMemoryModalOpen(true);
                              }}
                            >
                              手动添加
                            </Button>
                          </Space>
                        }
                      >
                        <div className="mb-3 flex items-center gap-1.5 text-sm text-ink-700">
                          记忆
                          <HintTip title="记忆是 AI 续写时的长期上下文，点击「AI 提炼记忆」会从已完成章节中自动总结关键设定。" />
                        </div>
                        {detail.memories.length > 0 ? (
                          <div className="space-y-2">
                            {detail.memories.map((m) => (
                              <div key={m.id} className="rounded border p-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <Space>
                                    <Tag color={MEMORY_SCOPE[m.scope].color}>{MEMORY_SCOPE[m.scope].label}</Tag>
                                    <span className="font-medium">{m.title}</span>
                                  </Space>
                                  <Space size={0}>
                                    <Popconfirm
                                      title="确认删除该记忆？"
                                      onConfirm={async () => {
                                        await novelApi.removeMemory(m.id);
                                        message.success('已删除');
                                        refresh();
                                      }}
                                    >
                                      <Button size="small" type="link" danger icon={<DeleteOutlined />} />
                                    </Popconfirm>
                                  </Space>
                                </div>
                                <p className="mb-0 mt-1 whitespace-pre-wrap text-sm text-gray-600">{m.content}</p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <Empty description="暂无记忆" />
                        )}
                      </Card>
                    ),
                  },
                  {
                    key: 'settings',
                    label: (
                      <span>
                        <BookOutlined /> 设定
                      </span>
                    ),
                    children: (
                      <Card size="small" title="世界观与风格">
                        <Descriptions column={1} bordered size="small">
                          <Descriptions.Item label="题材">
                            {active.genre || <span className="text-gray-400">—</span>}
                          </Descriptions.Item>
                          <Descriptions.Item label="文案风格">
                            {active.style || <span className="text-gray-400">—</span>}
                          </Descriptions.Item>
                          <Descriptions.Item label="阅读主题">
                            {themes.find((t) => t.name === active.theme)?.label ?? active.theme ?? '—'}
                          </Descriptions.Item>
                          <Descriptions.Item label="世界观设定">
                            <span className="whitespace-pre-wrap">{active.worldSetting || '—'}</span>
                          </Descriptions.Item>
                          <Descriptions.Item label="梗概">
                            <span className="whitespace-pre-wrap">{active.synopsis || '—'}</span>
                          </Descriptions.Item>
                        </Descriptions>
                      </Card>
                    ),
                  },
                ]}
              />
            </div>
          )}
        </Col>
      </Row>

      {/* 小说编辑 */}
      <Modal
        open={editorOpen}
        title={editing ? `编辑：${editing.title}` : '新建小说'}
        onCancel={() => setEditorOpen(false)}
        onOk={submit}
        okText="保存"
        width={680}
      >
        <Form form={form} layout="vertical">
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="title" label="书名" rules={[{ required: true, message: '请填写书名' }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="genre" label="题材">
                <Input placeholder="如：都市玄幻" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="synopsis" label="梗概">
            <TextArea rows={3} placeholder="一句话或一段话说明本书卖点" />
          </Form.Item>
          <Form.Item name="worldSetting" label="世界观设定">
            <TextArea rows={5} placeholder="力量体系、地理、历史、主要势力等" />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="style" label="语言风格">
                <Input placeholder="如：冷峻、快节奏、多短句" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="theme" label="阅读主题">
                <Select options={(themes.length ? themes : NOVEL_THEMES).map((t) => ({ value: t.name, label: t.label }))} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="targetWords" label="目标字数">
                <InputNumber className="w-full" min={10000} step={10000} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="status" label="状态">
            <Select
              options={(Object.keys(NOVEL_STATUS) as Novel['status'][]).map((s) => ({
                value: s,
                label: NOVEL_STATUS[s].label,
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 卷编辑 */}
      <Modal
        open={volModalOpen}
        title="新建卷"
        onCancel={() => setVolModalOpen(false)}
        onOk={async () => {
          if (!activeId) return;
          const v = await volForm.validateFields();
          try {
            await novelApi.addVolume(activeId, v);
            message.success('已创建');
            setVolModalOpen(false);
            refresh();
          } catch (err) {
            message.error((err as Error).message);
          }
        }}
        okText="创建"
      >
        <Form form={volForm} layout="vertical">
          <Form.Item name="title" label="卷名" rules={[{ required: true, message: '请填写卷名' }]}>
            <Input placeholder="如：第一卷 风起苍梧" />
          </Form.Item>
          <Form.Item name="summary" label="本卷概要">
            <TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 人物编辑 */}
      <Modal
        open={charModalOpen}
        title={editingChar ? `编辑人物：${editingChar.name}` : '新建人物'}
        onCancel={() => setCharModalOpen(false)}
        onOk={async () => {
          if (!activeId) return;
          const v = await charForm.validateFields();
          try {
            if (editingChar) {
              await novelApi.updateCharacter(editingChar.id, v);
              message.success('已更新');
            } else {
              await novelApi.addCharacter(activeId, v);
              message.success('已创建');
            }
            setCharModalOpen(false);
            refresh();
          } catch (err) {
            message.error((err as Error).message);
          }
        }}
        okText="保存"
        width={640}
      >
        <Form form={charForm} layout="vertical">
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="name" label="姓名" rules={[{ required: true, message: '请填写姓名' }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="role" label="定位">
                <Input placeholder="如：主角 / 反派 / 配角" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="appearance" label="外貌">
                <TextArea rows={2} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="personality" label="性格">
                <TextArea rows={2} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="motivation" label="核心动机">
                <TextArea rows={2} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="speechStyle" label="语言风格">
                <TextArea rows={2} placeholder="如：短句、少用形容词、方言口吻" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="background" label="背景">
            <TextArea rows={3} />
          </Form.Item>
          <Form.Item name="arc" label="成长弧线">
            <TextArea rows={3} placeholder="从什么状态到什么状态" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 章节编辑 */}
      <Modal
        open={chapterModalOpen}
        title={editingChapter ? `编辑章节：${editingChapter.title}` : '新建章节'}
        onCancel={() => setChapterModalOpen(false)}
        onOk={submitChapter}
        okText="保存"
        width={760}
      >
        <Form form={chapterForm} layout="vertical">
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="title" label="章节标题" rules={[{ required: true, message: '请填写标题' }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="volumeId" label="所属卷">
                <Select
                  allowClear
                  placeholder="不指定"
                  options={detail?.volumes.map((v) => ({ value: v.id, label: v.title }))}
                />
              </Form.Item>
            </Col>
            <Col span={4}>
              <Form.Item name="status" label="状态">
                <Select
                  options={(Object.keys(CHAPTER_STATUS) as NovelChapter['status'][]).map((s) => ({
                    value: s,
                    label: CHAPTER_STATUS[s].label,
                  }))}
                />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="outline" label="章节大纲">
            <TextArea rows={5} placeholder="本章要发生什么、冲突如何推进、结尾留什么钩子" />
          </Form.Item>
          <Form.Item
            name="content"
            label={
              <span className="inline-flex items-center gap-1.5">
                章节正文
                <HintTip title="留空则可使用「续写」由 AI 生成初稿" />
              </span>
            }
          >
            <TextArea rows={12} className="font-mono text-xs" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 伏笔 */}
      <Modal
        open={foreshadowModalOpen}
        title="埋设伏笔"
        onCancel={() => setForeshadowModalOpen(false)}
        onOk={async () => {
          if (!activeId) return;
          const v = await foreshadowForm.validateFields();
          try {
            await novelApi.addForeshadow(activeId, v);
            message.success('已添加');
            setForeshadowModalOpen(false);
            refresh();
          } catch (err) {
            message.error((err as Error).message);
          }
        }}
        okText="添加"
      >
        <Form form={foreshadowForm} layout="vertical" initialValues={{ status: 'planted' }}>
          <Form.Item name="name" label="伏笔名" rules={[{ required: true, message: '请填写伏笔名' }]}>
            <Input placeholder="如：父亲留下的铜钥匙" />
          </Form.Item>
          <Form.Item name="description" label="说明">
            <TextArea rows={3} />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="plantChapter" label="埋设章节">
                <Input placeholder="如：第 3 章" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="payoffChapter" label="计划回收章节">
                <Input placeholder="如：第 28 章" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* 记忆 */}
      <Modal
        open={memoryModalOpen}
        title="添加记忆"
        onCancel={() => setMemoryModalOpen(false)}
        onOk={async () => {
          if (!activeId) return;
          const v = await memoryForm.validateFields();
          try {
            await novelApi.addMemory(activeId, v);
            message.success('已添加');
            setMemoryModalOpen(false);
            refresh();
          } catch (err) {
            message.error((err as Error).message);
          }
        }}
        okText="添加"
      >
        <Form form={memoryForm} layout="vertical" initialValues={{ scope: 'global' }}>
          <Form.Item name="scope" label="作用范围">
            <Select
              options={(Object.keys(MEMORY_SCOPE) as NovelMemory['scope'][]).map((s) => ({
                value: s,
                label: `${MEMORY_SCOPE[s].label}记忆`,
              }))}
            />
          </Form.Item>
          <Form.Item name="title" label="标题" rules={[{ required: true, message: '请填写标题' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="content" label="内容" rules={[{ required: true, message: '请填写内容' }]}>
            <TextArea rows={5} placeholder="续写时会作为上下文提供给模型" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
