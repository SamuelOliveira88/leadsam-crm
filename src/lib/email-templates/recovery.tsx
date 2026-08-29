import * as React from 'react'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'

interface RecoveryEmailProps {
  siteName: string
  confirmationUrl: string
}

const BRAND = 'Alexandria Leds'
const PRIMARY = '#1d5966'

export const RecoveryEmail = ({
  confirmationUrl,
}: RecoveryEmailProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Redefina sua senha do {BRAND}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Text style={brand}>{BRAND}</Text>
        </Section>
        <Heading style={h1}>Redefinir senha</Heading>
        <Text style={text}>
          Recebemos uma solicitação para redefinir sua senha no {BRAND}. Clique
          no botão abaixo para escolher uma nova senha.
        </Text>
        <Button style={button} href={confirmationUrl}>
          Redefinir senha
        </Button>
        <Text style={footer}>
          Se você não solicitou a redefinição, pode ignorar este e-mail. Sua
          senha não será alterada.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default RecoveryEmail

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '32px 24px' }
const header = { marginBottom: '24px', textAlign: 'center' as const }
const brand = {
  color: PRIMARY,
  fontSize: '20px',
  fontWeight: 'bold' as const,
  margin: '0',
}
const h1 = {
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: '#111827',
  margin: '0 0 20px',
}
const text = {
  fontSize: '14px',
  color: '#4b5563',
  lineHeight: '1.6',
  margin: '0 0 20px',
}
const button = {
  backgroundColor: PRIMARY,
  color: '#ffffff',
  fontSize: '14px',
  fontWeight: 'bold' as const,
  borderRadius: '8px',
  padding: '12px 24px',
  textDecoration: 'none',
  display: 'inline-block' as const,
}
const footer = { fontSize: '12px', color: '#9ca3af', margin: '32px 0 0' }
