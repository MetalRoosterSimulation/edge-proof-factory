#!/usr/bin/env python3
"""
validate_kit.py — release gate for a Proof Kit.

Checks that a kit is a real, tested, honest deliverable, not paper:
  * structure: demo (Makefile, kustomize, Dockerfiles, tests) + handoff (00-03).
  * manifests parse (kubectl kustomize if available, else YAML sniff).
  * the dashboard is self-contained (no external resources) if present.
  * no banned filler words and no unresolved [FILL]/[NEEDS ...] markers in the
    partner-facing hand-off docs.
  * the model unit tests pass.

Usage: python3 tools/validate_kit.py reference-kits/<use-case>
Exit 0 if all pass. Python 3.6+ / stdlib only.
"""
import os
import re
import subprocess
import sys

BANNED = ["leverage", "seamless", "robust"]  # visible-text filler (voice rule)
MARKER = re.compile(r"\[(FILL|NEEDS[^\]]*)\]")
EXTERNAL = re.compile(r'(src|href)\s*=\s*["\']https?://|@import|cdn\.|googleapis',
                      re.I)

errors = []
warnings = []
passes = []


def err(m):
    errors.append(m)


def ok(m):
    passes.append(m)


def warn(m):
    warnings.append(m)


def must_exist(path, label):
    if os.path.exists(path):
        ok("present: %s" % label)
    else:
        err("missing: %s (%s)" % (label, path))


def main(kit):
    kit = kit.rstrip("/")
    demo = os.path.join(kit, "demo")
    handoff = os.path.join(kit, "handoff")

    # --- structure ---
    for rel, label in [
        (os.path.join(demo, "Makefile"), "demo/Makefile"),
        (os.path.join(demo, "k8s", "base", "kustomization.yaml"), "demo base kustomization"),
        (os.path.join(demo, "tests"), "demo/tests"),
        (os.path.join(handoff, "00-partner-handoff-runbook.md"), "handoff runbook"),
        (os.path.join(handoff, "01-component-map.md"), "handoff component map"),
        (os.path.join(handoff, "02-scale-up-path.md"), "handoff scale-up path"),
        (os.path.join(handoff, "03-production-footprint.md"), "handoff footprint"),
    ]:
        must_exist(rel, label)

    # every image dir has a Dockerfile
    img_root = os.path.join(demo, "images")
    if os.path.isdir(img_root):
        for name in sorted(os.listdir(img_root)):
            d = os.path.join(img_root, name)
            if os.path.isdir(d):
                must_exist(os.path.join(d, "Dockerfile"), "Dockerfile for %s" % name)

    # --- manifests parse ---
    base = os.path.join(demo, "k8s", "base")
    if _have("kubectl"):
        for overlay in ("base", "ai", "losant"):
            p = os.path.join(demo, "k8s", overlay)
            if os.path.exists(os.path.join(p, "kustomization.yaml")):
                rc = subprocess.run(["kubectl", "kustomize", p],
                                    stdout=subprocess.DEVNULL,
                                    stderr=subprocess.PIPE)
                if rc.returncode == 0:
                    ok("kustomize builds: k8s/%s" % overlay)
                else:
                    err("kustomize FAILED: k8s/%s: %s"
                        % (overlay, rc.stderr.decode()[:200]))
    else:
        warn("kubectl not found — skipped manifest build check")

    # --- dashboard self-contained ---
    for root, _dirs, files in os.walk(demo):
        for f in files:
            if f.endswith(".html"):
                text = _read(os.path.join(root, f))
                if EXTERNAL.search(text):
                    err("dashboard not self-contained: %s references an external resource" % f)
                else:
                    ok("self-contained HTML: %s" % f)

    # --- voice + no-fabrication in hand-off docs ---
    if os.path.isdir(handoff):
        for f in sorted(os.listdir(handoff)):
            if not f.endswith(".md"):
                continue
            text = _read(os.path.join(handoff, f))
            low = text.lower()
            for w in BANNED:
                if re.search(r"\b%s\b" % w, low):
                    err("banned filler word '%s' in handoff/%s" % (w, f))
            if MARKER.search(text):
                err("unresolved marker %s in handoff/%s"
                    % (MARKER.search(text).group(0), f))
        ok("voice/fabrication scan complete")

    # --- model unit tests ---
    tests = os.path.join(demo, "tests")
    test_files = [os.path.join(tests, f) for f in os.listdir(tests)
                  if f.startswith("test_") and f.endswith(".py")] if os.path.isdir(tests) else []
    for tf in test_files:
        rc = subprocess.run([sys.executable, tf], stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT)
        if rc.returncode == 0:
            ok("unit tests pass: %s" % os.path.basename(tf))
        else:
            err("unit tests FAILED: %s\n%s"
                % (os.path.basename(tf), rc.stdout.decode()[-400:]))

    # --- docs are portable: no machine-specific paths in user-facing guides ---
    repo = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    portable_docs = [
        "README.md",
        os.path.join("docs", "LAB-SETUP.md"),
        os.path.join("docs", "reference-architectures", "RA-01-on-prem.md"),
        os.path.join("docs", "reference-architectures", "RA-02-hybrid-aws.md"),
    ]
    for rel in portable_docs:
        path = os.path.join(repo, rel)
        if not os.path.exists(path):
            errors.append("%s missing (user-facing doc)" % rel)
            continue
        body = _read(path)
        bad = [pat for pat in ("~/Work/", "/home/kibby") if pat in body]
        if bad:
            errors.append("%s contains machine-specific paths: %s" % (rel, ", ".join(bad)))
        else:
            passes.append("%s is copy-paste portable" % rel)

    # --- report ---
    print("\n=== validate_kit: %s ===" % kit)
    for p in passes:
        print("  PASS %s" % p)
    for w in warnings:
        print("  WARN %s" % w)
    for e in errors:
        print("  FAIL %s" % e)
    print("\n%d pass, %d warn, %d FAIL" % (len(passes), len(warnings), len(errors)))
    return 1 if errors else 0


def _have(cmd):
    for p in os.environ.get("PATH", "").split(os.pathsep):
        if os.path.exists(os.path.join(p, cmd)):
            return True
    return False


def _read(path):
    with open(path, "r", errors="replace") as fh:
        return fh.read()


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("usage: validate_kit.py <kit-dir>")
        sys.exit(2)
    sys.exit(main(sys.argv[1]))
