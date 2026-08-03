"""vision-scorer — the swappable third-party workload of this kit.

Polls the shared working volume for imagery the ingest landed, scores each
frame with vegmodel (the stand-in for a commercial vision pipeline), and
writes the evidence record beside the image for the relay to deliver. The
platform contract is only the directory handshake — replace this container
with any vision pipeline honoring it and nothing else changes; findings
simply carry the new model version.
"""

import json
import os
import time

from app.vegmodel import score

WORK_DIR = os.environ.get("WORK_DIR", "/work")
INCOMING = os.path.join(WORK_DIR, "incoming")
SCORED = os.path.join(WORK_DIR, "scored")
MODEL_VERSION = os.environ.get("MODEL_VERSION", "1.4")
POLL_S = float(os.environ.get("POLL_S", "0.4"))


def process_one(img_id):
    meta_path = os.path.join(INCOMING, img_id + ".json")
    ppm_path = os.path.join(INCOMING, img_id + ".ppm")
    with open(meta_path) as f:
        meta = json.load(f)
    with open(ppm_path, "rb") as f:
        data = f.read()
    try:
        rec = score(data, model_version=MODEL_VERSION)
    except ValueError as exc:
        rec = {"model": "open-veg-scorer", "model_version": MODEL_VERSION,
               "score": 0.0, "finding": False, "kind": "unreadable",
               "error": str(exc)}
    rec.update({
        "id": meta["id"],
        "span": meta["span"],
        "flight": meta["flight"],
        "station": meta["station"],
        "size_mb": meta["size_mb"],
        "scored_t": time.time(),
        "disposition": ("finding — pending work order" if rec.get("finding")
                        else "no action — evidence only"),
    })
    # Land the record + image atomically-enough for a demo: image first,
    # then the .json the relay keys on.
    os.replace(ppm_path, os.path.join(SCORED, img_id + ".ppm"))
    out = os.path.join(SCORED, img_id + ".json")
    with open(out + ".tmp", "w") as f:
        json.dump(rec, f)
    os.replace(out + ".tmp", out)
    os.remove(meta_path)
    print("scored %s span=%s finding=%s kind=%s score=%s" % (
        meta["id"], meta["span"], rec["finding"], rec["kind"], rec["score"]),
        flush=True)


def main():
    os.makedirs(INCOMING, exist_ok=True)
    os.makedirs(SCORED, exist_ok=True)
    print("vision-scorer up · model open-veg-scorer %s" % MODEL_VERSION,
          flush=True)
    while True:
        ready = sorted(
            f[:-5] for f in os.listdir(INCOMING) if f.endswith(".json"))
        for img_id in ready:
            if os.path.exists(os.path.join(INCOMING, img_id + ".ppm")):
                try:
                    process_one(img_id)
                except FileNotFoundError:
                    pass  # racing a concurrent cleanup — next poll settles it
        time.sleep(POLL_S)


if __name__ == "__main__":
    main()
