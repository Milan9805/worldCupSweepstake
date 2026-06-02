import { handler } from '../../handlers/getTeams';
import { APIGatewayProxyEvent } from 'aws-lambda';
import * as db from '../../db/dynamodb';

jest.mock('../../db/dynamodb');

const mockedDb = db as jest.Mocked<typeof db>;

function makeEvent(): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    path: '/api/teams',
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

describe('getTeams handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns 200 with teams data', async () => {
    const teams = [
      { teamCode: 'ENG', name: 'England', fifaRanking: 4 },
      { teamCode: 'BRA', name: 'Brazil', fifaRanking: 1 },
    ];
    mockedDb.getAllTeams.mockResolvedValue(teams);
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ success: true, data: teams });
  });

  it('returns empty array when no teams', async () => {
    mockedDb.getAllTeams.mockResolvedValue([]);
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ success: true, data: [] });
  });

  it('returns 500 on database error', async () => {
    mockedDb.getAllTeams.mockRejectedValue(new Error('DB error'));
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body)).toEqual({ success: false, error: 'Internal server error' });
  });

  it('includes CORS headers', async () => {
    mockedDb.getAllTeams.mockResolvedValue([]);
    const result = await handler(makeEvent());
    expect(result.headers).toEqual({
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    });
  });
});
