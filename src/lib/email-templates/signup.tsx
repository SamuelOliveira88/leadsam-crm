import * as React from 'react'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'

import { LANG_HTML, TEXTOS_EMAIL, com, type IdiomaEmail } from './textos'

interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
  lang?: IdiomaEmail
}

const BRAND = 'Alexandria Leds'
const PRIMARY = '#1d5966'

export const SignupEmail = ({
  siteUrl,
  recipient,
  confirmationUrl,
  lang = 'pt',
}: SignupEmailProps) => {
  const t = TEXTOS_EMAIL[lang].signup
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
        <Text style={text}>
          {t.obrigadoAntes}{' '}
          <Link href={siteUrl} style={link}>
            <strong>{BRAND}</strong>
          </Link>
          {t.obrigadoDepois}
        </Text>
        <Text style={text}>
          {t.confirmeAntes}{' '}
          <Link href={`mailto:${recipient}`} style={link}>
            {recipient}
          </Link>{' '}
          {t.confirmeDepois}
        </Text>
        <Button style={button} href={confirmationUrl}>
          {t.botao}
        </Button>
        <Text style={footer}>
          {t.rodape}
        </Text>
      </Container>
    </Body>
  </Html>
  )
}

export default SignupEmail

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
const link = { color: PRIMARY, textDecoration: 'underline' }
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
