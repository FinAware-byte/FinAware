#!/usr/bin/env bash
set -euo pipefail

NAMESPACE="${NAMESPACE:-finaware}"
SECRET_NAME="${SECRET_NAME:-finaware-selfsigned-tls}"
CERT_FILE="${CERT_FILE:-deploy/caddy/certs/finaware-selfsigned.crt}"
KEY_FILE="${KEY_FILE:-deploy/caddy/certs/finaware-selfsigned.key}"

if [[ ! -f "${CERT_FILE}" || ! -f "${KEY_FILE}" ]]; then
  echo "Certificate or key not found. Run scripts/tls/generate-self-signed.sh first."
  exit 1
fi

kubectl create namespace "${NAMESPACE}" --dry-run=client -o yaml | kubectl apply -f -

kubectl -n "${NAMESPACE}" create secret tls "${SECRET_NAME}" \
  --cert="${CERT_FILE}" \
  --key="${KEY_FILE}" \
  --dry-run=client -o yaml | kubectl apply -f -

echo "TLS secret applied: ${NAMESPACE}/${SECRET_NAME}"
