// Textos dos e-mails de acesso (convite, confirmação, senha...) em português, inglês e espanhol.
// {BRAND} é trocado pelo nome do produto. Não traduzimos: Alexandria Leds.

export type IdiomaEmail = 'pt' | 'en' | 'es'

export function idiomaEmailDe(valor: unknown): IdiomaEmail {
  return valor === 'en' || valor === 'es' ? valor : 'pt'
}

/** Procura o idioma gravado no usuário (user_metadata.lang) nos formatos em que o dado pode chegar. */
export function idiomaDoUsuario(data: unknown): IdiomaEmail {
  const d = data as any
  return idiomaEmailDe(
    d?.user?.user_metadata?.lang ??
      d?.user_metadata?.lang ??
      d?.userMetadata?.lang ??
      d?.data?.lang ??
      d?.lang,
  )
}

export const LANG_HTML: Record<IdiomaEmail, string> = { pt: 'pt-BR', en: 'en', es: 'es' }

export function com(texto: string, brand: string): string {
  return texto.replace(/\{BRAND\}/g, brand)
}

type Textos = {
  assuntos: { signup: string; invite: string; magiclink: string; recovery: string; email_change: string; reauthentication: string }
  invite: { preview: string; titulo: string; antes: string; depois: string; botao: string; rodape: string }
  signup: { preview: string; titulo: string; obrigadoAntes: string; obrigadoDepois: string; confirmeAntes: string; confirmeDepois: string; botao: string; rodape: string }
  magiclink: { preview: string; titulo: string; texto: string; botao: string; rodape: string }
  recovery: { preview: string; titulo: string; texto: string; botao: string; rodape: string }
  email_change: { preview: string; titulo: string; antes: string; para: string; depois: string; clique: string; botao: string; rodape: string }
  reauthentication: { preview: string; titulo: string; texto: string; rodape: string }
}

export const TEXTOS_EMAIL: Record<IdiomaEmail, Textos> = {
  pt: {
    assuntos: {
      signup: 'Confirme seu e-mail — Alexandria Leds',
      invite: 'Você foi convidado — Alexandria Leds',
      magiclink: 'Seu link de acesso — Alexandria Leds',
      recovery: 'Redefina sua senha — Alexandria Leds',
      email_change: 'Confirme seu novo e-mail — Alexandria Leds',
      reauthentication: 'Seu código de verificação — Alexandria Leds',
    },
    invite: {
      preview: 'Você foi convidado para o {BRAND}',
      titulo: 'Você foi convidado',
      antes: 'Você recebeu um convite para fazer parte do',
      depois: '. Clique no botão abaixo para aceitar o convite e criar sua conta.',
      botao: 'Aceitar convite',
      rodape: 'Se você não esperava este convite, pode ignorar este e-mail.',
    },
    signup: {
      preview: 'Confirme seu e-mail para acessar o {BRAND}',
      titulo: 'Confirme seu e-mail',
      obrigadoAntes: 'Obrigado por se cadastrar no',
      obrigadoDepois: '!',
      confirmeAntes: 'Confirme seu endereço de e-mail (',
      confirmeDepois: ') clicando no botão abaixo:',
      botao: 'Verificar e-mail',
      rodape: 'Se você não criou uma conta, pode ignorar este e-mail com segurança.',
    },
    magiclink: {
      preview: 'Seu link de acesso ao {BRAND}',
      titulo: 'Link de acesso',
      texto: 'Clique no botão abaixo para entrar no {BRAND}. Este link expira em breve.',
      botao: 'Entrar agora',
      rodape: 'Se você não solicitou este link, pode ignorar este e-mail.',
    },
    recovery: {
      preview: 'Redefina sua senha do {BRAND}',
      titulo: 'Redefinir senha',
      texto: 'Recebemos uma solicitação para redefinir sua senha no {BRAND}. Clique no botão abaixo para escolher uma nova senha.',
      botao: 'Redefinir senha',
      rodape: 'Se você não solicitou a redefinição, pode ignorar este e-mail. Sua senha não será alterada.',
    },
    email_change: {
      preview: 'Confirme a alteração de e-mail no {BRAND}',
      titulo: 'Confirmar alteração de e-mail',
      antes: 'Você solicitou alterar o e-mail da sua conta no {BRAND} de',
      para: 'para',
      depois: '.',
      clique: 'Clique no botão abaixo para confirmar:',
      botao: 'Confirmar alteração',
      rodape: 'Se você não solicitou esta alteração, proteja sua conta imediatamente.',
    },
    reauthentication: {
      preview: 'Seu código de verificação do {BRAND}',
      titulo: 'Confirmar identidade',
      texto: 'Use o código abaixo para confirmar sua identidade:',
      rodape: 'Este código expira em breve. Se você não solicitou, pode ignorar este e-mail.',
    },
  },
  en: {
    assuntos: {
      signup: 'Confirm your email — Alexandria Leds',
      invite: "You've been invited — Alexandria Leds",
      magiclink: 'Your sign-in link — Alexandria Leds',
      recovery: 'Reset your password — Alexandria Leds',
      email_change: 'Confirm your new email — Alexandria Leds',
      reauthentication: 'Your verification code — Alexandria Leds',
    },
    invite: {
      preview: "You've been invited to {BRAND}",
      titulo: "You've been invited",
      antes: "You've been invited to join",
      depois: '. Click the button below to accept the invitation and create your account.',
      botao: 'Accept invitation',
      rodape: "If you weren't expecting this invitation, you can ignore this email.",
    },
    signup: {
      preview: 'Confirm your email to access {BRAND}',
      titulo: 'Confirm your email',
      obrigadoAntes: 'Thanks for signing up for',
      obrigadoDepois: '!',
      confirmeAntes: 'Please confirm your email address (',
      confirmeDepois: ') by clicking the button below:',
      botao: 'Verify email',
      rodape: "If you didn't create an account, you can safely ignore this email.",
    },
    magiclink: {
      preview: 'Your sign-in link for {BRAND}',
      titulo: 'Sign-in link',
      texto: 'Click the button below to sign in to {BRAND}. This link expires soon.',
      botao: 'Sign in now',
      rodape: "If you didn't request this link, you can ignore this email.",
    },
    recovery: {
      preview: 'Reset your {BRAND} password',
      titulo: 'Reset your password',
      texto: 'We got a request to reset your {BRAND} password. Click the button below to choose a new one.',
      botao: 'Reset password',
      rodape: "If you didn't ask for a reset, you can ignore this email. Your password won't change.",
    },
    email_change: {
      preview: 'Confirm your email change on {BRAND}',
      titulo: 'Confirm your email change',
      antes: 'You asked to change the email on your {BRAND} account from',
      para: 'to',
      depois: '.',
      clique: 'Click the button below to confirm:',
      botao: 'Confirm change',
      rodape: "If you didn't request this change, secure your account right away.",
    },
    reauthentication: {
      preview: 'Your {BRAND} verification code',
      titulo: 'Confirm your identity',
      texto: 'Use the code below to confirm your identity:',
      rodape: "This code expires soon. If you didn't request it, you can ignore this email.",
    },
  },
  es: {
    assuntos: {
      signup: 'Confirma tu correo — Alexandria Leds',
      invite: 'Te invitaron — Alexandria Leds',
      magiclink: 'Tu enlace de acceso — Alexandria Leds',
      recovery: 'Restablece tu contraseña — Alexandria Leds',
      email_change: 'Confirma tu nuevo correo — Alexandria Leds',
      reauthentication: 'Tu código de verificación — Alexandria Leds',
    },
    invite: {
      preview: 'Te invitaron a {BRAND}',
      titulo: 'Te invitaron',
      antes: 'Recibiste una invitación para formar parte de',
      depois: '. Haz clic en el botón de abajo para aceptar la invitación y crear tu cuenta.',
      botao: 'Aceptar invitación',
      rodape: 'Si no esperabas esta invitación, puedes ignorar este correo.',
    },
    signup: {
      preview: 'Confirma tu correo para acceder a {BRAND}',
      titulo: 'Confirma tu correo',
      obrigadoAntes: 'Gracias por registrarte en',
      obrigadoDepois: '.',
      confirmeAntes: 'Confirma tu dirección de correo (',
      confirmeDepois: ') haciendo clic en el botón de abajo:',
      botao: 'Verificar correo',
      rodape: 'Si no creaste una cuenta, puedes ignorar este correo sin problema.',
    },
    magiclink: {
      preview: 'Tu enlace de acceso a {BRAND}',
      titulo: 'Enlace de acceso',
      texto: 'Haz clic en el botón de abajo para entrar a {BRAND}. Este enlace vence pronto.',
      botao: 'Entrar ahora',
      rodape: 'Si no pediste este enlace, puedes ignorar este correo.',
    },
    recovery: {
      preview: 'Restablece tu contraseña de {BRAND}',
      titulo: 'Restablecer contraseña',
      texto: 'Recibimos una solicitud para restablecer tu contraseña de {BRAND}. Haz clic en el botón de abajo para elegir una nueva.',
      botao: 'Restablecer contraseña',
      rodape: 'Si no pediste el cambio, puedes ignorar este correo. Tu contraseña no cambiará.',
    },
    email_change: {
      preview: 'Confirma el cambio de correo en {BRAND}',
      titulo: 'Confirmar cambio de correo',
      antes: 'Pediste cambiar el correo de tu cuenta de {BRAND} de',
      para: 'a',
      depois: '.',
      clique: 'Haz clic en el botón de abajo para confirmar:',
      botao: 'Confirmar cambio',
      rodape: 'Si no pediste este cambio, protege tu cuenta de inmediato.',
    },
    reauthentication: {
      preview: 'Tu código de verificación de {BRAND}',
      titulo: 'Confirmar identidad',
      texto: 'Usa el código de abajo para confirmar tu identidad:',
      rodape: 'Este código vence pronto. Si no lo pediste, puedes ignorar este correo.',
    },
  },
}
