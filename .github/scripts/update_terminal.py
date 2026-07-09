#!/usr/bin/env python3
"""Gera o bloco do Terminal Interativo e atualiza o README."""
import os

def build_terminal():
    today_commits = os.environ.get("TODAY_COMMITS", "0")
    open_prs = os.environ.get("OPEN_PRS", "3")
    pct = int(os.environ.get("ROADMAP_PCT", "82"))
    full = pct // 5
    empty = 20 - full
    bar = "\u2588" * full
    emp = "\u2591" * empty

    lines = [
        "```bash",
        "\u2554" + "\u2550" * 69 + "\u2557",
        "\u2551  root@workspace:~$ ./whoami.sh                                     \u2551",
        "\u255a" + "\u2550" * 69 + "\u255d",
        "",
        "> whoami",
        "Bruno Andrade",
        "",
        "> skills",
        "\u250c" + "\u2500" * 57 + "\u2510",
        "\u2502 \u2713 React          \u2713 Next.js        \u2713 Node.js            \u2502",
        "\u2502 \u2713 TypeScript     \u2713 Firebase       \u2713 Clean Architecture \u2502",
        "\u2502 \u2713 Three.js       \u2713 Electron       \u2713 NVIDIA NIM         \u2502",
        "\u2502 \u2713 PostgreSQL     \u2713 Tailwind       \u2713 shadcn/ui          \u2502",
        "\u2514" + "\u2500" * 57 + "\u2518",
        "",
        "> projects",
        "\u250c" + "\u2500" * 57 + "\u2510",
        "\u2502 \U0001f3d7\ufe0f  Workspace        \u2014 Editor 3D + IA                  \u2502",
        "\u2502 \U0001f4dd VestQuiz          \u2014 Plataforma de quest\u00f5es          \u2502",
        "\u2502 \U0001f4ca INFO.SECTI        \u2014 Gest\u00e3o de projetos cient\u00edficos  \u2502",
        "\u2502 \U0001f52c PatentesLab       \u2014 Rob\u00f4 de patentes INPI           \u2502",
        "\u2502 \U0001f6d2 TSARA             \u2014 E-commerce + agendamento        \u2502",
        "\u2502 \U0001f4cb SECTI-contratos   \u2014 Gest\u00e3o contratual               \u2502",
        "\u2514" + "\u2500" * 57 + "\u2518",
        "",
        "> roadmap",
        f"{bar}{emp} {pct}%",
        "",
        "\u250c" + "\u2500" * 57 + "\u2510",
        "\u2502 \u2705 Full Stack       \u2705 3D Web       \u2705 Desktop (Electron)\u2502",
        "\u2502 \U0001f504 IA Integration   \u23f3 Mobile       \u23f3 Rust/WASM         \u2502",
        "\u2514" + "\u2500" * 57 + "\u2518",
        "",
        "> stats --verbose",
        f"Commits hoje: {today_commits} \u2502 PRs abertos: {open_prs} \u2502 Builds falhando: 0",
        "```",
    ]
    return "\n".join(lines)


def update_readme(terminal_block):
    with open("README.md", "r", encoding="utf-8") as f:
        content = f.read()
    marker = "root@workspace:~"
    start = content.find(marker)
    if start == -1:
        print("Marker not found, skipping")
        return
    fence_start = content.rfind("```bash", 0, start)
    fence_end = content.find("```", fence_start + 7)
    fence_end = content.find("```", fence_end + 3) + 3
    content = content[:fence_start] + terminal_block + content[fence_end:]
    with open("README.md", "w", encoding="utf-8") as f:
        f.write(content)


if __name__ == "__main__":
    block = build_terminal()
    update_readme(block)
    print("Terminal updated")
