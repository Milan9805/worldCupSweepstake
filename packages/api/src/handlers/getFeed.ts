import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getRecentEvents } from '../db/dynamodb';

// Default number of events returned when no `?limit=` is supplied, and the cap
// we clamp any requested limit to. The Events table is tiny (a few hundred rows
// all tournament), so this keeps a single-partition Query cheap and bounded.
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 200;

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const limit = parseLimit(event.queryStringParameters?.limit);
    const events = await getRecentEvents(limit);

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({ success: true, data: events }),
    };
  } catch (error) {
    console.error('Error fetching feed:', error);
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ success: false, error: 'Internal server error' }),
    };
  }
}

// Parse the optional `?limit=` query param, falling back to the default and
// clamping into [1, MAX_LIMIT] so a bad or oversized value can't blow up the
// read.
function parseLimit(raw: string | undefined): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(parsed), MAX_LIMIT);
}

function corsHeaders() {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  };
}
