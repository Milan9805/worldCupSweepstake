import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getConfig } from '../db/dynamodb';
import { getSecret } from '../lib/secrets';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';

function getJwtSecret(): Promise<string> {
  return getSecret('JWT_SECRET', 'JWT_SECRET_SSM_NAME');
}

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

interface AttemptRecord {
  failures: number;
  firstFailureAt: number;
}

const attempts = new Map<string, AttemptRecord>();

function sourceIp(event: APIGatewayProxyEvent): string {
  return event.requestContext?.identity?.sourceIp || 'unknown';
}

function checkRateLimit(ip: string, now: number): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
  const record = attempts.get(ip);
  if (!record || now - record.firstFailureAt > WINDOW_MS) {
    return { allowed: true };
  }
  if (record.failures >= MAX_ATTEMPTS) {
    return { allowed: false, retryAfterSeconds: Math.ceil((WINDOW_MS - (now - record.firstFailureAt)) / 1000) };
  }
  return { allowed: true };
}

function recordFailure(ip: string, now: number): void {
  const record = attempts.get(ip);
  if (!record || now - record.firstFailureAt > WINDOW_MS) {
    attempts.set(ip, { failures: 1, firstFailureAt: now });
  } else {
    record.failures += 1;
  }
}

export function _resetRateLimitForTests(): void {
  attempts.clear();
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const ip = sourceIp(event);
    const now = Date.now();
    const rate = checkRateLimit(ip, now);
    if (!rate.allowed) {
      return {
        statusCode: 429,
        headers: { ...corsHeaders(), 'Retry-After': String(rate.retryAfterSeconds) },
        body: JSON.stringify({ success: false, error: 'Too many login attempts. Try again later.' }),
      };
    }

    const body = JSON.parse(event.body || '{}');
    const { secret } = body;

    if (!secret) {
      return {
        statusCode: 400,
        headers: corsHeaders(),
        body: JSON.stringify({ success: false, error: 'Secret is required' }),
      };
    }

    const config = await getConfig('adminSecret');
    if (!config) {
      return {
        statusCode: 500,
        headers: corsHeaders(),
        body: JSON.stringify({ success: false, error: 'Admin not configured' }),
      };
    }

    const isValid = await bcrypt.compare(secret, config.value);
    if (!isValid) {
      recordFailure(ip, now);
      return {
        statusCode: 401,
        headers: corsHeaders(),
        body: JSON.stringify({ success: false, error: 'Invalid secret' }),
      };
    }

    attempts.delete(ip);
    const token = jwt.sign({ role: 'admin' }, await getJwtSecret(), { expiresIn: '24h' });

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({ success: true, data: { token } }),
    };
  } catch (error) {
    console.error('Error in admin login:', error);
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ success: false, error: 'Internal server error' }),
    };
  }
}

export async function verifyAdminToken(token: string): Promise<boolean> {
  try {
    const secret = await getJwtSecret();
    const decoded = jwt.verify(token, secret) as { role: string };
    return decoded.role === 'admin';
  } catch {
    return false;
  }
}

function corsHeaders() {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  };
}
