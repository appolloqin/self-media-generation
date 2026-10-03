import { useEffect, useState } from 'react';
import {
  Card,
  Form,
  Input,
  Select,
  Button,
  Space,
  Row,
  Col,
  Tag,
  Switch,
  App as AntApp,
} from 'antd';
import { PictureOutlined, EyeInvisibleOutlined, EyeOutlined } from '@ant-design/icons';
import { IMAGE_MODEL_PRESETS, type ImageApiConfig, type ImageApiType } from '@smg/shared';
import HintTip from '@/components/HintTip';
import { useConfigStore } from '@/store/config';

const TYPE_OPTIONS: { value: ImageApiType; label: string; hint: string }[] = [
  { value: 'openai', label: 'OpenAI 兼容', hint: 'Seedream / Wan / Qwen / MiniMax 等网关' },
  { value: 'ali', label: '阿里万相', hint: 'DashScope 官方文生图' },
  { value: 'pollinations', label: 'Pollinations', hint: '免费公网接口，无需 Key' },
  { value: 'picsum', label: 'Picsum 占位', hint: '随机占位图，仅调试' },
  { value: 'none', label: '关闭', hint: '禁用 AI 生图' },
];

const SIZE_OPTIONS = [
  { value: '1792x1024', label: '1792×1024（宽幅，适合封面）' },
  { value: '1024x1024', label: '1024×1024' },
  { value: '1024x1792', label: '1024×1792（竖幅）' },
  { value: '900x384', label: '900×384（微信封面）' },
];

export default function ImagePanel() {
  const { message } = AntApp.useApp();
  const config = useConfigStore((s) => s.config);
  const patch = useConfigStore((s) => s.patch);
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<ImageApiConfig>();
  const type = Form.useWatch('type', form) as ImageApiType | undefined;

  const imgApi = config?.imgApi;

  useEffect(() => {
    if (imgApi) form.setFieldsValue(imgApi);
  }, [imgApi, form]);

  if (!config || !imgApi) return null;

  const currentType = type ?? imgApi.type;

  const applyPreset = (model: string) => {
    form.setFieldsValue({ type: 'openai', model });
  };

  const save = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await patch({
        imgApi: {
          type: values.type,
          apiKey: values.apiKey ?? '',
          apiBase: values.apiBase ?? '',
          model: values.model ?? '',
          size: values.size ?? '1792x1024',
          watermark: values.watermark ?? false,
        },
      });
      message.success('图片生成配置已保存');
    } catch (err) {
      message.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1.5 text-sm text-ink-700">
        <PictureOutlined />
        图片生成 API
        <HintTip title="封面与资源图库共用此配置。推荐 OpenAI 兼容网关，填写 Seedream / Wan / Qwen / MiniMax 等模型名即可。" />
      </div>

      <Card size="small" title="模型快捷选项">
        <Space wrap>
          {IMAGE_MODEL_PRESETS.map((p) => (
            <Tag
              key={p.key}
              className="cursor-pointer px-3 py-1"
              color={imgApi.model === p.model ? 'default' : undefined}
              onClick={() => applyPreset(p.model)}
              title={p.hint}
            >
              {p.label}
              <span className="ml-1 text-ink-500">({p.model})</span>
            </Tag>
          ))}
        </Space>
        <p className="mt-3 mb-0 text-xs text-ink-500">
          点击快捷项会切换到 OpenAI 兼容并填入模型名；实际可用性以你的网关为准。
        </p>
      </Card>

      <Card>
        <Form form={form} layout="vertical" initialValues={imgApi}>
          <Form.Item
            name="type"
            label="服务类型"
            rules={[{ required: true, message: '请选择服务类型' }]}
          >
            <Select
              options={TYPE_OPTIONS.map((o) => ({
                value: o.value,
                label: (
                  <span>
                    {o.label}
                    <span className="ml-2 text-xs text-ink-500">{o.hint}</span>
                  </span>
                ),
              }))}
            />
          </Form.Item>

          {currentType === 'openai' && (
            <Form.Item
              name="apiBase"
              label={
                <span className="inline-flex items-center gap-1.5">
                  接口地址
                  <HintTip title="OpenAI 兼容根地址，如 https://api.example.com/v1；系统会请求 {base}/images/generations" />
                </span>
              }
              rules={[{ required: true, message: '请填写接口地址' }]}
            >
              <Input placeholder="https://api.example.com/v1" />
            </Form.Item>
          )}

          {(currentType === 'openai' || currentType === 'ali') && (
            <Form.Item
              name="apiKey"
              label="API Key"
              rules={[{ required: true, message: '请填写 API Key' }]}
            >
              <Input.Password
                visibilityToggle={{
                  visible: showKey,
                  onVisibleChange: setShowKey,
                }}
                iconRender={(visible) => (visible ? <EyeOutlined /> : <EyeInvisibleOutlined />)}
                placeholder={currentType === 'ali' ? 'DashScope API Key' : 'Bearer Token'}
              />
            </Form.Item>
          )}

          {(currentType === 'openai' || currentType === 'ali') && (
            <Row gutter={12}>
              <Col span={14}>
                <Form.Item
                  name="model"
                  label="模型"
                  rules={[{ required: true, message: '请填写模型名' }]}
                >
                  <Input
                    placeholder={currentType === 'ali' ? 'wanx2.0-t2i-turbo' : 'seedream-3.0'}
                  />
                </Form.Item>
              </Col>
              <Col span={10}>
                <Form.Item name="size" label="默认尺寸">
                  <Select options={SIZE_OPTIONS} />
                </Form.Item>
              </Col>
            </Row>
          )}

          {(currentType === 'pollinations' || currentType === 'picsum') && (
            <Form.Item name="size" label="默认尺寸">
              <Select options={SIZE_OPTIONS} />
            </Form.Item>
          )}

          {currentType !== 'none' && currentType !== 'picsum' && (
            <Form.Item
              name="watermark"
              label={
                <span className="inline-flex items-center gap-1.5">
                  生成水印
                  <HintTip title="Seedream / 即梦等网关默认会在右下角加「AI生成」水印。关闭后请求会显式传入 watermark=false。封面与图库均使用此默认值，图库生成时可单独覆盖。" />
                </span>
              }
              valuePropName="checked"
            >
              <Switch checkedChildren="加水印" unCheckedChildren="无水印" />
            </Form.Item>
          )}

          {currentType !== 'openai' && (
            <Form.Item name="apiBase" hidden>
              <Input />
            </Form.Item>
          )}
          {currentType !== 'openai' && currentType !== 'ali' && (
            <>
              <Form.Item name="apiKey" hidden>
                <Input />
              </Form.Item>
              <Form.Item name="model" hidden>
                <Input />
              </Form.Item>
            </>
          )}

          <Button type="primary" loading={saving} onClick={() => void save()}>
            保存配置
          </Button>
        </Form>
      </Card>
    </div>
  );
}
