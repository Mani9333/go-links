# Deploying go-links on a GCP Ubuntu VM

A copy-paste runbook to host **both services** on one Google Cloud Compute Engine
VM (**Ubuntu 24.04 LTS**): nginx serves the UI and routes to the **TypeScript web
service** and the **Python analytics service**, each kept alive by **systemd**.
Data lives in **MongoDB Atlas**.

```
Internet ─▶ nginx :80/:443 ─┬─ /                → static UI (web/public)
                            ├─ /api /go /healthz → web        (Node,   127.0.0.1:3000)
                            └─ /analytics         → analytics  (uvicorn,127.0.0.1:8000)
                                         │                │
                                         └────────────────┴────▶ MongoDB Atlas
```

## Versions installed

| Component | Version | Notes |
| --- | --- | --- |
| Ubuntu | 24.04 LTS | Base image. |
| Node.js | 20.x LTS (NodeSource) | Web service (needs ≥ 20). |
| Python | 3.12 (system) via `python3` + venv | Analytics (needs ≥ 3.11). |
| nginx | apt (1.24.x) | Static hosting + reverse proxy. |
| git | apt (2.43.x) | Optional (for clone). |

---

## 1. Reserve a static IP + create the VM

Run on your Mac / Cloud Shell:

```bash
export PROJECT_ID="your-gcp-project-id"
export REGION="us-central1"
export ZONE="us-central1-a"
export VM_NAME="go-links"

gcloud config set project "$PROJECT_ID"

# Static IP (note the address it prints — referred to as STATIC_IP)
gcloud compute addresses create go-links-ip --region="$REGION"
gcloud compute addresses describe go-links-ip --region="$REGION" --format='get(address)'

# VM, attaching that IP
gcloud compute instances create "$VM_NAME" \
  --zone="$ZONE" --machine-type=e2-small \
  --image-family=ubuntu-2404-lts-amd64 --image-project=ubuntu-os-cloud \
  --tags=http-server,https-server --address=go-links-ip --boot-disk-size=10GB

gcloud compute firewall-rules create allow-http-https \
  --allow=tcp:80,tcp:443 --target-tags=http-server,https-server || true
```

## 2. Allowlist the VM in MongoDB Atlas

Atlas → **Network Access → Add IP Address** → `STATIC_IP/32`. Ensure a DB user
exists (e.g. `mani`) with a password — that goes into `MONGODB_URI`.

## 3. SSH in and install runtimes

```bash
gcloud compute ssh "$VM_NAME" --zone="$ZONE"     # or: ssh YOUR_USER@STATIC_IP
```

```bash
# --- everything below runs ON THE VM ---
sudo apt-get update && sudo apt-get upgrade -y
sudo apt-get install -y curl git nginx python3 python3-venv python3-pip

# Node 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v && python3 --version
```

## 4. Get the code

**Copy from your Mac** (clean archive — see the "Package a ZIP" section of the repo),
or clone:

```bash
cd ~ && git clone YOUR_REPO_URL go-links && cd go-links
```

## 5. Build the web service & set up analytics

```bash
# TypeScript web
cd ~/go-links/web
npm ci
npm run build

# Python analytics
cd ~/go-links/analytics
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

> Set your Atlas connection string once — both units below reference it. Replace
> `<db_password>` with the real password.

## 6. systemd units (one per service)

```bash
export MONGO_URI='mongodb+srv://mani:<db_password>@sample-cluster.nt7uhom.mongodb.net/?appName=go-links'

# --- web (Node) ---
sudo tee /etc/systemd/system/go-links-web.service >/dev/null <<EOF
[Unit]
Description=go-links web (TypeScript)
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=/home/$USER/go-links/web
Environment=NODE_ENV=production
Environment=HOST=127.0.0.1
Environment=PORT=3000
Environment=MONGODB_URI=$MONGO_URI
ExecStart=/usr/bin/node /home/$USER/go-links/web/dist/server.js
Restart=on-failure
RestartSec=2

[Install]
WantedBy=multi-user.target
EOF

# --- analytics (Python) ---
sudo tee /etc/systemd/system/go-links-analytics.service >/dev/null <<EOF
[Unit]
Description=go-links analytics (Python)
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=/home/$USER/go-links/analytics
Environment=ENV=production
Environment=PORT=8000
Environment=MONGODB_URI=$MONGO_URI
ExecStart=/home/$USER/go-links/analytics/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
Restart=on-failure
RestartSec=2

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now go-links-web go-links-analytics
systemctl status go-links-web go-links-analytics --no-pager
curl -s localhost:3000/healthz && echo && curl -s localhost:8000/healthz && echo
```

> The `MONGODB_URI` holds a secret. For stronger hygiene use `EnvironmentFile=`
> with `chmod 600` instead of inline `Environment=`.

## 7. nginx: serve UI + route to both services

```bash
sudo tee /etc/nginx/sites-available/go-links >/dev/null <<EOF
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    root /home/$USER/go-links/web/public;
    index index.html;

    location / { try_files \$uri \$uri/ /index.html; }

    location ~ ^/(api|go|healthz|metrics) {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Request-Id \$request_id;
    }

    location /analytics/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Request-Id \$request_id;
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/go-links /etc/nginx/sites-enabled/go-links
sudo rm -f /etc/nginx/sites-enabled/default
chmod o+x /home/$USER          # let nginx read web/public
sudo nginx -t && sudo systemctl reload nginx
```

Browse to **`http://STATIC_IP`** — the UI loads, `/api/*` and `/go/*` hit the web
service, and the Insights panel is populated by the Python service.

## 8. HTTPS (optional)

```bash
sudo snap install --classic certbot
sudo ln -sf /snap/bin/certbot /usr/bin/certbot
sudo certbot --nginx -d your.domain.com
```

## 9. Operate & update

```bash
journalctl -u go-links-web -f
journalctl -u go-links-analytics -f

cd ~/go-links
git pull   # or re-copy the archive
( cd web && npm ci && npm run build )
( cd analytics && .venv/bin/pip install -r requirements.txt )
sudo systemctl restart go-links-web go-links-analytics
```

## 10. Tear down

```bash
gcloud compute instances delete "$VM_NAME" --zone="$ZONE"
gcloud compute addresses delete go-links-ip --region="$REGION"
```

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Can't reach `http://STATIC_IP` | GCP firewall allows :80? `sudo nginx -t`, `systemctl status nginx`. |
| 502 on `/api` or `/analytics` | Service up? `systemctl status go-links-web go-links-analytics`; `curl localhost:3000/healthz`, `curl localhost:8000/healthz`. |
| Mongo connection errors | Atlas **Network Access** must include STATIC_IP; check `MONGODB_URI`/password. |
| Insights panel empty | analytics service down or no data yet — create a few links first. |
| 403 on the UI | `chmod o+x /home/$USER` so nginx can read `web/public`. |
