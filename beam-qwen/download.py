"""beam-qwen/download.py — one-off: pull the model files into Beam Volume "models".

Run from the box:  cd /home/workspace/beam-qwen && python3 download.py
CPU only (no GPU billed). Skips files that already exist with the right size.
Model: JonathanColetti/Qwen3.8-27B-Uncensored-GGUF (Heretic abliteration, MTP head fused, vision mmproj).
"""
from beam import function, Image, Volume

VOL = "/models"
REPO = "https://huggingface.co/JonathanColetti/Qwen3.8-27B-Uncensored-GGUF/resolve/main"
FILES = {
    "Qwen3.8-27B-Uncensored-Q4_K_M.gguf": None,        # ~16.8 GB, fused MTP head
    "mmproj-Qwen3.8-27B-Uncensored-F16.gguf": None,   # ~0.9 GB, vision projector
}


@function(
    name="qwen-download",
    cpu=2,
    memory="4Gi",
    timeout=3600,
    image=Image(python_version="python3.11").add_commands(["apt-get update -qq && apt-get install -y -qq curl ca-certificates"]),
    volumes=[Volume(name="models", mount_path=VOL)],
)
def download():
    import os, subprocess, time
    out = []
    for name in FILES:
        dst = f"{VOL}/{name}"
        # HEAD for the true size (follows the LFS redirect)
        head = subprocess.run(["curl", "-sIL", f"{REPO}/{name}"], capture_output=True, text=True).stdout
        sizes = [int(l.split(":")[1]) for l in head.splitlines() if l.lower().startswith("content-length:")]
        want = sizes[-1] if sizes else None
        have = os.path.getsize(dst) if os.path.exists(dst) else 0
        if want and have == want:
            out.append(f"OK (already there) {name} {have/1e9:.2f} GB")
            continue
        t0 = time.time()
        r = subprocess.run(["curl", "-L", "--retry", "5", "--retry-all-errors", "-C", "-", "-o", dst, f"{REPO}/{name}"], capture_output=True, text=True)
        have = os.path.getsize(dst) if os.path.exists(dst) else 0
        ok = r.returncode == 0 and (want is None or have == want)
        out.append(f"{'OK' if ok else 'FAIL'} {name} {have/1e9:.2f} GB in {time.time()-t0:.0f}s (want {want}) rc={r.returncode} {r.stderr[-200:] if not ok else ''}")
    listing = subprocess.run(["ls", "-la", VOL], capture_output=True, text=True).stdout
    return {"results": out, "ls": listing}


if __name__ == "__main__":
    res = download.remote()
    for line in res["results"]:
        print(line)
    print(res["ls"])
