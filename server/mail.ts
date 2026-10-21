import nodemailer from 'nodemailer';

export type RecoveryMail = { origin: string; sendReset: (email: string, url: string) => Promise<void> };

export function recoveryMailFromEnv(): RecoveryMail | null {
  const { SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_FROM, PUBLIC_ORIGIN } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !SMTP_FROM || !PUBLIC_ORIGIN) return null;
  let origin: URL;
  try { origin = new URL(PUBLIC_ORIGIN); } catch { return null; }
  const local = process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
  if ((origin.protocol !== 'https:' && !(local && origin.protocol === 'http:')) || origin.username || origin.password) return null;
  const port = Number(process.env.SMTP_PORT || 587);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  const transport = nodemailer.createTransport({
    host: SMTP_HOST, port, secure: port === 465, requireTLS: port !== 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 10000,
    disableFileAccess: true, disableUrlAccess: true,
  });
  return {
    origin: origin.origin,
    async sendReset(email, url) {
      await transport.sendMail({ from: SMTP_FROM, to: email, subject: 'Restablece tu contraseña de Pinta Pues',
        text: `¿Olvidaste tu contraseña, pues?\n\nAbre este enlace para elegir una nueva:\n${url}\n\nEl enlace vence en 30 minutos y solo puede usarse una vez. Si no lo pediste, ignora este correo. Tu contraseña sigue igual.`,
      });
    },
  };
}
