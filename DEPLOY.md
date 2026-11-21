# Production deployment

The production Compose stack runs PostgreSQL, the backend, nginx, and Caddy. Caddy terminates HTTPS for the domain configured in `.env`.

## Requirements

- A server with Docker and the Compose plugin.
- A domain pointing to that server.
- Inbound TCP ports 80 and 443 for HTTP and HTTPS; UDP 443 is optional for HTTP/3.
- TCP and UDP port 6881 for incoming BitTorrent connections.
- An SMTP service for password-reset emails.

## Configure

```sh
git clone https://github.com/mtellami/repository.git
cd repository
cp .env.example .env
```

Set these values in `.env`:

| Variable | Value |
| --- | --- |
| `DOMAIN` | Your public hostname, such as `video.example.com` |
| `PUBLIC_URL` | The matching HTTPS address |
| `SECRET_KEY` | A long random signing key |
| `POSTGRES_PASSWORD` | A strong database password |
| `SMTP_HOST`, `SMTP_PORT` | Your mail server address and port |
| `SMTP_USER`, `SMTP_PASSWORD` | SMTP credentials |
| `SMTP_TLS` / `SMTP_SSL` | Enable STARTTLS or implicit TLS as required by your provider |
| `MAIL_FROM` | A sender address accepted by your mail provider |

Configure optional metadata, subtitle, and OAuth credentials as described in `.env.example`. Register `https://<domain>/api/auth/oauth/<provider>/callback` with each enabled OAuth provider (`42`, `github`, `discord`, or `gitlab`).

## Start and maintain

```sh
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml logs -f caddy backend
```

The backend runs database migrations on startup. Caddy obtains and renews certificates automatically. PostgreSQL, the backend HTTP port, and nginx are accessible only inside the Compose network.

After updating the source, rebuild with the same `up -d --build` command. Stop services with:

```sh
docker compose -f docker-compose.prod.yml down
```

Volumes persist across restarts and `down`. Back up PostgreSQL and the application data volume before updates; deleting volumes deletes stored data. Monitor disk usage because video downloads are cached until the retention policy removes them.
