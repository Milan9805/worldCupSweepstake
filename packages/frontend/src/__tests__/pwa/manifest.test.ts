import fs from 'fs';
import path from 'path';

const publicDir = path.join(__dirname, '../../../public');
const manifestPath = path.join(publicDir, 'manifest.webmanifest');

describe('PWA web app manifest', () => {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  it('has the core installability fields', () => {
    expect(manifest.name).toBeTruthy();
    expect(manifest.short_name).toBeTruthy();
    expect(manifest.start_url).toBe('/');
    expect(manifest.scope).toBe('/');
    expect(manifest.display).toBe('standalone');
  });

  it('declares 192, 512 and a maskable icon', () => {
    const sizes = manifest.icons.map((icon) => icon.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');

    const purposes = manifest.icons.map((icon) => icon.purpose);
    expect(purposes).toContain('maskable');
  });

  it('references icon files that exist on disk', () => {
    for (const icon of manifest.icons) {
      const iconPath = path.join(publicDir, icon.src);
      expect(fs.existsSync(iconPath)).toBe(true);
    }
  });
});
