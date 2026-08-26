# BlackRain Desktop

> 基于开源 `codex-rs` / `codex app-server` 独立实现的开源 Codex Desktop。

[![CI](https://github.com/goodbyeri-studio/blackrain-desktop/actions/workflows/ci.yml/badge.svg)](https://github.com/goodbyeri-studio/blackrain-desktop/actions/workflows/ci.yml)
[![License: AGPL-3.0-only](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)

> 当前以 macOS 为唯一产品发布目标。Electron 代码和自动化检查存在，不等于已发布、已签名或已公证的 macOS 产品。

## 目标

先对齐官方闭源 Codex Desktop 的可观察功能与体验：Codex thread、审批、停止与恢复、标准 Codex Home、文件、终端、Git、diff、通知，以及 main-owned in-app Browser 和 Computer Use。

BlackRain 的 Router、多模型 Provider、Gateway 和 Auto 是后续可选扩展层。它们不得引入第二个 agent runtime，也不得接管 thread、turn、审批或 Browser 状态。云端账号、托管模型、Cloud Browser 和团队服务不属于当前范围；将来需要时在独立的 BlackRain Cloud 中建设。

## 快速开始

需要 macOS、Node.js 22 和 Git。Electron 发行脚本仍在从历史 Windows 配置迁移中；不要把现有打包命令视作 macOS 发行流程。

```sh
cd apps/desktop
npm ci
npm run electron:start
```

完整命令、测试与发布边界见[开发文档](docs/development.md)。

## 文档

[文档地图](docs/README.md) · [产品定义](docs/product.md) · [架构](docs/architecture.md) · [Browser 与 Computer Use](docs/browser.md) · [上游与来源](docs/upstream.md)

## 参与贡献

阅读 [CONTRIBUTING.md](CONTRIBUTING.md)，从 [Issue #95](https://github.com/goodbyeri-studio/blackrain-desktop/issues/95) 或 [Good first issue](https://github.com/goodbyeri-studio/blackrain-desktop/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) 开始。

## 商业授权与支持

BlackRain 自有代码采用 [GNU Affero General Public License v3.0 only](LICENSE)。AGPL 允许商业使用，但分发修改版或通过网络提供修改版服务时必须履行相应的源码提供和许可证义务。需要将 BlackRain 闭源集成到专有产品、服务或发行包时，请联系维护者获取单独的商业授权；商业授权不覆盖 [NOTICE](NOTICE) 中列出的第三方组件。

- 商业授权与项目联系：[goodbyeri-studio](https://github.com/goodbyeri-studio)，或扫描下方微信二维码。
- 赞赏支持：扫描下方赞赏码。赞赏不代表获得商业授权、支持承诺或服务等级协议。

<table>
  <tr>
    <td align="center">微信联系方式<br><img src="docs/assets/wechat-contact.jpg" width="240" alt="微信联系方式二维码"></td>
    <td align="center">赞赏支持<br><img src="docs/assets/wechat-support.jpg" width="240" alt="赞赏二维码"></td>
  </tr>
</table>

## 许可证

BlackRain 自有代码采用 [AGPL-3.0-only](LICENSE)，第三方归属见 [NOTICE](NOTICE)。项目独立于 OpenAI、ChatGPT 和 Cursor，不复制其闭源代码或专有资源。商业授权说明见 [COMMERCIAL-LICENSE.md](COMMERCIAL-LICENSE.md)。
