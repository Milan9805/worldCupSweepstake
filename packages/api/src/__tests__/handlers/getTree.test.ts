import { handler } from '../../handlers/getTree';
import { APIGatewayProxyEvent } from 'aws-lambda';
import * as db from '../../db/dynamodb';

jest.mock('../../db/dynamodb');

const mockedDb = db as jest.Mocked<typeof db>;

function makeEvent(): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    path: '/api/tree',
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

describe('getTree handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns 200 with tree data', async () => {
    const tree = [
      { round: 'SEMI_FINAL', position: 1, team1: 'ENG', team2: 'GER' },
    ];
    mockedDb.getTree.mockResolvedValue(tree);
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ success: true, data: tree });
  });

  it('returns 500 on database error', async () => {
    mockedDb.getTree.mockRejectedValue(new Error('DB error'));
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body)).toEqual({ success: false, error: 'Internal server error' });
  });
});
