import { useEffect, useState } from 'react';
import {
  Card,
  Table,
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
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  CopyOutlined,
  EditOutlined,
  FolderAddOutlined,
  ReloadOutlined,
  EyeOutlined,
} from '@ant-design/icons';
import { templateApi, type TemplateType } from '@/api';
import HintTip from '@/components/HintTip';
import { templateCategoryLabel as categoryLabel } from '@smg/shared';

export default function TemplatePage() {
  const { message, modal } = AntApp.useApp();

  const [categories, setCategories] = useState<{ name: string; templateCount: number }[]>([]);
  const [activeCat, setActiveCat] = useState<string | undefined>();
  const [templates, setTemplates] = useState<TemplateType[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<TemplateType | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [form] = Form.useForm();
  const [catForm] = Form.useForm();

  const loadCats = async () => {
    try {
      setCategories(await templateApi.categories());
    } catch (err) {
      message.error((err as Error).message);
    }
  };

  const loadTemplates = async () => {
    setLoading(true);
    try {
      setTemplates(await templateApi.list(activeCat));
    } catch (err) {
      message.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCats();
  }, []);

  useEffect(() => {
    void loadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCat]);

  const openEditor = (tpl?: TemplateType) => {
    setEditing(tpl ?? null);
    form.setFieldsValue({
      name: tpl?.name ?? '',
      category: tpl?.category ?? activeCat ?? categories[0]?.name ?? 'Others',
      content: tpl?.content ?? '',
    });
    setEditorOpen(true);
  };

  const submit = async () => {
    const values = await form.validateFields();
    try {
      if (editing) {
        await templateApi.update(editing.id, values);
        message.success('模板已更新');
      } else {
        await templateApi.create(values);
        message.success('模板已创建');
      }
      setEditorOpen(false);
      void loadTemplates();
      void loadCats();
    } catch (err) {
      message.error((err as Error).message);
    }
  };

  const preview = (tpl: TemplateType) => {
    modal.info({
      title: tpl.name,
      width: 460,
      content: (
        <div
          className="mt-3 max-h-[60vh] overflow-y-auto rounded-lg border p-3"
          dangerouslySetInnerHTML={{
            __html: `<style>body{font-family:sans-serif;font-size:14px;line-height:1.8}p{margin:0 0 10px}</style>${tpl.content}`,
          }}
        />
      ),
    });
  };

  return (
    <div className="page">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title mb-0">模板中心</h1>
          <p className="page-subtitle mb-0">
            共 {categories.reduce((a, c) => a + c.templateCount, 0)} 个模板 · {categories.length} 个分类
          </p>
        </div>
        <Space>
          <Button icon={<FolderAddOutlined />} onClick={() => setCatModalOpen(true)}>
            新建分类
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openEditor()}>
            新建模板
          </Button>
        </Space>
      </div>

      <Row gutter={16}>
        <Col xs={24} md={6}>
          <Card
            size="small"
            title="分类"
            extra={<Button size="small" type="text" icon={<ReloadOutlined />} onClick={loadCats} />}
          >
            <div className="space-y-1">
              <Button
                type={activeCat === undefined ? 'primary' : 'text'}
                block
                size="small"
                onClick={() => setActiveCat(undefined)}
              >
                全部
              </Button>
              {categories.map((c) => (
                <div key={c.name} className="flex items-center gap-1">
                  <Button
                    type={activeCat === c.name ? 'primary' : 'text'}
                    size="small"
                    block
                    onClick={() => setActiveCat(c.name)}
                  >
                    {categoryLabel(c.name)} ({c.templateCount})
                  </Button>
                  <Popconfirm
                    title="删除该分类？"
                    description="分类下有模板时需强制删除"
                    onConfirm={async () => {
                      try {
                        await templateApi.removeCategory(c.name, true);
                        void loadCats();
                        void loadTemplates();
                      } catch (err) {
                        message.error((err as Error).message);
                      }
                    }}
                  >
                    <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </div>
              ))}
            </div>
          </Card>
        </Col>

        <Col xs={24} md={18}>
          <Card size="small">
            <Table
              rowKey="id"
              loading={loading}
              dataSource={templates}
              pagination={{ pageSize: 15 }}
              locale={{ emptyText: <Empty description="该分类下暂无模板" /> }}
              columns={[
                {
                  title: '名称',
                  dataIndex: 'name',
                  render: (v: string, r) => (
                    <Space>
                      <span className="font-medium">{v}</span>
                      {r.builtin === 1 && <Tag color="blue">内置</Tag>}
                    </Space>
                  ),
                },
                { title: '分类', dataIndex: 'category', width: 160, render: (v: string) => <Tag>{categoryLabel(v)}</Tag> },
                {
                  title: '操作',
                  width: 220,
                  render: (_, r) => (
                    <Space size={0}>
                      <Button size="small" type="link" icon={<EyeOutlined />} onClick={() => preview(r)}>
                        预览
                      </Button>
                      <Button size="small" type="link" icon={<EditOutlined />} onClick={() => openEditor(r)}>
                        编辑
                      </Button>
                      <Button
                        size="small"
                        type="link"
                        icon={<CopyOutlined />}
                        onClick={async () => {
                          await templateApi.copy(r.id, `${r.name} 副本`, r.category);
                          message.success('已复制');
                          void loadTemplates();
                        }}
                      >
                        复制
                      </Button>
                      {r.builtin !== 1 && (
                        <Popconfirm
                          title="确认删除？"
                          onConfirm={async () => {
                            await templateApi.remove(r.id);
                            void loadTemplates();
                            void loadCats();
                          }}
                        >
                          <Button size="small" type="link" danger icon={<DeleteOutlined />} />
                        </Popconfirm>
                      )}
                    </Space>
                  ),
                },
              ]}
            />
          </Card>
        </Col>
      </Row>

      <Modal
        open={editorOpen}
        title={editing ? `编辑模板：${editing.name}` : '新建模板'}
        onCancel={() => setEditorOpen(false)}
        onOk={submit}
        okText="保存"
        width={860}
      >
        <Form form={form} layout="vertical">
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="name" label="模板名" rules={[{ required: true, message: '请填写模板名' }]}>
                <Input placeholder="如：科技评测-卡片式" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="category" label="分类" rules={[{ required: true, message: '请选择分类' }]}>
                <Select
                  showSearch
                  options={categories.map((c) => ({ value: c.name, label: categoryLabel(c.name) }))}
                  placeholder="选择或输入新分类"
                />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            name="content"
            label={
              <span className="inline-flex items-center gap-1.5">
                HTML 内容
                <HintTip title="使用 {{TITLE}} 表示标题、{{CONTENT}} 表示正文、{{COVER}} 表示封面、{{DATE}} 表示日期" />
              </span>
            }
          >
            <Input.TextArea rows={18} className="font-mono text-xs" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={catModalOpen}
        title="新建模板分类"
        onCancel={() => setCatModalOpen(false)}
        onOk={async () => {
          const { name } = await catForm.validateFields();
          try {
            await templateApi.createCategory(name);
            message.success('分类已创建');
            setCatModalOpen(false);
            catForm.resetFields();
            void loadCats();
          } catch (err) {
            message.error((err as Error).message);
          }
        }}
        okText="创建"
      >
        <Form form={catForm} layout="vertical">
          <Form.Item name="name" label="分类名" rules={[{ required: true, message: '请填写分类名' }]}>
            <Input placeholder="如：游戏动漫" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
