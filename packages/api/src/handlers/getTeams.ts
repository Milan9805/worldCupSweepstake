import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getAllTeams } from '../db/dynamodb';

export async function handler(_event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const teams = await getAllTeams();

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({ success: true, data: teams }),
    };
  } catch (error) {
    console.error('Error fetching teams:', error);
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
