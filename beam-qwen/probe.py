"""beam-qwen/probe.py — sanity probe: does the llama.cpp CUDA image start on Beam's GPUs?

Run from the box:  cd /home/workspace/beam-qwen && python3 probe.py [RTX4090|RTX5090] [server-cuda|server-cuda13]
Prints nvidia-smi (driver, VRAM), the llama-server version, and whether the binary sees CUDA.
Costs a few GPU-seconds. No model needed.
"""
import sys
from beam import function, Image

GPU = sys.argv[1] if len(sys.argv) > 1 else "RTX4090"
TAG = sys.argv[2] if len(sys.argv) > 2 else "server-cuda"


@function(
    name=f"qwen-probe-{TAG}",
    gpu=GPU,
    cpu=2,
    memory="4Gi",
    timeout=600,
    image=Image(base_image=f"ghcr.io/ggml-org/llama.cpp:{TAG}", python_version="python3.11"),
)
def probe():
    import subprocess, os
    env = dict(os.environ, LD_LIBRARY_PATH="/app:/app/lib:" + os.environ.get("LD_LIBRARY_PATH", ""))
    def sh(cmd):
        r = subprocess.run(cmd, shell=True, capture_output=True, text=True, env=env)
        return (r.stdout + r.stderr).strip()[-1500:]
    return {
        "nvidia_smi": sh("nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader"),
        "cuda_from_smi": sh("nvidia-smi | grep -o 'CUDA Version: [0-9.]*'"),
        "binary": sh("ls /app/ | grep -v ggml-cpu"),
        "env_ld": os.environ.get("LD_LIBRARY_PATH", "(unset)"),
        "version": sh("/app/llama-server --version 2>&1 | head -5"),
        "ldd_cuda": sh("ldd /app/llama-server 2>/dev/null | grep -i -E 'cuda|cublas' | head -8"),
        "devices": sh("/app/llama-server --list-devices 2>&1 | head -12"),
        "python": sh("python3 --version; python3 -c 'import fastapi, httpx; print(\"fastapi ok\")' 2>&1 | tail -1"),
    }


if __name__ == "__main__":
    res = probe.remote()
    print(f"=== GPU={GPU} IMAGE={TAG}")
    for k, v in res.items():
        print(f"--- {k}\n{v}")
