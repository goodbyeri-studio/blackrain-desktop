// 文件夹 + 右下角加号:用于"进入/新增项目"触发器(语义=新增一个)。
//
// 合规说明(重要):
//  - 文件夹主体路径取自 lucide-react(ISC 许可,permissive,允许借用并保留许可)。
//  - 右下角加号是本仓自绘几何(我们自己的坐标)。
//  - 绝不复制任何专有图标(如 OpenAI Codex app 的私有 14×14 美术)的 path 数据;
//    我们只"看其样式、自己重写",符合仓库 License 红线。
//
// 统一 24×24 viewBox,与同处使用的 lucide folder / folder-git-2 视觉对齐。

type FolderAddIconProps = {
  className?: string;
  size?: number;
  strokeWidth?: number;
};

export function FolderAddIcon({
  className,
  size = 16,
  strokeWidth = 1.7,
}: FolderAddIconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {/* 文件夹主体(lucide folder,ISC) */}
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
      {/* 右下角加号(本仓自绘) */}
      <path d="M16.5 12.5v5" />
      <path d="M14 15h5" />
    </svg>
  );
}
