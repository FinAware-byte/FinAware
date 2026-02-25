#!/usr/bin/env bash
set -euo pipefail

CERT_DIR="${CERT_DIR:-deploy/caddy/certs}"
CERT_FILE="${CERT_FILE:-${CERT_DIR}/finaware-selfsigned.crt}"
KEY_FILE="${KEY_FILE:-${CERT_DIR}/finaware-selfsigned.key}"
OPENSSL_CNF="${OPENSSL_CNF:-${CERT_DIR}/openssl-selfsigned.cnf}"
DAYS="${DAYS:-825}"

mkdir -p "${CERT_DIR}"

cat > "${OPENSSL_CNF}" <<'CNF'
[req]
default_bits       = 4096
prompt             = no
default_md         = sha256
x509_extensions    = v3_req
distinguished_name = dn

[dn]
C  = ZA
ST = Gauteng
L  = Johannesburg
O  = FinAware Demo
OU = Platform
CN = dev.finaware.io

[v3_req]
subjectAltName = @alt_names
keyUsage = critical, digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth

[alt_names]
DNS.1 = dev.finaware.io
DNS.2 = stag.finaware.io
DNS.3 = prod.finaware.io
DNS.4 = localhost
DNS.5 = finaware.local
IP.1  = 127.0.0.1
CNF

openssl req -x509 -nodes -newkey rsa:4096 \
  -days "${DAYS}" \
  -keyout "${KEY_FILE}" \
  -out "${CERT_FILE}" \
  -config "${OPENSSL_CNF}"

chmod 600 "${KEY_FILE}"
chmod 644 "${CERT_FILE}"

printf 'Generated self-signed certificate:\n'
printf '  cert: %s\n' "${CERT_FILE}"
printf '  key : %s\n' "${KEY_FILE}"
