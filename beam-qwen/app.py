"""beam-qwen/app.py — Qwen3.8-27B-Uncensored (GGUF) served by llama.cpp on Beam, v1 (2026-09-11)

Shape: one Beam @asgi app. on_start launches llama-server (vision loaded) from the
Volume, waits until healthy, warms it up, and — on RTX4090 — Beam snapshots the
container right after (checkpoint_enabled) so later cold starts skip the load.
The ASGI app is a thin FastAPI proxy that streams /v1/* through to llama-server.

Deploy from the box:   cd /home/workspace/beam-qwen && beam deploy app.py:qwen
Call:                  POST <url>/v1/chat/completions  with  Authorization: Bearer <BEAM_TOKEN>
Health / warm-up:      GET <url>/health   POST <url>/warmup
"""
import os
from beam import asgi, Image, Volume, QueueDepthAutoscaler

VOL = "/models"
MODEL = "Qwen3.8-27B-Uncensored-Q4_K_M.gguf"          # 16.81 GB, fused MTP head (JonathanColetti)
MMPROJ = "mmproj-Qwen3.8-27B-Uncensored-F16.gguf"     # 0.93 GB, vision projector
ALIAS = "qwen3.8-27b-uncensored"
PORT = 8081
# Beam 2026-09-11: "Checkpoints are yet not supported between multiple GPUs" — a GPU priority list
# and checkpoint_enabled are mutually exclusive. Fast wake wins (Sam), so 4090 only; to add the
# RTX5090 as capacity fallback later use ["RTX4090", "RTX5090"] and set checkpoint_enabled=False.
GPUS = "RTX4090"
KEEP_WARM_S = 300
CHECKPOINT = os.environ.get("QWEN_CHECKPOINT", "0") == "1"  # deploy-time switch: QWEN_CHECKPOINT=1 beam deploy …

# Context by card. Measured ladder (2026-09-11): fill in as we go.
#   total VRAM MiB threshold -> n_ctx
CTX_LADDER = [
    (30000, 196608),   # RTX5090 32 GB
    (0,     131072),   # RTX4090 24 GB — target 100–130K
]
CTX_OVERRIDE = int(os.environ.get("QWEN_CTX", "0") or 0)  # set at deploy time for the ladder tests

# CUDA 12.8.1 image built for sm_89 (4090) + sm_120a (5090); Beam adds Python 3.11 plus its own
# pinned fastapi/httpx/uvicorn/starlette (probe 2026-09-11) — do not add them again or versions fight.
image = Image(base_image="ghcr.io/ggml-org/llama.cpp:server-cuda", python_version="python3.11")


def start_server():
    """Runs once per container. Returns state for the handler (snapshot point on 4090)."""
    import subprocess, time, json, urllib.request

    def sh(cmd):
        return subprocess.run(cmd, shell=True, capture_output=True, text=True).stdout.strip()

    vram = int((sh("nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits") or "0").split("\n")[0])
    gpu_name = sh("nvidia-smi --query-gpu=name --format=csv,noheader")
    ctx = CTX_OVERRIDE or next(c for thr, c in CTX_LADDER if vram >= thr)

    for f in (MODEL, MMPROJ):
        if not os.path.exists(f"{VOL}/{f}"):
            raise RuntimeError(f"missing {VOL}/{f} — run download.py first")

    cmd = [
        "/app/llama-server",
        "-m", f"{VOL}/{MODEL}",
        "--mmproj", f"{VOL}/{MMPROJ}",
        "--alias", ALIAS,
        "-ngl", "99",
        "--load-mode", "none",  # no mmap (build 10902 spelling; "--no-mmap" is gone): small host RSS for the checkpoint. "dio" = DirectIO, to test later.
        "-fa", "on",
        "-ctk", "q8_0", "-ctv", "q8_0",
        "-c", str(ctx),
        "-np", "1",
        "--jinja",
        "--chat-template-kwargs", json.dumps({"enable_thinking": False}),
        "--repeat-penalty", "1.05",
        "--temp", "0.7", "--top-p", "0.8", "--top-k", "20", "--min-p", "0",
        "--host", "127.0.0.1", "--port", str(PORT),
        "--metrics",
    ]
    log = open("/tmp/llama-server.log", "w")
    t0 = time.time()
    # Beam's runtime does not carry the image's ENV LD_LIBRARY_PATH=/app — set it for the child.
    env = dict(os.environ, LD_LIBRARY_PATH="/app:/app/lib:" + os.environ.get("LD_LIBRARY_PATH", ""))
    proc = subprocess.Popen(cmd, stdout=log, stderr=subprocess.STDOUT, env=env)

    # wait for /health (loading 17.7 GB from the volume into VRAM)
    deadline = time.time() + 900
    healthy = False
    while time.time() < deadline:
        if proc.poll() is not None:
            tail = sh("tail -n 40 /tmp/llama-server.log")
            raise RuntimeError(f"llama-server exited rc={proc.returncode}\n{tail}")
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/health", timeout=2) as r:
                if r.status == 200:
                    healthy = True
                    break
        except Exception:
            pass
        time.sleep(1.0)
    if not healthy:
        raise RuntimeError("llama-server did not become healthy in 900 s\n" + sh("tail -n 40 /tmp/llama-server.log"))
    load_s = round(time.time() - t0, 1)

    # warm-up: a few short chats so kernels/graphs are hot inside the snapshot
    for msg in ("Say hi in three words.", "Name one color.", "Count to three."):
        body = json.dumps({"model": ALIAS, "messages": [{"role": "user", "content": msg}], "max_tokens": 12, "stream": False}).encode()
        req = urllib.request.Request(f"http://127.0.0.1:{PORT}/v1/chat/completions", data=body, headers={"Content-Type": "application/json"})
        try:
            urllib.request.urlopen(req, timeout=120).read()
        except Exception as e:  # warm-up failures are not fatal
            print("warm-up request failed:", e)

    used = sh("nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits")
    rss = sh("ps -o rss= -p %d" % proc.pid)
    print(f"[qwen] ready: gpu={gpu_name} vram={vram}MiB ctx={ctx} load={load_s}s vram_used={used}MiB server_rss_kb={rss}")
    print("[qwen] llama-server log tail:\n" + sh("grep -E 'KV self size|CUDA0 model buffer|compute buffer|n_ctx|mtmd|vision|MTP|draft' /tmp/llama-server.log | tail -12"))
    return {"proc": proc, "ctx": ctx, "vram_total_mib": vram, "vram_used_mib": used, "gpu": gpu_name, "load_s": load_s}


@asgi(
    name="qwen-27b",
    gpu=GPUS,
    cpu=4,
    # Checkpoint (2026-09-11 v1 attempt): 16Gi OOM-killed during the snapshot — the GPU's ~22 GB of
    # state is copied into host RAM while checkpointing. Give it real headroom.
    memory="48Gi",
    image=image,
    volumes=[Volume(name="models", mount_path=VOL)],
    on_start=start_server,
    keep_warm_seconds=KEEP_WARM_S,
    timeout=-1,                 # long generations must not be cut at Beam's 180 s default
    concurrent_requests=8,      # llama-server queues them (one slot); the proxy stays async
    # v3 (2026-09-11): checkpoint captured + restored fine (10.7 s) but after restore anything touching the
    # GPU hung (chat timed out; /health and /v1/models fine). v4 = checkpoint off to confirm; see /debug.
    checkpoint_enabled=CHECKPOINT,
    authorized=True,            # Beam Bearer token required
    autoscaler=QueueDepthAutoscaler(max_containers=1, tasks_per_container=8),
)
def qwen(context):
    import httpx
    from fastapi import FastAPI, Request
    from fastapi.responses import StreamingResponse, JSONResponse
    from starlette.background import BackgroundTask

    state = context.on_start_value
    app = FastAPI()
    client = httpx.AsyncClient(base_url=f"http://127.0.0.1:{PORT}", timeout=httpx.Timeout(900.0, connect=10.0))

    @app.get("/health")
    async def health():
        try:
            r = await client.get("/health")
            up = r.status_code == 200
        except Exception:
            up = False
        return JSONResponse({"ok": up, "model": ALIAS, "ctx": state["ctx"], "gpu": state["gpu"],
                             "vram_total_mib": state["vram_total_mib"], "vram_used_after_load_mib": state["vram_used_mib"],
                             "load_s": state["load_s"]})

    @app.post("/warmup")
    async def warmup():
        return {"status": "warm", "model": ALIAS, "ctx": state["ctx"]}

    @app.get("/debug")
    async def debug():
        import subprocess
        def sh(cmd):
            return subprocess.run(cmd, shell=True, capture_output=True, text=True).stdout[-3000:]
        return JSONResponse({
            "server_alive": state["proc"].poll() is None,
            "nvidia_smi": sh("nvidia-smi --query-gpu=name,memory.used,memory.total,utilization.gpu --format=csv,noheader"),
            "log_tail": sh("tail -n 40 /tmp/llama-server.log"),
        })

    @app.api_route("/v1/{path:path}", methods=["GET", "POST"])
    async def proxy(request: Request, path: str):
        body = await request.body()
        headers = {"content-type": request.headers.get("content-type", "application/json"), "accept": request.headers.get("accept", "*/*")}
        req = client.build_request(request.method, f"/v1/{path}", content=body, headers=headers)
        r = await client.send(req, stream=True)
        return StreamingResponse(
            r.aiter_raw(),
            status_code=r.status_code,
            media_type=r.headers.get("content-type", "application/json"),
            background=BackgroundTask(r.aclose),
        )

    return app
