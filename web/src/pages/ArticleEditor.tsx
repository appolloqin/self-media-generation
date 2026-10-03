import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Card,
  Tabs,
  Button,
  Space,
  Input,
  Select,
  Tag,
  Spin,
  Empty,
  Row,
  Col,
  Descriptions,
  Table,
  Upload,
  Progress,
  Alert,
  Typography,
  Modal,
  App as AntApp,
  Tooltip,
} from 'antd';
import {
  SaveOutlined,
  ArrowLeftOutlined,
  SendOutlined,
  ThunderboltOutlined,
  PictureOutlined,
  CopyOutlined,
  DownloadOutlined,
  EyeOutlined,
  HistoryOutlined,
  ExperimentOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PLATFORM_LABELS, PUBLISH_PLATFORMS, platformLabel, countChineseWords } from '@smg/shared';
import { articleApi, publishApi, layoutApi, deAiApi, imageApi, type ArticleDetail, type PublishOutcome } from '@/api';
import type { PublishPlatform } from '@smg/shared';

const { TextArea } = Input;
const { Text, Paragraph } = Typography;

export default function ArticleEditorPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { message, modal } = AntApp.useApp();

  const articleId = Number(id);
  const [article, setArticle] = useState<ArticleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [platform, setPlatform] = useState<PublishPlatform>('wechat');
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [lastOutcome, setLastOutcome] = useState<PublishOutcome | null>(null);
  const [uploading, setUploading] = useState(false);
  const [generatingCover, setGeneratingCover] = useState(false);
  const [deAiBusy, setDeAiBusy] = useState(false);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [images, setImages] = useState<{ items: { id: number; url: string; title: string }[] }>({ items: [] });

  const load = useCallback(async () => {
    if (!articleId) return;
    setLoading(true);
    try {
      const a = await articleApi.get(articleId);
      setArticle(a);
      setContent(a.content);
      setTitle(a.title);
      setPlatform(a.platform as PublishPlatform);
      setCoverUrl(a.coverPath);
      setPreviewHtml(a.content);
    } catch (err) {
      message.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [articleId, message]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void imageApi
      .list({ pageSize: 24 })
      .then((r) => setImages({ items: r.items }))
      .catch(() => undefined);
  }, []);

  const wordCount = useMemo(() => countChineseWords(content), [content]);

  const handleSave = async () => {
    if (!articleId) return;
    setSaving(true);
    try {
      const updated = await articleApi.update(articleId, { title, content, platform });
      setArticle((prev) => (prev ? { ...prev, ...updated } : prev));
      setPreviewHtml(updated.content);
      message.success('已保存');
    } catch (err) {
      message.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handlePreview = async () => {
    setPreviewLoading(true);
    try {
      const { html } = await layoutApi.local({ content, title });
      setPreviewHtml(html);
    } catch {
      setPreviewHtml(content);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleAiLayout = async () => {
    setPreviewLoading(true);
    try {
      const { html } = await layoutApi.preview({ content, title, platform });
      setPreviewHtml(html);
      message.success('AI 排版完成，可复制后替换正文');
    } catch (err) {
      message.error((err as Error).message);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleUsePreview = () => {
    modal.confirm({
      title: '用预览排版替换正文？',
      content: '当前正文将被覆盖，建议先保存。',
      onOk: () => setContent(previewHtml),
    });
  };

  const handlePublish = async () => {
    if (!articleId) return;
    setPublishing(true);
    try {
      const outcome = await publishApi.publish(articleId, platform);
      setLastOutcome(outcome);
      if (outcome.success) message.success(outcome.message);
      else message.warning(outcome.message);
      void load();
    } catch (err) {
      message.error((err as Error).message);
    } finally {
      setPublishing(false);
    }
  };

  const handleDeAi = async () => {
    setDeAiBusy(true);
    try {
      const res = await deAiApi.analyze(content);
      modal.confirm({
        title: `人工率 ${res.before.humanScore}% → ${res.after.humanScore}%`,
        content: (
          <div>
            <Paragraph className="mb-1 text-xs">共 {res.after.attempts} 轮重写，改动：</Paragraph>
            <ul className="ml-4 list-disc text-xs">
              {res.after.changes.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </div>
        ),
        okText: '应用改写结果',
        cancelText: '保留原文',
        onOk: () => {
          setContent(res.after.content);
          message.success('已应用去 AI 味结果');
        },
      });
    } catch (err) {
      message.error((err as Error).message);
    } finally {
      setDeAiBusy(false);
    }
  };

  const handleUploadCover = async (file: File) => {
    if (!articleId) return false;
    setUploading(true);
    try {
      const res = await publishApi.uploadCover(articleId, file);
      setCoverUrl(res.article.coverPath);
      message.success('封面上传成功');
    } catch (err) {
      message.error((err as Error).message);
    } finally {
      setUploading(false);
    }
    return false;
  };

  const handleGenerateCover = async () => {
    if (!articleId) return;
    setGeneratingCover(true);
    try {
      const res = await publishApi.generateCover(articleId);
      setCoverUrl(res.article.coverPath);
      message.success('封面已生成');
    } catch (err) {
      message.error((err as Error).message);
    } finally {
      setGeneratingCover(false);
    }
  };

  const insertImage = (url: string) => {
    setContent((prev) => `${prev}\n<img src="${url}" style="max-width:100%;border-radius:8px;margin:12px 0;" />\n`);
    message.success('已插入图片');
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Spin size="large" />
      </div>
    );
  }

  if (!article) return <Empty description="文章不存在" />;

  return (
    <div className="page">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/articles')}>
            返回
          </Button>
          <div className="min-w-0">
            <h1 className="page-title mb-0 max-w-[42vw] truncate">{title || '未命名'}</h1>
            <Text type="secondary" className="text-xs">
              #{article.id} · {wordCount.toLocaleString()} 字 · {platformLabel(platform)}
            </Text>
          </div>
        </Space>
        <Space wrap>
          <Button icon={<DownloadOutlined />} href={articleApi.exportUrl(article.id)}>
            导出
          </Button>
          <Button icon={<SendOutlined />} loading={publishing} onClick={handlePublish}>
            发布
          </Button>
          <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSave}>
            保存
          </Button>
        </Space>
      </div>

      {lastOutcome && (
        <Alert
          className="mb-4"
          type={lastOutcome.success ? 'success' : 'warning'}
          showIcon
          message={lastOutcome.success ? '发布成功' : '发布未完成'}
          description={
            <div className="text-xs">
              <div>{lastOutcome.message}</div>
              {lastOutcome.url && <div>链接：{lastOutcome.url}</div>}
            </div>
          }
          closable
          onClose={() => setLastOutcome(null)}
        />
      )}

      <Row gutter={16}>
        <Col xs={24} lg={12}>
          <Card
            title="正文编辑"
            extra={
              <Space size={4}>
                <Tooltip title="本地排版预览">
                  <Button size="small" icon={<EyeOutlined />} loading={previewLoading} onClick={handlePreview} />
                </Tooltip>
                <Tooltip title="AI 智能排版">
                  <Button size="small" icon={<ThunderboltOutlined />} loading={previewLoading} onClick={handleAiLayout} />
                </Tooltip>
                <Tooltip title="去 AI 味">
                  <Button size="small" icon={<ExperimentOutlined />} loading={deAiBusy} onClick={handleDeAi} />
                </Tooltip>
              </Space>
            }
          >
            <Space className="mb-3 w-full" align="start">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="文章标题"
                size="large"
                className="flex-1 font-semibold"
              />
              <Select
                value={platform}
                onChange={setPlatform}
                className="w-32"
                options={PUBLISH_PLATFORMS.map((p) => ({ value: p, label: PLATFORM_LABELS[p] }))}
              />
            </Space>

            <TextArea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="font-mono"
              style={{ minHeight: 520, fontSize: 13, lineHeight: 1.7 }}
              placeholder="支持 HTML / Markdown / 纯文本"
            />
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Tabs
            defaultActiveKey={params.get('tab') === 'publish' ? 'publish' : 'preview'}
            items={[
              {
                key: 'preview',
                label: (
                  <Space>
                    <EyeOutlined />
                    预览
                  </Space>
                ),
                children: (
                  <Card
                    size="small"
                    extra={
                      <Button size="small" icon={<CopyOutlined />} onClick={handleUsePreview}>
                        应用到正文
                      </Button>
                    }
                  >
                    <div className="phone-frame" style={{ height: 620 }}>
                      <iframe
                        title="preview"
                        srcDoc={buildPreviewDoc(previewHtml, title)}
                        sandbox="allow-same-origin"
                        style={{ width: '100%', height: '100%', border: 0 }}
                      />
                    </div>
                  </Card>
                ),
              },
              {
                key: 'publish',
                label: (
                  <Space>
                    <SendOutlined />
                    发布
                  </Space>
                ),
                children: (
                  <Space direction="vertical" className="w-full" size={12}>
                    <Card size="small" title="封面图">
                      <div className="mb-3 flex gap-3">
                        <div className="h-[100px] w-[225px] shrink-0 overflow-hidden rounded-lg bg-gray-100">
                          {coverUrl && <img src={coverUrl} alt="封面" className="h-full w-full object-cover" />}
                        </div>
                        <Space direction="vertical" size={8}>
                          <Upload
                            accept="image/*"
                            showUploadList={false}
                            beforeUpload={handleUploadCover}
                            customRequest={() => undefined}
                          >
                            <Button icon={<PictureOutlined />} loading={uploading}>
                              上传封面
                            </Button>
                          </Upload>
                          <Button
                            icon={<ThunderboltOutlined />}
                            loading={generatingCover}
                            onClick={() => void handleGenerateCover()}
                          >
                            AI 生成
                          </Button>
                        </Space>
                      </div>
                      <Text type="secondary" className="text-xs">
                        微信公众号封面建议 900×384，系统会自动裁切。AI 生成使用【系统设置 → 图片生成】中的配置。
                      </Text>
                    </Card>

                    <Card size="small" title="发布历史">
                      {article.publishHistory.length === 0 ? (
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无发布记录" />
                      ) : (
                        <Table
                          rowKey="id"
                          size="small"
                          pagination={false}
                          dataSource={article.publishHistory}
                          columns={[
                            {
                              title: '平台',
                              dataIndex: 'platform',
                              width: 100,
                              render: (v: string) => <Tag>{platformLabel(v)}</Tag>,
                            },
                            {
                              title: '结果',
                              dataIndex: 'success',
                              width: 76,
                              render: (v: number) => <Tag color={v ? 'green' : 'red'}>{v ? '成功' : '失败'}</Tag>,
                            },
                            {
                              title: '信息',
                              dataIndex: 'error',
                              render: (v: string | null) => <span className="text-xs text-gray-500">{v || '—'}</span>,
                            },
                            {
                              title: '时间',
                              dataIndex: 'createdAt',
                              width: 148,
                              render: (v: string) => <span className="text-xs">{v}</span>,
                            },
                          ]}
                        />
                      )}
                    </Card>
                  </Space>
                ),
              },
              {
                key: 'images',
                label: (
                  <Space>
                    <PictureOutlined />
                    图库
                  </Space>
                ),
                children: (
                  <div>
                    {images.items.length === 0 ? (
                      <Empty description="图库为空，请先在资源图库上传图片" />
                    ) : (
                      <div className="grid grid-cols-4 gap-2">
                        {images.items.map((img) => (
                          <div
                            key={img.id}
                            className="group relative aspect-square cursor-pointer overflow-hidden rounded-lg bg-gray-100"
                            onClick={() => insertImage(img.url)}
                          >
                            <img
                              src={img.url}
                              alt={img.title}
                              className="h-full w-full object-cover transition group-hover:scale-105"
                            />
                            <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-xs text-white opacity-0 transition group-hover:opacity-100">
                              插入
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ),
              },
              {
                key: 'meta',
                label: (
                  <Space>
                    <HistoryOutlined />
                    信息
                  </Space>
                ),
                children: (
                  <Descriptions bordered size="small" column={1}>
                    <Descriptions.Item label="选题">{article.topic || '—'}</Descriptions.Item>
                    <Descriptions.Item label="分类">{article.category || '—'}</Descriptions.Item>
                    <Descriptions.Item label="格式">{article.format}</Descriptions.Item>
                    <Descriptions.Item label="摘要">{article.summary || '—'}</Descriptions.Item>
                    <Descriptions.Item label="创建时间">{article.createdAt}</Descriptions.Item>
                    <Descriptions.Item label="更新时间">{article.updatedAt}</Descriptions.Item>
                  </Descriptions>
                ),
              },
            ]}
          />
        </Col>
      </Row>
    </div>
  );
}

function buildPreviewDoc(html: string, title: string): string {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  body{margin:0;padding:16px;background:#fff;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;color:#3a3a3a;word-break:break-word}
  img{max-width:100%;height:auto}
  p{margin:0 0 16px;line-height:1.9;text-align:justify}
  h1,h2,h3{line-height:1.5;margin:24px 0 12px}
  section{margin:0 0 16px}
  blockquote{border-left:4px solid #3a7bd5;padding-left:14px;margin:16px 0;color:#555;background:#f7faff}
  pre{background:#f7f7f7;padding:12px;border-radius:6px;overflow-x:auto}
  code{background:#f5f5f5;padding:2px 5px;border-radius:3px}
  ul,ol{padding-left:24px;line-height:1.9}
  table{width:100%;border-collapse:collapse;margin:16px 0}
  td,th{border:1px solid #e5e5e5;padding:8px}
</style></head><body>${html}</body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
