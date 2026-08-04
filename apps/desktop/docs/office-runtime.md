# Office Runtime 历史边界

Office 参考工作台与 OfficeCLI 产品路线已暂停。旧 Desktop runtime bridge、安装资源映射和构建入口已随 Electron native-clean 迁移删除；`plugins/office-cli/` 只保留冻结资产，不进入当前 MSIX、导航或发布承诺。

恢复前必须建立新的独立 spec，重新完成许可证、供应链、权限、工具调用、Windows package/install 和产品验收。当前 `002-electron-migration` 的通过状态不证明 Office 能力可用。
