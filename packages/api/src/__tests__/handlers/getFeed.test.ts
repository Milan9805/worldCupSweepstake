import { handler } from '../../handlers/getFeed';
import { APIGatewayProxyEvent } from 'aws-lambda';
import * as db from '../../db/dynamodb';

jest.mock('../../db/dynamodb');

const mockedDb = db as jest.Mocked<typeof db>;

function makeEvent(
  queryStringParameters: Record<string, string> | null = null
): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    path: '/api/feed',
    pathParameters: null,
    queryStringParameters,
    headers: {},
    body: null,
    isBase64Encoded: false,
    resource: '',
    stageVariables: null,
    requestContext: {} as APIGatewayProxyEvent['requestContext'],
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
  };
}

describe('getFeed handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns 200 with feed data', async () => {
    const events = [
      { eventId: 'm1#GOAL#1-0', ts: '2026-06-05T12:00:00Z', type: 'GOAL', payload: {} },
      { eventId: 'm1#KICKOFF', ts: '2026-06-05T11:00:00Z', type: 'KICKOFF', payload: {} },
    ];
    mockedDb.getRecentEvents.mockResolvedValue(events as never);
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ success: true, data: events });
  });

  it('returns empty array when no events', async () => {
    mockedDb.getRecentEvents.mockResolvedValue([]);
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ success: true, data: [] });
  });

  it('uses the default limit when no query param is given', async () => {
    mockedDb.getRecentEvents.mockResolvedValue([]);
    await handler(makeEvent());
    expect(mockedDb.getRecentEvents).toHaveBeenCalledWith(100);
  });

  it('honours a valid ?limit= query param', async () => {
    mockedDb.getRecentEvents.mockResolvedValue([]);
    await handler(makeEvent({ limit: '25' }));
    expect(mockedDb.getRecentEvents).toHaveBeenCalledWith(25);
  });

  it('caps an oversized ?limit= at the max', async () => {
    mockedDb.getRecentEvents.mockResolvedValue([]);
    await handler(makeEvent({ limit: '9999' }));
    expect(mockedDb.getRecentEvents).toHaveBeenCalledWith(200);
  });

  it('falls back to the default on a non-numeric ?limit=', async () => {
    mockedDb.getRecentEvents.mockResolvedValue([]);
    await handler(makeEvent({ limit: 'abc' }));
    expect(mockedDb.getRecentEvents).toHaveBeenCalledWith(100);
  });

  it('falls back to the default on a non-positive ?limit=', async () => {
    mockedDb.getRecentEvents.mockResolvedValue([]);
    await handler(makeEvent({ limit: '0' }));
    expect(mockedDb.getRecentEvents).toHaveBeenCalledWith(100);
  });

  it('returns 500 on database error', async () => {
    mockedDb.getRecentEvents.mockRejectedValue(new Error('DB error'));
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body)).toEqual({ success: false, error: 'Internal server error' });
  });

  it('includes CORS headers', async () => {
    mockedDb.getRecentEvents.mockResolvedValue([]);
    const result = await handler(makeEvent());
    expect(result.headers).toEqual({
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    });
  });
});
