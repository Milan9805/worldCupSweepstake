import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getAllMatches } from '../db/dynamodb';

export async function handler(_event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const matches = await getAllMatches();

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({ success: true, data: matches }),
    };
  } catch (error) {
    console.error('Error fetching matches:', error);
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
