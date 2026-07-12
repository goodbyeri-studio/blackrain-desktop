# Hermes Windows runtime slot

`windows-x64/` 是发布前生成的 BlackRain 基础 runtime，不提交二进制和 venv。

真源：

- `windows-x64.manifest.json`：冻结 Python、Hermes、锁文件 hash、额外/禁止包、BlackRain MCP router hash 和入口。
- `scripts/vendor-hermes-runtime.ps1`：在 Windows 构建机创建 relocatable venv、验证 asyncio/import、收集 License/NOTICE/provenance/checksum。
- `.specs/009-hermes-work-surface/`：实现与验证状态。

生成目录必须包含 `python/`、`venv/`、`blackrain-mcp-router.py`、`LICENSES/`、`NOTICE.txt`、`provenance/`、`packages.lock.txt` 和 `SHA256SUMS`。router 使用同一随包 venv 的锁定 `mcp`/Starlette/Uvicorn 依赖，不依赖系统 Python。doctor 会拒绝未被 checksum 覆盖的额外文件、符号链接、缺失的 managed Python/router 和与冻结 manifest/hash 不一致的 runtime。目录存在不代表 Windows 产品验收通过。
