import { handler } from '../../handlers/adminMembers';
import { APIGatewayProxyEvent } from 'aws-lambda';
import * as db from '../../db/dynamodb';
import * as adminLogin from '../../handlers/adminLogin';

jest.mock('../../db/dynamodb');
jest.mock('../../handlers/adminLogin');

const mockedDb = db as jest.Mocked<typeof db>;
const mockedAdminLogin = adminLogin as jest.Mocked<typeof adminLogin>;

function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'POST',
    path: '/api/admin/members',
    pathParameters: null,
    queryStringParameters: null,
    headers: { Authorization: 'Bearer valid-token' },
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

describe('adminMembers handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockedAdminLogin.verifyAdminToken.mockReturnValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns 401 if unauthorized', async () => {
    mockedAdminLogin.verifyAdminToken.mockReturnValue(false);
    const event = makeEvent({
      headers: { Authorization: 'Bearer invalid' },
      body: JSON.stringify({ groupKey: 'g1', members: [] }),
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(401);
  });

  it('returns 401 when no token at all', async () => {
    mockedAdminLogin.verifyAdminToken.mockReturnValue(false);
    const event = makeEvent({
      headers: {},
      body: JSON.stringify({ groupKey: 'g1', members: [] }),
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(401);
  });

  it('handles lowercase authorization header', async () => {
    mockedAdminLogin.verifyAdminToken.mockReturnValue(true);
    mockedDb.getGroup.mockResolvedValue({ groupKey: 'g1', members: [] });
    mockedDb.putGroup.mockResolvedValue(undefined);
    const event = makeEvent({
      headers: { authorization: 'Bearer valid-token' },
      body: JSON.stringify({ groupKey: 'g1', members: [{ name: 'Test', imageUrl: null, teams: [] }] }),
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
  });

  it('returns 400 if groupKey missing', async () => {
    const event = makeEvent({
      body: JSON.stringify({ members: [] }),
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toBe('groupKey and members are required');
  });

  it('returns 400 if members missing', async () => {
    const event = makeEvent({
      body: JSON.stringify({ groupKey: 'g1' }),
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
  });

  it('returns 404 if group not found', async () => {
    mockedDb.getGroup.mockResolvedValue(undefined);
    const event = makeEvent({
      body: JSON.stringify({ groupKey: 'g1', members: [{ name: 'Alice', imageUrl: null, teams: [] }] }),
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body).error).toBe('Group not found');
  });

  it('returns 200 and updates members', async () => {
    mockedDb.getGroup.mockResolvedValue({ groupKey: 'g1', groupName: 'Test', members: [] });
    mockedDb.putGroup.mockResolvedValue(undefined);

    const newMembers = [{ name: 'Alice', imageUrl: null, teams: ['ENG'] }];
    const event = makeEvent({
      body: JSON.stringify({ groupKey: 'g1', members: newMembers }),
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({
      success: true,
      data: { groupKey: 'g1', members: newMembers },
    });
    expect(mockedDb.putGroup).toHaveBeenCalledWith({
      groupKey: 'g1',
      groupName: 'Test',
      members: newMembers,
    });
  });

  it('returns 500 on unexpected error', async () => {
    mockedDb.getGroup.mockRejectedValue(new Error('DB error'));
    const event = makeEvent({
      body: JSON.stringify({ groupKey: 'g1', members: [] }),
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(500);
  });
});
