# Oracle Cloud ops server: uptime monitoring and error tracking (+ connecting the shared malware scanner)

**What this gives you.** One free Oracle Cloud VM runs:
- **Uptime Kuma**: uptime monitoring, status alerts and a status page.
- **GlitchTip**: Sentry-compatible error tracking for server errors.

**Cost.** £0 on Oracle's Always Free tier (Ampere A1: up to 4 OCPU / 24 GB RAM, 200 GB block storage).

**Time.** About 45 minutes.

**What already works without the VM:**
- **Image metadata stripping:** GPS, EXIF, XMP and IPTC data are removed from every upload.
- **PDF checks:** PDFs with active content are refused.
- **Health monitoring:** `/api/health` reports the scanner and error tracking as BLOCKED_EXTERNAL until you finish these steps.

Files used: `ops/oracle/docker-compose.yml`, `ops/oracle/Caddyfile`, `ops/oracle/env.example`.

**Malware scanning is not on this VM.** ClamAV runs as a shared Blackwellen service for every brand: the AV scan gateway in the `blackwellen-operations` repo (`services/av-scan-gateway`, `infra/containers/av-scan-gateway`, runbook `ops/runbooks/av-scan-gateway.md`) on the Recovery & Security host. Gala Dock only needs its brand token and the gateway URL (step 6).

---

## 1. Create the VM (Oracle Cloud console)

1. Sign up at cloud.oracle.com. Choose your **home region carefully**, because it can't be changed. Pick UK South (London) to keep data close to Supabase in eu-west-2.
2. Go to **Compute → Instances → Create instance**:
   - Name: `galadock-ops`
   - Image: **Canonical Ubuntu 24.04** (aarch64)
   - Shape: **Ampere → VM.Standard.A1.Flex**, with **2 OCPU / 12 GB** (enough; you can go up to 4 / 24 free)
   - Networking: create a VCN with a **public subnet**, and tick **Assign a public IPv4 address**
   - SSH keys: upload your public key, or download the generated one
   - Boot volume: 100 GB
3. If you see "Out of capacity", retry later or choose another availability domain. A1 capacity comes and goes.
4. Copy the instance's **public IP**.

## 2. Open the firewall

1. **Oracle side.** Go to Networking → your VCN → Security Lists → Default → **Add ingress rules**:
   - Source `0.0.0.0/0`, TCP, destination port **80**
   - Source `0.0.0.0/0`, TCP, destination port **443**
   - Leave SSH (22) restricted to your own IP if you can.
2. **On the VM.** Oracle's Ubuntu images block these ports in iptables as well:

```bash
ssh ubuntu@<PUBLIC_IP>
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

## 3. DNS

In your DNS provider (galadock.com), create two **A records** pointing to the VM's public IP:

| Host | Purpose |
|---|---|
| `status.ops.galadock.com` | Uptime Kuma |
| `errors.ops.galadock.com` | GlitchTip |

## 4. Install Docker and start the stack

```bash
sudo apt-get update && sudo apt-get -y upgrade
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu && newgrp docker

# Copy the repo's ops/ folder to the VM (from your machine):
#   scp -r ops ubuntu@<PUBLIC_IP>:~/galadock-ops
cd ~/galadock-ops/oracle
cp env.example .env
nano .env    # set the three hostnames; generate each secret with: openssl rand -hex 32
docker compose up -d
docker compose run --rm glitchtip-migrate      # first run only
```

Caddy fetches HTTPS certificates automatically as soon as DNS resolves.

## 5. Malware scanner (shared Blackwellen AV gateway)

Deployed and checked from `blackwellen-operations` (runbook `ops/runbooks/av-scan-gateway.md`). The operator issues Gala Dock's brand
token there (`BW_AVSCAN_TOKEN_GALA_DOCK`) and gives you the gateway's HTTPS URL. Contract: `POST /scan` with
`Authorization: Bearer <token>` and the raw bytes → `{"clean":true}` or `{"clean":false,"signature":"…"}`; `GET /healthz` →
`{"ok":true,"clamd":"PONG",…}`. After connecting, run `node scripts/testing/pwa-scanner-certification.mjs` (clean sample, harmless
EICAR detection, unauthenticated denial).

## 6. Connect Gala Dock (Vercel → Project → Settings → Environment Variables, Production)

| Variable | Value |
|---|---|
| `CLAMAV_SCAN_URL` | the shared AV gateway URL from the operator |
| `CLAMAV_SCAN_TOKEN` | Gala Dock's brand token (`BW_AVSCAN_TOKEN_GALA_DOCK` on the gateway) |
| `SENTRY_DSN` | from GlitchTip (step 8) |

Add the same values to your local `.env`, then run `node scripts/vercel-env-push.mjs --only CLAMAV_SCAN_URL,CLAMAV_SCAN_TOKEN,SENTRY_DSN` and redeploy.

**Behaviour once connected:**
- Upload routes scan every file before storing it. Infected files are refused (422).
- If the scanner is unreachable, uploads are refused with "try again" (503), so the check fails closed.
- The `scan-uploads` job (every 5 minutes, in Supabase cron) scans files uploaded directly from browsers. It deletes infected ones, audits them and notifies the uploader.

## 7. Uptime monitoring (Uptime Kuma)

1. Open `https://status.ops.galadock.com` and create the admin account. Do this immediately, because the first visitor becomes admin.
2. Add these monitors (**Add New Monitor**):

| Monitor | Type | URL / settings | Interval |
|---|---|---|---|
| Gala Dock — public health | HTTP(s) – Keyword | `https://www.galadock.com/api/health`, keyword `"status":"ok"` | 60 s |
| Gala Dock — readiness | HTTP(s) – Keyword | same URL, header `Authorization: Bearer <CRON_SECRET>`, keyword `"db":"ok"` | 5 min |
| Homepage | HTTP(s) | `https://www.galadock.com/` | 60 s |
| Checkout API reachable | HTTP(s) | `https://www.galadock.com/api/maintenance` | 2 min |
| SSL expiry | (on each HTTP monitor) | tick "Certificate expiry notification" | — |

3. **Settings → Notifications:** add Email (SMTP), Slack, Discord, Telegram or SMS, and set it as the default.
4. **Status Pages → New:** `status.ops.galadock.com/status/galadock`. Use this URL as the maintenance banner's *status URL* in Admin → Maintenance.

## 8. Error tracking (GlitchTip)

1. Create a superuser:

   ```bash
   docker compose exec glitchtip-web ./manage.py createsuperuser
   ```

2. Open `https://errors.ops.galadock.com`, sign in, and create an organisation and a project (platform **JavaScript / Next.js**).
3. Copy the project's **DSN**. It looks like `https://<key>@errors.ops.galadock.com/<id>`.
4. Set `SENTRY_DSN` in Vercel (step 6). `src/instrumentation.ts` then reports server errors: route, method, path, error and digest. It never sends headers, cookies or query strings.
5. In GlitchTip **Alerts**, email or Slack yourself on new issues.

## 9. Maintenance

- **Scanner:** signatures, uptime and alerting are owned by the shared gateway (Watchtower watches `/healthz`); Gala Dock's `/api/health` still reports it.
- **OS:**

  ```bash
  sudo apt-get update && sudo apt-get -y upgrade
  ```

  Then reboot monthly.
- **Containers:**

  ```bash
  docker compose pull && docker compose up -d
  ```

  Run monthly.
- **Backups:**
  - Export Uptime Kuma: Settings → Backup.
  - Back up GlitchTip's Postgres: `docker compose exec glitchtip-db pg_dump -U glitchtip glitchtip | gzip > glitchtip-$(date +%F).sql.gz`
- **Health:** `/api/health` on Gala Dock shows the scanner as `ready` and reports its response time.
- **Security:**
  - Keep SSH key-only and limited to your IP.
  - Rotate `CRON_SECRET` (and ask the operator to rotate Gala Dock's scanner token) if they're ever exposed: update Vercel, then redeploy.
