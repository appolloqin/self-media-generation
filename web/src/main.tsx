import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ConfigProvider, App as AntApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import relativeTime from 'dayjs/plugin/relativeTime';
import App from './App';
import './index.css';

dayjs.locale('zh-cn');
dayjs.extend(relativeTime);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          /* 品牌主色：Graphite */
          colorPrimary: '#1f2937',
          colorPrimaryHover: '#374151',
          colorPrimaryActive: '#111827',
          colorInfo: '#1f2937',
          colorSuccess: '#059669',
          colorWarning: '#d97706',
          colorError: '#dc2626',
          colorLink: '#1f2937',

          /* 文字层级 */
          colorText: '#111827',
          colorTextSecondary: '#4b5563',
          colorTextTertiary: '#6b7280',
          colorTextQuaternary: '#9ca3af',

          /* 表面与线条 */
          colorBgLayout: '#fafafa',
          colorBgContainer: '#ffffff',
          colorBgElevated: '#ffffff',
          colorBorder: '#e5e7eb',
          colorBorderSecondary: '#f4f4f5',

          /* 圆角 */
          borderRadius: 8,
          borderRadiusLG: 12,
          borderRadiusSM: 6,
          borderRadiusXS: 4,

          /* 排版 */
          fontSize: 14,
          fontSizeLG: 16,
          fontSizeHeading1: 28,
          fontSizeHeading2: 24,
          fontSizeHeading3: 20,
          lineHeight: 1.5714,

          /* 动效 */
          motionDurationFast: '0.15s',
          motionDurationMid: '0.2s',
          motionDurationSlow: '0.3s',
          motionEaseInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',

          /* 阴影：极轻 */
          boxShadow: '0 1px 3px rgba(17, 24, 39, 0.06)',
          boxShadowSecondary: '0 8px 24px rgba(17, 24, 39, 0.08)',
        },
        components: {
          Layout: {
            headerBg: '#ffffff',
            headerHeight: 56,
            headerPadding: '0 20px',
            siderBg: '#ffffff',
            bodyBg: '#fafafa',
          },
          Menu: {
            itemBorderRadius: 8,
            itemHeight: 38,
            itemMarginInline: 10,
            itemSelectedBg: '#f4f4f5',
            itemSelectedColor: '#111827',
            itemHoverBg: '#fafafa',
            groupTitleFontSize: 11,
          },
          Card: {
            paddingLG: 20,
            headerHeight: 48,
            headerFontSize: 15,
          },
          Table: {
            headerBg: '#f4f4f5',
            headerColor: '#4b5563',
            rowHoverBg: '#fafafa',
            borderColor: '#f4f4f5',
          },
          Button: {
            controlHeight: 34,
            borderRadius: 8,
            fontWeight: 500,
          },
          Input: {
            controlHeight: 34,
            activeBorderColor: '#1f2937',
            hoverBorderColor: '#9ca3af',
          },
          Select: {
            controlHeight: 34,
          },
          Segmented: {
            itemSelectedBg: '#ffffff',
            trackBg: '#f4f4f5',
          },
          Tabs: {
            horizontalItemPadding: '12px 0',
            titleFontSize: 14,
            inkBarColor: '#1f2937',
          },
          Tag: {
            borderRadiusSM: 6,
          },
          Progress: {
            defaultColor: '#1f2937',
            remainingColor: '#f4f4f5',
          },
          Statistic: {
            titleFontSize: 13,
            contentFontSize: 24,
          },
        },
      }}
    >
      <AntApp>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  </React.StrictMode>,
);
