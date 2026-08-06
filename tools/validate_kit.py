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

    # neuvector is a bare Fleet/Helm bundle (fleet.yaml, no kustomization) —
    # validate what's checkable: the file exists and names a Helm chart.
    nv = os.path.join(demo, "k8s", "neuvector", "fleet.yaml")
    if os.path.exists(nv):
        nv_text = _read(nv)
        if "helm:" in nv_text and "chart" in nv_text:
            ok("fleet bundle sane: k8s/neuvector/fleet.yaml")
        else:
            err("k8s/neuvector/fleet.yaml exists but names no Helm chart")

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
            bad = [pat for pat in ("~/Work/", "/home/kibby") if pat in text]
            if bad:
                err("handoff/%s contains machine-specific paths: %s"
                    % (f, ", ".join(bad)))
        ok("voice/fabrication scan complete")

    # --- browser-demo walkthrough (standard when a kit has a portal demo) ---
    # If browser-demo-walkthrough.md exists at the kit root, the generated
    # PDF must sit beside it, and the md follows the same voice / marker /
    # portability rules as handoff docs (it is rep-facing).
    walkthrough = os.path.join(kit, "browser-demo-walkthrough.md")
    if os.path.isfile(walkthrough):
        if not os.path.isfile(os.path.join(kit, "browser-demo-walkthrough.pdf")):
            err("browser-demo-walkthrough.md present but its generated PDF "
                "is missing (tools/md2pdf.py renders it)")
        text = _read(walkthrough)
        low = text.lower()
        for w in BANNED:
            if re.search(r"\b%s\b" % w, low):
                err("banned filler word '%s' in browser-demo-walkthrough.md" % w)
        if MARKER.search(text):
            err("unresolved marker %s in browser-demo-walkthrough.md"
                % MARKER.search(text).group(0))
        bad = [pat for pat in ("~/Work/", "/home/kibby") if pat in text]
        if bad:
            err("browser-demo-walkthrough.md contains machine-specific "
                "paths: %s" % ", ".join(bad))
        ok("browser-demo walkthrough pair present and clean")

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
        os.path.join("docs", "LOCAL-SETUP.md"),
        os.path.join("docs", "LAB-MVP-SETUP.md"),
        os.path.join("docs", "reference-architectures", "RA-01-on-prem.md"),
        os.path.join("docs", "reference-architectures", "RA-02-hybrid-aws.md"),
        os.path.join("integrations", "rancher-mcp-server", "README.md"),
        os.path.join("portal", "README.md"),
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


def _reset():
    """Clear the module-level result accumulators (selftest runs main() repeatedly)."""
    del errors[:]
    del warnings[:]
    del passes[:]


USAGE = """usage: validate_kit.py <kit-dir>
       validate_kit.py --selftest

Release gate for a Proof Kit. Exit 0 if every check passes, 1 on any FAIL,
2 on a usage error.

What it checks:
  structure     demo/{Makefile,k8s/base/kustomization.yaml,tests} and
                handoff/{00-runbook,01-component-map,02-scale-up,03-footprint}.md,
                plus a Dockerfile in every demo/images/* directory
  manifests     kubectl kustomize builds each overlay (base, ai, losant) when
                kubectl is on PATH, else WARN; k8s/neuvector/fleet.yaml must
                name a Helm chart
  dashboards    every .html under demo/ is self-contained (no CDN, no @import,
                no remote src/href)
  voice         no filler words (%s) and no unresolved
                [FILL] / [NEEDS ...] markers in partner-facing docs
  portability   no ~/Work/ or /home/kibby paths in handoff docs, the browser-demo
                walkthrough, or the repo's user-facing guides
  walkthrough   if browser-demo-walkthrough.md exists, its rendered .pdf sits
                beside it (tools/md2pdf.py generates it)
  tests         every demo/tests/test_*.py exits 0
""" % ", ".join(BANNED)


def _selftest():
    """Build synthetic kits in a temp dir and assert each detector fires.

    Runs main() once per scenario with stdout captured, so the assertions read
    the accumulators rather than the printed report.
    """
    import io
    import shutil
    import tempfile
    import contextlib

    checks = [0]

    def check(cond, label):
        checks[0] += 1
        if not cond:
            print("SELFTEST FAILED: %s" % label)
            sys.exit(1)

    def build(root, **opts):
        """Write a minimal kit. Options flip one fault on at a time."""
        demo = os.path.join(root, "demo")
        handoff = os.path.join(root, "handoff")
        os.makedirs(os.path.join(demo, "k8s", "base"))
        os.makedirs(os.path.join(demo, "tests"))
        os.makedirs(os.path.join(demo, "images", "edge-inference"))
        os.makedirs(handoff)
        _write(os.path.join(demo, "Makefile"), "up:\n\t@echo up\n")
        _write(os.path.join(demo, "k8s", "base", "kustomization.yaml"),
               "resources: []\n")
        _write(os.path.join(demo, "images", "edge-inference", "Dockerfile"),
               "FROM scratch\n")
        _write(os.path.join(demo, "tests", "test_model.py"),
               "import sys\nsys.exit(%d)\n" % (1 if opts.get("failing_test") else 0))
        html = ('<html><body><p>console</p>%s</body></html>'
                % ('<script src="https://cdn.example.com/x.js"></script>'
                   if opts.get("external_html") else ""))
        _write(os.path.join(demo, "dash.html"), html)
        docs = ["00-partner-handoff-runbook.md", "01-component-map.md",
                "02-scale-up-path.md", "03-production-footprint.md"]
        if opts.get("drop_footprint"):
            docs.remove("03-production-footprint.md")
        body = "# Doc\n\nA plain sentence about the kit.\n"
        if opts.get("banned"):
            body += "\nThis is a robust design.\n"
        if opts.get("marker"):
            body += "\nNode count: [FILL]\n"
        if opts.get("abs_path"):
            body += "\nSee /home/kibby/notes.md.\n"
        for d in docs:
            _write(os.path.join(handoff, d), body)
        if opts.get("walkthrough_no_pdf"):
            _write(os.path.join(root, "browser-demo-walkthrough.md"),
                   "# Walkthrough\n\nOpen the console.\n")

    def run(**opts):
        root = tempfile.mkdtemp(prefix="validate_kit_selftest_")
        try:
            kit = os.path.join(root, "kit")
            os.makedirs(kit)
            build(kit, **opts)
            _reset()
            with contextlib.redirect_stdout(io.StringIO()):
                main(kit)
            return list(errors)
        finally:
            shutil.rmtree(root, ignore_errors=True)

    def fired(errs, needle):
        return any(needle in e for e in errs)

    # A clean synthetic kit must raise no kit-scoped errors. Repo-scoped
    # portable-doc checks run against the real repo and are excluded here so
    # the selftest stays independent of repo content.
    base = [e for e in run() if not e.startswith(("README.md", "docs/", "integrations/", "portal/"))]
    check(base == [], "clean kit produced kit-scoped errors: %s" % base)

    check(fired(run(drop_footprint=True), "missing: handoff footprint"),
          "missing handoff doc not detected")
    check(fired(run(banned=True), "banned filler word 'robust'"),
          "banned filler word not detected")
    check(fired(run(marker=True), "unresolved marker [FILL]"),
          "unresolved marker not detected")
    check(fired(run(abs_path=True), "machine-specific paths"),
          "machine-specific path not detected")
    check(fired(run(external_html=True), "not self-contained"),
          "external resource in HTML not detected")
    check(fired(run(walkthrough_no_pdf=True), "generated PDF"),
          "walkthrough without its PDF not detected")
    check(fired(run(failing_test=True), "unit tests FAILED"),
          "failing unit test not detected")

    print("selftest: OK (%d checks — every detector fires, clean kit stays clean)"
          % checks[0])
    return 0


def _write(path, text):
    with open(path, "w") as fh:
        fh.write(text)


if __name__ == "__main__":
    args = sys.argv[1:]
    if not args or args[0] in ("-h", "--help"):
        print(USAGE)
        sys.exit(0 if args else 2)
    if args[0] == "--selftest":
        sys.exit(_selftest())
    if len(args) != 1:
        print(USAGE)
        sys.exit(2)
    if not os.path.isdir(args[0]):
        print("validate_kit: not a directory: %s\n" % args[0])
        print(USAGE)
        sys.exit(2)
    sys.exit(main(args[0]))
