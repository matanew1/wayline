"""Turns a Maestro JUnit report (+ debug output) into GitHub annotations and a job summary."""
import glob
import os
import sys
import xml.etree.ElementTree as ET

report, debug = sys.argv[1], sys.argv[2]
summary = open(os.environ.get("GITHUB_STEP_SUMMARY", os.devnull), "a")

if not os.path.exists(report):
    print("::error title=Maestro::no report written (did the emulator or the APK install fail?)")
    sys.exit(0)

rows = []
for case in ET.parse(report).getroot().iter("testcase"):
    name = case.get("name") or case.get("id")
    failure = case.find("failure")
    if failure is None:
        failure = case.find("error")
    if failure is None:
        rows.append(f"| ✅ | {name} | |")
        print(f"::notice title=Maestro passed::{name}")
    else:
        msg = (failure.get("message") or failure.text or "failed").strip().replace("\n", " ")[:900]
        rows.append(f"| ❌ | {name} | {msg} |")
        print(f"::error title=Maestro failed: {name}::{msg}")

summary.write("## Maestro\n\n| | Flow | Failure |\n|---|---|---|\n" + "\n".join(rows) + "\n")

# The last lines of maestro.log usually name the step that failed and what was on screen.
for log in sorted(glob.glob(os.path.join(debug, "**", "maestro.log"), recursive=True))[-1:]:
    tail = [l.strip() for l in open(log, errors="replace").read().splitlines() if "FAILED" in l or "Exception" in l][-5:]
    for line in tail:
        print(f"::warning title=maestro.log::{line[:900]}")
