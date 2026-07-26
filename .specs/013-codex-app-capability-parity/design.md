# Codex App 能力补齐设计

## 能力账本

能力矩阵至少包含：

| 字段 | 含义 |
|---|---|
| capability | 用户可感知能力 |
| reference | 官方公开说明或合法可观察基线 |
| upstream | 当前锁定 `codex-rs` 是否提供 |
| host | Electron 宿主需要实现什么 |
| status | absent / designed / code-exists / verified / release-ready |
| evidence | spec、测试和人工验证位置 |

协议方法存在、壳层包装存在、UI 存在、E2E 通过和发布可用是五种不同状态。

## Browser 架构

```text
Codex thread
  -> BlackRain browser tool contract
  -> Rust daemon / Electron main authenticated bridge
  -> Browser controller
  -> isolated WebContentsView + persistent partition
  -> normalized browser events / artifacts
  -> thread event stream + visible browser UI
```

Electron main 拥有 browser webContents。renderer 只发送经过校验的意图并接收标准化状态；不得持有任意 `webContents` 控制权。网页运行在独立 session 中，不加载 App preload。

## 浏览器状态

- `profileId`：决定持久 partition，不包含 secret。
- `viewId`：单个浏览视图生命周期标识。
- `ownerThreadId`：关联 thread，但不把网页状态序列化进 thread。
- `controlMode`：`agent`、`user` 或 `transitioning`。
- `navigationState`：URL、title、loading、canGoBack、canGoForward、crashed。
- `artifact`：截图、下载和用户明确保存的导出物。

## 权限与隔离

- 默认拒绝摄像头、麦克风、地理位置、通知、剪贴板写入和任意外部协议。
- 需要的权限按 origin 和用途向用户解释并确认。
- 下载进入受控流程，展示来源、文件名、大小和目标路径。
- 新窗口默认转为受控 view 或外部浏览器，不允许任意 popup。
- CDP 只由 main 控制，调试端点不暴露到网络。

## 能力补齐流程

1. 用公开材料和可观察行为定义用户合同。
2. 判断能力属于上游内核、Electron 宿主、BlackRain UI 还是 Gateway。
3. 为跨层能力建或更新 spec。
4. 实现最小纵向切片。
5. 自动化验证加 Windows 人工验收。
6. 只有证据齐全才更新能力状态和产品文案。

## 失败模式

- 页面不可达：展示网络错误并允许重试/返回。
- 登录过期：保留页面，让用户手动重新认证，不收集凭据。
- renderer 崩溃：重建 view，保留 partition，明确提示状态变化。
- agent 与用户争夺控制：使用显式状态机，转换期间停止输入。
- 工具协议漂移：按锁定 codex 版本运行合同探针并降级为手动浏览。
