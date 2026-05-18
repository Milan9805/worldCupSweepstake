import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { refreshData } from '../services/refresh';

export async function handler(_event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const data = await refreshData();

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({ success: true, data }),
    };
  } catch (error) {
    console.error('Error refreshing data:', error);
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
