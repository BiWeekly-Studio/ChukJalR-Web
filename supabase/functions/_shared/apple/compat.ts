import crypto, { type KeyObject } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { X509, KEYUTIL } from 'npm:jsrsasign@11.1.5';

/** Older Edge runtimes report Rust curve aliases instead of Node/OpenSSL names.
 * Preserve the actual curve and key, including rejection of unknown curves.
 */
export function normalizeECDetails(details: KeyObject['asymmetricKeyDetails']) {
  const aliases: Record<string, string> = {
    p256: 'prime256v1', 'P-256': 'prime256v1', secp256r1: 'prime256v1',
    p384: 'secp384r1', 'P-384': 'secp384r1',
    p521: 'secp521r1', 'P-521': 'secp521r1',
  };
  const namedCurve = aliases[details?.namedCurve ?? ''];
  return namedCurve ? { ...details, namedCurve } : details;
}

function installCurveAliases(key: KeyObject) {
  // Apple's verifier re-imports the verified key from PEM inside jsonwebtoken.
  // Normalize the shared getter so those freshly imported keys are covered too.
  for (let prototype = Object.getPrototypeOf(key); prototype; prototype = Object.getPrototypeOf(prototype)) {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'asymmetricKeyDetails');
    if (!descriptor?.get) continue;
    const original = descriptor.get;
    Object.defineProperty(prototype, 'asymmetricKeyDetails', {
      ...descriptor,
      get(this: KeyObject) {
        const details = original.call(this);
        return this.asymmetricKeyType === 'ec' ? normalizeECDetails(details) : details;
      },
    });
    return;
  }
  throw new Error('Unsupported asymmetric key details implementation');
}

function certificateDate(value: string): string {
  if (!/^(\d{12}|\d{14})Z$/.test(value)) throw new Error('Invalid certificate date');
  const expanded = value.length === 13
    ? (Number(value.slice(0, 2)) >= 50 ? '19' : '20') + value
    : value;
  return `${expanded.slice(0,4)}-${expanded.slice(4,6)}-${expanded.slice(6,8)}T${expanded.slice(8,10)}:${expanded.slice(10,12)}:${expanded.slice(12,14)}Z`;
}

/** The X509 surface used by Apple's SDK, for Edge's incomplete node:crypto shim.
 * Certificate parsing uses the same ASN.1 library as Apple's OCSP verifier.
 * Apple's chain, OID, date, JWS and online revocation checks remain unchanged.
 */
export class EdgeX509Certificate {
  readonly raw: Buffer;
  readonly publicKey: KeyObject;
  readonly subject: string;
  readonly issuer: string;
  readonly ca: boolean;
  readonly validFrom: string;
  readonly validTo: string;
  readonly infoAccess: string;
  private readonly certificate: X509;
  constructor(input: Buffer | string) {
    const source = Buffer.from(input);
    this.raw = source.toString().includes('-----BEGIN CERTIFICATE-----')
      ? Buffer.from(source.toString().replace(/-----[^-]+-----/g, '').replace(/\s/g, ''), 'base64')
      : Buffer.from(source);
    this.certificate = new X509();
    this.certificate.readCertHex(this.raw.toString('hex'));
    this.publicKey = crypto.createPublicKey(KEYUTIL.getPEM(this.certificate.getPublicKey()));
    this.subject = this.certificate.getSubjectString();
    this.issuer = this.certificate.getIssuerString();
    this.ca = this.certificate.getExtBasicConstraints()?.cA === true;
    this.validFrom = certificateDate(this.certificate.getNotBefore());
    this.validTo = certificateDate(this.certificate.getNotAfter());
    const aia = this.certificate.getExtAIAInfo();
    this.infoAccess = (aia?.ocsp ?? []).map((url: string) => `OCSP - URI:${url}`).join('\n');
  }
  toString(): string {
    const lines = this.raw.toString('base64').match(/.{1,64}/g)!.join('\n');
    return `-----BEGIN CERTIFICATE-----\n${lines}\n-----END CERTIFICATE-----\n`;
  }
  verify(key: KeyObject): boolean {
    try { return this.certificate.verifySignature(key.export({ type: 'spki', format: 'pem' }) as string); }
    catch { return false; }
  }
}

export function installAppleCryptoCompatibility(sample: Buffer) {
  try {
    const certificate = new crypto.X509Certificate(sample);
    certificate.toString(); void certificate.raw; void certificate.publicKey;
    void certificate.infoAccess; void certificate.ca;
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('Not implemented: crypto.X509Certificate.prototype.')) throw error;
    // The SDK's CommonJS import reads this export when constructing certificates.
    Object.defineProperty(crypto, 'X509Certificate', { value: EdgeX509Certificate, configurable: true, writable: true });
  }
  installCurveAliases(new crypto.X509Certificate(sample).publicKey);
}
