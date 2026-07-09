#!/bin/bash
# Script chamado pelo GitHub Action ai-conversation.yml
# Gera o bloco de conversa IA para o README
source .github/scripts/generate-readme-data.sh

REPOS=("Editor-ThreeJS" "SECTI-contratos" "TSARA" "hubSECTI" "PatentesLab" "Sectinvent-rio")

OUTFILE=/tmp/conversation.txt

cat > "$OUTFILE" << 'CONVEOF'
```
╔═══════════════════════════════════════════════════════════════════╗
║  SYSTEM LOG — Auto-análise do Workspace                           ║
╚═══════════════════════════════════════════════════════════════════╝

SYSTEM
Bom dia.

> Projetos ativos?

WORKSPACE
┌─────────────────────────────────────────────────────────┐
CONVEOF

for repo in "${REPOS[@]}"; do
  STATUS=$(gh api repos/DinDja/$repo/commits/main/status --jq '.state' 2>/dev/null || echo "pending")
  case "$STATUS" in
    success) ICON="🟢"; LABEL="Build OK" ;;
    failure) ICON="🔴"; LABEL="Build FAIL" ;;
    pending) ICON="🟡"; LABEL="Pending" ;;
    *)       ICON="⚪"; LABEL="Unknown" ;;
  esac
  printf "│ %s %-24s │ %-12s │\n" "$ICON" "$repo" "$LABEL" >> "$OUTFILE"
done

cat >> "$OUTFILE" << 'CONVEOF2'
└─────────────────────────────────────────────────────────┘

> Status?

CI/CD
┌─────────────────────────────────────────────────────────┐
│ ✅ GitHub Actions   │ 3 workflows ativos               │
│ ✅ Vercel           │ Deploy automático habilitado     │
│ ✅ Netlify          │ Functions serverless ativas      │
│ ✅ Firebase         │ 6 projetos conectados            │
└─────────────────────────────────────────────────────────┘

> Pendências?
CONVEOF2

BUGS=$(gh api search/issues --method GET -f q="author:DinDja label:bug state:open" --jq '.total_count' 2>/dev/null || echo "1")
ISSUES=$(gh api search/issues --method GET -f q="author:DinDja state:open" --jq '.total_count' 2>/dev/null || echo "5")

cat >> "$OUTFILE" << CONVEOF3

TASKS
┌─────────────────────────────────────────────────────────┐
│ 🔵 ${OPEN_PRS:-3} PRs abertos                                        │
│ 🟡 $((ISSUES - OPEN_PRS - BUGS)) issues em progresso                                │
│ 🔴 ${BUGS:-1} bug(s) crítico(s)                                      │
└─────────────────────────────────────────────────────────┘

> Objetivo?

MISSION
┌─────────────────────────────────────────────────────────┐
│ "Construir um ecossistema completo de ferramentas      │
│  3D, enterprise e IA — integrando criatividade,        │
│  produtividade e inovação tecnológica."                │
└─────────────────────────────────────────────────────────┘
\`\`\`
CONVEOF3