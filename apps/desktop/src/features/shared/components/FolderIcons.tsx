// Codex 风格文件夹图标组(自绘 SVG,仿 Codex App 项目菜单)。
// 与 lucide folder-git 的区别:文件夹更圆润,角标(git 分支 / 加号)
// 落在右下角作为小徽标,而非塞进文件夹中央。
// 统一 24×24 viewBox、fill=none、stroke=currentColor,由调用方控制 size/strokeWidth。

type FolderIconProps = {
  className?: string;
  size?: number;
  strokeWidth?: number;
};

const BASE = {
  fill: "none" as const,
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

// 共用的文件夹外形(圆润、带左上小翻盖)。
const FOLDER_BODY =
  "M3 7.2c0-1.05.0-1.575.204-1.976a1.8 1.8 0 0 1 .786-.786C4.391 4.234 4.916 4.234 5.966 4.234h1.62c.46 0 .689 0 .895.063.182.056.35.148.494.27.162.138.285.327.53.704l.39.6c.246.378.369.566.531.704.144.123.312.215.494.27.206.064.435.064.895.064H17.4c1.26 0 1.89 0 2.371.245.424.216.768.56.984.984.245.48.245 1.111.245 2.371V15.6c0 1.26 0 1.89-.245 2.371a2.25 2.25 0 0 1-.984.984c-.48.245-1.111.245-2.371.245H6.6c-1.26 0-1.89 0-2.371-.245a2.25 2.25 0 0 1-.984-.984C3 17.49 3 16.86 3 15.6z";

/** 纯文件夹(使用现有文件夹)。 */
export function FolderIcon({ className, size = 16, strokeWidth = 1.7 }: FolderIconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" strokeWidth={strokeWidth} aria-hidden {...BASE}>
      <path d={FOLDER_BODY} />
    </svg>
  );
}

/** 文件夹 + git 分支角标(进入项目工作触发器 / 项目列表项)。 */
export function FolderGitIcon({ className, size = 16, strokeWidth = 1.7 }: FolderIconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" strokeWidth={strokeWidth} aria-hidden {...BASE}>
      <path d={FOLDER_BODY} />
      {/* 右下角 git 分支:上节点→竖线→分出去的下节点 */}
      <circle cx="12.4" cy="13.1" r="1.05" />
      <circle cx="12.4" cy="18.2" r="1.05" />
      <circle cx="16.7" cy="14.8" r="1.05" />
      <path d="M12.4 14.15v3" />
      <path d="M15.75 15.3c-.95.55-2.2.8-3.35.85" />
    </svg>
  );
}

/** 文件夹 + 加号角标(添加新项目 / 新建空白项目)。 */
export function FolderPlusIcon({ className, size = 16, strokeWidth = 1.7 }: FolderIconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" strokeWidth={strokeWidth} aria-hidden {...BASE}>
      <path d={FOLDER_BODY} />
      {/* 居中偏下的加号 */}
      <path d="M12 11.4v5.2" />
      <path d="M9.4 14h5.2" />
    </svg>
  );
}
