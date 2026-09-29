#!/bin/bash
# Clone LinkNest to a sibling folder on the host (not Docker or WSL).
# Usage: ./clone-linknest.sh <new-folder-name> [--source <path>] [--target <path>] [--preset empty|structure|full|demo]
# Legacy: --assets --database  (both => full, database only => structure)

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

CLONE_UNAVAILABLE='Clone is not available in Docker or WSL mode. Please go with Docker clone or redeploy via Docker container.'

refuse_if_not_host() {
    if [ -f /.dockerenv ] || [ "${LINKNEST_DOCKER:-}" = "1" ] || [ "${SSH_GATEWAY_DOCKER:-}" = "1" ]; then
        echo -e "${RED}${CLONE_UNAVAILABLE}${NC}"
        exit 1
    fi
    if [ -n "${WSL_DISTRO_NAME:-}" ] || [ -n "${WSL_INTEROP:-}" ]; then
        echo -e "${RED}${CLONE_UNAVAILABLE}${NC}"
        exit 1
    fi
    if [ -r /proc/version ] && grep -qiE 'microsoft|WSL' /proc/version 2>/dev/null; then
        echo -e "${RED}${CLONE_UNAVAILABLE}${NC}"
        exit 1
    fi
}

print_usage() {
    echo ""
    echo "Usage: ./clone-linknest.sh <new-folder-name> [--source <path>] [--target <path>] [--preset empty|structure|full|demo]"
    echo ""
    echo "Host filesystem only. In Docker, rebuild with redeploy-docker.sh / docker-deploy.sh instead."
    echo ""
    echo "Parameters:"
    echo "  new-folder-name              Name of the new folder to create"
    echo "  --source <path>              Source directory (default: this repo)"
    echo "  --target <path>              Parent directory for the clone (optional)"
    echo "  --preset empty|structure|full|demo   Clone content preset (default: empty)"
    echo "  --assets / --database        Legacy flags (both => full, database => structure)"
    echo ""
    echo "Presets:"
    echo "  empty       Fresh admin / admin123, no tiles or uploads"
    echo "  structure   Public/authenticated tiles only; admin / admin123"
    echo "  full        Full database and uploads; same logins as source"
    echo "  demo        Demo tiles plus demo1–demo10 / password"
    echo ""
    echo "Examples:"
    echo "  ./clone-linknest.sh myspaces"
    echo "  ./clone-linknest.sh myspaces --preset full"
    echo "  ./clone-linknest.sh myspaces --source /var/www/linknest --target /home/user/projects --preset structure"
    echo ""
}

refuse_if_not_host

if [ -z "$1" ]; then
    print_usage
    exit 1
fi

NEW_FOLDER="$1"
PRESET=""
COPY_ASSETS=0
COPY_DATABASE=0
TARGET_PATH=""
SOURCE_PATH=""

shift
while [[ $# -gt 0 ]]; do
    case $1 in
        --source)
            SOURCE_PATH="$2"
            shift 2
            ;;
        --target)
            TARGET_PATH="$2"
            shift 2
            ;;
        --preset)
            PRESET="$2"
            shift 2
            ;;
        --empty|--structure|--full|--demo)
            PRESET="${1#--}"
            shift
            ;;
        --assets)
            COPY_ASSETS=1
            shift
            ;;
        --database|--databases)
            COPY_DATABASE=1
            shift
            ;;
        *)
            echo -e "${YELLOW}Warning: Unknown parameter '$1'${NC}"
            shift
            ;;
    esac
done

PRESET="$(echo "${PRESET:-}" | tr '[:upper:]' '[:lower:]')"
if [ -z "$PRESET" ]; then
    if [ "$COPY_DATABASE" -eq 1 ] && [ "$COPY_ASSETS" -eq 1 ]; then
        PRESET="full"
    elif [ "$COPY_DATABASE" -eq 1 ]; then
        PRESET="structure"
    else
        PRESET="empty"
    fi
fi
case "$PRESET" in
    empty|structure|full|demo) ;;
    *)
        echo -e "${RED}ERROR: Unknown preset '$PRESET' (use empty, structure, full, or demo)${NC}"
        exit 1
        ;;
esac

COPY_DATABASE=0
COPY_ALL_UPLOADS=0
if [ "$PRESET" = "full" ] || [ "$PRESET" = "structure" ]; then
    COPY_DATABASE=1
    COPY_ALL_UPLOADS=1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -n "$SOURCE_PATH" ]; then
    if [ ! -d "$SOURCE_PATH" ]; then
        echo -e "${RED}ERROR: Source directory does not exist: $SOURCE_PATH${NC}"
        exit 1
    fi
    CURRENT_DIR="$(cd "$SOURCE_PATH" && pwd)"
else
    CURRENT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
fi
if [ -n "$TARGET_PATH" ]; then
    TARGET_DIR="$TARGET_PATH/$NEW_FOLDER"
else
    PARENT_DIR="$(cd "$CURRENT_DIR/.." && pwd)"
    TARGET_DIR="$PARENT_DIR/$NEW_FOLDER"
fi

echo ""
echo "========================================"
echo "LinkNest Clone Script"
echo "========================================"
echo ""
echo "Source: $CURRENT_DIR"
echo "Target: $TARGET_DIR"
echo "Preset: $PRESET"
echo ""

if [ -d "$TARGET_DIR" ]; then
    echo -e "${YELLOW}WARNING: Folder '$TARGET_DIR' already exists!${NC}"
    echo ""
    read -p "Do you want to replace it? (y/N): " REPLACE
    if [[ "$REPLACE" =~ ^[Yy]$ ]]; then
        echo "Removing existing folder..."
        rm -rf "$TARGET_DIR"
        echo "Existing folder removed successfully."
    else
        echo "Operation cancelled by user."
        exit 0
    fi
fi

echo "[1/7] Creating target directory..."
mkdir -p "$TARGET_DIR"

if [ ! -f "$CURRENT_DIR/package.json" ]; then
    echo -e "${RED}ERROR: Source directory not found or invalid!${NC}"
    echo "Expected: $CURRENT_DIR"
    exit 1
fi

echo "[2/7] Copying files..."
echo ""

echo "  - Copying root files..."
COPY_ERROR=0
for f in package.json package-lock.json tsconfig.json vite.config.ts vite.docker.config.ts vite.runtime.config.ts \
         tailwind.config.js postcss.config.js index.html index.tsx index.css App.tsx types.ts router.php README.md \
         AGENTS.md composer.json novnc.d.ts package-for-deployment.bat redeploy-docker.bat redeploy-docker.sh \
         bulk-import-template.csv section-links-import-template.csv staging-ai-import-template.csv staging-ai-prompt-guide.md; do
    if [ -f "$CURRENT_DIR/$f" ]; then
        cp "$CURRENT_DIR/$f" "$TARGET_DIR/" 2>/dev/null || COPY_ERROR=1
    fi
done
[ -f "$CURRENT_DIR/.htaccess" ] && cp "$CURRENT_DIR/.htaccess" "$TARGET_DIR/" 2>/dev/null || true
[ -f "$CURRENT_DIR/.gitignore" ] && cp "$CURRENT_DIR/.gitignore" "$TARGET_DIR/" 2>/dev/null || true
if [ "$COPY_ERROR" -eq 1 ]; then
    echo "    ${YELLOW}WARNING: Some files may not have been copied successfully${NC}"
fi

for d in api analytics bin components config contexts hooks migrations services src utils public docker docs land extensions; do
    if [ -d "$CURRENT_DIR/$d" ]; then
        echo "  - Copying $d directory..."
        cp -r "$CURRENT_DIR/$d" "$TARGET_DIR/" 2>/dev/null || true
    fi
done

echo "  - Creating data directory..."
mkdir -p "$TARGET_DIR/data"

echo "  - Creating uploads directory..."
mkdir -p "$TARGET_DIR/uploads"

echo "  - Copying scripts directory..."
mkdir -p "$TARGET_DIR/scripts"
cp -r "$CURRENT_DIR/scripts/." "$TARGET_DIR/scripts/" 2>/dev/null || true
chmod +x "$TARGET_DIR/scripts/clone-linknest.sh" 2>/dev/null || true

if [ "$COPY_ALL_UPLOADS" -eq 1 ]; then
    echo "  - Copying all uploads..."
    if [ -d "$CURRENT_DIR/uploads" ]; then
        cp -a "$CURRENT_DIR/uploads/." "$TARGET_DIR/uploads/" 2>/dev/null || true
        echo "    Copied uploads folder"
    fi
fi

if [ "$COPY_DATABASE" -eq 1 ]; then
    echo "  - Copying database..."
    if [ -f "$CURRENT_DIR/data/linknest.db" ]; then
        cp "$CURRENT_DIR/data/linknest.db" "$TARGET_DIR/data/linknest.db"
        DB_SIZE=$(du -h "$TARGET_DIR/data/linknest.db" | cut -f1)
        echo "    Copied database: data/linknest.db ($DB_SIZE)"
        if [ "$PRESET" = "full" ]; then
            echo "  - Encrypting LDAP passwords in copied database..."
            (cd "$TARGET_DIR" && php scripts/encrypt_ldap_passwords.php >/dev/null 2>&1) || {
                echo -e "    ${YELLOW}WARNING: Failed to encrypt LDAP passwords in copied database${NC}"
            }
        fi
    else
        echo "    No database file found to copy"
    fi
fi

echo "[3/7] Creating .env file..."
cat > "$TARGET_DIR/.env" << EOF
# LinkNest Environment Variables
# Base path for the application
VITE_BASE_PATH=/$NEW_FOLDER

# Optional: HTTPS Configuration
# VITE_PROTOCOL=https
# VITE_HOST=your-domain.com
# VITE_PORT=443

# Optional: Gemini API Key
# GEMINI_API_KEY=your-api-key-here
EOF
echo "  Created .env with VITE_BASE_PATH=/$NEW_FOLDER"

echo "[4/7] Applying preset and install identity..."
php "$TARGET_DIR/scripts/apply-clone-preset.php" "$TARGET_DIR" "$NEW_FOLDER" "$PRESET" "http://localhost/$NEW_FOLDER/"
if [ $? -ne 0 ]; then
    echo -e "${RED}ERROR: Failed to apply clone preset / install identity${NC}"
    exit 1
fi

echo "[5/7] Installing npm dependencies..."
echo "  This may take a few minutes..."
cd "$TARGET_DIR"
if [ ! -f "package.json" ]; then
    echo -e "${RED}ERROR: package.json not found in target directory!${NC}"
    exit 1
fi
npm install

echo "[6/7] Building the application..."
echo "  This may take a few minutes..."
npm run build
echo "  Build complete! Removing node_modules folder (not needed for production)..."
if [ -d "$TARGET_DIR/node_modules" ]; then
    rm -rf "$TARGET_DIR/node_modules"
    echo "  Deleted node_modules folder to save space"
fi

echo "[7/7] Creating deployment README..."
cat > "$TARGET_DIR/DEPLOYMENT.md" << EOF
# $NEW_FOLDER - LinkNest Instance

This is a cloned instance of LinkNest deployed to /$NEW_FOLDER/

Preset: $PRESET

## Quick Start

1. Access it at: http://localhost/$NEW_FOLDER/
2. Empty / structure: admin / admin123
3. Full: same logins as the source instance
4. Demo: admin / admin123 and demo1–demo10 / password

Each clone has its own login cookie (data/install_identity.php). Do not copy that file between installs.

## Cloning

Host only: scripts/clone-linknest.sh new-instance-name --preset empty
Docker: use redeploy-docker.sh (Admin folder clone is disabled in Docker/WSL).
EOF

echo ""
echo "========================================"
echo -e "${GREEN}Clone Complete!${NC}"
echo "========================================"
echo ""
echo "New instance created at: $TARGET_DIR"
echo "Preset: $PRESET"
echo ""
echo "Next steps:"
echo "1. Access the application at: http://localhost/$NEW_FOLDER/"
if [ "$PRESET" = "full" ]; then
    echo "2. Login with the same credentials as the source instance"
elif [ "$PRESET" = "demo" ]; then
    echo "2. Login as admin / admin123 or demo1–demo10 / password"
else
    echo "2. Login with default credentials: admin / admin123"
fi
echo "3. Change the admin password in the Admin Panel"
echo ""
