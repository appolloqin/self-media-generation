import { useState } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Tag,
  Input,
  Select,
  Divider,
  Popconfirm,
  Modal,
  Form,
  InputNumber,
  App as AntApp,
  Tooltip,
} from 'antd';
import {
  CheckCircleOutlined,
  PlusOutlined,
  DeleteOutlined,
  ReloadOutlined,
  EditOutlined,
} from '@ant-design/icons';
import { configApi } from '@/api';
import { useConfigStore } from '@/store/config';
import HintTip from '@/components/HintTip';
import type { ProviderView } from '@smg/shared';

export default function LlmPanel() {
  const { message, modal } = AntApp.useApp();
  const config = useConfigStore((s) => s.config);
  const load = useConfigStore((s) => s.load);
  const [testing, setTesting] = useState('');
  const [modelLists, setModelLists] = useState<Record<string, string[]>>({});
  const [editing, setEditing] = useState<ProviderView | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm] = Form.useForm();
  const [newOpen, setNewOpen] = useState(false);
  const [newForm] = Form.useForm();

  const test = async (key: string) => {
    setTesting(key);
    try {
      const res = await configApi.testLlm(key);
      if (res.ok) message.success(res.message);
      else message.error(res.message);
    } catch (err) {
      message.error((err as Error).message);
    } finally {
      setTesting('');
    }
  };

  const loadModels = async (key: string) => {
    try {
      const list = await configApi.models(key);
      setModelLists((m) => ({ ...m, [key]: list }));
      message.success(`已获取 ${list.length} 个模型`);
    } catch (err) {
      message.error((err as Error).message);
    }
  };

  const openEdit = (p: ProviderView) => {
    setEditing(p);
    editForm.setFieldsValue({
      label: p.label,
      apiBase: p.apiBase,
      model: p.model,
      apiKey: p.apiKey,
      maxTokens: p.maxTokens,
    });
    setEditOpen(true);
  };

  const submitEdit = async () => {
    if (!editing) return;
    const v = await editForm.validateFields();
    try {
      await configApi.saveProvider(editing.key, v);
      message.success('已保存');
      setEditOpen(false);
      await load(true);
    } catch (err) {
      message.error((err as Error).message);
    }
  };

  const submitNew = async () => {
    const v = await newForm.validateFields();
    try {
      await configApi.createProvider(v);
      message.success(`已添加服务商「${v.label}」`);
      setNewOpen(false);
      newForm.resetFields();
      await load(true);
    } catch (err) {
      message.error((err as Error).message);
    }
  };

  const removeProvider = (p: ProviderView) => {
    modal.confirm({
      title: `确认删除「${p.label}」？`,
      content: '该服务商的接口地址、密钥等配置将被移除。',
      okType: 'danger',
      onOk: async () => {
        try {
          await configApi.removeProvider(p.key);
          message.success('已删除');
          await load(true);
        } catch (err) {
          message.error((err as Error).message);
        }
      },
    });
  };

  const setActive = async (key: string) => {
    try {
      await configApi.save({ api: { apiType: key } } as never);
      await load(true);
      message.success('已切换当前服务商');
    } catch (err) {
      message.error((err as Error).message);
    }
  };

  if (!config) return null;

  const providers = config.providers;
  const customCount = providers.filter((p) => p.custom).length;

  return (
    <Card
      title={
        <span>
          大模型服务商
          <span className="ml-2 text-xs font-normal text-gray-500">全部 OpenAI 兼容协议</span>
        </span>
      }
      extra={
        <Space>
          <Tag color={config.llmReady ? 'green' : 'red'}>
            {config.llmReady ? '当前服务商已就绪' : '当前服务商未配置完整'}
          </Tag>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              newForm.resetFields();
              newForm.setFieldsValue({ maxTokens: 8192 });
              setNewOpen(true);
            }}
          >
            添加自定义服务商
          </Button>
        </Space>
      }
    >
      <div className="mb-4 flex items-center gap-1.5 text-sm text-ink-700">
        服务商配置
        <HintTip title="所有服务商统一使用 OpenAI Chat Completions 协议。可接入 vLLM、one-api / new-api 聚合网关、LM Studio、Ollama 以及各家云厂商与中转服务。接口地址可只填到域名，系统会自动补全 /v1/chat/completions。建议优先使用 OpenRouter 的 :free 模型先跑通流程。" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-gray-700">当前使用</span>
        <Select
          className="w-64"
          showSearch
          optionFilterProp="label"
          value={config.api.apiType}
          onChange={setActive}
          options={providers.map((p) => ({
            value: p.key,
            label: `${p.label}${p.configured ? '' : '（未配置）'}`,
          }))}
        />
        <span className="text-xs text-gray-500">
          共 {providers.length} 个服务商
          {customCount > 0 ? `，其中 ${customCount} 个自定义` : ''}
        </span>
      </div>

      <Table
        rowKey="key"
        size="small"
        pagination={false}
        dataSource={providers}
        columns={[
          {
            title: '服务商',
            dataIndex: 'label',
            width: 200,
            render: (v: string, r: ProviderView) => (
              <Space direction="vertical" size={0}>
                <Space size={4}>
                  <span className="font-medium">{v}</span>
                  {r.active && <Tag color="blue">使用中</Tag>}
                  {r.custom ? <Tag color="purple">自定义</Tag> : <Tag>内置</Tag>}
                </Space>
                <Tooltip title={r.apiBase || '未填写接口地址'}>
                  <span className="block max-w-[190px] truncate text-xs text-gray-400">
                    {r.apiBase || '未填写接口地址'}
                  </span>
                </Tooltip>
              </Space>
            ),
          },
          {
            title: 'API Key',
            dataIndex: 'apiKey',
            width: 210,
            render: (v: string, r: ProviderView) => (
              <Input.Password
                size="small"
                value={v}
                placeholder={r.key === 'Ollama' ? '本地服务无需 Key' : r.envKeyName}
                onChange={(e) => void configApi.saveProvider(r.key, { apiKey: e.target.value })}
              />
            ),
          },
          {
            title: '模型',
            dataIndex: 'model',
            width: 220,
            render: (v: string, r: ProviderView) => {
              const fetched = modelLists[r.key];
              const options = fetched?.length ? fetched : r.models;
              // 自定义服务商的模型列表常拉不到，允许自由输入
              const free = r.custom || !options.length;
              return (
                <Select
                  size="small"
                  showSearch
                  allowClear
                  className="w-full"
                  value={v || undefined}
                  placeholder={free ? '输入模型名' : '选择模型'}
                  mode={free ? 'tags' : undefined}
                  onChange={(m) => {
                    const model = Array.isArray(m) ? m[0] ?? '' : (m ?? '');
                    void configApi.saveProvider(r.key, { model });
                  }}
                  options={options.map((m: string) => ({ value: m, label: m }))}
                />
              );
            },
          },
          {
            title: '状态',
            width: 80,
            render: (_: unknown, r: ProviderView) =>
              r.configured ? <Tag color="green">已配置</Tag> : <Tag>未配置</Tag>,
          },
          {
            title: '操作',
            width: 210,
            render: (_: unknown, r: ProviderView) => (
              <Space size={0}>
                <Button
                  size="small"
                  type="link"
                  loading={testing === r.key}
                  onClick={() => test(r.key)}
                  icon={<CheckCircleOutlined />}
                >
                  测试
                </Button>
                <Button size="small" type="link" onClick={() => loadModels(r.key)}>
                  拉模型
                </Button>
                <Button size="small" type="link" icon={<EditOutlined />} onClick={() => openEdit(r)}>
                  设置
                </Button>
                {r.custom && (
                  <Button
                    size="small"
                    type="link"
                    danger
                    icon={<DeleteOutlined />}
                    disabled={r.active}
                    onClick={() => removeProvider(r)}
                  />
                )}
              </Space>
            ),
          },
        ]}
      />

      <Divider />

      <Popconfirm
        title="恢复默认配置？"
        description="将清空当前所有设置，包括 API Key 和自定义服务商。"
        onConfirm={() => useConfigStore.getState().reset()}
      >
        <Button danger icon={<ReloadOutlined />}>
          恢复默认配置
        </Button>
      </Popconfirm>

      <Modal
        open={editOpen}
        title={`服务商设置：${editing?.label ?? ''}`}
        onCancel={() => setEditOpen(false)}
        onOk={submitEdit}
        okText="保存"
        width={520}
      >
        <Form form={editForm} layout="vertical" preserve={false}>
          <Form.Item name="label" label="显示名称" rules={[{ required: true, message: '请输入显示名称' }]}>
            <Input />
          </Form.Item>
          <Form.Item
            name="apiBase"
            label="接口地址（OpenAI 兼容）"
            tooltip="填到域名即可，系统会自动补 /v1/chat/completions"
            rules={[{ required: true, message: '请输入接口地址' }]}
          >
            <Input placeholder="https://api.example.com/v1" />
          </Form.Item>
          <Form.Item
            name="apiKey"
            label={
              <span className="inline-flex items-center gap-1.5">
                API Key
                <HintTip title="本地部署（如 vLLM / Ollama）可留空" />
              </span>
            }
          >
            <Input.Password placeholder="sk-..." />
          </Form.Item>
          <Form.Item name="model" label="默认模型">
            <Input placeholder="如 gpt-4o-mini、qwen-plus、deepseek-chat" />
          </Form.Item>
          <Form.Item name="maxTokens" label="最大输出 Token">
            <InputNumber className="w-full" min={256} max={1000000} step={512} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={newOpen}
        title="添加自定义 OpenAI 兼容服务商"
        onCancel={() => setNewOpen(false)}
        onOk={submitNew}
        okText="添加"
        width={520}
      >
        <div className="mb-4 flex items-center gap-1.5 text-sm text-ink-700">
          自定义服务商
          <HintTip title="适用于所有 OpenAI 兼容接口，包括 vLLM、one-api / new-api、LM Studio、Ollama、各家云厂商与中转网关。" />
        </div>
        <Form form={newForm} layout="vertical" preserve={false}>
          <Form.Item name="label" label="显示名称" rules={[{ required: true, message: '请输入显示名称' }]}>
            <Input placeholder="如 公司内部推理网关" />
          </Form.Item>
          <Form.Item
            name="key"
            label="标识（可选）"
            tooltip="内部存储用的唯一标识，留空则根据名称自动生成"
            rules={[{ pattern: /^[A-Za-z0-9_-]{1,64}$/, message: '只能包含字母、数字、下划线和短横线' }]}
          >
            <Input placeholder="如 my_gateway" />
          </Form.Item>
          <Form.Item
            name="apiBase"
            label={
              <span className="inline-flex items-center gap-1.5">
                接口地址
                <HintTip title="可填域名（自动补 /v1）、完整 /v1 路径，或本地地址如 http://192.168.1.10:8000" />
              </span>
            }
            rules={[{ required: true, message: '请输入接口地址' }]}
          >
            <Input placeholder="https://api.example.com/v1" />
          </Form.Item>
          <Form.Item
            name="apiKey"
            label={
              <span className="inline-flex items-center gap-1.5">
                API Key（可选）
                <HintTip title="本地部署无需填写" />
              </span>
            }
          >
            <Input.Password placeholder="sk-..." />
          </Form.Item>
          <Form.Item
            name="model"
            label={
              <span className="inline-flex items-center gap-1.5">
                默认模型
                <HintTip title="可先留空，添加后通过「拉模型」获取" />
              </span>
            }
          >
            <Input placeholder="如 gpt-4o-mini" />
          </Form.Item>
          <Form.Item name="maxTokens" label="最大输出 Token">
            <InputNumber className="w-full" min={256} max={1000000} step={512} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
