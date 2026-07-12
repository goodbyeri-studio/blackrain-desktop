# Tasks

## 阶段 0：冻结最小边界

- [x] 确认正式产品关系：`Skill + 插件 + 环境 + 资源 + 验证 → 工作台 → 工作室`
- [x] 确认工作台是核心商品，双引擎是执行实现
- [x] 创建本 spec 五件套
- [x] 盘点 Office 参考工作台当前所有资源、注入路径和 License
- [x] 确认首版只支持 Windows x64 和官方签名/随包工作台
- [x] 决定 Manifest 格式、schema 校验库和版本策略
- [x] 决定受控安装路径、用户项目路径和共享依赖策略

## 阶段 1：最小 Manifest 与只读检查

- [x] 定义 `workbench.yaml` v1 schema
- [x] 为 schema 提供正反例 fixtures
- [x] 实现 shared core 的 manifest parse/validate
- [ ] 实现依赖、权限、License、空间和兼容性 inspect
- [x] 前端展示工作台详情和安装计划，只读不安装
- [ ] App 与 Daemon 提供一致的 inspect RPC
- [x] 将 Office 骨架迁移成首个 v1 manifest

> 2026-07-12：v1 使用 UTF-8 YAML + `serde_yaml_ng` 严格反序列化（所有对象 `deny_unknown_fields`），当前只接受 Windows x64、`preferred/allowed=[work]`、安全包内相对路径、最多 256 项列表和 `sha256:` 完整性声明。Core inspect 会拒绝 manifest/资源 symlink、路径穿越、重复身份、非法依赖 scope/checksum，并要求每个 Skill 目录含 `SKILL.md`。App 只允许 inspect 官方 allowlist 中的 `com.blackrain.office`，前端仅展示声明，不提供 install/activate 写入口；Daemon parity、空间/BlackRain semver/签名/系统依赖探针仍未完成，因此相关总项保持未勾选。

## 阶段 2：官方工作台安装与激活

- [x] 实现版本化 staging/active/state 目录
- [x] 支持 `bundled` 依赖
- [ ] 支持 `system` 依赖检测和用户引导
- [ ] 接入系统凭据槽位，不在 manifest/settings 落密钥
- [x] 实现 install / health / activate / deactivate
- [x] 将工作台 Skills、插件和项目路径映射给 Hermes WORK surface
- [x] 保持 App 是唯一引擎配置写入者
- [x] 完成 Office 参考工作台安装后 smoke

> 2026-07-12：官方 Office v0.1.0 已形成首个 local-only Core lifecycle：仅 Windows x64 command 可从 App allowlist 资源进入；工作台包复制到 `workbenches/com.blackrain.office/versions/0.1.0`，OfficeCLI 经 SHA-256 和 `--version` 后安装到 `tools/officecli`，随后在 App-data 临时 smoke 项目执行 `create smoke-output.docx --locale en-US --json`、确认输出存在并执行 `validate --json`，任一失败都不签发 activation，临时输出随后清理。通过后才依据用户选择的既有项目目录签发 read-write permission grant、`SystemCapability: officecli-1.0.117` 和 `ActivatedWorkbenchContext`。staging/版本目录、`active.json`/`state.json`、前端项目选择与 DS 权限确认已接通；App 启动不再无条件复制 OfficeCLI。当前 smoke 仅由可执行 fixture 自动验证，未在 Windows 真实 OfficeCLI 上运行；升级/回滚、共享引用计数、签名、空间检查、system/user-provided 依赖和 Daemon parity 仍未完成，不能写成完整 008 生命周期完成。

## 阶段 3：升级、回滚和卸载

- [x] 冻结不可变 activation generation、task/session 迁移资格、审计和失败回滚合同
- [ ] 实现 activation generation migration shared Core 状态机和持久审计
- [ ] 迁移 API 仅接受 task + target activation 身份，不接受前端资源/env/runtime 覆盖
- [ ] 覆盖 active run 拒绝、跨工作台/项目拒绝、新资源未验证拒绝和失败原子回滚
- [ ] 实现新版本 staging 安装和原子激活
- [ ] 健康检查失败自动回滚
- [ ] 共享依赖引用计数
- [ ] 卸载保留用户项目
- [ ] 报告无法删除的残留项
- [ ] 失败注入覆盖断网、磁盘不足、进程残留和依赖冲突

> 2026-07-12：generation 合同以新 `activationId` 表达资源变化，旧 activation 不原地改写。既有 task 默认 pinned；仅同 workbench、同 project、无 active run 且新资源全部 install/verify/permission 通过时可显式迁移。session 可保留但下一 run 使用新 generation，迁移必须持久化旧/新 activation、时间、原因和结果；runtime/router readiness 失败同时恢复旧 task binding 与 active generation。当前只冻结合同，shared Core 状态机、API、router 和 Windows 验证均未实现。

## 阶段 4：发布级安全与来源

- [ ] 建立包内来源和 License 清单
- [ ] 校验 checksum，禁止路径穿越和包外写入
- [ ] 定义官方包签名与信任根
- [ ] 安装前权限和网络数据流审批
- [ ] 生成/检查发行 NOTICE
- [ ] Windows VM 运行安装、升级、回滚、卸载矩阵

## 阶段 5：第二垂类验证抽象

- [ ] 与真实领域专家选择第二套工作台
- [ ] 不复制 Office 特例，验证 schema 是否足够通用
- [ ] 覆盖至少一个 `managed` 或 `user-provided` 依赖
- [ ] 覆盖商业宿主软件或数据源授权场景
- [ ] 记录需要进入 v2 schema 的真实缺口

## post-MVP：市场与工作室

- [ ] 第三方包上传、签名、审核和分发另建 spec
- [ ] 专家/封装者联合署名和分成另建 spec
- [ ] 工作室多岗位编排另建 spec
- [ ] 高责任领域合规分类另建 spec

## 收口纪律

- [ ] 每个任务分别记录代码/配置存在、Windows 验证通过、发布可交付
- [ ] 同步 `README.md`、`docs/04`、`plugins/README.md`、`workbenches/README.md`
- [ ] 所有真实命令和结果写入 `verification.md`
- [ ] 未实现字段和开放问题不得在产品文档写成现有能力
