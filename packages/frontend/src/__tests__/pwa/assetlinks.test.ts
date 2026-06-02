import fs from 'fs';
import path from 'path';

const assetlinksPath = path.join(
  __dirname,
  '../../../public/.well-known/assetlinks.json'
);

// Colon-separated hex SHA-256 (32 bytes), e.g. "AB:CD:...:EF".
const SHA256 = /^([0-9A-Fa-f]{2}:){31}[0-9A-Fa-f]{2}$/;
const PLACEHOLDER = 'REPLACE_WITH_SHA256_FINGERPRINT_FROM_PWABUILDER';

describe('Digital Asset Links (assetlinks.json)', () => {
  const statements = JSON.parse(fs.readFileSync(assetlinksPath, 'utf8'));
  const target = statements[0].target;
  const fingerprints = target.sha256_cert_fingerprints;
  const isPlaceholder = fingerprints.every((fp) => fp === PLACEHOLDER);

  it('has the Trusted Web Activity statement shape', () => {
    expect(statements[0].relation).toContain(
      'delegate_permission/common.handle_all_urls'
    );
    expect(target.namespace).toBe('android_app');
    expect(target.package_name).toBeTruthy();
    expect(Array.isArray(fingerprints)).toBe(true);
    expect(fingerprints.length).toBeGreaterThan(0);
  });

  // Skipped until the APK is built and its real fingerprint is pasted in
  // (see Step 2/3 of the plan). Once replaced, this enforces a valid SHA-256.
  (isPlaceholder ? it.skip : it)(
    'uses valid colon-hex SHA-256 fingerprints',
    () => {
      for (const fp of fingerprints) {
        expect(fp).toMatch(SHA256);
      }
    }
  );
});
