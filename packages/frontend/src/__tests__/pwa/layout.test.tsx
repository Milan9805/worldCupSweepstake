import React from 'react';
import { TextEncoder, TextDecoder } from 'util';
import RootLayout, { metadata, viewport } from '../../app/layout';

// jsdom doesn't define TextEncoder/TextDecoder, which react-dom/server needs.
// Polyfill before the server renderer is required (lazily, inside the test).
if (typeof globalThis.TextEncoder === 'undefined') {
  Object.assign(globalThis, { TextEncoder, TextDecoder });
}

describe('Root layout PWA wiring', () => {
  it('links the web app manifest', () => {
    expect(metadata.manifest).toBe('/manifest.webmanifest');
  });

  it('declares the theme color via the viewport export', () => {
    // In Next 14 themeColor must live on `viewport`, not `metadata`.
    expect(viewport.themeColor).toBe('#111111');
  });

  it('registers the service worker', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const html = renderToStaticMarkup(<RootLayout>{null}</RootLayout>);
    expect(html).toContain('serviceWorker');
    expect(html).toContain("register('/sw.js')");
  });
});
