#!/usr/bin/env python3
"""Fetch bundled stock photos from Wikimedia Commons featured pictures.

Unsplash napi is behind a bot challenge, so Commons is the source.

Usage:
  python3 fetch_stock.py candidates   # harvest metadata -> scripts/candidates.json
  python3 fetch_stock.py build        # download picks.json -> extension/photos/stock + stock.json

picks.json is hand-curated: [{"title": "File:...", "location": "Place, Region, Country"}, ...]
Order in picks.json = id order (001..).
"""
import html
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPTS = os.path.join(ROOT, "scripts")
EXT = os.path.join(ROOT, "extension")
OUT = os.path.join(EXT, "photos", "stock")
API = "https://commons.wikimedia.org/w/api.php"
UA = "doorway/1.0 (https://github.com/Pawel-Kica/doorway)"

CATEGORIES = [
    "Featured pictures of landscapes", "Featured pictures of mountains", "Featured pictures of the Alps",
    "Featured pictures of the Himalayas", "Featured pictures of lakes", "Featured pictures of waterfalls",
    "Featured pictures of coasts", "Featured pictures of forests", "Featured pictures of volcanoes",
    "Featured pictures of islands", "Featured pictures of watercourses", "Featured pictures of aurora",
    "Featured pictures of geysers", "Featured pictures of World Heritage Sites",
    "Commons featured desktop backgrounds",
]
# Category keywords that hint at people, buildings or dark scenes.
BAD = re.compile(r"\b(people|men|women|person|portrait|building|cityscape|architecture|church|castle|"
                 r"monument|temple|town|village|bridge|street|night|interior|animals|birds|boat|ship|"
                 r"train|railway|car|sunset|underwater|cave)s?\b", re.I)
OK_LICENSE = re.compile(r"^(CC BY(-SA)? [0-9.]+|CC0|Public domain|PD.*)$", re.I)


def get(url, binary=False):
    for attempt in range(5):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
            return data if binary else json.loads(data)
        except Exception as e:  # retry on 429/5xx/timeouts
            print("  retry", attempt, e, file=sys.stderr)
            time.sleep(3 * (attempt + 1))
    raise RuntimeError("failed: " + url)


def query_files(params):
    """Yield Commons file pages with imageinfo for a generator query, following continuation."""
    base = {"action": "query", "format": "json", "prop": "imageinfo|categories", "clshow": "!hidden",
            "cllimit": "max", "iiprop": "url|size|extmetadata|user", "iiurlwidth": "2560"}
    base.update(params)
    cont = {}
    while True:
        d = get(API + "?" + urllib.parse.urlencode({**base, **cont}))
        for p in d.get("query", {}).get("pages", {}).values():
            if p.get("imageinfo"):
                yield p
        if "continue" not in d:
            return
        cont = d["continue"]


def strip_html(s):
    return html.unescape(re.sub(r"<[^>]+>", "", s or "")).strip()


def artist(meta, user):
    """Return (name, url) from the Artist field, falling back to the uploader."""
    raw = meta.get("Artist", {}).get("value", "")
    raw = re.sub(r"^\s*Uploaded by\s*", "", raw)
    if "Original:" in raw:  # derivative works: credit the original photographer
        raw = raw.split("Original:", 1)[1].split("Derivative", 1)[0]
    links = [(h, strip_html(t)) for h, t in re.findall(r'<a [^>]*href="([^"]+)"[^>]*>(.*?)</a>', raw, re.S)
             if not re.search(r"File:|upload\.wikimedia|User_talk:|Special:", h) and strip_html(t)]
    if links:
        url, name = links[0]
    else:
        url, name = "", " ".join(strip_html(raw).split())
    if url.startswith("//"):
        url = "https:" + url
    if "redlink=1" in url or "action=edit" in url:  # user page missing -> canonical user URL
        u = re.search(r"User:([^&]+)", url)
        url = "https://commons.wikimedia.org/wiki/User:" + u.group(1) if u else ""
    if not name or len(name) > 60:
        name = user
    if not url:
        url = "https://commons.wikimedia.org/wiki/User:" + urllib.parse.quote(user.replace(" ", "_"))
    return name, url


def candidates():
    seen = {}
    for cat in CATEGORIES:
        print("category:", cat)
        for p in query_files({"generator": "categorymembers", "gcmtitle": "Category:" + cat,
                              "gcmtype": "file", "gcmlimit": "50"}):
            if p["title"] in seen:
                continue
            ii = p["imageinfo"][0]
            meta = ii.get("extmetadata", {})
            cats = [c["title"][9:] for c in p.get("categories", [])]
            lic = meta.get("LicenseShortName", {}).get("value", "")
            w, h = ii["width"], ii["height"]
            if w < 2560 or not (1.3 <= w / h <= 2.2) or not OK_LICENSE.match(lic):
                continue
            if any(BAD.search(c) for c in cats) or not p["title"].lower().endswith((".jpg", ".jpeg")):
                continue
            name, url = artist(meta, ii.get("user", ""))
            seen[p["title"]] = {
                "title": p["title"], "w": w, "h": h, "license": lic,
                "photographer": name, "photographerUrl": url, "sourceUrl": ii["descriptionurl"],
                "name": strip_html(meta.get("ObjectName", {}).get("value", "")),
                "desc": strip_html(meta.get("ImageDescription", {}).get("value", ""))[:200],
                "gps": [meta.get("GPSLatitude", {}).get("value"), meta.get("GPSLongitude", {}).get("value")],
                "cats": cats, "thumb": ii["thumburl"],
            }
    out = os.path.join(SCRIPTS, "candidates.json")
    json.dump(list(seen.values()), open(out, "w"), indent=1, ensure_ascii=False)
    print(len(seen), "candidates ->", out)


def sips(*args):
    subprocess.run(["sips", *args], check=True, capture_output=True)


def build():
    picks = json.load(open(os.path.join(SCRIPTS, "picks.json")))
    os.makedirs(os.path.join(OUT, "thumbs"), exist_ok=True)
    info = {}
    for i in range(0, len(picks), 50):  # API allows 50 titles per request
        chunk = "|".join(p["title"] for p in picks[i:i + 50])
        for p in query_files({"titles": chunk}):
            info[p["title"]] = p
    items = []
    for n, pick in enumerate(picks, 1):
        pid = "%03d" % n
        p = info[pick["title"]]
        ii = p["imageinfo"][0]
        meta = ii.get("extmetadata", {})
        full = os.path.join(OUT, pid + ".jpg")
        thumb = os.path.join(OUT, "thumbs", pid + ".jpg")
        if not os.path.exists(full):
            print(pid, pick["title"])
            src = os.path.join(tempfile.gettempdir(), "doorway-stock-src.jpg")
            open(src, "wb").write(get(ii["thumburl"], binary=True))
            # Encode from the source each time; sips skips re-encoding when nothing else changes.
            for q in (80, 72, 64, 56, 48, 40, 34):  # keep under ~900KB
                sips("-s", "format", "jpeg", "-s", "formatOptions", str(q), "--resampleWidth", "2560", src, "--out", full)
                if os.path.getsize(full) <= 900_000:
                    break
            time.sleep(1)
        if not os.path.exists(thumb):
            sips("-s", "format", "jpeg", "-s", "formatOptions", "75", "--resampleWidth", "480", full, "--out", thumb)
        name, url = artist(meta, ii.get("user", ""))
        items.append({
            "id": pid, "file": "photos/stock/%s.jpg" % pid, "thumb": "photos/stock/thumbs/%s.jpg" % pid,
            "location": pick["location"], "photographer": name, "photographerUrl": url,
            "sourceUrl": ii["descriptionurl"], "license": meta.get("LicenseShortName", {}).get("value", ""),
        })
    json.dump(items, open(os.path.join(EXT, "photos", "stock.json"), "w"), indent=1, ensure_ascii=False)
    print(len(items), "items written")


if __name__ == "__main__":
    {"candidates": candidates, "build": build}[sys.argv[1] if len(sys.argv) > 1 else "candidates"]()
