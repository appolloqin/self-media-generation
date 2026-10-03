/**
 * 品牌标识（内联 SVG）
 * 几何「文稿」标记：内容创作，无拟人五官，避免骷髅/表情联想。
 */

/** 品牌图形本体：圆角文稿 + 三行字迹（渐短，示意正文） */
export default function BrandLogo({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <rect x="10" y="8" width="20" height="24" rx="4" fill="#fff" fillOpacity="0.96" />
      <rect x="14" y="14.5" width="12" height="2.4" rx="1.2" fill="#1a1f2e" />
      <rect x="14" y="20" width="9" height="2.4" rx="1.2" fill="#1a1f2e" fillOpacity="0.7" />
      <rect x="14" y="25.5" width="6" height="2.4" rx="1.2" fill="#1a1f2e" fillOpacity="0.45" />
    </svg>
  );
}

/** 品牌色块标识：中性底 + 白色图形，用于侧边栏与登录页 */
export function BrandMark({ className = '' }: { className?: string }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-[10px] bg-brand-500 ${className}`}
      aria-hidden="true"
    >
      <BrandLogo className="h-[72%] w-[72%]" />
    </span>
  );
}
