import * as React from 'react'

import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'

import { LANG_HTML, TEXTOS_EMAIL, com, type IdiomaEmail } from './textos'

interface ReauthenticationEmailProps {
  token: string
  lang?: IdiomaEmail
}

const BRAND = 'Alexandria Leds'
const PRIMARY = '#1d5966'

export const ReauthenticationEmail = ({ token, lang = 'pt' }: ReauthenticationEmailProps) => {
  const t = TEXTOS_EMAIL[lang].reauthentication
  return (
  <Html lang={LANG_HTML[lang]} dir="ltr">
    <Head />
    <Preview>{com(t.preview, BRAND)}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Text style={brand}>{BRAND}</Text>
        </Section>
        <Heading style={h1}>{t.titulo}</Heading>
        <Text style={text}>{t.texto}</Text>
        <Text style={codeStyle}>{token}</Text>
        <Text style={footer}>
          {t.rodape}
        </Text>
      </Container>
    </Body>
  </Html>
  )
}

export default ReauthenticationEmail

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
const codeStyle = {
  fontFamily: 'Courier, monospace',
  fontSize: '28px',
  fontWeight: 'bold' as const,
  color: PRIMARY,
  letterSpacing: '4px',
  margin: '0 0 30px',
}
const footer = { fontSize: '12px', color: '#9ca3af', margin: '32px 0 0' }
