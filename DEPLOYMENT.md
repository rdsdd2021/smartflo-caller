# 24/7 VPS Deployment Guide: Smartflo 15-Channel Auto-Dialer

Deploy this complete stack to an inexpensive Linux VPS (**$4–$5/month** on DigitalOcean, Hetzner, or AWS) so campaigns run **24/7 without needing your laptop open or connected to the internet**.

---

## Quick-Start (1 Command)

### 1. SSH into your VPS:
```bash
ssh root@YOUR_SERVER_IP
```

### 2. Copy/Clone the project:
```bash
# Option A: Clone from your git repo
git clone <YOUR_REPO_URL> smartflo-caller
cd smartflo-caller

# Option B: Upload from local PC via SCP:
# scp -r "C:\Users\Ramanuj Dey Sarkar\smartflo-caller" root@YOUR_SERVER_IP:/root/smartflo-caller
```

### 3. Run the automated deployment script:
```bash
chmod +x deploy.sh
./deploy.sh
```

That's it! Open `http://YOUR_SERVER_IP` in your browser.

---

## Free Automatic HTTPS (SSL)
To add a custom domain with automatic SSL:
1. Point your domain's **A Record** to `YOUR_SERVER_IP`.
2. Edit `.env` on the VPS:
   ```bash
   DOMAIN=dialer.yourdomain.com
   ```
3. Reload Caddy:
   ```bash
   docker compose up -d --force-recreate proxy
   ```
Now accessible at `https://dialer.yourdomain.com` with zero SSL maintenance!

---

## Helpful Commands
```bash
# View live calling telemetry logs
docker compose logs -f backend

# Restart services
docker compose restart

# Stop services
docker compose down
```
