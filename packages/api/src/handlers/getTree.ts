import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getTree } from '../db/dynamodb';

export async function handler(_event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const tree = await getTree();

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({ success: true, data: tree }),
    };
  } catch (error) {
    console.error('Error fetching tree:', error);
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
