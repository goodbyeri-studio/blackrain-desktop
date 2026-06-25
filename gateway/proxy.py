#!/usr/bin/env python3
"""002-accounts-credits / M-A2：平台 credit 代理（独立 Chat Completions 转发器）。

职责（且仅此）：校验 Supabase JWT → 查/扣 credit → 注入平台 DeepSeek key → usage 计量。
**不做 responses⇄chat 翻译**（那只留在本地网关 gateway.py 一份，铁律 2）。
入站/出站皆 OpenAI Chat Completions，与未来 new-api 同形态，便于零改动顶替。

数据流（credit 模式）：
    内核(Responses) → 本地网关(翻译成 Chat, base_url=本代理, Bearer=用户 JWT)
        → 本代理(校验 JWT + 查余额 + 注平台 key + 转发 + 计量扣 credit) → DeepSeek

环境变量（部署常驻服务时设；本地调试可用 .env）：
    SUPABASE_URL                 必填，形如 https://xxxx.supabase.co
    SUPABASE_SERVICE_ROLE_KEY    必填，查余额 / 调 spend_credits（绕 RLS）
    SUPABASE_ANON_KEY            必填，校验用户 JWT（/auth/v1/user 需 apikey）
    DEEPSEEK_API_KEY             必填，平台 DeepSeek key（只在服务端，绝不下发桌面）
    PROXY_PORT                   默认 8800
    DEEPSEEK_BASE_URL            默认 https://api.deepseek.com
    PROXY_LOG                    日志文件路径（默认 stderr）

跑：cd gateway && python3 proxy.py
"""

import http.server
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

from credit_math import MULTIPLIERS, credits_for_usage, model_multiplier

SUPABASE_URL = (os.environ.get("SUPABASE_URL") or "").rstrip("/")
SERVICE_ROLE_KEY = (os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
ANON_KEY = (os.environ.get("SUPABASE_ANON_KEY") or "").strip()
DEEPSEEK_KEY = (os.environ.get("DEEPSEEK_API_KEY") or "").strip()
DEEPSEEK_BASE_URL = (os.environ.get("DEEPSEEK_BASE_URL") or "https://api.deepseek.com/v1").rstrip("/")
PORT = int(os.environ.get("PROXY_PORT") or "8800")
# 绑定地址：默认仅本机（安全）。容器/主机部署时显式设 PROXY_HOST=0.0.0.0 才对外服务。
HOST = (os.environ.get("PROXY_HOST") or "127.0.0.1").strip()
LOG_PATH = (os.environ.get("PROXY_LOG") or "").strip()


def redact(value):
    """脱敏：保留前 4 后 2，中间星号。空值返回占位。"""
    if not value:
        return "<empty>"
    s = str(value)
    if len(s) <= 8:
        return "****"
    return f"{s[:4]}…{s[-2:]}"


def log(*parts):
    line = "[proxy] " + " ".join(str(p) for p in parts)
    if LOG_PATH:
        with open(LOG_PATH, "a", encoding="utf-8") as fh:
            fh.write(line + "\n")
    else:
        print(line, file=sys.stderr, flush=True)


# ---------- 错误类型 ----------
class ProxyError(Exception):
    """带 HTTP 状态码与结构化错误体的代理错误。"""

    def __init__(self, status, code, message):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message

    def body(self):
        return {"error": {"code": self.code, "message": self.message}}


# ---------- Supabase 交互 ----------
def _supabase_get(path, headers, timeout=15):
    req = urllib.request.Request(SUPABASE_URL + path, headers=headers, method="GET")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read().decode()
        return resp.status, (json.loads(raw) if raw.strip() else None)


def _supabase_post(path, headers, body, timeout=15):
    data = json.dumps(body).encode()
    req = urllib.request.Request(SUPABASE_URL + path, data=data, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read().decode()
        return resp.status, (json.loads(raw) if raw.strip() else None)


def verify_jwt(bearer):
    """用 Supabase /auth/v1/user 校验用户 JWT，返回 user_id。

    走 Supabase 服务端校验（自动处理过期/签名），避免本地手搓 crypto。
    无效/过期 → 401。
    """
    if not bearer:
        raise ProxyError(401, "missing_token", "缺少 Authorization Bearer。")
    try:
        status, user = _supabase_get(
            "/auth/v1/user",
            {"apikey": ANON_KEY, "Authorization": f"Bearer {bearer}"},
        )
    except urllib.error.HTTPError as e:
        raise ProxyError(401, "invalid_token", f"JWT 校验失败（{e.code}）。")
    if status != 200 or not user or not user.get("id"):
        raise ProxyError(401, "invalid_token", "JWT 无效或已过期。")
    return user["id"]


def get_balance(user_id):
    """查 profiles.credits。返回 float。查不到 → 视为 0（无 profile 不放行）。"""
    status, rows = _supabase_get(
        f"/rest/v1/profiles?id=eq.{urllib.parse.quote(user_id)}&select=credits",
        {"apikey": SERVICE_ROLE_KEY, "Authorization": f"Bearer {SERVICE_ROLE_KEY}"},
    )
    if status != 200 or not rows:
        return 0.0
    return float(rows[0].get("credits") or 0)


def spend_credits(user_id, cost, model, in_tok, out_tok):
    """调 Postgres RPC 原子扣减 + 写流水。返回新余额；失败抛异常（不阻断已完成的回复）。"""
    status, new_balance = _supabase_post(
        "/rest/v1/rpc/spend_credits",
        {
            "apikey": SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
            "Content-Type": "application/json",
        },
        {"uid": user_id, "cost": cost, "model": model, "in_tok": in_tok, "out_tok": out_tok},
    )
    return new_balance


# ---------- 模型路由 ----------
def allowed_model(requested):
    """只放行平台允许的模型（倍率表里的）。未知模型 → 400。"""
    if requested in MULTIPLIERS:
        return requested
    raise ProxyError(
        400,
        "unsupported_model",
        f"平台不支持模型 `{requested}`。可用：{', '.join(sorted(MULTIPLIERS))}。",
    )


def gateway_models_payload():
    """GET /v1/models：返回平台允许的模型 + 倍率元数据。"""
    return {
        "object": "list",
        "data": [
            {
                "id": mid,
                "object": "model",
                "owned_by": "blackrain",
                "credit_multiplier": mult,
            }
            for mid, mult in sorted(MULTIPLIERS.items())
        ],
    }


# ---------- 转发到 DeepSeek + usage 计量 ----------
def forward_stream(chat_body):
    """注平台 key、强制 stream + include_usage，转发到 DeepSeek。

    逐行 yield 原始 SSE 字节（透传给本地网关，不翻译）；
    末尾通过闭包 captured['usage'] 暴露嗅探到的 usage。
    """
    body = {**chat_body, "stream": True, "stream_options": {"include_usage": True}}
    data = json.dumps(body).encode()
    url = f"{DEEPSEEK_BASE_URL}/chat/completions"
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Authorization": f"Bearer {DEEPSEEK_KEY}", "Content-Type": "application/json"},
        method="POST",
    )
    captured = {"usage": None}

    def gen():
        with urllib.request.urlopen(req, timeout=300) as r:
            for raw in r:
                line = raw.decode("utf-8", "replace")
                stripped = line.strip()
                if stripped.startswith("data:"):
                    payload = stripped[5:].strip()
                    if payload and payload != "[DONE]":
                        try:
                            chunk = json.loads(payload)
                            if chunk.get("usage"):
                                captured["usage"] = chunk["usage"]
                        except Exception:
                            pass
                yield raw  # 原样透传

    return gen(), captured


# ---------- HTTP handler ----------
class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass  # 静音默认访问日志（含敏感 URL/header），改用 log() 脱敏输出。

    def _send_json(self, code, payload):
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(payload, ensure_ascii=False).encode())

    def _bearer(self):
        header = self.headers.get("Authorization", "")
        prefix = "Bearer "
        return header[len(prefix):].strip() if header.startswith(prefix) else ""

    def do_GET(self):
        path = urllib.parse.urlparse(self.path).path
        if path.endswith("/health"):
            self._send_json(200, {"ok": True, "service": "blackrain-credit-proxy"})
            return
        if path.endswith("/models"):
            self._send_json(200, gateway_models_payload())
            return
        self._send_json(404, {"error": {"code": "not_found", "message": f"未知路径 {path}"}})

    def do_POST(self):
        path = urllib.parse.urlparse(self.path).path
        if not path.endswith("/chat/completions"):
            self._send_json(404, {"error": {"code": "not_found", "message": f"未知路径 {path}"}})
            return
        try:
            user_id = verify_jwt(self._bearer())
            n = int(self.headers.get("Content-Length", 0) or 0)
            chat_body = json.loads(self.rfile.read(n)) if n else {}
            model = allowed_model(chat_body.get("model"))

            # 转发前门禁：余额 > 0 才放行（强一致，接受并发小幅超卖）。
            balance = get_balance(user_id)
            if balance <= 0:
                raise ProxyError(402, "insufficient_credits", "额度不足，请升级或充值。")

            log("REQ user:", redact(user_id), "model:", model, "balance:", round(balance, 3))
            stream, captured = forward_stream(chat_body)

            # 透传 SSE
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.end_headers()
            for raw in stream:
                self.wfile.write(raw)
                self.wfile.flush()

            # 收尾计量扣费（回复已完整发出；扣费失败只记日志，不影响用户已收到的内容）。
            usage = captured["usage"] or {}
            in_tok = int(usage.get("prompt_tokens") or 0)
            out_tok = int(usage.get("completion_tokens") or 0)
            cost = credits_for_usage(model, in_tok, out_tok)
            try:
                new_balance = spend_credits(user_id, cost, model, in_tok, out_tok)
                log(
                    "METER user:", redact(user_id), "model:", model,
                    "in:", in_tok, "out:", out_tok,
                    "x:", model_multiplier(model), "cost:", cost, "balance:", new_balance,
                )
            except Exception as e:
                log("METER-FAIL user:", redact(user_id), "cost:", cost, "err:", repr(e))

        except ProxyError as e:
            self._fail(e.status, e.code, e.message)
        except urllib.error.HTTPError as e:
            self._fail(502, "upstream_error", f"上游错误（{e.code}）。")
        except Exception as e:
            log("ERROR:", repr(e))
            self._fail(500, "proxy_error", "代理内部错误。")

    def _fail(self, status, code, message):
        """失败响应。若响应头未发，回 JSON；已发（流中途断）则尽力发一个 SSE error。"""
        if not getattr(self, "_headers_sent", False) and not self.wfile.closed:
            try:
                self._send_json(status, {"error": {"code": code, "message": message}})
                return
            except Exception:
                pass
        try:
            self.wfile.write(
                f"data: {json.dumps({'error': {'code': code, 'message': message}})}\n\n".encode()
            )
            self.wfile.flush()
        except Exception:
            pass


def _require_env():
    missing = [
        name
        for name, val in [
            ("SUPABASE_URL", SUPABASE_URL),
            ("SUPABASE_SERVICE_ROLE_KEY", SERVICE_ROLE_KEY),
            ("SUPABASE_ANON_KEY", ANON_KEY),
            ("DEEPSEEK_API_KEY", DEEPSEEK_KEY),
        ]
        if not val
    ]
    if missing:
        print(f"[proxy] 缺少环境变量：{', '.join(missing)}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    _require_env()
    log(
        f"{HOST}:{PORT} supabase={redact(SUPABASE_URL)} deepseek={DEEPSEEK_BASE_URL}",
        "models=" + ",".join(sorted(MULTIPLIERS)),
    )
    try:
        http.server.HTTPServer((HOST, PORT), Handler).serve_forever()
    except KeyboardInterrupt:
        pass
