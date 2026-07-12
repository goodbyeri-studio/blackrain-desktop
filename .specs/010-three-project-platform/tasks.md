# Tasks

## 阶段 0：冻结边界

- [x] 确认三项目名称、职责和可见性
- [x] 确认 Cloud 是 Relay 企业客户而非共享数据库的内嵌模块
- [x] 确认 Relay 允许采用公开 AGPL New API 路线并保留署名
- [x] 明确三个项目不等于 Cloud/Relay 立即拆成大量微服务

## 阶段 1：仓库治理

- [x] 将 `goodbyeri-studio/BlackRain` 重命名为 `goodbyeri-studio/blackrain-desktop`
- [x] 创建私有 `goodbyeri-studio/blackrain-cloud`
- [x] 创建公开 `goodbyeri-studio/blackrain-relay`
- [x] 更新 Desktop 本地 `origin`
- [x] 更新 Desktop 文档、GitHub Flow 命令、updater URL 和 AGPL 边界

## 阶段 2：Cloud 资产迁移与最小闭环

- [x] 将 Supabase 配置、migration、邮件模板迁入 Cloud 并建立唯一真源
- [x] 将历史 proxy、credit 计算、测试和镜像迁入 Cloud legacy 留档
- [x] 从 Desktop 删除服务端资产，保留客户端账户层和 CODE 本地翻译网关
- [ ] 在 Cloud 建立模块化单体运行时骨架和 OpenAPI
- [ ] 实现 Supabase JWT 校验与 BlackRain entitlement
- [ ] 实现 Cloud service account -> Relay scoped model token broker
- [ ] 冻结 Supabase 商业 ledger 与 Relay usage/批发账单的幂等对账合同

## 阶段 3：Relay 最小闭环

- [ ] 建立公开 AGPL 仓库、LICENSE、NOTICE、上游来源和版本锁
- [ ] 部署锁定 New API，保留要求的署名与原项目链接
- [ ] 配置官方模型渠道、模型白名单、倍率、限流、日志和备份
- [ ] 对 Cloud 提供企业客户、sub-token、usage 和管理 API
- [ ] 分别跑 WORK Chat 与 CODE Responses/本地翻译协议探针

## 阶段 4：收口

- [ ] Windows Desktop 登录、token exchange、双引擎同余额 E2E
- [ ] Cloud/Relay 故障、撤销、过期、重复 usage、退款与日终对账矩阵
- [ ] 独立部署、备份恢复、密钥轮换、监控和告警
- [ ] 正式法律复核 AGPL 组合、模型厂商转售条款和国内运营合规
