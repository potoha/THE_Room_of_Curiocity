#!/usr/bin/env python3
"""Generate the public content index from Markdown frontmatter.

Legacy entries in data/content.json remain supported. A *new* Markdown file
appears on the site when it contains `status: published` in its frontmatter.
Run: python tools/build_content_index.py
For CI: python tools/build_content_index.py --output build/data/content.json
No third-party Python packages are needed.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
MD_ROOT = DATA / "MD_contents_master"
TYPE_BY_FOLDER = {
    "01-fragment": "fragment",
    "02-essay": "essay",
    "03-project-note": "project-note",
    "04-works": "work",
}
FIELD_NAMES = ("title", "description", "slug", "url", "created", "status", "featured", "featuredOrder")


def parse_scalar(value: str):
    value = value.strip().strip("\ufeff")
    if not value:
        return ""
    if (value[0] == value[-1]) and value.startswith(('"', "'")):
        return value[1:-1]
    if value.lower() in ("true", "false"):
        return value.lower() == "true"
    if re.fullmatch(r"-?\d+", value):
        return int(value)
    return value


def parse_frontmatter(text: str) -> dict:
    # Minimal frontmatter parser, supporting the documented inline list form.
    # Multi-line nested YAML deliberately excluded to avoid silent misparses.
    m = re.match(r"\A\ufeff?---\s*\r?\n(.*?)\r?\n---\s*(?:\r?\n|\Z)", text, re.S)
    if not m:
        return {}
    result = {}
    for line in m.group(1).splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if ":" not in line or line[0].isspace():
            continue
        name, value = line.split(":", 1)
        key = name.strip()
        value = value.strip()
        if value.startswith("[") and value.endswith("]"):
            result[key] = [
                parse_scalar(item) for item in value[1:-1].split(",") if item.strip()
            ]
        else:
            result[key] = parse_scalar(value)
    return result


def stable_id(file_name: str) -> str:
    return "c_" + hashlib.sha256(file_name.encode("utf-8")).hexdigest()[:12]


def slug_for(file_name: str) -> str:
    stem = Path(file_name).stem.lower()
    slug = re.sub(r"[^a-z0-9]+", "-", stem).strip("-")
    return slug if len(slug) >= 3 else "text-" + stable_id(file_name)[2:]


def build_index() -> list:
    baseline = json.loads((DATA / "content.json").read_text(encoding="utf-8"))
    dictionary = json.loads((DATA / "keywords.json").read_text(encoding="utf-8"))
    keyword_ids = {}
    for kid, kw in dictionary.items():
        for label in [kw.get("label", ""), *(kw.get("aliases") or [])]:
            if isinstance(label, str) and label:
                keyword_ids.setdefault(label, kid)

    legacy = {entry["file"]: entry for entry in baseline if entry.get("file")}
    ordered = []
    files = list(MD_ROOT.rglob("*.md"))
    for path in sorted(files):
        rel = path.relative_to(MD_ROOT).as_posix()
        fm = parse_frontmatter(path.read_text(encoding="utf-8-sig"))
        old = legacy.get(rel)
        # Do not accidentally publish unregistered private drafts.
        if old is None and fm.get("status") != "published":
            continue
        if fm.get("status") in ("draft", "private", "archived"):
            continue
        entry = dict(old) if old else {
            "id": stable_id(rel),
            "type": TYPE_BY_FOLDER.get(path.relative_to(MD_ROOT).parts[0], "work"),
            "title": path.stem,
            "slug": slug_for(rel),
            "file": rel,
            "keywords": [],
            "url": "",
            "description": "",
        }
        for name in FIELD_NAMES:
            if name in fm and name != "status":
                entry[name] = fm[name]
        if "type" in fm:
            entry["type"] = str(fm["type"])
        if "topics" in fm and isinstance(fm["topics"], list):
            entry["keywords"] = list(dict.fromkeys(
                keyword_ids[label] for label in fm["topics"] if label in keyword_ids
            ))
        if "keywords" in fm and isinstance(fm["keywords"], list):
            entry["keywords"] = [k for k in fm["keywords"] if k in dictionary]
        if not entry.get("slug"):
            entry["slug"] = slug_for(rel)
        ordered.append(entry)
    # Preserve curated order for legacy records; sort new ones by filename.
    legacy_order = {row["file"]: i for i, row in enumerate(baseline) if row.get("file")}
    ordered.sort(key=lambda e: (0, legacy_order[e["file"]]) if e["file"] in legacy_order else (1, e["file"]))
    seen = {}
    for entry in ordered:
        slug = entry["slug"]
        if slug in seen:
            raise ValueError(f"Duplicate slug {slug!r}: {seen[slug]!r} and {entry['file']!r}")
        seen[slug] = entry["file"]
    return ordered


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--output", default="data/content.json", help="Output JSON, relative to repository")
    args = ap.parse_args()
    output = ROOT / args.output
    items = build_index()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(items, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Indexed {len(items)} published content items -> {output.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
