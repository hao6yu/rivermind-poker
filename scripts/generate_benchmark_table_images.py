from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


OUTPUT_DIR = Path("docs/assets/open-model-benchmark")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

REGULAR_FONT = "/System/Library/Fonts/Supplemental/Arial.ttf"
BOLD_FONT = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
ROW_ACCENTS = ["#16a085", "#5965f2", "#e26d3d", "#7c3aed", "#0284c7"]


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(BOLD_FONT if bold else REGULAR_FONT, size)


def wrap_text(draw: ImageDraw.ImageDraw, text: str, max_width: int, text_font: ImageFont.FreeTypeFont) -> list[str]:
    words = str(text).split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if current and draw.textlength(candidate, font=text_font) > max_width:
            lines.append(current)
            current = word
        else:
            current = candidate
    if current:
        lines.append(current)
    return lines or [""]


def draw_table(
    *,
    file_name: str,
    title: str,
    subtitle: str,
    columns: list[tuple[str, float]],
    rows: list[list[str]],
    width: int = 2000,
) -> None:
    margin = 56
    title_font = font(52, bold=True)
    subtitle_font = font(28)
    header_font = font(29, bold=True)
    body_font = font(35)
    model_font = font(35, bold=True)
    line_height = 44
    header_y = 184
    header_height = 88
    inner_width = width - margin * 2
    total_weight = sum(weight for _, weight in columns)
    column_widths = [int(inner_width * weight / total_weight) for _, weight in columns]
    column_widths[-1] += inner_width - sum(column_widths)

    measure = Image.new("RGB", (width, 400), "white")
    measure_draw = ImageDraw.Draw(measure)
    wrapped_rows: list[list[list[str]]] = []
    row_heights: list[int] = []
    for row in rows:
        wrapped = [
            wrap_text(measure_draw, cell, column_widths[index] - 40, model_font if index == 0 else body_font)
            for index, cell in enumerate(row)
        ]
        wrapped_rows.append(wrapped)
        row_heights.append(max(108, max(len(lines) for lines in wrapped) * line_height + 42))

    height = header_y + header_height + sum(row_heights) + 58
    image = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(image)
    draw.text((margin, 48), title, fill="#111827", font=title_font)
    draw.text((margin, 112), subtitle, fill="#64748b", font=subtitle_font)

    draw.rounded_rectangle(
        (margin, header_y, margin + inner_width, header_y + header_height),
        radius=18,
        fill="#111827",
    )
    x = margin
    for index, (label, _) in enumerate(columns):
        draw.text((x + 20, header_y + 27), label, fill="white", font=header_font)
        x += column_widths[index]

    y = header_y + header_height
    for row_index, wrapped in enumerate(wrapped_rows):
        row_height = row_heights[row_index]
        draw.rectangle(
            (margin, y, margin + inner_width, y + row_height),
            fill="#f8fafc" if row_index % 2 == 0 else "#eef2ff",
        )
        draw.rectangle((margin, y, margin + 10, y + row_height), fill=ROW_ACCENTS[row_index % len(ROW_ACCENTS)])
        x = margin
        for column_index, lines in enumerate(wrapped):
            cell_font = model_font if column_index == 0 else body_font
            text_height = len(lines) * line_height
            line_y = y + max(18, (row_height - text_height) // 2)
            for line in lines:
                draw.text((x + 20, line_y), line, fill="#111827", font=cell_font)
                line_y += line_height
            x += column_widths[column_index]
        y += row_height

    draw.rounded_rectangle(
        (margin, header_y, margin + inner_width, y),
        radius=18,
        outline="#cbd5e1",
        width=3,
    )
    image.save(OUTPUT_DIR / file_name, "PNG", optimize=True)


draw_table(
    file_name="model-scorecard.png",
    title="The short version",
    subtitle="My review of these exact local-agent sessions—not a universal model ranking.",
    columns=[("Model", 1.25), ("Best at", 1.35), ("Biggest failure", 2.25), ("Score", 1.15)],
    rows=[
        ["DeepSeek V4 Flash 0731", "Domain, security, concurrency", "Weak visual QA; too much confidence after green tests", "6.5 first pass"],
        ["Qwen3.8 Flash Next", "Simulator debugging, UI integration", "Declared done without exercising private multiplayer", "7.2 first done; 8.1 after repair"],
        ["GLM-5.3 Flash EXL3", "Focused architecture, test seams", "Accessibility rationalization; hidden multiplayer entry", "7.8 provisional"],
    ],
)

draw_table(
    file_name="public-benchmark-comparison.png",
    title="Public benchmark reality check",
    subtitle="Evidence that open models are in the conversation—not proof that they win every workload.",
    columns=[("Benchmark", 1.65), ("Open model", 1.35), ("Result", 0.95), ("Proprietary reference", 1.65), ("Gap", 0.55)],
    rows=[
        ["Arena WebDev", "Qwen3.8 Flash Next", "1617 ± 15 AutoEval", "GPT-5.6 Sol xhigh: 1619 ± 8", "−2"],
        ["Terminal-Bench 2.1", "GLM-5.3 Flash", "84.3", "Claude Opus 4.8: 85.0", "−0.7"],
        ["Terminal-Bench 2.1", "DeepSeek V4 Flash 0731", "82.7", "Claude Opus 4.8: 85.0", "−2.3"],
        ["SWE-bench Pro", "Qwen3.8 Flash Next", "62.5", "Claude Opus 4.6 Max: 53.4", "+9.1"],
        ["DeepSWE 1.1", "GLM-5.3 Flash", "63.4", "Claude Opus 4.8: 58.0", "+5.4"],
    ],
)

draw_table(
    file_name="session-telemetry.png",
    title="What the DSH sessions actually measured",
    subtitle="Effective generation uses model-active request time; decode speed starts after the first token.",
    columns=[
        ("Model", 1.45), ("Calls", 0.55), ("Output tokens", 0.9), ("Reasoning words", 0.95),
        ("Active time", 0.75), ("Effective", 0.85), ("Decode", 0.75), ("Median TTFT", 0.75),
    ],
    rows=[
        ["DeepSeek V4 Flash 0731", "1,163", "619,379", "148,602", "6.12 h", "44.1 tok/s", "52.9 tok/s", "1.04 s"],
        ["Qwen3.8 Flash Next", "605", "459,740", "157,782", "5.09 h", "35.5 tok/s", "40.8 tok/s", "2.25 s"],
        ["GLM-5.3 Flash EXL3", "270", "134,913", "43,372", "2.03 h", "21.5 tok/s", "27.1 tok/s", "3.77 s"],
    ],
    width=2400,
)

draw_table(
    file_name="reasoning-comparison.png",
    title="Maximum reasoning did not mean maximum useful reasoning",
    subtitle="The real distinction: did a concern become a fix, a test, or an explicit open risk?",
    columns=[("Model", 1.05), ("Reasoning style", 1.65), ("Useful part", 1.65), ("Waste pattern", 2.35)],
    rows=[
        ["DeepSeek", "Broad, repetitive architecture validation", "Invariants, authority, concurrency, security", "Re-confirming design while under-testing visible behavior"],
        ["Qwen", "Continuous, exploratory diagnosis", "Simulator evidence and cross-layer debugging", "Losing the acceptance checklist inside local progress"],
        ["GLM", "Fewer, larger planning blocks", "Test seams and focused implementation", "Rationalizing a concern instead of closing it"],
    ],
)

print("Generated four Medium comparison tables.")
