# Deploying Hypertube on Oracle Cloud (Always Free) with HTTPS

Result: `https://<your-name>.duckdns.org` running the same Docker stack as locally, with an automatic HTTPS certificate (Caddy).
Cost: **0 €**, as long as you follow the "stay free" rules below.
Time: about 1 hour the first time.

> This is optional. The 42 evaluation runs the project from the git repository with `docker compose up` (see README / DEFENSE.md).

---

## 0. Stay free

* Keep the account on the **Free Tier**. **Never click "Upgrade to Pay As You Go".** A free-tier account cannot create billable resources.
* Use only **Always Free** shapes. This guide uses `VM.Standard.A1.Flex` with **2 OCPUs and 12 GB RAM** (the documented free allowance), a 50 GB boot volume and no extra paid services.
* After creating the account, add a **budget alert**: *Billing & Cost Management → Budgets → Create Budget*, amount **1 USD**, alert at 1 % to your email. You'll know immediately if anything ever costs money.
* Oracle may **reclaim idle Always Free VMs**: below 20 % CPU, network and memory for 7 days. That costs nothing, but you would have to recreate the VM; your data lives in Docker volumes on it.
* The credit card at signup is used for identity verification only.

## 1. Create the Oracle Cloud account

1. Sign up at https://www.oracle.com/cloud/free/.
2. Choose a **home region** close to you (it cannot be changed later), e.g. Madrid, Marseille or Frankfurt for Morocco.
3. Finish verification; the account starts as *Free Tier*.

## 2. Create the VM

*Compute → Instances → Create instance*:

| Setting | Value |
|---|---|
| Name | `hypertube` |
| Image | **Canonical Ubuntu 24.04** (aarch64) |
| Shape | *Change shape* → Ampere → **VM.Standard.A1.Flex**, **2 OCPUs**, **12 GB** memory |
| Networking | Create a new VCN with a **public subnet**, and keep **Assign a public IPv4 address** checked |
| SSH keys | Upload your public key (`cat ~/.ssh/id_ed25519.pub`; create one with `ssh-keygen -t ed25519` if needed) |
| Boot volume | Default (50 GB) |

If you get **"Out of capacity"**, try another availability domain or retry later; free ARM capacity is popular.

Note the instance's **public IP address**.

## 3. Open the ports

**a) Oracle network (security list).** Go to *Networking → Virtual cloud networks → your VCN → Subnets → public subnet → Security List → Add Ingress Rules*. Source CIDR is `0.0.0.0/0` for each:

| Protocol | Destination port | Why |
|---|---|---|
| TCP | 80 | HTTP (certificate + redirect) |
| TCP | 443 | HTTPS |
| UDP | 443 | HTTP/3 (optional) |
| TCP | 6881 | BitTorrent |
| UDP | 6881 | BitTorrent (uTP/DHT) |

Do **not** open 5432, 8000, 8025 or 8080.

**b) The VM's own firewall.** Oracle's Ubuntu images block everything except SSH. Connect with `ssh ubuntu@<PUBLIC_IP>`, then:

```bash
for p in 80 443 6881; do sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport $p -j ACCEPT; done
for p in 443 6881; do sudo iptables -I INPUT 6 -p udp --dport $p -j ACCEPT; done
sudo netfilter-persistent save
```

## 4. Free subdomain (DuckDNS)

1. Sign in at https://www.duckdns.org (GitHub login works).
2. Create a subdomain, e.g. `hypertube-un35`, and set its IP to the VM's **public IP**.
3. Check from your Mac: `ping hypertube-un35.duckdns.org` should show that IP.

## 5. Install Docker and the project on the VM

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu && exit       # log out, then ssh in again
git clone https://github.com/UN-35/Hypertube.git && cd Hypertube
```

Copy your configuration from your Mac. Run this **on the Mac**, in the project folder:

```bash
scp .env ubuntu@<PUBLIC_IP>:~/Hypertube/.env
```

Then edit it **on the VM** (`nano .env`):

| Variable | Production value |
|---|---|
| `DOMAIN` | `hypertube-un35.duckdns.org` (add the line) |
| `PUBLIC_URL` | `https://hypertube-un35.duckdns.org` (also forced by the prod compose file) |
| `SECRET_KEY` | **a new value**: `python3 -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `POSTGRES_PASSWORD` | **a new strong value** |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_TLS`, `MAIL_FROM` | A real SMTP service; there is no Mailpit in production. For example, Brevo's free plan: host `smtp-relay.brevo.com`, port `587`, `SMTP_TLS=true`, with the SMTP login and key from your Brevo account. `MAIL_FROM` must be a sender verified there |

Start it:

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml logs -f caddy backend   # wait for "certificate obtained"
```

Open `https://hypertube-un35.duckdns.org`.

## 6. Add the production callback URLs to the OAuth apps

Keep the localhost ones too, so the local/evaluation setup still works. Replace the domain with yours:

| Provider | Where | Add |
|---|---|---|
| 42 | intra → Settings → API → your app → Edit → *Redirect URI* (one per line) | `https://hypertube-un35.duckdns.org/api/auth/oauth/42/callback` |
| GitHub | Settings → Developer settings → OAuth Apps → *Hypertube (local)* → *Add redirect URI* | `https://hypertube-un35.duckdns.org/api/auth/oauth/github/callback` |
| Discord | Developer Portal → app → OAuth2 → Redirects → *Add another* → *Save Changes* | `https://hypertube-un35.duckdns.org/api/auth/oauth/discord/callback` |
| GitLab | User settings → Applications → *Hypertube local* → Edit → Redirect URI (one per line) | `https://hypertube-un35.duckdns.org/api/auth/oauth/gitlab/callback` |

## 7. Day-to-day

```bash
cd ~/Hypertube
git pull && docker compose -f docker-compose.prod.yml up -d --build    # deploy a new version
docker compose -f docker-compose.prod.yml logs -f backend              # logs
docker compose -f docker-compose.prod.yml down                         # stop (data kept)
df -h /                                                                # disk: films are cached up to 30 days
```

## Security notes

* Only ports 80/443 (Caddy) and 6881 (BitTorrent) are public. PostgreSQL, the backend and nginx are reachable only inside Docker's network.
* Caddy renews the certificate automatically. Over HTTPS, session cookies are `Secure` and responses carry HSTS.
* Use different `SECRET_KEY` and `POSTGRES_PASSWORD` values than on your laptop, and never commit `.env`.
