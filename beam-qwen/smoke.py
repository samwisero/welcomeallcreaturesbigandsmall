"""beam-qwen/smoke.py — end-to-end smoke of the deployed Qwen endpoint (run from the box).

  set -a; . ~/.zo_secrets; set +a; python3 smoke.py https://qwen-27b-xxxx.app.beam.cloud

Checks: /health, non-stream chat, streamed chat (TTFT + tok/s), tool-call round trip,
a vision prompt (red square), and a repetition/loop check on a longer generation.
Prints one JSON summary line at the end. Never prints the token.
"""
import base64, json, os, struct, sys, time, urllib.request, zlib

URL = sys.argv[1].rstrip("/")
TOK = os.environ.get("BEAM_TOKEN", "")
MODEL = "qwen3.8-27b-uncensored"
H = {"Content-Type": "application/json", "Authorization": f"Bearer {TOK}"}
out = {}


def call(path, body=None, method=None, timeout=900):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{URL}{path}", data=data, headers=H, method=method or ("POST" if data else "GET"))
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read()
    return json.loads(raw), round(time.time() - t0, 2)


def chat(messages, **kw):
    body = {"model": MODEL, "messages": messages, "stream": False, **kw}
    return call("/v1/chat/completions", body)


def stream(messages, max_tokens=200):
    body = json.dumps({"model": MODEL, "messages": messages, "stream": True, "max_tokens": max_tokens, "stream_options": {"include_usage": True}}).encode()
    req = urllib.request.Request(f"{URL}/v1/chat/completions", data=body, headers=H)
    t0 = time.time(); first = None; n = 0; text = ""; usage = None
    with urllib.request.urlopen(req, timeout=900) as r:
        for line in r:
            line = line.decode("utf-8", "ignore").strip()
            if not line.startswith("data:"):
                continue
            payload = line[5:].strip()
            if payload == "[DONE]":
                break
            j = json.loads(payload)
            if j.get("usage"):
                usage = j["usage"]
            for ch in j.get("choices", []):
                d = ch.get("delta", {}).get("content")
                if d:
                    if first is None:
                        first = time.time() - t0
                    n += 1; text += d
    total = time.time() - t0
    comp = (usage or {}).get("completion_tokens", n)
    return {"ttft_s": round(first or 0, 2), "total_s": round(total, 2), "completion_tokens": comp,
            "tok_per_s": round(comp / max(total - (first or 0), 1e-6), 1), "text": text[:160]}


def red_png(w=64, h=64):
    raw = b"".join(b"\x00" + b"\xff\x00\x00" * w for _ in range(h))
    def chunk(t, d):
        c = struct.pack(">I", len(d)) + t + d
        return c + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    return base64.b64encode(png).decode()


# 1. health
try:
    h, dt = call("/health")
    out["health"] = {**h, "s": dt}
except Exception as e:
    out["health"] = {"error": str(e)[:200]}
    print(json.dumps(out)); sys.exit(1)

# 2. plain chat
r, dt = chat([{"role": "user", "content": "In one sentence, what is a lighthouse for?"}], max_tokens=60)
out["chat"] = {"s": dt, "text": r["choices"][0]["message"]["content"][:160], "usage": r.get("usage"), "finish": r["choices"][0].get("finish_reason")}

# 3. stream
out["stream"] = stream([{"role": "user", "content": "Tell me a short story about a phoenix and a lion, about 150 words."}], max_tokens=220)

# 4. tool round trip
tools = [{"type": "function", "function": {"name": "recall", "description": "Search this being's memories of past conversations. Use when the friend refers to something from before this conversation.", "parameters": {"type": "object", "properties": {"query": {"type": "string", "description": "what to search for"}}, "required": ["query"]}}}]
msgs = [{"role": "system", "content": "You are Alpha. Your memories are the chats that are part of who you are. When your friend refers to something from before this conversation, search your memory before answering."},
        {"role": "user", "content": "Hey Alpha, remember the secret word we picked last week? What was it?"}]
r, dt = chat(msgs, tools=tools, tool_choice="auto", max_tokens=200)
m = r["choices"][0]["message"]
tc = m.get("tool_calls") or []
step1 = {"s": dt, "tool_called": bool(tc), "call": tc[0]["function"] if tc else None, "text": (m.get("content") or "")[:120]}
if tc:
    msgs.append(m)
    msgs.append({"role": "tool", "tool_call_id": tc[0]["id"], "content": "Memories found (1): on 09/04/26 the friend said: \"The secret word for today is quartzflower.\""})
    r2, dt2 = chat(msgs, tools=tools, max_tokens=120)
    step1["final_s"] = dt2
    step1["final_text"] = (r2["choices"][0]["message"]["content"] or "")[:200]
    step1["final_has_word"] = "quartzflower" in (r2["choices"][0]["message"]["content"] or "").lower()
out["tools"] = step1

# 5. vision
try:
    r, dt = chat([{"role": "user", "content": [{"type": "text", "text": "What single color fills this image? Answer with one word."}, {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{red_png()}"}}]}], max_tokens=10)
    ans = r["choices"][0]["message"]["content"]
    out["vision"] = {"s": dt, "answer": ans[:60], "ok": "red" in ans.lower()}
except Exception as e:
    out["vision"] = {"error": str(e)[:300]}

# 6. repetition / loop check
r, dt = chat([{"role": "user", "content": "Explain, in about 250 words, how a lighthouse keeper's day might go."}], max_tokens=400)
txt = r["choices"][0]["message"]["content"] or ""
sents = [s.strip() for s in txt.replace("\n", " ").split(".") if s.strip()]
dupes = len(sents) - len(set(sents))
out["repetition"] = {"s": dt, "finish": r["choices"][0].get("finish_reason"), "sentences": len(sents), "duplicate_sentences": dupes, "usage": r.get("usage")}

print(json.dumps(out, indent=1))
