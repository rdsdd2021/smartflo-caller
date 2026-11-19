#!/usr/bin/env bash
# ==============================================================================
# Smartflo Auto-Dialer VPS 1-Click Production Deployment Script
# Supports: Ubuntu 20.04 / 22.04 / 24.04, Debian 11 / 12
# ==============================================================================

set -e

echo "🚀 [1/4] Checking and installing system prerequisites..."

# Install Docker if not present
if ! command -v docker &> /dev/null; then
    echo "📦 Docker not detected. Installing official Docker Engine..."
    curl -fsSL https://get.docker.com | sh
    systemctl enable --now docker
else
    echo "✅ Docker is already installed: $(docker --version)"
fi

# Ensure docker compose is available
if ! docker compose version &> /dev/null; then
    echo "📦 Installing docker-compose-plugin..."
    apt-get update && apt-get install -y docker-compose-plugin
fi

echo "🛡️  [2/4] Configuring firewall for Web & WebSockets (Ports 80, 443)..."
if command -v ufw &> /dev/null && ufw status | grep -q "Status: active"; then
    ufw allow 80/tcp
    ufw allow 443/tcp
    ufw reload
    echo "✅ Ports 80 and 443 opened in UFW."
fi

echo "⚙️  [3/4] Preparing configuration..."
if [ ! -f .env ]; then
    cp .env.example .env
    echo "📄 Created .env from .env.example"
fi

echo "🏗️  [4/4] Building and launching containers via Docker Compose..."
docker compose down --remove-orphans || true
docker compose build --pull
docker compose up -d

SERVER_IP=$(curl -s https://api.ipify.org || hostname -I | awk '{print $1}')

echo ""
echo "=================================================================="
echo "🎉 DEPLOYMENT SUCCESSFUL!"
echo "=================================================================="
echo "Your Smartflo 15-Channel Parallel Auto-Dialer is now running 24/7!"
echo ""
echo "🌐 Access your Dashboard at:"
echo "   http://${SERVER_IP}"
echo ""
echo "🔒 To enable free automatic HTTPS (SSL):"
echo "   1. Edit .env and set: DOMAIN=yourdomain.com"
echo "   2. Point your domain's DNS A-record to: ${SERVER_IP}"
echo "   3. Run: docker compose up -d --force-recreate proxy"
echo ""
echo "📊 Management Commands:"
echo "   View live logs:      docker compose logs -f"
echo "   Restart dialer:      docker compose restart"
echo "   Stop dialer:         docker compose down"
echo "=================================================================="
