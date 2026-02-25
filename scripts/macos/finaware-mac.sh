#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="$PROJECT_ROOT/.env"
ENV_EXAMPLE_FILE="$PROJECT_ROOT/.env.example"
CERT_DIR="$PROJECT_ROOT/deploy/caddy/certs"
CERT_FILE="$CERT_DIR/finaware.local.crt"
KEY_FILE="$CERT_DIR/finaware.local.key"

info() {
  printf "\n[finaware] %s\n" "$*"
}

warn() {
  printf "\n[finaware][warn] %s\n" "$*" >&2
}

fail() {
  printf "\n[finaware][error] %s\n" "$*" >&2
  exit 1
}

require_macos() {
  if [[ "$(uname -s)" != "Darwin" ]]; then
    fail "This script supports macOS only."
  fi
}

ensure_xcode_cli() {
  if ! xcode-select -p >/dev/null 2>&1; then
    warn "Xcode Command Line Tools are required."
    xcode-select --install || true
    fail "Install Xcode Command Line Tools, then rerun this script."
  fi
}

ensure_homebrew() {
  if command -v brew >/dev/null 2>&1; then
    return
  fi

  info "Installing Homebrew..."
  NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

  if [[ -x /opt/homebrew/bin/brew ]]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
  elif [[ -x /usr/local/bin/brew ]]; then
    eval "$(/usr/local/bin/brew shellenv)"
  else
    fail "Homebrew installation completed but brew binary was not found."
  fi
}

ensure_brew_formula() {
  local package="$1"
  if brew list --formula "$package" >/dev/null 2>&1; then
    info "Homebrew formula already installed: $package"
    return
  fi

  info "Installing Homebrew formula: $package"
  brew install "$package"
}

ensure_tools() {
  info "Installing required tooling with Homebrew..."
  brew update
  ensure_brew_formula node@20
  ensure_brew_formula colima
  ensure_brew_formula docker
  ensure_brew_formula dnsmasq
  ensure_brew_formula mkcert

  if ! brew list --formula nss >/dev/null 2>&1; then
    info "Installing optional Homebrew formula: nss"
    brew install nss || warn "Could not install nss. Firefox trust setup may require manual work."
  fi
}

ensure_colima_running() {
  if ! command -v colima >/dev/null 2>&1; then
    fail "colima is not installed."
  fi

  if ! colima status 2>/dev/null | grep -q "Running"; then
    info "Starting Colima (Docker runtime)..."
    colima start --cpu 4 --memory 8 --disk 60
  else
    info "Colima is already running."
  fi
}

ensure_docker_ready() {
  if ! command -v docker >/dev/null 2>&1; then
    fail "docker CLI is not installed."
  fi

  if ! docker compose version >/dev/null 2>&1; then
    fail "docker compose plugin is unavailable. Ensure Homebrew 'docker' is installed and in PATH."
  fi

  for _ in $(seq 1 30); do
    if docker info >/dev/null 2>&1; then
      return
    fi
    sleep 1
  done

  fail "Docker engine is not ready. Ensure Colima or Docker Desktop is running."
}

configure_dnsmasq() {
  local brew_prefix dnsmasq_dir dnsmasq_conf
  brew_prefix="$(brew --prefix)"
  dnsmasq_dir="$brew_prefix/etc/dnsmasq.d"
  dnsmasq_conf="$dnsmasq_dir/finaware.conf"

  mkdir -p "$dnsmasq_dir"
  cat > "$dnsmasq_conf" <<DNSCONF
listen-address=127.0.0.1
address=/.finaware.io/127.0.0.1
DNSCONF

  info "Starting dnsmasq service..."
  brew services restart dnsmasq >/dev/null 2>&1 || brew services start dnsmasq

  info "Registering macOS resolver for finaware.io (requires sudo)..."
  sudo mkdir -p /etc/resolver
  printf "nameserver 127.0.0.1\n" | sudo tee /etc/resolver/finaware.io >/dev/null

  dscacheutil -flushcache || true
  sudo killall -HUP mDNSResponder || true
}

upsert_env() {
  local key="$1"
  local value="$2"

  if [[ ! -f "$ENV_FILE" ]]; then
    cp "$ENV_EXAMPLE_FILE" "$ENV_FILE"
  fi

  if grep -q "^${key}=" "$ENV_FILE"; then
    perl -0777 -i -pe "s#^${key}=.*#${key}=\"${value}\"#m" "$ENV_FILE"
  else
    printf "%s=\"%s\"\n" "$key" "$value" >> "$ENV_FILE"
  fi
}

configure_env() {
  info "Preparing .env for local macOS setup..."
  if [[ ! -f "$ENV_FILE" ]]; then
    cp "$ENV_EXAMPLE_FILE" "$ENV_FILE"
  fi

  upsert_env "ENVIRONMENT" "dev"
  upsert_env "SESSION_COOKIE_SECURE" "true"
  upsert_env "LETSENCRYPT_EMAIL" "security@finaware.io"
  upsert_env "LETSENCRYPT_CA" "https://acme-v02.api.letsencrypt.org/directory"
}

configure_local_certs() {
  mkdir -p "$CERT_DIR"

  info "Creating trusted local CA and FinAware certs with mkcert..."
  mkcert -install
  mkcert \
    -cert-file "$CERT_FILE" \
    -key-file "$KEY_FILE" \
    localhost 127.0.0.1 \
    dev.finaware.io stag.finaware.io prod.finaware.io \
    www.dev.finaware.io www.stag.finaware.io www.prod.finaware.io
}

ensure_local_certs_present() {
  if [[ -f "$CERT_FILE" && -f "$KEY_FILE" ]]; then
    info "Local TLS certs already exist."
    return
  fi

  warn "Local TLS certs are missing. Regenerating..."
  configure_local_certs
}

install_node_modules() {
  info "Installing npm dependencies..."
  (cd "$PROJECT_ROOT" && npm install --no-audit --fund=false)
}

start_stack_local() {
  info "Starting FinAware with local DNS + local TLS..."
  (
    cd "$PROJECT_ROOT"
    docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
  )

  info "FinAware is starting. Use one of these URLs:"
  printf "  https://dev.finaware.io\n"
  printf "  https://stag.finaware.io\n"
  printf "  https://prod.finaware.io\n"
}

stop_stack_local() {
  info "Stopping local FinAware stack..."
  (
    cd "$PROJECT_ROOT"
    docker compose -f docker-compose.yml -f docker-compose.local.yml down
  )
}

usage() {
  cat <<USAGE
Usage:
  scripts/macos/finaware-mac.sh all      # install prerequisites + configure DNS/TLS + start stack
  scripts/macos/finaware-mac.sh install  # install prerequisites + configure DNS/TLS only
  scripts/macos/finaware-mac.sh start    # start local stack only
  scripts/macos/finaware-mac.sh stop     # stop local stack
USAGE
}

main() {
  local action="${1:-all}"

  require_macos

  case "$action" in
    all)
      ensure_xcode_cli
      ensure_homebrew
      ensure_tools
      ensure_colima_running
      ensure_docker_ready
      configure_dnsmasq
      configure_env
      configure_local_certs
      install_node_modules
      start_stack_local
      ;;
    install)
      ensure_xcode_cli
      ensure_homebrew
      ensure_tools
      ensure_colima_running
      ensure_docker_ready
      configure_dnsmasq
      configure_env
      configure_local_certs
      install_node_modules
      info "Install complete. Run: scripts/macos/finaware-mac.sh start"
      ;;
    start)
      ensure_homebrew
      ensure_colima_running
      ensure_docker_ready
      ensure_local_certs_present
      start_stack_local
      ;;
    stop)
      stop_stack_local
      ;;
    *)
      usage
      fail "Unknown action: $action"
      ;;
  esac
}

main "$@"
