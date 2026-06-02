import { handler } from '../../handlers/getBracket';
import { APIGatewayProxyEvent } from 'aws-lambda';
import * as db from '../../db/dynamodb';

jest.mock('../../db/dynamodb');

const mockedDb = db as jest.Mocked<typeof db>;

function makeEvent(): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    path: '/api/bracket',
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

describe('getBracket handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns 200 with tree data', async () => {
    const tree = [
      { round: 'ROUND_OF_16', position: 1, team1: 'ENG', team2: 'BRA' },
    ];
    mockedDb.getTree.mockResolvedValue(tree);
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ success: true, data: tree });
  });

  it('returns empty array when no tree data', async () => {
    mockedDb.getTree.mockResolvedValue([]);
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ success: true, data: [] });
  });

  it('returns 500 on database error', async () => {
    mockedDb.getTree.mockRejectedValue(new Error('DB error'));
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body)).toEqual({ success: false, error: 'Internal server error' });
  });
});
