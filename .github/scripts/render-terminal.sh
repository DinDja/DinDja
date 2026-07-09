#!/bin/bash
# Script chamado pelo GitHub Action terminal-interactive.yml
# Gera o bloco do terminal interativo para o README
source .github/scripts/generate-readme-data.sh

PCT=${ROADMAP_PCT:-82}
FULL=$((PCT / 5))
EMPTY=$((20 - FULL))
BAR=$(printf '█%.0s' $(seq 1 $FULL))
EMP=$(printf '░%.0s' $(seq 1 $EMPTY))

cat > /tmp/terminal-block.txt << 'TERMEOF'
```bash
╔═══════════════════════════════════════════════════════════════════╗
║  root@workspace:~$ ./whoami.sh                                     ║
╚═══════════════════════════════════════════════════════════════════╝

> whoami
Bruno Andrade

> skills
┌─────────────────────────────────────────────────────────┐
│ ✓ React          ✓ Next.js        ✓ Node.js            │
│ ✓ TypeScript     ✓ Firebase       ✓ Clean Architecture │
│ ✓ Three.js       ✓ Electron       ✓ NVIDIA NIM         │
│ ✓ PostgreSQL     ✓ Tailwind       ✓ shadcn/ui          │
└─────────────────────────────────────────────────────────┘

> projects
┌─────────────────────────────────────────────────────────┐
│ 🏗️  Workspace        — Editor 3D + IA                  │
│ 📝 VestQuiz          — Plataforma de questões          │
│ 📊 INFO.SECTI        — Gestão de projetos científicos  │
│ 🔬 PatentesLab       — Robô de patentes INPI           │
│ 🛒 TSARA             — E-commerce + agendamento        │
│ 📋 SECTI-contratos   — Gestão contratual               │
└─────────────────────────────────────────────────────────┘

> roadmap
TERMEOF

echo "${BAR}${EMP} ${PCT}%" >> /tmp/terminal-block.txt

cat >> /tmp/terminal-block.txt << 'TERMEOF2'

┌─────────────────────────────────────────────────────────┐
│ ✅ Full Stack     ✅ 3D Web     ✅ Desktop (Electron)   │
│ 🔄 IA Integration   ⏳ Mobile       ⏳ Rust/WASM            │
└─────────────────────────────────────────────────────────┘

> stats --verbose
Commits hoje: ${TODAY_COMMITS:-0} │ PRs abertos: ${OPEN_PRS:-3} │ Builds falhando: 0
```
TERMEOF2