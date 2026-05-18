import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getConfig } from '../db/dynamodb';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
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
      return {
        statusCode: 401,
        headers: corsHeaders(),
        body: JSON.stringify({ success: false, error: 'Invalid secret' }),
      };
    }

    const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '24h' });

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

export function verifyAdminToken(token: string): boolean {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { role: string };
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
