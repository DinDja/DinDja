#!/usr/bin/env python3
"""Gera o skyline da Cidade Viva e atualiza o README."""
import re

REPOS = [
    ("Editor-ThreeJS", 184),
    ("SECTI-contratos", 85),
    ("TSARA", 152),
    ("hubSECTI", 82),
    ("PatentesLab", 70),
    ("Sectinvent-rio", 58),
]

def build_skyline():
    lines = []
    lines.append("```")
    lines.append("\u2554" + "\u2550" * 69 + "\u2557")
    lines.append("\u2551                    SKYLINE DO WORKSPACE                           \u2551")
    lines.append("\u2551                                                                   \u2551")
    for name, count in REPOS:
        bars = count // 10
        bar = "\u2588" * bars
        dots = "\u2591" * (18 - bars)
        label = f"  {name}"
        label = label.ljust(27)
        line = f"\u2551   \U0001f3e2 {label}{bar}{dots}  {count} arquivos   \u2551"
        lines.append(line)
    lines.append("\u2551                                                                   \u2551")
    lines.append("\u2551   \U0001f4a1 CI verde = luzes acesas                                      \u2551")
    lines.append("\u2551   \U0001f41b Bugs = fuma\u00e7a saindo do pr\u00e9dio                               \u2551")
    lines.append("\u2551   \U0001f389 Nova release = fogos de artif\u00edcio                            \u2551")
    lines.append("\u255a" + "\u2550" * 69 + "\u255d")
    lines.append("```")
    return "\n".join(lines)


def update_readme(skyline_block):
    with open("README.md", "r", encoding="utf-8") as f:
        content = f.read()
    marker = "\u2554" + "\u2550" * 69 + "\u2557"
    start = content.find(marker)
    if start == -1:
        print("Marker not found, skipping")
        return
    fence_start = content.rfind("```", 0, start)
    fence_end = content.find("```", fence_start + 3)
    fence_end = content.find("```", fence_end + 3) + 3
    content = content[:fence_start] + skyline_block + content[fence_end:]
    with open("README.md", "w", encoding="utf-8") as f:
        f.write(content)


if __name__ == "__main__":
    block = build_skyline()
    update_readme(block)
    print("Skyline updated")
