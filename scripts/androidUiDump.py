"""Print uiautomator nodes from a dump: label, bounds, clickability.

Usage: python3 androidUiDump.py ui.xml [--clickable] [--near x,y --radius N]

Icon glyphs from @expo/vector-icons land in the text tree as private-use-area
codepoints; they are hidden by default because they are noise for a legibility
pass but the `--glyphs` flag shows them when auditing accessibility labels.
"""
import re
import sys

GLYPH_MIN, GLYPH_MAX = 0xE000, 0xF8FF


def nodes(xml_text):
    for match in re.finditer(r"<node[^>]*>", xml_text):
        tag = match.group(0)

        def field(name):
            found = re.search(name + r'="([^"]*)"', tag)
            return found.group(1) if found else ""

        bounds = re.search(r'bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', tag)
        if not bounds:
            continue
        x1, y1, x2, y2 = map(int, bounds.groups())
        yield {
            "text": field("text"),
            "desc": field("content-desc"),
            "clickable": field("clickable") == "true",
            "center": ((x1 + x2) // 2, (y1 + y2) // 2),
            "size": (x2 - x1, y2 - y1),
        }


def is_glyph(value):
    return bool(value) and GLYPH_MIN <= ord(value[0]) <= GLYPH_MAX


def main():
    path = sys.argv[1]
    clickable_only = "--clickable" in sys.argv
    show_glyphs = "--glyphs" in sys.argv
    for node in nodes(open(path, encoding="utf-8").read()):
        if clickable_only and not node["clickable"]:
            continue
        label = node["text"] or node["desc"]
        if not label:
            continue
        if is_glyph(label) and not show_glyphs:
            continue
        marker = "TAP" if node["clickable"] else "   "
        x, y = node["center"]
        w, h = node["size"]
        print(f"{marker} ({x:4},{y:4}) {w:4}x{h:<4} {label[:70]}")


if __name__ == "__main__":
    main()
