import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getGroup, putGroup } from '../db/dynamodb';
import { verifyAdminToken } from './adminLogin';

const GROUP_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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
    const groupKey = typeof body.groupKey === 'string' ? body.groupKey.trim() : '';
    const groupName = typeof body.groupName === 'string' ? body.groupName.trim() : '';

    if (!groupKey || !groupName) {
      return {
        statusCode: 400,
        headers: corsHeaders(),
        body: JSON.stringify({ success: false, error: 'groupKey and groupName are required' }),
      };
    }

    if (!GROUP_KEY_PATTERN.test(groupKey)) {
      return {
        statusCode: 400,
        headers: corsHeaders(),
        body: JSON.stringify({
          success: false,
          error: 'groupKey must be lowercase letters, numbers, and hyphens (e.g. lads-on-tour)',
        }),
      };
    }

    const existing = await getGroup(groupKey);
    if (existing) {
      return {
        statusCode: 409,
        headers: corsHeaders(),
        body: JSON.stringify({ success: false, error: 'Group already exists' }),
      };
    }

    const group = { groupKey, groupName, members: [] };
    await putGroup(group);

    return {
      statusCode: 201,
      headers: corsHeaders(),
      body: JSON.stringify({ success: true, data: group }),
    };
  } catch (error) {
    console.error('Error creating group:', error);
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
