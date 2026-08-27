import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

// 硬编码颜色字面量守卫。DS 目标文件必须使用 ds-tokens.css 的 CSS 变量。
const noColorLiteral = {
  selector: "Literal[value=/#[0-9A-Fa-f]{3,8}|rgba?\\(|hsla?\\(/]",
  message:
    "Avoid hardcoded color literals in DS-targeted components; use design-system CSS variables/tokens.",
};

export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "release-artifacts/**",
      ".vite/**",
      "out/**",
      "output/**",
      "resources/codex/**",
      "resources/node-runtime/**",
      "resources/browser-client/**",
      "public/assets/material-icons/**",
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  react.configs.flat.recommended,

  // 类型感知规则：只启用对本项目最有价值的一组，不整体接入
  // recommended-type-checked（会一次性引入大量新 error）。
  // no-floating-promises / no-misused-promises 针对 Electron 的大量异步
  // IPC 调用，是最容易漏掉真实 bug 的地方。
  {
    files: ["src/**/*.{ts,tsx}", "electron/**/*.ts"],
    languageOptions: {
      parserOptions: {
        // src 由 tsconfig.json 覆盖，electron 由 tsconfig.electron.json 覆盖。
        // 两者都要列出，否则 electron/** 会报 "not found by the project service"。
        project: ["./tsconfig.json", "./tsconfig.electron.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: false },
      ],
      "@typescript-eslint/await-thenable": "error",
    },
  },

  {
    files: ["**/*.{ts,tsx,js,jsx,cjs,mjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    settings: { react: { version: "detect" } },
    plugins: { "react-hooks": reactHooks },
    rules: {
      // 与迁移前 eslint-plugin-react-hooks v4 的 recommended 保持一致。
      // v7 的 recommended 额外打包了 14 条 React Compiler 规则
      // （set-state-in-effect、refs、purity、immutability 等），在本仓库
      // 会产生 143 个新 error。那是一次独立的重构，不应由配置迁移顺带引入。
      // 若要逐条启用，见 reactHooks.configs.recommended。
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react/react-in-jsx-scope": "off",
      "react/jsx-uses-react": "off",
      "react/no-unescaped-entities": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },

  // ── Design System 守卫 ──────────────────────────────────────────
  // 以下五组规则从 .eslintrc.cjs 的 overrides 逐条迁移，行为保持一致。
  // 目标文件必须使用 src/features/design-system/components/ 的 primitive，
  // 而不是手写 markup。

  // modal → ModalShell
  {
    files: [
      "src/features/workspaces/components/*Prompt.tsx",
      "src/features/git/components/BranchSwitcherPrompt.tsx",
      "src/features/threads/components/RenameThreadPrompt.tsx",
      "src/features/settings/components/SettingsView.tsx",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "JSXOpeningElement[name.name='div'] > JSXAttribute[name.name='role'][value.value='dialog']",
          message:
            "Use `ModalShell` for modal dialog shell markup instead of `<div role=\"dialog\">`.",
        },
        {
          selector:
            "JSXOpeningElement[name.name='div'] > JSXAttribute[name.name='aria-modal']",
          message:
            "Use `ModalShell` for modal dialog shell markup instead of manually setting `aria-modal`.",
        },
        {
          selector:
            "JSXOpeningElement[name.name='div'] > JSXAttribute[name.name='className'][value.value=/\\b[a-z0-9-]*modal-(overlay|backdrop|window|card)\\b/]",
          message:
            "Modal shell chrome belongs in `ModalShell`; avoid legacy `*-modal-overlay/backdrop/window/card` wrappers.",
        },
        noColorLiteral,
      ],
    },
  },

  // panel → PanelFrame / PanelMeta / PanelSearchField
  {
    files: [
      "src/features/git/components/GitDiffPanel.tsx",
      "src/features/files/components/FileTreePanel.tsx",
      "src/features/prompts/components/PromptPanel.tsx",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXOpeningElement[name.name='aside']",
          message:
            "Use `PanelFrame` instead of raw `<aside>` for DS panel shells.",
        },
        {
          selector:
            "JSXOpeningElement[name.name='div'] > JSXAttribute[name.name='className'][value.value=/\\b(file-tree-meta|prompt-panel-meta|file-tree-search|prompt-panel-search|file-tree-search-icon|prompt-panel-search-icon|file-tree-search-input|prompt-panel-search-input)\\b/]",
          message:
            "Use DS panel sub-primitives (`PanelMeta` / `PanelSearchField`) for meta/search shell markup.",
        },
        noColorLiteral,
      ],
    },
  },

  // toast → ToastViewport / ToastCard / ToastHeader / ToastActions / ToastError
  {
    files: [
      "src/features/app/components/ApprovalToasts.tsx",
      "src/features/notifications/components/ErrorToasts.tsx",
      "src/features/update/components/UpdateToast.tsx",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "JSXOpeningElement[name.name='div'] > JSXAttribute[name.name='className'][value.value=/^(approval-toasts|error-toasts|update-toasts)$/]",
          message:
            "Use `ToastViewport` for toast region wrappers instead of raw `<div>` wrappers.",
        },
        {
          selector:
            "JSXOpeningElement[name.name='div'] > JSXAttribute[name.name='className'][value.value=/^(approval-toast|error-toast|update-toast)$/]",
          message:
            "Use `ToastCard` for toast cards instead of raw `<div>` wrappers.",
        },
        {
          selector:
            "JSXOpeningElement[name.name='div'] > JSXAttribute[name.name='className'][value.value=/^(approval-toast-header|error-toast-header|update-toast-header|approval-toast-actions|update-toast-actions|update-toast-error)$/]",
          message:
            "Use DS toast sub-primitives (`ToastHeader`, `ToastActions`, `ToastError`) for shared toast structure.",
        },
        {
          selector:
            "JSXOpeningElement[name.name='div'] > JSXAttribute[name.name='aria-live']",
          message:
            "Use `ToastViewport` for live-region semantics instead of raw `<div aria-live>` wrappers.",
        },
        noColorLiteral,
      ],
    },
  },

  // diff viewer → ds-diff.css 主题变量
  {
    files: ["src/features/git/components/GitDiffViewer.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/#[0-9A-Fa-f]{3,8}|rgba?\\(|hsla?\\(/]",
          message:
            "Avoid hardcoded diff color literals; use DS diff theme variables from `ds-diff.css`.",
        },
      ],
    },
  },

  // popover / dropdown → PopoverSurface / PopoverMenuItem
  {
    files: [
      "src/features/app/components/MainHeader.tsx",
      "src/features/app/components/LaunchScriptButton.tsx",
      "src/features/app/components/LaunchScriptEntryButton.tsx",
      "src/features/app/components/OpenAppMenu.tsx",
      "src/features/app/components/Sidebar.tsx",
      "src/features/app/components/SidebarHeader.tsx",
      "src/features/app/components/SidebarCornerActions.tsx",
      "src/features/composer/components/ComposerInput.tsx",
      "src/features/files/components/FilePreviewPopover.tsx",
      "src/features/workspaces/components/WorkspaceHome.tsx",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "JSXOpeningElement[name.name='div'] > JSXAttribute[name.name='className'][value.value=/\\b(workspace-add-menu|sidebar-sort-dropdown|sidebar-account-popover|worktree-info-popover|workspace-branch-dropdown|launch-script-popover|open-app-dropdown|file-preview-popover)\\b/]",
          message:
            "Use `PopoverSurface` for popover/dropdown shell markup instead of raw `<div>` wrappers.",
        },
        {
          selector:
            "JSXOpeningElement[name.name='div'] > JSXAttribute[name.name='role'][value.value=/^(menu|listbox)$/]",
          message:
            'Use `PopoverSurface` for popover/dropdown shell semantics instead of raw `<div role="menu|listbox">` wrappers.',
        },
        {
          selector:
            "JSXOpeningElement[name.name='button'] > JSXAttribute[name.name='className'][value.value=/\\b(open-app-option|workspace-add-option|sidebar-sort-option)\\b/]",
          message:
            "Use `PopoverMenuItem` for precomputed popover list entries instead of raw `<button>` menu rows.",
        },
        noColorLiteral,
      ],
    },
  },
);
