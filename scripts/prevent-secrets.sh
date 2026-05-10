#!/usr/bin/env bash
# Pre-commit hook: Blocks commits containing secrets or sensitive data.
# Scans staged files for high-entropy strings, API keys, tokens, passwords,
# private keys, and connection strings.

set -euo pipefail

RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Patterns that indicate secrets or sensitive data
PATTERNS=(
  # AWS
  'AKIA[0-9A-Z]{16}'
  'aws_secret_access_key\s*='
  'aws_access_key_id\s*='

  # Generic API keys / tokens / secrets
  '(?i)(api[_-]?key|api[_-]?secret|access[_-]?token|auth[_-]?token|secret[_-]?key)\s*[:=]\s*["\x27][^\s"'\'']{8,}'

  # Private keys
  '-----BEGIN (RSA |DSA |EC |OPENSSH |PGP )?PRIVATE KEY-----'
  '-----BEGIN CERTIFICATE-----'

  # Passwords in config/code
  '(?i)(password|passwd|pwd)\s*[:=]\s*["\x27][^\s"'\'']{4,}'

  # Database connection strings
  '(?i)(mongodb|postgres|postgresql|mysql|redis|amqp|mssql):\/\/[^\s]+'

  # JWT tokens
  'eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}'

  # GitHub / GitLab tokens
  'gh[pousr]_[A-Za-z0-9_]{36,}'
  'glpat-[A-Za-z0-9_-]{20,}'

  # Slack tokens
  'xox[baprs]-[0-9a-zA-Z-]+'

  # Stripe keys
  'sk_live_[0-9a-zA-Z]{24,}'
  'pk_live_[0-9a-zA-Z]{24,}'

  # SendGrid
  'SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}'

  # Twilio
  'SK[0-9a-fA-F]{32}'

  # Google
  'AIza[0-9A-Za-z_-]{35}'

  # Heroku
  '(?i)heroku.*[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'

  # Generic high-value secrets
  '(?i)client[_-]?secret\s*[:=]\s*["\x27][^\s"'\'']{8,}'
  '(?i)encryption[_-]?key\s*[:=]\s*["\x27][^\s"'\'']{8,}'

  # .env inline values (KEY=value without quotes, likely real secrets)
  '^[A-Z_]+_SECRET=[^\s$]+'
  '^[A-Z_]+_KEY=[^\s$]+'
  '^[A-Z_]+_TOKEN=[^\s$]+'
  '^[A-Z_]+_PASSWORD=[^\s$]+'
)

# Files to always block (even if somehow not in .gitignore)
BLOCKED_FILES=(
  '.env'
  '.env.local'
  '.env.production'
  '.env.staging'
  '.env.development'
  'id_rsa'
  'id_dsa'
  'id_ecdsa'
  'id_ed25519'
  '.npmrc'
  '.pypirc'
  'credentials.json'
  'service-account.json'
  'gcloud-service-key.json'
  'secrets.yaml'
  'secrets.yml'
  'secrets.json'
  'vault.json'
  '.htpasswd'
  'token.json'
)

# File extensions to always block
BLOCKED_EXTENSIONS=(
  '.pem'
  '.key'
  '.p12'
  '.pfx'
  '.jks'
  '.keystore'
)

ERRORS=0

# Get staged files (only added/modified, not deleted)
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM 2>/dev/null || true)

if [ -z "$STAGED_FILES" ]; then
  exit 0
fi

# Check for blocked filenames
for file in $STAGED_FILES; do
  basename=$(basename "$file")
  for blocked in "${BLOCKED_FILES[@]}"; do
    if [ "$basename" = "$blocked" ]; then
      echo -e "${RED}BLOCKED${NC} Sensitive file detected: ${YELLOW}$file${NC}"
      echo "  This file type should never be committed."
      ERRORS=$((ERRORS + 1))
    fi
  done

  # Check blocked extensions
  for ext in "${BLOCKED_EXTENSIONS[@]}"; do
    if [[ "$file" == *"$ext" ]]; then
      echo -e "${RED}BLOCKED${NC} Sensitive file extension detected: ${YELLOW}$file${NC}"
      echo "  Files with '$ext' extension should never be committed."
      ERRORS=$((ERRORS + 1))
    fi
  done
done

# Scan staged content for secret patterns
for file in $STAGED_FILES; do
  # Skip binary files, lock files, and this script itself
  if [[ "$file" == *.lock ]] || [[ "$file" == *"lock.yaml" ]] || \
     [[ "$file" == *"prevent-secrets"* ]] || \
     [[ "$file" == *.png ]] || [[ "$file" == *.jpg ]] || \
     [[ "$file" == *.gif ]] || [[ "$file" == *.ico ]] || \
     [[ "$file" == *.woff* ]] || [[ "$file" == *.ttf ]] || \
     [[ "$file" == *.eot ]] || [[ "$file" == *.svg ]]; then
    continue
  fi

  # Skip .env.example (it should have placeholder values)
  if [[ "$file" == *".env.example"* ]]; then
    continue
  fi

  # Get the staged content of the file
  CONTENT=$(git show ":$file" 2>/dev/null || true)
  if [ -z "$CONTENT" ]; then
    continue
  fi

  for pattern in "${PATTERNS[@]}"; do
    MATCHES=$(echo "$CONTENT" | grep -Pn "$pattern" 2>/dev/null || true)
    if [ -n "$MATCHES" ]; then
      echo -e "${RED}SECRET DETECTED${NC} in ${YELLOW}$file${NC}:"
      echo "$MATCHES" | head -3 | while IFS= read -r line; do
        # Mask the actual secret value in output
        echo "  Line $line" | sed -E 's/([=:]\s*["\x27]?).{4}[^\s"'\'']*$/\1****REDACTED****/g'
      done
      ERRORS=$((ERRORS + 1))
    fi
  done
done

if [ $ERRORS -gt 0 ]; then
  echo ""
  echo -e "${RED}=== COMMIT BLOCKED ===${NC}"
  echo -e "Found ${RED}$ERRORS${NC} potential secret(s) in staged files."
  echo ""
  echo "If this is a false positive, you can:"
  echo "  1. Add the file/pattern to .gitignore"
  echo "  2. Use 'git commit --no-verify' (USE WITH EXTREME CAUTION)"
  echo ""
  echo "NEVER commit real secrets. Use environment variables instead."
  exit 1
fi

exit 0
