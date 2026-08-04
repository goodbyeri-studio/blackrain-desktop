# OfficeCLI 交付历史说明

OfficeCLI 与工作台路线已暂停。历史 vendor/build/install 命令和旧安装器资源路径已删除，当前 Windows Electron MSIX 不交付 OfficeCLI。

`plugins/office-cli/` 中保留的文件仅是冻结资产。若未来恢复，必须先调整产品优先级并新建 living spec，覆盖许可证与二进制 hash、Electron main 权限、原装 app-server 工具路由，以及正式签名 MSIX 的完整生命周期验收。
