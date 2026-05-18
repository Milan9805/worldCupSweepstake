import { handler } from '../../handlers/getGroup';
import { APIGatewayProxyEvent } from 'aws-lambda';
import * as db from '../../db/dynamodb';

jest.mock('../../db/dynamodb');

const mockedDb = db as jest.Mocked<typeof db>;

function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    path: '/api/group/test',
    pathParameters: { key: 'test-group' },
    queryStringParameters: null,
    headers: {},
    body: null,
    isBase64Encoded: false,
    resource: '',
    stageVariables: null,
    requestContext: {} as APIGatewayProxyEvent['requestContext'],
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    ...overrides,
  };
}

describe('getGroup handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns 400 if group key is missing', async () => {
    const event = makeEvent({ pathParameters: null });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({ success: false, error: 'Group key is required' });
  });

  it('returns 404 if group not found', async () => {
    mockedDb.getGroup.mockResolvedValue(undefined);
    const event = makeEvent();
    const result = await handler(event);
    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body)).toEqual({ success: false, error: 'Group not found' });
  });

  it('returns 200 with group data', async () => {
    const groupData = { groupKey: 'test-group', groupName: 'Test', members: [] };
    mockedDb.getGroup.mockResolvedValue(groupData);
    const event = makeEvent();
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ success: true, data: groupData });
  });

  it('returns 500 on database error', async () => {
    mockedDb.getGroup.mockRejectedValue(new Error('DB error'));
    const event = makeEvent();
    const result = await handler(event);
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body)).toEqual({ success: false, error: 'Internal server error' });
  });

  it('includes CORS headers', async () => {
    mockedDb.getGroup.mockResolvedValue(undefined);
    const event = makeEvent();
    const result = await handler(event);
    expect(result.headers).toEqual({
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    });
  });
});
