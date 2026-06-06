#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { sign, randomUUID } from 'node:crypto'
import path from 'node:path'

function usage() {
  console.log([
    'Usage:',
    '  node scripts/issue-license.js activation_request.dat license.dat "Customer Name" [days]',
    '',
    'Requires license-private-key.pem in the project root.',
    'The private key must never be committed or sent to customers.'
  ].join('\n'))
}

const [, , requestPath, outputPath = 'license.dat', customerName = '', days] = process.argv
if (!requestPath) {
  usage()
  process.exit(1)
}

const privateKeyPath = path.resolve('license-private-key.pem')
if (!existsSync(privateKeyPath)) {
  console.error('Missing license-private-key.pem')
  console.error('Generate a private/public keypair first, then keep the private key secret.')
  process.exit(1)
}

const request = JSON.parse(readFileSync(requestPath, 'utf8').replace(/^\uFEFF/, ''))
if (request.schema !== 'abdokofta.activation-request.v1' || !request.hwid) {
  console.error('Invalid activation_request.dat')
  process.exit(1)
}

const issuedAt = Date.now()
const payload = {
  schema: 'abdokofta.license.v1',
  licenseId: randomUUID(),
  customerName: customerName || undefined,
  appId: request.appId,
  hwid: request.hwid,
  features: ['offline-pos'],
  issuedAt,
  expiresAt: days ? issuedAt + Number(days) * 24 * 60 * 60 * 1000 : undefined
}

const signature = sign(
  null,
  Buffer.from(JSON.stringify(payload)),
  readFileSync(privateKeyPath, 'utf8')
).toString('base64')

writeFileSync(outputPath, JSON.stringify({ payload, signature }, null, 2), 'utf8')
console.log(`Wrote ${outputPath}`)
