/**
 * S3 setup script for LocalStack.
 * Creates the avatar bucket and configures it for local development:
 *   - public-read policy so <img> tags can load avatars
 *   - CORS so the browser can PUT directly to the presigned URL from localhost:3000
 *
 * Usage: npx ts-node scripts/setup-s3.ts
 * Requires LocalStack running on port 4566.
 */

import {
  S3Client,
  CreateBucketCommand,
  PutBucketPolicyCommand,
  PutBucketCorsCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const BUCKET = process.env.AVATAR_BUCKET || 'sweepstake-avatars';

const s3 = new S3Client({
  endpoint: 'http://localhost:4566',
  region: 'us-east-1',
  credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
  forcePathStyle: true,
});

async function main() {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
    console.log(`Bucket "${BUCKET}" already exists.`);
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
    console.log(`Created bucket "${BUCKET}".`);
  }

  await s3.send(
    new PutBucketPolicyCommand({
      Bucket: BUCKET,
      Policy: JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Sid: 'PublicRead',
            Effect: 'Allow',
            Principal: '*',
            Action: 's3:GetObject',
            Resource: `arn:aws:s3:::${BUCKET}/*`,
          },
        ],
      }),
    })
  );
  console.log('Applied public-read policy.');

  await s3.send(
    new PutBucketCorsCommand({
      Bucket: BUCKET,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedMethods: ['GET', 'PUT'],
            AllowedOrigins: ['*'],
            AllowedHeaders: ['*'],
            ExposeHeaders: ['ETag'],
          },
        ],
      },
    })
  );
  console.log('Applied CORS configuration.');
}

main().catch((err) => {
  console.error('Failed to set up S3 bucket:', err);
  process.exit(1);
});
