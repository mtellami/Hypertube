import logging
import smtplib
import ssl
from email.message import EmailMessage
from html import escape

from ..config import get_settings

log = logging.getLogger("hypertube.mail")


def send_mail(to: str, subject: str, text: str, html: str | None = None) -> bool:
    s = get_settings()
    msg = EmailMessage()
    msg["From"] = s.mail_from
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(text)
    if html:
        msg.add_alternative(html, subtype="html")
    try:
        if s.smtp_ssl:
            server: smtplib.SMTP = smtplib.SMTP_SSL(s.smtp_host, s.smtp_port, timeout=15,
                                                    context=ssl.create_default_context())
        else:
            server = smtplib.SMTP(s.smtp_host, s.smtp_port, timeout=15)
        with server:
            if s.smtp_tls and not s.smtp_ssl:
                server.starttls(context=ssl.create_default_context())
            if s.smtp_user:
                server.login(s.smtp_user, s.smtp_password)
            server.send_message(msg)
        return True
    except (OSError, smtplib.SMTPException) as exc:
        log.error("Failed to send mail to %s: %s", to, exc)
        return False


RESET_TEXTS = {
    "en": ("Reset your Hypertube password", "Hi {name},",
           "Someone asked to reset your Hypertube password. Use the link below within one hour:",
           "Reset password", "If you did not request this, you can ignore this email."),
    "fr": ("Réinitialisez votre mot de passe Hypertube", "Bonjour {name},",
           "Une réinitialisation de votre mot de passe Hypertube a été demandée. Utilisez ce lien dans l'heure :",
           "Réinitialiser le mot de passe", "Si vous n'êtes pas à l'origine de cette demande, ignorez cet email."),
    "es": ("Restablece tu contraseña de Hypertube", "Hola {name},",
           "Alguien solicitó restablecer tu contraseña de Hypertube. Usa este enlace durante la próxima hora:",
           "Restablecer contraseña", "Si no lo solicitaste, puedes ignorar este correo."),
}


def send_password_reset(to: str, first_name: str, language: str, link: str) -> bool:
    subject, hello, body, cta, ignore = RESET_TEXTS.get(language, RESET_TEXTS["en"])
    hello = hello.format(name=first_name)
    text = f"{hello}\n\n{body}\n{link}\n\n{ignore}\n"
    html = f"""<div style="font-family:Arial,sans-serif;background:#070a14;color:#e8ecf8;padding:32px">
<div style="max-width:480px;margin:auto;background:#11172a;border-radius:16px;padding:32px">
<h1 style="margin:0 0 24px;font-size:22px;color:#9db4ff">Hypertube</h1>
<p>{escape(hello)}</p><p>{escape(body)}</p>
<p style="margin:28px 0"><a href="{escape(link)}" style="background:#6d5cff;color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:bold">{escape(cta)}</a></p>
<p style="color:#7f88a6;font-size:13px">{escape(ignore)}</p></div></div>"""
    return send_mail(to, subject, text, html)
