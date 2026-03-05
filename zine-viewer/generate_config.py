"""
generate_config.py
zine-viewer/assets/ 配下の vol** フォルダをスキャンして config.js を自動生成する。

使い方:
  1) zine-viewer/assets/volXX を作成
  2) その中に以下を配置
     - XX-1 .. XX-8 のページ画像 (png/jpg/jpeg)
     - 展開図画像 (例: volXX.png / volX.png / その他画像1枚)
     - PDF 1本 (ダウンロード用)
  3) newzine.bat (または generate_config.bat) を実行
"""

import json
import os
import re
from pathlib import Path
from typing import Dict, List, Optional, Tuple

SCRIPT_DIR = Path(__file__).resolve().parent
ASSETS_DIR = SCRIPT_DIR / "assets"

IMAGE_EXTS = (".png", ".jpg", ".jpeg")


def list_files_map(vol_dir: Path) -> Dict[str, str]:
    files: Dict[str, str] = {}
    for p in vol_dir.iterdir():
        if p.is_file():
            files[p.name.lower()] = p.name
    return files


def find_first_existing(files_map: Dict[str, str], candidates: List[str]) -> Optional[str]:
    for c in candidates:
        hit = files_map.get(c.lower())
        if hit:
            return hit
    return None


def find_cover(vol_num: int, files_map: Dict[str, str]) -> Optional[str]:
    candidates = [f"{vol_num}-1{ext}" for ext in IMAGE_EXTS]
    return find_first_existing(files_map, candidates)


def find_pages(vol_num: int, files_map: Dict[str, str]) -> List[Optional[str]]:
    pages: List[Optional[str]] = []
    for page_idx in range(1, 9):
        candidates = [f"{vol_num}-{page_idx}{ext}" for ext in IMAGE_EXTS]
        pages.append(find_first_existing(files_map, candidates))
    return pages


def find_spread(vol_id: str, vol_num: int, files_map: Dict[str, str]) -> Optional[str]:
    # 優先: volXX.ext (ゼロ埋め) -> volX.ext -> その他 vol数字.ext
    preferred = [f"{vol_num:02d}", f"{vol_num}"]
    for n in preferred:
        hit = find_first_existing(files_map, [f"vol{n}{ext}" for ext in IMAGE_EXTS])
        if hit:
            return hit

    vol_named = []
    for lower_name, real_name in files_map.items():
        if re.match(r"^vol\d+\.(png|jpg|jpeg)$", lower_name):
            vol_named.append(real_name)
    if vol_named:
        vol_named.sort(key=lambda x: x.lower())
        # vol_id 完全一致を優先
        for name in vol_named:
            if Path(name).stem.lower() == vol_id.lower():
                return name
        return vol_named[0]

    # フォールバック: ページ画像以外の最初の画像
    page_pat = re.compile(rf"^{vol_num}-[1-8]\.(png|jpg|jpeg)$")
    others = []
    for lower_name, real_name in files_map.items():
        if not lower_name.endswith(IMAGE_EXTS):
            continue
        if page_pat.match(lower_name):
            continue
        others.append(real_name)
    if others:
        others.sort(key=lambda x: x.lower())
        return others[0]

    return None


def find_pdf(files_map: Dict[str, str]) -> Optional[str]:
    pdfs = [real for lower, real in files_map.items() if lower.endswith(".pdf")]
    if not pdfs:
        return None
    pdfs.sort(key=lambda x: x.lower())
    return pdfs[0]


def build_rel_path(vol_id: str, filename: Optional[str]) -> Optional[str]:
    if not filename:
        return None
    return f"assets/{vol_id}/{filename}"


def scan_volumes() -> List[dict]:
    if not ASSETS_DIR.exists():
        raise FileNotFoundError(f"assets directory not found: {ASSETS_DIR}")

    entries: List[Tuple[int, str]] = []
    for item in ASSETS_DIR.iterdir():
        if not item.is_dir():
            continue
        m = re.match(r"^vol(\d+)$", item.name, flags=re.IGNORECASE)
        if not m:
            continue
        vol_num = int(m.group(1))
        vol_id = f"vol{vol_num:02d}"
        entries.append((vol_num, vol_id))

    entries.sort(key=lambda x: x[0])

    volumes = []
    for vol_num, vol_id in entries:
        vol_dir = ASSETS_DIR / vol_id
        files_map = list_files_map(vol_dir)

        cover = find_cover(vol_num, files_map)
        spread = find_spread(vol_id, vol_num, files_map)
        pages = find_pages(vol_num, files_map)
        pdf = find_pdf(files_map)

        label = f"Vol.{vol_num:02d}"
        vol_data = {
            "id": vol_id,
            "label": label,
            "cover": build_rel_path(vol_id, cover),
            "spread": build_rel_path(vol_id, spread),
            "pages": [build_rel_path(vol_id, p) for p in pages],
            "pdf": build_rel_path(vol_id, pdf),
        }
        volumes.append(vol_data)

        found_pages = sum(1 for p in pages if p)
        print(f"  {vol_id}: cover={cover}, spread={spread}, pdf={pdf}, pages={found_pages}枚")

    return volumes


def promote_dummy_volume() -> None:
    """vol99 が存在する場合、空いている最大の次の番号の volXX に昇格し、中のファイル名もリネームする"""
    if not ASSETS_DIR.exists():
        return

    vol99_dir = ASSETS_DIR / "vol99"
    if not vol99_dir.exists() or not vol99_dir.is_dir():
        return

    # 既存の volXX を探して最大の番号を取得 (99は除く)
    max_num = -1
    for item in ASSETS_DIR.iterdir():
        if item.is_dir() and item.name.lower() != "vol99":
            m = re.match(r"^vol(\d+)$", item.name, flags=re.IGNORECASE)
            if m:
                num = int(m.group(1))
                if num > max_num and num != 99:
                    max_num = num

    new_vol_num = max(0, max_num + 1)
    new_vol_id = f"vol{new_vol_num:02d}"
    new_vol_dir = ASSETS_DIR / new_vol_id

    print(f"[*] Found dummy dataset 'vol99'. Promoting to '{new_vol_id}'...")

    # vol99 をリネーム
    try:
        vol99_dir.rename(new_vol_dir)
    except Exception as e:
        print(f"    Failed to rename vol99 to {new_vol_id}: {e}")
        return

    # 中のファイルをリネーム
    page_pat = re.compile(r"^\d+-([1-8])(\.[a-zA-Z0-9]+)$")
    vol_pat = re.compile(r"^vol\d+(.*)$", re.IGNORECASE)

    for p in new_vol_dir.iterdir():
        if not p.is_file():
            continue

        new_name = p.name
        pm = page_pat.match(p.name)
        vm = vol_pat.match(p.name)

        if pm:
            # 例: 11-1.jpg -> 12-1.jpg
            new_name = f"{new_vol_num}-{pm.group(1)}{pm.group(2)}"
        elif vm:
            # 例: vol11.pdf -> vol12.pdf
            new_name = f"vol{new_vol_num:02d}{vm.group(1)}"
        
        if new_name != p.name:
            new_path = new_vol_dir / new_name
            # 同名ファイルが既にある場合は避けるか上書き
            if not new_path.exists():
                p.rename(new_path)
                print(f"    Renamed: {p.name} -> {new_name}")
            else:
                print(f"    Skip renaming (already exists): {new_name}")

    print(f"[*] Promotion complete. (vol99 -> {new_vol_id})\n")


def generate_config_js(volumes: List[dict]) -> None:
    lines = []
    lines.append("// ZINE Data — 自動生成 (newzine.bat / generate_config.bat)")
    lines.append("// 手動で編集しないでください。再生成で上書きされます。")
    lines.append("")
    lines.append("export const ZINE_DATA = [")

    for vol in volumes:
        lines.append("    {")
        lines.append(f"        id: {json.dumps(vol['id'])}, label: {json.dumps(vol['label'])},")
        lines.append(f"        cover: {json.dumps(vol['cover'])},")
        lines.append(f"        spread: {json.dumps(vol['spread'])},")
        page_strs = ", ".join(json.dumps(p) for p in vol["pages"])
        lines.append(f"        pages: [{page_strs}],")
        lines.append(f"        pdf: {json.dumps(vol['pdf'])},")
        lines.append("    },")

    lines.append("];")
    lines.append("")

    config_path = SCRIPT_DIR / "config.js"
    config_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"\n  -> config.js generated: {config_path} ({len(volumes)} volumes)")


def main() -> int:
    print(f"Scan target: {ASSETS_DIR}")
    try:
        promote_dummy_volume()
        volumes = scan_volumes()
    except Exception as exc:
        print(f"ERROR: {exc}")
        return 1

    if not volumes:
        print("No vol** directories found under assets/.")
        return 1

    generate_config_js(volumes)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
