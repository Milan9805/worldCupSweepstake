const esbuild = require('esbuild');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const outDir = path.resolve(__dirname, '../infrastructure/modules/api');
const outFile = path.join(outDir, 'lambda.js');
const zipFile = path.join(outDir, 'lambda.zip');

async function build() {
  console.log('Bundling Lambda function...');

  await esbuild.build({
    entryPoints: [path.resolve(__dirname, '../packages/api/src/index.ts')],
    bundle: true,
    platform: 'node',
    target: 'node20',
    outfile: outFile,
    minify: true,
    sourcemap: false,
    external: [
      // AWS SDK v3 is available in the Lambda runtime
      '@aws-sdk/*',
    ],
  });

  console.log('Creating zip archive...');

  // Remove old zip if it exists
  if (fs.existsSync(zipFile)) {
    fs.unlinkSync(zipFile);
  }

  // Rename lambda.js to index.js for the zip (handler is "index.handler")
  const indexFile = path.join(outDir, 'index.js');
  fs.renameSync(outFile, indexFile);

  execSync(`cd "${outDir}" && zip lambda.zip index.js`, { stdio: 'inherit' });

  // Clean up
  fs.unlinkSync(indexFile);

  console.log(`Done! Output: ${zipFile}`);
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
