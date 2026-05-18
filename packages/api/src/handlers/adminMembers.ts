import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getGroup, putGroup } from '../db/dynamodb';
import { verifyAdminToken } from './adminLogin';

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const authHeader = event.headers['Authorization'] || event.headers['authorization'];
    const token = authHeader?.replace('Bearer ', '');

    if (!token || !verifyAdminToken(token)) {
      return {
        statusCode: 401,
        headers: corsHeaders(),
        body: JSON.stringify({ success: false, error: 'Unauthorized' }),
      };
    }

    const body = JSON.parse(event.body || '{}');
    const { groupKey, members } = body;

    if (!groupKey || !members) {
      return {
        statusCode: 400,
        headers: corsHeaders(),
        body: JSON.stringify({ success: false, error: 'groupKey and members are required' }),
      };
    }

    const existing = await getGroup(groupKey);
    if (!existing) {
      return {
        statusCode: 404,
        headers: corsHeaders(),
        body: JSON.stringify({ success: false, error: 'Group not found' }),
      };
    }

    await putGroup({ ...existing, members });

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({ success: true, data: { groupKey, members } }),
    };
  } catch (error) {
    console.error('Error updating members:', error);
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
