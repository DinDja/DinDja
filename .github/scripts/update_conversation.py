#!/usr/bin/env python3
"""Gera o bloco de conversa IA e atualiza o README."""
import os
import subprocess
import json

REPOS = [
    "Editor-ThreeJS",
    "SECTI-contratos",
    "TSARA",
    "hubSECTI",
    "PatentesLab",
    "Sectinvent-rio",
]


def gh_api(url):
    try:
        result = subprocess.run(
            ["gh", "api", url], capture_output=True, text=True, timeout=30
        )
        return json.loads(result.stdout) if result.stdout else {}
    except Exception:
        return {}


def build_conversation():
    open_prs = os.environ.get("OPEN_PRS", "3")
    bugs = os.environ.get("BUGS", "1")
    issues = os.environ.get("ISSUES", "5")

    lines = [
        "```",
        "\u2554" + "\u2550" * 69 + "\u2557",
        "\u2551  SYSTEM LOG \u2014 Auto-an\u00e1lise do Workspace                           \u2551",
        "\u255a" + "\u2550" * 69 + "\u255d",
        "",
        "SYSTEM",
        "Bom dia.",
        "",
        "> Projetos ativos?",
        "",
        "WORKSPACE",
        "\u250c" + "\u2500" * 57 + "\u2510",
    ]

    for repo in REPOS:
        data = gh_api(f"repos/DinDja/{repo}/commits/main/status")
        state = data.get("state", "pending")
        if state == "success":
            icon, label = "\U0001f7e2", "Build OK"
        elif state == "failure":
            icon, label = "\U0001f534", "Build FAIL"
        elif state == "pending":
            icon, label = "\U0001f7e1", "Pending"
        else:
            icon, label = "\u26aa", "Unknown"
        name_padded = repo.ljust(24)
        label_padded = label.ljust(12)
        lines.append(f"\u2502 {icon} {name_padded} \u2502 {label_padded} \u2502")

    lines.extend([
        "\u2514" + "\u2500" * 57 + "\u2518",
        "",
        "> Status?",
        "",
        "CI/CD",
        "\u250c" + "\u2500" * 57 + "\u2510",
        "\u2502 \u2705 GitHub Actions   \u2502 3 workflows ativos               \u2502",
        "\u2502 \u2705 Vercel           \u2502 Deploy autom\u00e1tico habilitado     \u2502",
        "\u2502 \u2705 Netlify          \u2502 Functions serverless ativas      \u2502",
        "\u2502 \u2705 Firebase         \u2502 6 projetos conectados            \u2502",
        "\u2514" + "\u2500" * 57 + "\u2518",
        "",
        "> Pend\u00eancias?",
        "",
        "TASKS",
        "\u250c" + "\u2500" * 57 + "\u2510",
        f"\u2502 \U0001f535 {open_prs} PRs abertos                                        \u2502",
        f"\u2502 \U0001f7e1 {issues} issues em progresso                                \u2502",
        f"\u2502 \U0001f534 {bugs} bug(s) cr\u00edtico(s)                                      \u2502",
        "\u2514" + "\u2500" * 57 + "\u2518",
        "",
        "> Objetivo?",
        "",
        "MISSION",
        "\u250c" + "\u2500" * 57 + "\u2510",
        "\u2502 \"Construir um ecossistema completo de ferramentas      \u2502",
        "\u2502  3D, enterprise e IA \u2014 integrando criatividade,        \u2502",
        "\u2502  produtividade e inova\u00e7\u00e3o tecnol\u00f3gica.\"                \u2502",
        "\u2514" + "\u2500" * 57 + "\u2518",
        "```",
    ])
    return "\n".join(lines)


def update_readme(conv_block):
    with open("README.md", "r", encoding="utf-8") as f:
        content = f.read()
    marker = "SYSTEM LOG"
    start = content.find(marker)
    if start == -1:
        print("Marker not found, skipping")
        return
    fence_start = content.rfind("```", 0, start)
    fence_end = content.find("```", fence_start + 3)
    fence_end = content.find("```", fence_end + 3) + 3
    content = content[:fence_start] + conv_block + content[fence_end:]
    with open("README.md", "w", encoding="utf-8") as f:
        f.write(content)


if __name__ == "__main__":
    block = build_conversation()
    update_readme(block)
    print("Conversation updated")
