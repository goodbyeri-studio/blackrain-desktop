#!/usr/bin/env python3
"""最小 responses⇄chat 翻译网关：把 codex 内核(Responses API)的请求译成
DeepSeek(Chat Completions)，再把回复译回内核能解析的 Responses SSE 序列。

零依赖(stdlib)。第一版聚焦文本路径：STRIP_TOOLS=1 时剥掉 tools 逼纯文本回复，
先证通主链(请求翻译 + SSE 事件顺序 + 内核渲染)，再攻工具调用。
"""
import http.server, json, os, sys, urllib.request, uuid

DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions"
DEEPSEEK_KEY = os.environ["DEEPSEEK_API_KEY"]
PORT = int(os.environ.get("GW_PORT", "8899"))
STRIP_TOOLS = os.environ.get("STRIP_TOOLS", "1") == "1"
LOG = os.environ.get("GW_LOG", "/tmp/gateway.log")

def log(*a):
    with open(LOG, "a") as f:
        f.write(" ".join(str(x) for x in a) + "\n")

# ---------- 请求翻译: Responses → Chat Completions ----------
def responses_to_chat(body):
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

    chat = {"model": body.get("model", "deepseek-v4-flash"), "messages": msgs, "stream": False}
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

# ---------- 调 DeepSeek ----------
def call_deepseek_stream(chat):
    """流式调 DeepSeek，逐块 yield delta dict（含 content / reasoning_content / tool_calls）。
    末尾 yield ('__usage__', usage_dict) 一次（若上游给了 usage）。"""
    chat = {**chat, "stream": True, "stream_options": {"include_usage": True}}
    data = json.dumps(chat).encode()
    req = urllib.request.Request(DEEPSEEK_URL, data=data, headers={
        "Authorization": f"Bearer {DEEPSEEK_KEY}", "Content-Type": "application/json",
    })
    with urllib.request.urlopen(req, timeout=120) as r:
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
    def do_GET(self):
        self.send_response(200); self.send_header("Content-Type", "application/json"); self.end_headers()
        self.wfile.write(json.dumps({"data": [{"id": "deepseek-v4-flash"}, {"id": "deepseek-v4-pro"}]}).encode())
    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0) or 0)
        body = json.loads(self.rfile.read(n)) if n else {}
        log("REQ input items:", len(body.get("input", [])), "tools:", len(body.get("tools", [])))
        try:
            chat = responses_to_chat(body)
            self.send_response(200); self.send_header("Content-Type", "text/event-stream"); self.end_headers()
            emit_stream(self.wfile, call_deepseek_stream(chat))
        except Exception as e:
            log("ERROR:", repr(e))
            try:
                self.send_response(200); self.send_header("Content-Type", "text/event-stream"); self.end_headers()
                self.wfile.write(sse("response.failed", {"type": "response.failed",
                    "response": {"error": {"code": "gateway_error", "message": str(e)}}}))
                self.wfile.flush()
            except Exception:
                pass

if __name__ == "__main__":
    print(f"[gateway] :{PORT} STRIP_TOOLS={STRIP_TOOLS} -> DeepSeek", flush=True)
    http.server.HTTPServer(("127.0.0.1", PORT), H).serve_forever()
