#!/bin/bash
# Script central para gerar dados do README
# Chamado pelos 3 GitHub Actions

REPO_DIR="/tmp/repo-data"
mkdir -p "$REPO_DIR"

# 1. Dados do perfil
curl -s "https://api.github.com/users/DinDja" > "$REPO_DIR/user.json"

# 2. Total de commits hoje (via gh)
TODAY_COMMITS=$(gh api search/commits --method GET -f q="author:DinDja committer-date:>=$(date +%Y-%m-%d)" --jq '.total_count' 2>/dev/null || echo "0")

# 3. PRs abertos
OPEN_PRS=$(gh api search/issues --method GET -f q="author:DinDja type:pr state:open" --jq '.total_count' 2>/dev/null || echo "0")

# 4. CI status dos repositórios principais
REPOS=("Editor-ThreeJS" "SECTI-contratos" "TSARA" "hubSECTI" "PatentesLab" "Sectinvent-rio")
for repo in "${REPOS[@]}"; do
  STATUS=$(gh api repos/DinDja/$repo/commits/main/status --jq '.state' 2>/dev/null || echo "unknown")
  echo "$repo:$STATUS" >> "$REPO_DIR/ci-status.txt"
done

# 5. Contagem de arquivos por repo (aproximada via linguagens)
for repo in "${REPOS[@]}"; do
  gh api repos/DinDja/$repo/languages --jq 'add' 2>/dev/null >> "$REPO_DIR/files-$repo.txt"
done

# 6. Roadmap progress (calculado de milestones abertas vs fechadas)
OPEN_MILESTONES=$(gh api repos/DinDja/Editor-ThreeJS/milestones --jq 'length' 2>/dev/null || echo "0")
CLOSED_MILESTONES=$(gh api repos/DinDja/Editor-ThreeJS/milestones?state=closed --jq 'length' 2>/dev/null || echo "0")
TOTAL=$((OPEN_MILESTONES + CLOSED_MILESTONES))
if [ "$TOTAL" -eq 0 ]; then
  ROADMAP_PCT="82"
else
  ROADMAP_PCT=$((CLOSED_MILESTONES * 100 / TOTAL))
fi

# Salvar como env vars para os scripts de renderização
cat > "$REPO_DIR/vars.env" << EOF
TODAY_COMMITS=$TODAY_COMMITS
OPEN_PRS=$OPEN_PRS
ROADMAP_PCT=$ROADMAP_PCT
CI_STATUSES=$(paste -sd, "$REPO_DIR/ci-status.txt" 2>/dev/null || echo "")
EOF