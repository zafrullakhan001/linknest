#!/bin/bash
# Generate self-signed SSL certificate for LinkNest

CERT_DIR="/etc/apache2/ssl"
CERT_FILE="$CERT_DIR/linknest.crt"
KEY_FILE="$CERT_DIR/linknest.key"

# Create SSL directory
mkdir -p "$CERT_DIR"

# Generate self-signed certificate
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout "$KEY_FILE" \
    -out "$CERT_FILE" \
    -subj "/C=US/ST=State/L=City/O=LinkNest/CN=localhost" \
    -addext "subjectAltName=DNS:localhost,DNS:*.localhost,IP:127.0.0.1,IP:0.0.0.0"

# Set proper permissions
chmod 600 "$KEY_FILE"
chmod 644 "$CERT_FILE"
chown root:root "$KEY_FILE" "$CERT_FILE"

echo "✓ Self-signed SSL certificate generated"
echo "  Certificate: $CERT_FILE"
echo "  Private Key: $KEY_FILE"
















