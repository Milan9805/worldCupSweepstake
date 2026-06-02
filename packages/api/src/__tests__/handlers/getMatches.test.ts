import { handler } from '../../handlers/getMatches';
import { APIGatewayProxyEvent } from 'aws-lambda';
import * as db from '../../db/dynamodb';

jest.mock('../../db/dynamodb');

const mockedDb = db as jest.Mocked<typeof db>;

function makeEvent(): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    path: '/api/matches',
    pathParameters: null,
    queryStringParameters: null,
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

describe('getMatches handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns 200 with matches data', async () => {
    const matches = [
      { matchId: '1', homeTeam: 'ENG', awayTeam: 'BRA', status: 'SCHEDULED' },
      { matchId: '2', homeTeam: 'GER', awayTeam: 'FRA', status: 'FINISHED' },
    ];
    mockedDb.getAllMatches.mockResolvedValue(matches);
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ success: true, data: matches });
  });

  it('returns empty array when no matches', async () => {
    mockedDb.getAllMatches.mockResolvedValue([]);
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ success: true, data: [] });
  });

  it('returns 500 on database error', async () => {
    mockedDb.getAllMatches.mockRejectedValue(new Error('DB error'));
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body)).toEqual({ success: false, error: 'Internal server error' });
  });

  it('includes CORS headers', async () => {
    mockedDb.getAllMatches.mockResolvedValue([]);
    const result = await handler(makeEvent());
    expect(result.headers).toEqual({
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    });
  });
});
