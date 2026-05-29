import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { verifyAdminToken } from './adminLogin';
import { randomUUID } from 'crypto';

const isLocal = process.env.IS_LOCAL === 'true';
const BUCKET_NAME = process.env.AVATAR_BUCKET || 'sweepstake-avatars';

const s3Client = new S3Client({
  // Don't inject a default CRC32 checksum into the presigned URL — the browser
  // PUTs a plain body, so a baked-in checksum would mismatch and S3 rejects it.
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
  ...(isLocal
    ? {
        endpoint: 'http://localhost:4566',
        region: 'us-east-1',
        credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
        forcePathStyle: true,
      }
    : {}),
});

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const authHeader = event.headers['Authorization'] || event.headers['authorization'];
    const token = authHeader?.replace('Bearer ', '');

    if (!token || !(await verifyAdminToken(token))) {
      return {
        statusCode: 401,
        headers: corsHeaders(),
        body: JSON.stringify({ success: false, error: 'Unauthorized' }),
      };
    }

    const body = JSON.parse(event.body || '{}');
    const { groupKey, personName, contentType } = body;

    if (!groupKey || !personName || !contentType) {
      return {
        statusCode: 400,
        headers: corsHeaders(),
        body: JSON.stringify({
          success: false,
          error: 'groupKey, personName, and contentType are required',
        }),
      };
    }

    // Validate content type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(contentType)) {
      return {
        statusCode: 400,
        headers: corsHeaders(),
        body: JSON.stringify({ success: false, error: 'Invalid content type' }),
      };
    }

    const extension = contentType.split('/')[1];
    const key = `avatars/${groupKey}/${randomUUID()}.${extension}`;

    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });
    const imageUrl = isLocal
      ? `http://localhost:4566/${BUCKET_NAME}/${key}`
      : `https://${BUCKET_NAME}.s3.amazonaws.com/${key}`;

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({ success: true, data: { uploadUrl, imageUrl } }),
    };
  } catch (error) {
    console.error('Error generating upload URL:', error);
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ success: false, error: 'Internal server error' }),
    };
  }
}

function corsHeaders() {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  };
}
