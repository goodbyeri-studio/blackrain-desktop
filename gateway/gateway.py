#!/usr/bin/env python3
"""最小 responses⇄chat 翻译网关：把 codex 内核(Responses API)的请求译成
OpenAI-compatible Chat Completions，再把回复译回内核能解析的 Responses SSE 序列。

零依赖(stdlib)。第一版聚焦文本路径：STRIP_TOOLS=1 时剥掉 tools 逼纯文本回复，
先证通主链(请求翻译 + SSE 事件顺序 + 内核渲染)，再攻工具调用。
"""
import http.server, json, os, re, urllib.error, urllib.parse, urllib.request, uuid

PORT = int(os.environ.get("GW_PORT", "8899"))
STRIP_TOOLS = os.environ.get("STRIP_TOOLS", "1") == "1"
LOG = os.environ.get("GW_LOG", "/tmp/gateway.log")
# App 与本地网关之间的能力 token。设置后强制校验 Authorization；
# 未设置时（手动调试）跳过校验，方便本地起网关。
GATEWAY_TOKEN = (os.environ.get("BLACKRAIN_GATEWAY_API_KEY") or "").strip()

DEFAULT_PROVIDER = {
    "id": "deepseek",
    "name": "DeepSeek",
    "kind": "openai-compatible",
    "base_url": "https://api.deepseek.com/v1",
    "api_key_env": "DEEPSEEK_API_KEY",
    "models": [
        {
            "id": "deepseek-v4-flash",
            "model": "deepseek-v4-flash",
            "display_name": "DeepSeek V4 Flash",
            "description": "高性价比主力 · 1M 上下文",
            "is_default": True,
        },
        {
            "id": "deepseek-v4-pro",
            "model": "deepseek-v4-pro",
            "display_name": "DeepSeek V4 Pro",
            "description": "旗舰 1.6T · 1M 上下文 · 攻坚",
            "is_default": False,
        },
    ],
}

def redact(value):
    text = str(value)
    text = re.sub(r"Bearer\s+[A-Za-z0-9._~+/=-]{8,}", "Bearer <redacted>", text)
    text = re.sub(
        r"(?i)(authorization['\"]?\s*[:=]\s*['\"]?)Bearer\s+[^'\"\s,}]+",
        r"\1Bearer <redacted>",
        text,
    )
    for env_name, env_value in os.environ.items():
        if not env_value or len(env_value) < 8:
            continue
        upper_name = env_name.upper()
        if not any(marker in upper_name for marker in ("API_KEY", "TOKEN", "SECRET")):
            continue
        text = text.replace(env_value, "<redacted>")
    return text[:2000] + "..." if len(text) > 2000 else text

def log(*a):
    with open(LOG, "a") as f:
        f.write(" ".join(redact(x) for x in a) + "\n")

def _as_bool(value, default=True):
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() not in ("0", "false", "no", "off")

def _as_str(value, fallback=""):
    if value is None:
        return fallback
    return str(value)

def load_provider_configs():
    """Load the model gateway registry.

    Extra providers can be supplied through BLACKRAIN_MODEL_GATEWAY_PROVIDERS or
    GW_PROVIDERS_JSON as a JSON array. Later entries replace earlier entries
    with the same id, so local development can override the built-in DeepSeek
    default without editing this file.
    """
    providers = [DEFAULT_PROVIDER]
    raw = (
        os.environ.get("BLACKRAIN_MODEL_GATEWAY_PROVIDERS")
        or os.environ.get("GW_PROVIDERS_JSON")
    )
    if raw and raw.strip():
        try:
            extra = json.loads(raw)
            if isinstance(extra, list):
                providers.extend(extra)
            else:
                log("provider registry ignored: JSON root is not a list")
        except Exception as exc:
            log("provider registry ignored:", repr(exc))

    merged = {}
    for provider in providers:
        if not isinstance(provider, dict):
            continue
        pid = _as_str(provider.get("id")).strip()
        if not pid:
            continue
        merged[pid] = provider
    return [normalize_provider(provider) for provider in merged.values()]

def normalize_provider(provider):
    pid = _as_str(provider.get("id")).strip()
    name = _as_str(provider.get("name"), pid).strip() or pid
    base_url = _as_str(
        provider.get("base_url") or provider.get("baseUrl"),
        "",
    ).strip()
    api_key_env = _as_str(
        provider.get("api_key_env") or provider.get("apiKeyEnv"),
        "",
    ).strip()
    api_key = _as_str(provider.get("api_key") or provider.get("apiKey"), "").strip()
    enabled = _as_bool(provider.get("enabled"), True)
    models = provider.get("models")
    if not isinstance(models, list):
        models = []
    return {
        "id": pid,
        "name": name,
        "kind": _as_str(provider.get("kind"), "openai-compatible"),
        "base_url": base_url,
        "api_key_env": api_key_env,
        "api_key": api_key,
        "enabled": enabled,
        "models": [
            normalize_model(pid, name, item, index)
            for index, item in enumerate(models)
        ],
    }

def normalize_model(provider_id, provider_name, item, index):
    if isinstance(item, str):
        raw = item
        record = {}
    elif isinstance(item, dict):
        record = item
        raw = _as_str(record.get("model") or record.get("id"), "")
    else:
        record = {}
        raw = ""

    upstream_model = raw.strip() or f"model-{index + 1}"
    explicit_id = _as_str(record.get("id") or record.get("public_id") or record.get("publicId"), "").strip()
    if explicit_id:
        public_id = explicit_id
    elif provider_id == "deepseek":
        public_id = upstream_model
    else:
        public_id = f"{provider_id}/{upstream_model}"

    display_name = _as_str(
        record.get("display_name") or record.get("displayName"),
        upstream_model,
    ).strip() or upstream_model
    description = _as_str(record.get("description"), "").strip()
    return {
        "id": public_id,
        "model": upstream_model,
        "display_name": display_name,
        "description": description,
        "provider_id": provider_id,
        "provider_name": provider_name,
        "is_default": _as_bool(record.get("is_default") or record.get("isDefault"), False),
    }

PROVIDERS = load_provider_configs()

def list_gateway_models():
    out = []
    for provider in PROVIDERS:
        if not provider["enabled"]:
            continue
        for model in provider["models"]:
            out.append({
                "id": model["id"],
                "object": "model",
                "model": model["id"],
                "displayName": model["display_name"],
                "description": model["description"],
                "providerId": model["provider_id"],
                "providerName": model["provider_name"],
                "isDefault": model["is_default"],
            })
    if out and not any(item["isDefault"] for item in out):
        out[0]["isDefault"] = True
    return out

def default_model_id():
    models = list_gateway_models()
    for model in models:
        if model.get("isDefault"):
            return model["id"]
    return models[0]["id"] if models else "deepseek-v4-flash"

def resolve_model_route(requested_model):
    wanted = _as_str(requested_model, "").strip() or default_model_id()
    fallback = None
    upstream_match = None
    for provider in PROVIDERS:
        if not provider["enabled"]:
            continue
        for model in provider["models"]:
            route = {"provider": provider, "model": model}
            fallback = fallback or route
            if wanted == model["id"]:
                return route
            if wanted == model["model"]:
                upstream_match = upstream_match or route
            prefixed = f'{provider["id"]}/{model["model"]}'
            if wanted == prefixed:
                return route
    if upstream_match:
        return upstream_match
    if not wanted and fallback:
        return fallback
    raise RuntimeError(f"Unknown model `{wanted}` in BlackRain gateway registry")

def provider_chat_url(provider):
    base = provider["base_url"].rstrip("/")
    if base.endswith("/chat/completions"):
        return base
    return f"{base}/chat/completions"

# ---------- 请求翻译: Responses → Chat Completions ----------
def responses_to_chat(body, upstream_model):
    msgs = []
    if body.get("instructions"):
        msgs.append({"role": "system", "content": body["instructions"]})
    for item in body.get("input", []):
        t = item.get("type")
        if t == "message":
            role = item.get("role", "user")
            if role == "developer":
                role = "system"
            texts = []
            for c in item.get("content", []):
                if c.get("type") in ("input_text", "output_text", "text"):
                    texts.append(c.get("text", ""))
            msgs.append({"role": role, "content": "\n".join(texts)})
        elif t == "function_call":
            msgs.append({"role": "assistant", "content": None, "tool_calls": [{
                "id": item.get("call_id"), "type": "function",
                "function": {"name": item.get("name"), "arguments": item.get("arguments", "{}")},
            }]})
        elif t == "function_call_output":
            out = item.get("output", "")
            if isinstance(out, dict):
                out = out.get("content", json.dumps(out, ensure_ascii=False))
            msgs.append({"role": "tool", "tool_call_id": item.get("call_id"), "content": str(out)})

    chat = {"model": upstream_model, "messages": msgs, "stream": False}
    if not STRIP_TOOLS:
        tools = []
        for tdef in body.get("tools", []):
            if tdef.get("type") == "function":
                tools.append({"type": "function", "function": {
                    "name": tdef.get("name"),
                    "description": tdef.get("description", ""),
                    "parameters": tdef.get("parameters", {"type": "object", "properties": {}}),
                }})
        if tools:
            chat["tools"] = tools
            chat["tool_choice"] = "auto"
    return chat

# ---------- 调 OpenAI-compatible provider ----------
class ProviderHTTPError(Exception):
    """上游/代理返回非 2xx。携带状态码与结构化错误码，供 do_POST 转 response.failed。"""

    def __init__(self, status, code, message):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


def resolve_provider_key(provider):
    """解析 provider 的鉴权 key，优先级：inline api_key → api_key_file → env。

    api_key_file（credit 模式用）：每次请求都重新读盘，拿最新 JWT——
    App 在 Supabase 刷新 token 时更新该文件，网关无需重启。见 002 decisions「JWT 每请求读文件」。
    """
    inline = provider.get("api_key")
    if inline:
        return inline.strip()
    key_file = provider.get("api_key_file") or provider.get("apiKeyFile")
    if key_file:
        try:
            with open(key_file, "r", encoding="utf-8") as fh:
                value = fh.read().strip()
            if value:
                return value
        except FileNotFoundError:
            return None
        except OSError as exc:
            log("api_key_file 读取失败:", repr(exc))
            return None
    api_key_env = provider.get("api_key_env")
    if api_key_env:
        return (os.environ.get(api_key_env) or "").strip() or None
    return None


def call_provider_stream(provider, chat):
    """流式调 provider，逐块 yield delta dict（含 content / reasoning_content / tool_calls）。
    末尾 yield ('__usage__', usage_dict) 一次（若上游给了 usage）。"""
    chat = {**chat, "stream": True, "stream_options": {"include_usage": True}}
    data = json.dumps(chat).encode()
    key = resolve_provider_key(provider)
    if not key:
        raise RuntimeError(
            f"Missing API key for provider `{provider['id']}`"
            + (f" (env {provider['api_key_env']})" if provider.get("api_key_env") else "")
        )
    req = urllib.request.Request(provider_chat_url(provider), data=data, headers={
        "Authorization": f"Bearer {key}", "Content-Type": "application/json",
    })
    try:
        upstream = urllib.request.urlopen(req, timeout=120)
    except urllib.error.HTTPError as e:
        # 代理/上游错误：尽力解析结构化错误体（如 402 insufficient_credits）。
        raw = ""
        try:
            raw = e.read().decode("utf-8", "replace")
        except Exception:
            pass
        code = "upstream_error"
        message = f"上游返回 {e.code}。"
        try:
            parsed = json.loads(raw)
            err = parsed.get("error") if isinstance(parsed, dict) else None
            if isinstance(err, dict):
                code = err.get("code") or code
                message = err.get("message") or message
        except Exception:
            pass
        raise ProviderHTTPError(e.code, code, message)
    with upstream as r:
        for raw in r:
            line = raw.decode("utf-8", "replace").strip()
            if not line.startswith("data:"):
                continue
            payload = line[5:].strip()
            if payload == "[DONE]":
                break
            try:
                chunk = json.loads(payload)
            except Exception:
                continue
            if chunk.get("usage"):
                yield ("__usage__", chunk["usage"])
            choices = chunk.get("choices") or []
            if choices:
                yield ("__delta__", choices[0].get("delta") or {})

# ---------- 回复翻译: Chat → Responses SSE ----------
def sse(ev, obj):
    return f"event: {ev}\ndata: {json.dumps(obj, ensure_ascii=False)}\n\n".encode()

def map_usage(u):
    if not u:
        return None
    return {"input_tokens": u.get("prompt_tokens", 0), "output_tokens": u.get("completion_tokens", 0),
            "total_tokens": u.get("total_tokens", 0),
            "input_tokens_details": {"cached_tokens": 0}, "output_tokens_details": {"reasoning_tokens": 0}}

def emit_stream(wfile, deltas):
    """状态机：消费 DeepSeek 流式 delta，按内核要求的事件顺序吐 Responses SSE。
    reasoning_content → reasoning item + reasoning_text.delta；
    content → message item + output_text.delta；
    tool_calls 增量 → 累积后 function_call items。"""
    rid = "resp_" + uuid.uuid4().hex
    wfile.write(sse("response.created", {"type": "response.created",
        "response": {"id": rid, "status": "in_progress"}}))
    wfile.flush()

    oi = 0                      # output_index 游标
    usage = None
    # reasoning 段状态
    r_open = False; r_iid = None; r_buf = ""
    # text 段状态
    t_open = False; t_iid = None; t_buf = ""
    # tool_calls 累积：index -> {id,name,args}
    tools = {}

    def close_reasoning():
        nonlocal r_open, oi
        if not r_open: return
        wfile.write(sse("response.output_item.done", {"type": "response.output_item.done",
            "output_index": oi, "item": {"type": "reasoning", "id": r_iid,
            "summary": [], "content": [{"type": "reasoning_text", "text": r_buf}]}}))
        wfile.flush(); oi += 1; r_open = False

    def close_text():
        nonlocal t_open, oi
        if not t_open: return
        wfile.write(sse("response.output_item.done", {"type": "response.output_item.done",
            "output_index": oi, "item": {"type": "message", "id": t_iid, "role": "assistant",
            "content": [{"type": "output_text", "text": t_buf}]}}))
        wfile.flush(); oi += 1; t_open = False

    for kind, payload in deltas:
        if kind == "__usage__":
            usage = map_usage(payload); continue
        d = payload
        rc = d.get("reasoning_content")
        c = d.get("content")
        tcs = d.get("tool_calls")

        if rc:
            if t_open: close_text()
            if not r_open:
                r_iid = "rsn_" + uuid.uuid4().hex
                wfile.write(sse("response.output_item.added", {"type": "response.output_item.added",
                    "output_index": oi, "item": {"type": "reasoning", "id": r_iid,
                    "summary": [], "content": []}}))
                r_open = True
            r_buf += rc
            wfile.write(sse("response.reasoning_text.delta", {"type": "response.reasoning_text.delta",
                "item_id": r_iid, "output_index": oi, "content_index": 0, "delta": rc}))
            wfile.flush()

        if c:
            if r_open: close_reasoning()
            if not t_open:
                t_iid = "msg_" + uuid.uuid4().hex
                wfile.write(sse("response.output_item.added", {"type": "response.output_item.added",
                    "output_index": oi, "item": {"type": "message", "id": t_iid,
                    "role": "assistant", "content": []}}))
                t_open = True
            t_buf += c
            wfile.write(sse("response.output_text.delta", {"type": "response.output_text.delta",
                "item_id": t_iid, "output_index": oi, "content_index": 0, "delta": c}))
            wfile.flush()

        if tcs:
            for tc in tcs:
                i = tc.get("index", 0)
                slot = tools.setdefault(i, {"id": None, "name": None, "args": ""})
                if tc.get("id"): slot["id"] = tc["id"]
                fn = tc.get("function") or {}
                if fn.get("name"): slot["name"] = fn["name"]
                if fn.get("arguments"): slot["args"] += fn["arguments"]

    # 收尾：关掉还开着的 reasoning/text
    close_reasoning(); close_text()

    # 输出累积的 tool_calls（作为 function_call items）
    end_turn = True
    if tools:
        end_turn = False
        for i in sorted(tools):
            slot = tools[i]
            fc_id = "fc_" + uuid.uuid4().hex
            call_id = slot["id"] or fc_id
            item = {"type": "function_call", "id": fc_id, "name": slot["name"],
                    "arguments": slot["args"] or "{}", "call_id": call_id}
            wfile.write(sse("response.output_item.added", {"type": "response.output_item.added",
                "output_index": oi, "item": {**item, "arguments": ""}}))
            wfile.write(sse("response.function_call_arguments.delta",
                {"type": "response.function_call_arguments.delta", "item_id": fc_id,
                 "call_id": call_id, "output_index": oi, "delta": item["arguments"]}))
            wfile.write(sse("response.output_item.done", {"type": "response.output_item.done",
                "output_index": oi, "item": item}))
            wfile.flush(); oi += 1

    wfile.write(sse("response.completed", {"type": "response.completed",
        "response": {"id": rid, "status": "completed", "usage": usage, "end_turn": end_turn}}))
    wfile.flush()

class H(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass

    def authorized(self):
        """校验 Authorization bearer。GATEWAY_TOKEN 为空时（手动调试）放行。"""
        if not GATEWAY_TOKEN:
            return True
        header = self.headers.get("Authorization", "")
        prefix = "Bearer "
        if not header.startswith(prefix):
            return False
        return header[len(prefix):].strip() == GATEWAY_TOKEN

    def send_json(self, code, payload):
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(payload, ensure_ascii=False).encode())

    def reject_unauthorized(self):
        self.send_json(401, {"error": {"message": "Unauthorized: invalid gateway token."}})

    def do_GET(self):
        path = urllib.parse.urlparse(self.path).path
        # /health 不需鉴权：App 用它做存活探测。
        if path.endswith("/health"):
            self.send_json(200, {
                "ok": True,
                "service": "blackrain-gateway",
                "providers": [
                    {"id": provider["id"], "name": provider["name"], "enabled": provider["enabled"]}
                    for provider in PROVIDERS
                ],
            })
            return
        if not self.authorized():
            self.reject_unauthorized()
            return
        if path.endswith("/models"):
            self.send_json(200, {"object": "list", "data": list_gateway_models()})
            return
        self.send_json(404, {"error": {"message": f"Unknown gateway path: {path}"}})

    def do_POST(self):
        if not self.authorized():
            self.reject_unauthorized()
            return
        n = int(self.headers.get("Content-Length", 0) or 0)
        body = json.loads(self.rfile.read(n)) if n else {}
        stream_started = False
        try:
            route = resolve_model_route(body.get("model"))
            provider = route["provider"]
            model = route["model"]
            log(
                "REQ provider:", provider["id"],
                "model:", model["model"],
                "input items:", len(body.get("input", [])),
                "tools:", len(body.get("tools", [])),
            )
            chat = responses_to_chat(body, model["model"])
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.end_headers()
            stream_started = True
            emit_stream(self.wfile, call_provider_stream(provider, chat))
        except ProviderHTTPError as e:
            # 代理/上游结构化错误（如 402 insufficient_credits）→ 转 response.failed，
            # 保留 code 供前端识别（额度不足 → 提示升级/充值）。
            log("UPSTREAM-FAIL:", e.status, e.code, e.message)
            self._emit_failed(stream_started, e.code, e.message)
        except Exception as e:
            log("ERROR:", repr(e))
            self._emit_failed(stream_started, "gateway_error", str(e))

    def _emit_failed(self, stream_started, code, message):
        """把失败写成内核可消费的 response.failed SSE。
        头未发则先发 200+SSE 头；头已发则直接追加事件到开着的流。"""
        event = sse("response.failed", {"type": "response.failed",
            "response": {"error": {"code": code, "message": message}}})
        try:
            if not stream_started:
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream")
                self.end_headers()
            self.wfile.write(event)
            self.wfile.flush()
        except Exception:
            pass

if __name__ == "__main__":
    provider_summary = ", ".join(
        f"{provider['id']}({len(provider['models'])})"
        for provider in PROVIDERS
        if provider["enabled"]
    )
    print(f"[gateway] :{PORT} STRIP_TOOLS={STRIP_TOOLS} providers={provider_summary}", flush=True)
    try:
        http.server.HTTPServer(("127.0.0.1", PORT), H).serve_forever()
    except KeyboardInterrupt:
        print("\n[gateway] stopped", flush=True)
