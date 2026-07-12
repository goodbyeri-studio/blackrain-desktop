<!-- 标题请用 Conventional 格式，如：feat: 新增 DeepSeek provider 配置面板 -->

## 改了什么
<!-- 一两句说清这个 PR 做了什么、解决什么问题 -->

## 怎么测的
<!-- 写出真实命令、平台、结果和未验证项；不要只写“CI 绿”。 -->
- [ ] 已运行与改动匹配的 typecheck / test / lint / cargo check（不涉及则说明）
- [ ] 涉及 GUI、双引擎、凭据、Office、NSIS 或安装流程时，已在 Windows 实机验证；未跑的项目已明确列出
- [ ] 涉及发布时，已验证 NSIS 安装、开始菜单启动、真实对话和卸载（不涉及则说明）

## 文档与 living spec

- [ ] 产品形态变化已同步 `docs/04-产品形态.md`
- [ ] 运行时边界变化已同步 `docs/09-运行时架构与里程碑.md`
- [ ] 工作台 Manifest、依赖、权限或生命周期变化已同步 `.specs/008-expert-workbench-package/`
- [ ] 有对应 living spec 时，已同步 `tasks.md` / `decisions.md` / `verification.md`，并写入真实验证结果
- [ ] 不涉及上述文档时，已在说明中写明原因

## License 与密钥

- [ ] 新增第三方代码/依赖/资产已列明来源、许可证及 NOTICE/署名处理（不涉及则说明）
- [ ] 工作台包未包含作者凭据、Cookie、客户数据、商业软件副本或无权再分发的文件
- [ ] 未引入 AGPL / GPL / BSL / 无许可证代码
- [ ] diff、日志、截图、fixture 和文档中没有真实 API key、JWT、cookie、私有 URL 或未脱敏用户数据

## 风险与影响
<!-- 有无破坏性改动、影响哪些模块、需要别人注意什么。无则写「无」 -->

<!-- 若有 Windows 实机未验证项、上游锁版本变化或待决架构问题，请在这里明确列出。 -->

## 关联
<!-- 关联的 issue / 文档 / 里程碑，可选 -->
