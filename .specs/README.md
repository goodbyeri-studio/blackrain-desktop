# BlackRain Living Specs

当前只维护一个业务 spec：

- [001 内置浏览器](001-in-app-browser/)：唯一当前 P0，包含所需的 Electron、App Server、Browser client、安全、恢复和 Windows 验收。

其他产品路线没有当前 spec。Gateway、账号、插件、GUI、Windows Tauri、工作台和平台编排的旧 spec 已从当前树删除；历史内容仍可从 Git 读取，但不构成当前路线图。

## 规则

1. 同一时刻只保留一个当前业务 spec。
2. 当前 P0 完成前不新建下一项 spec；直接依赖写入 001。
3. `tasks.md` 只放未完成任务；完成事实写入 `verification.md`。
4. 新优先级必须先修改产品真源，再决定替换当前 spec，而不是并列堆叠。
5. 每个业务 spec 保留 requirements/design/tasks/decisions/verification 五个文件。
