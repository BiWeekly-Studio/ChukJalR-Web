import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';
import jwt from 'npm:jsonwebtoken@9.0.2';
import { appleRoots } from './roots.ts';
import { EdgeX509Certificate, installAppleCryptoCompatibility, normalizeECDetails } from './compat.ts';

const roots = appleRoots.map(value => Buffer.from(value, 'base64'));
installAppleCryptoCompatibility(roots[0]);

Deno.test('Edge certificates preserve DER, issuer identity, dates and signature verification', () => {
  const certificates = roots.map(root => new EdgeX509Certificate(root));
  for (const certificate of certificates) {
    assert.deepEqual(new EdgeX509Certificate(certificate.toString()).raw, certificate.raw);
    assert.equal(certificate.subject, certificate.issuer);
    assert.equal(certificate.ca, true);
    assert.ok(Date.parse(certificate.validFrom) < Date.parse(certificate.validTo));
    assert.equal(certificate.verify(certificate.publicKey), true);
    const wrongIssuer = certificates.find(other => other !== certificate)!;
    assert.equal(certificate.verify(wrongIssuer.publicKey), false);
    const corrupted = Buffer.from(certificate.raw);
    corrupted[corrupted.length - 1] ^= 1;
    assert.equal(new EdgeX509Certificate(corrupted).verify(certificate.publicKey), false);
  }
});

Deno.test('curve normalization preserves unknown curves and other key properties', () => {
  assert.deepEqual(normalizeECDetails({ namedCurve: 'p256' }), { namedCurve: 'prime256v1' });
  assert.deepEqual(normalizeECDetails({ namedCurve: 'p384' }), { namedCurve: 'secp384r1' });
  assert.deepEqual(normalizeECDetails({ namedCurve: 'p521' }), { namedCurve: 'secp521r1' });
  const unknown = { namedCurve: 'unknown', modulusLength: 42 };
  assert.equal(normalizeECDetails(unknown), unknown);
  assert.equal(normalizeECDetails(undefined), undefined);
});

Deno.test('JWT signs and verifies re-imported P-256 keys while rejecting wrong curves and signatures', () => {
  const pair = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const privatePEM = pair.privateKey.export({ type: 'pkcs8', format: 'pem' });
  const publicPEM = pair.publicKey.export({ type: 'spki', format: 'pem' });
  const signed = jwt.sign({ test: true }, privatePEM, { algorithm: 'ES256' });
  assert.equal((jwt.verify(signed, publicPEM, { algorithms: ['ES256'] }) as jwt.JwtPayload).test, true);
  const another = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  assert.throws(() => jwt.verify(signed, another.publicKey, { algorithms: ['ES256'] }));
  const wrongCurve = crypto.generateKeyPairSync('ec', { namedCurve: 'secp384r1' });
  assert.throws(() => jwt.sign({ test: true }, wrongCurve.privateKey, { algorithm: 'ES256' }));
});
