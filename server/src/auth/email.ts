import nodemailer from 'nodemailer'
import { z } from 'zod'
import { AppError } from '../errors/app-error.js'
import type { EmailSender } from './types.js'

const smtpSchema = z.object({
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_SECURE: z.enum(['true', 'false']).default('false'),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  EMAIL_FROM: z.string().email(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
})

export function createSmtpEmailSender(): EmailSender {
  const parsed = smtpSchema.safeParse(process.env)
  if (!parsed.success) {
    throw new AppError(
      'Envio de e-mail indisponível: configure o provedor SMTP.',
      503,
      'EMAIL_PROVIDER_NOT_CONFIGURED',
    )
  }
  const config = parsed.data
  if (config.NODE_ENV === 'production' && (!config.SMTP_USER || !config.SMTP_PASSWORD)) {
    throw new AppError(
      'Envio de e-mail indisponível: credenciais SMTP de produção não configuradas.',
      503,
      'EMAIL_PROVIDER_NOT_CONFIGURED',
    )
  }
  const transporter = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE === 'true',
    requireTLS: config.NODE_ENV === 'production' && config.SMTP_SECURE !== 'true',
    ...(config.SMTP_USER && config.SMTP_PASSWORD
      ? { auth: { user: config.SMTP_USER, pass: config.SMTP_PASSWORD } }
      : {}),
    logger: false,
    debug: false,
    disableFileAccess: true,
    disableUrlAccess: true,
  })

  return {
    async sendEmailConfirmation({ to, name, confirmationUrl }) {
      await transporter.sendMail({
        from: config.EMAIL_FROM,
        to,
        subject: 'Confirme seu e-mail no Indica',
        text: `Olá, ${name}. Confirme seu e-mail acessando: ${confirmationUrl}`,
        html: emailHtml('Confirme seu e-mail', name, 'Confirmar e-mail', confirmationUrl, 'Este link expira em 24 horas e pode ser usado uma única vez.'),
      })
    },
    async sendPasswordReset({ to, name, resetUrl }) {
      await transporter.sendMail({
        from: config.EMAIL_FROM,
        to,
        subject: 'Redefina sua senha do Indica',
        text: `Olá, ${name}. Redefina sua senha acessando: ${resetUrl}`,
        html: emailHtml('Redefina sua senha', name, 'Criar nova senha', resetUrl, 'Este link expira em 1 hora e pode ser usado uma única vez.'),
      })
    },
  }
}

function emailHtml(title: string, name: string, action: string, url: string, note: string) {
  return `<div style="font-family:Arial,sans-serif;color:#213047;line-height:1.5"><h1 style="font-size:22px">${escapeHtml(title)}</h1><p>Olá, ${escapeHtml(name)}.</p><p><a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#3578c6;color:#fff;text-decoration:none">${escapeHtml(action)}</a></p><p style="font-size:13px;color:#667085">${escapeHtml(note)}</p><p style="font-size:12px;color:#667085">Se você não solicitou esta ação, ignore esta mensagem.</p></div>`
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  })[character]!)
}
