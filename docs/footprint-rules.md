# Footprint rules — keeping the demo laptop-class

The demo must run on a developer laptop. Rules:

1. **Single node.** k3d one server, no agents. Disable traefik/servicelb; use
   NodePort. HA belongs in the hand-off (Stage 2), never the demo.
2. **CPU only.** No GPU in the base. Anything needing a GPU (real SUSE AI
   inference) is an optional profile with a tiny model, clearly labeled as an
   analog, never the base path.
3. **Openly pullable images only in the base.** No registry that needs an
   entitlement, login, or subscription to `docker pull`. Vendor OSS (Losant
   `losant-mqtt` / `losant/edge-agent`, Ollama, Open WebUI, NeuVector OSS) is
   fine; SUSE-registry images are not (they belong to the hand-off).
4. **Small requests.** Each base pod requests ≤ ~50m CPU / ≤ ~96Mi memory so the
   whole base fits comfortably in ~1–2 GB. Optional AI/security profiles may ask
   for more and say so.
5. **No persistent volumes in the base.** `emptyDir` / local-path only. Storage
   (Longhorn) is multi-node and belongs in the hand-off.
6. **Fast start.** Base `make up` (cluster + build + deploy) targets a couple of
   minutes on a fresh machine. Model pulls (Ollama) are an opt-in profile because
   they are slow and large.

If a use case genuinely cannot be shown CPU-only on one node, the demo shows the
part that can, and the hand-off's scale-up path carries the rest — but say that
explicitly; do not quietly ship a demo that needs a workstation.
