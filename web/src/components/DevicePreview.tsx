import { useEffect, useMemo, useRef, useState } from 'react';
import { Select, Space, Typography } from 'antd';
import {
  MobileOutlined,
  TabletOutlined,
  DesktopOutlined,
  WindowsOutlined,
  AppleOutlined,
} from '@ant-design/icons';
import { looksLikeHtml, toPreviewHtml } from '@/utils/mdPreview';

export type PreviewDeviceKind = 'phone' | 'tablet' | 'desktop';

export type PreviewDevice = {
  id: string;
  label: string;
  group: 'iPhone' | 'iPad' | 'Huawei' | 'Nexus' | 'Mac' | 'Windows';
  width: number;
  height: number;
  kind: PreviewDeviceKind;
};

/** 常见机型逻辑分辨率（CSS px），用于公众号/网页预览 */
export const PREVIEW_DEVICES: PreviewDevice[] = [
  { id: 'iphone-se', label: 'iPhone SE (3rd)', group: 'iPhone', width: 375, height: 667, kind: 'phone' },
  { id: 'iphone-13-mini', label: 'iPhone 13 mini', group: 'iPhone', width: 375, height: 812, kind: 'phone' },
  { id: 'iphone-15', label: 'iPhone 15', group: 'iPhone', width: 393, height: 852, kind: 'phone' },
  { id: 'iphone-15-pro-max', label: 'iPhone 15 Pro Max', group: 'iPhone', width: 430, height: 932, kind: 'phone' },
  { id: 'iphone-16-pro', label: 'iPhone 16 Pro', group: 'iPhone', width: 402, height: 874, kind: 'phone' },

  { id: 'ipad-mini', label: 'iPad mini', group: 'iPad', width: 744, height: 1133, kind: 'tablet' },
  { id: 'ipad-air', label: 'iPad Air 11"', group: 'iPad', width: 820, height: 1180, kind: 'tablet' },
  { id: 'ipad-pro-11', label: 'iPad Pro 11"', group: 'iPad', width: 834, height: 1194, kind: 'tablet' },
  { id: 'ipad-pro-13', label: 'iPad Pro 13"', group: 'iPad', width: 1024, height: 1366, kind: 'tablet' },

  { id: 'huawei-p60', label: 'Huawei P60', group: 'Huawei', width: 360, height: 780, kind: 'phone' },
  { id: 'huawei-mate60', label: 'Huawei Mate 60', group: 'Huawei', width: 390, height: 844, kind: 'phone' },
  { id: 'huawei-matepad', label: 'Huawei MatePad 11', group: 'Huawei', width: 800, height: 1280, kind: 'tablet' },

  { id: 'nexus-5', label: 'Nexus 5', group: 'Nexus', width: 360, height: 640, kind: 'phone' },
  { id: 'nexus-6p', label: 'Nexus 6P', group: 'Nexus', width: 412, height: 732, kind: 'phone' },
  { id: 'pixel-7', label: 'Pixel 7', group: 'Nexus', width: 412, height: 915, kind: 'phone' },
  { id: 'pixel-tablet', label: 'Pixel Tablet', group: 'Nexus', width: 800, height: 1280, kind: 'tablet' },

  { id: 'macbook-air-13', label: 'MacBook Air 13"', group: 'Mac', width: 1280, height: 800, kind: 'desktop' },
  { id: 'macbook-pro-14', label: 'MacBook Pro 14"', group: 'Mac', width: 1512, height: 982, kind: 'desktop' },
  { id: 'imac-24', label: 'iMac 24"', group: 'Mac', width: 1920, height: 1080, kind: 'desktop' },

  { id: 'win-laptop', label: 'Windows Laptop', group: 'Windows', width: 1366, height: 768, kind: 'desktop' },
  { id: 'win-1080', label: 'Windows 1080p', group: 'Windows', width: 1920, height: 1080, kind: 'desktop' },
  { id: 'win-2k', label: 'Windows 2K', group: 'Windows', width: 2560, height: 1440, kind: 'desktop' },
];

const DEFAULT_DEVICE_ID = 'iphone-15';

/** fit = 适应宽度；其余为固定显示比例 */
const ZOOM_OPTIONS = [
  { value: 'fit', label: '适应宽度' },
  { value: '1.25', label: '125%' },
  { value: '1', label: '100%' },
  { value: '0.75', label: '75%' },
  { value: '0.5', label: '50%' },
  { value: '0.25', label: '25%' },
] as const;

type ZoomValue = (typeof ZOOM_OPTIONS)[number]['value'];

const DEFAULT_ZOOM: ZoomValue = '1';

const GROUP_ORDER: PreviewDevice['group'][] = ['iPhone', 'iPad', 'Huawei', 'Nexus', 'Mac', 'Windows'];

function groupIcon(group: PreviewDevice['group']) {
  switch (group) {
    case 'iPhone':
      return <MobileOutlined />;
    case 'iPad':
      return <TabletOutlined />;
    case 'Huawei':
      return <MobileOutlined />;
    case 'Nexus':
      return <MobileOutlined />;
    case 'Mac':
      return <AppleOutlined />;
    case 'Windows':
      return <WindowsOutlined />;
    default:
      return <DesktopOutlined />;
  }
}

type Props = {
  html: string;
  title: string;
  /** 预览舞台可视高度（内容更高时可滚动） */
  maxHeight?: number;
  extra?: React.ReactNode;
};

export default function DevicePreview({ html, title, maxHeight = 820, extra }: Props) {
  const [deviceId, setDeviceId] = useState(DEFAULT_DEVICE_ID);
  const [zoom, setZoom] = useState<ZoomValue>(DEFAULT_ZOOM);
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ w: 360, h: maxHeight });

  const device = useMemo(
    () => PREVIEW_DEVICES.find((d) => d.id === deviceId) ?? PREVIEW_DEVICES[0],
    [deviceId],
  );

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      // 预留边框/内边距，避免机型框被二次挤压
      setStageSize({ w: Math.max(200, rect.width - 32), h: Math.max(200, rect.height - 32) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const bezel = device.kind === 'phone' ? 18 : device.kind === 'tablet' ? 24 : 2;
  const fitScale = Math.min(stageSize.w / (device.width + bezel), 1);
  const scale = zoom === 'fit' ? fitScale : Number(zoom);
  const scaledW = (device.width + bezel) * scale;
  const scaledH = (device.height + bezel) * scale;

  const options = GROUP_ORDER.map((group) => ({
    label: (
      <Space size={6}>
        {groupIcon(group)}
        {group}
      </Space>
    ),
    options: PREVIEW_DEVICES.filter((d) => d.group === group).map((d) => ({
      value: d.id,
      label: `${d.label} · ${d.width}×${d.height}`,
    })),
  }));

  return (
    <div className="device-preview">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Space size={8} wrap>
          <Typography.Text type="secondary" className="text-xs">
            机型
          </Typography.Text>
          <Select
            size="small"
            value={deviceId}
            onChange={setDeviceId}
            options={options}
            popupMatchSelectWidth={280}
            className="min-w-[220px]"
          />
          <Typography.Text type="secondary" className="text-xs">
            显示
          </Typography.Text>
          <Select
            size="small"
            value={zoom}
            onChange={(v) => setZoom(v as ZoomValue)}
            options={ZOOM_OPTIONS.map((z) => ({ value: z.value, label: z.label }))}
            className="w-[104px]"
          />
          <Typography.Text type="secondary" className="text-xs">
            {device.width}×{device.height}
          </Typography.Text>
        </Space>
        {extra}
      </div>

      <div ref={stageRef} className="device-preview-stage" style={{ height: maxHeight }}>
        <div className="device-preview-scaler" style={{ width: scaledW, height: scaledH }}>
          <div
            className={`device-frame device-frame--${device.kind}`}
            style={{
              width: device.width,
              height: device.height,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
            }}
          >
            <iframe
              title="preview"
              srcDoc={buildPreviewDoc(html, title, device.width)}
              sandbox="allow-same-origin"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function buildPreviewDoc(source: string, title: string, viewportWidth: number): string {
  const isHtml = looksLikeHtml(source);
  const body = isHtml ? source : toPreviewHtml(source);
  const mdCss = isHtml
    ? `html,body{margin:0;padding:0;background:#fff;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;color:#3a3a3a;word-break:break-word;letter-spacing:0;text-align:left}
  img{max-width:100%;height:auto}
  p{text-align:left;letter-spacing:0}
  ul,ol{padding-left:1.4em}
  li{text-align:left}`
    : `html,body{margin:0;padding:16px 18px 32px;background:#fff;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;color:#3a3a3a;word-break:break-word;letter-spacing:0;text-align:left;font-size:16px;line-height:1.8}
  img{max-width:100%;height:auto}
  h1{font-size:22px;line-height:1.4;font-weight:700;margin:0 0 16px;color:#1a1a1a}
  h2{font-size:18px;line-height:1.45;font-weight:700;margin:26px 0 12px;color:#1a1a1a}
  h3{font-size:16px;line-height:1.45;font-weight:700;margin:20px 0 10px;color:#1a1a1a}
  p{margin:0 0 14px;text-align:left;letter-spacing:0}
  ul,ol{margin:8px 0 16px;padding-left:1.4em}
  li{margin:0 0 8px;text-align:left}
  strong{font-weight:700}
  blockquote{margin:16px 0;padding:8px 14px;border-left:3px solid #3a7bd5;color:#555}
  code{background:#f5f5f5;padding:1px 5px;border-radius:3px;font-size:0.92em}
  a{color:#3a7bd5}`;
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=${viewportWidth},initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  ${mdCss}
</style></head><body>${body}</body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
