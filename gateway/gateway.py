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

    chat = {"model": body.get("model", "deepseek-chat"), "messages": msgs, "stream": False}
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
def call_deepseek(chat):
    data = json.dumps(chat).encode()
    req = urllib.request.Request(DEEPSEEK_URL, data=data, headers={
        "Authorization": f"Bearer {DEEPSEEK_KEY}", "Content-Type": "application/json",
    })
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read())

# ---------- 回复翻译: Chat → Responses SSE ----------
def sse(ev, obj):
    return f"event: {ev}\ndata: {json.dumps(obj, ensure_ascii=False)}\n\n".encode()

def emit_text(wfile, text, usage):
    rid = "resp_" + uuid.uuid4().hex
    iid = "msg_" + uuid.uuid4().hex
    wfile.write(sse("response.created", {"type": "response.created", "response": {"id": rid, "status": "in_progress"}}))
    wfile.write(sse("response.output_item.added", {"type": "response.output_item.added",
        "output_index": 0, "item": {"type": "message", "id": iid, "role": "assistant", "content": []}}))
    wfile.write(sse("response.output_text.delta", {"type": "response.output_text.delta",
        "item_id": iid, "output_index": 0, "content_index": 0, "delta": text}))
    wfile.write(sse("response.output_item.done", {"type": "response.output_item.done",
        "output_index": 0, "item": {"type": "message", "id": iid, "role": "assistant",
        "content": [{"type": "output_text", "text": text}]}}))
    wfile.write(sse("response.completed", {"type": "response.completed", "response": {
        "id": rid, "status": "completed", "usage": usage, "end_turn": True}}))
    wfile.flush()

def emit_tool_calls(wfile, tool_calls, usage):
    rid = "resp_" + uuid.uuid4().hex
    wfile.write(sse("response.created", {"type": "response.created", "response": {"id": rid, "status": "in_progress"}}))
    for idx, tc in enumerate(tool_calls):
        fc_id = "fc_" + uuid.uuid4().hex
        fn = tc.get("function", {})
        item = {"type": "function_call", "id": fc_id, "name": fn.get("name"),
                "arguments": fn.get("arguments", "{}"), "call_id": tc.get("id") or fc_id}
        wfile.write(sse("response.output_item.added", {"type": "response.output_item.added",
            "output_index": idx, "item": {**item, "arguments": ""}}))
        wfile.write(sse("response.function_call_arguments.delta", {"type": "response.function_call_arguments.delta",
            "item_id": fc_id, "call_id": item["call_id"], "output_index": idx, "delta": fn.get("arguments", "{}")}))
        wfile.write(sse("response.output_item.done", {"type": "response.output_item.done",
            "output_index": idx, "item": item}))
    wfile.write(sse("response.completed", {"type": "response.completed", "response": {
        "id": rid, "status": "completed", "usage": usage, "end_turn": False}}))
    wfile.flush()

def map_usage(u):
    if not u:
        return None
    return {"input_tokens": u.get("prompt_tokens", 0), "output_tokens": u.get("completion_tokens", 0),
            "total_tokens": u.get("total_tokens", 0),
            "input_tokens_details": {"cached_tokens": 0}, "output_tokens_details": {"reasoning_tokens": 0}}

class H(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        self.send_response(200); self.send_header("Content-Type", "application/json"); self.end_headers()
        self.wfile.write(json.dumps({"data": [{"id": "deepseek-chat"}]}).encode())
    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0) or 0)
        body = json.loads(self.rfile.read(n)) if n else {}
        log("REQ input items:", len(body.get("input", [])), "tools:", len(body.get("tools", [])))
        try:
            chat = responses_to_chat(body)
            resp = call_deepseek(chat)
            choice = resp["choices"][0]["message"]
            usage = map_usage(resp.get("usage"))
            self.send_response(200); self.send_header("Content-Type", "text/event-stream"); self.end_headers()
            if choice.get("tool_calls"):
                log("DeepSeek 回了 tool_calls:", [t["function"]["name"] for t in choice["tool_calls"]])
                emit_tool_calls(self.wfile, choice["tool_calls"], usage)
            else:
                txt = choice.get("content", "") or ""
                log("DeepSeek 回了文本:", repr(txt[:80]))
                emit_text(self.wfile, txt, usage)
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
