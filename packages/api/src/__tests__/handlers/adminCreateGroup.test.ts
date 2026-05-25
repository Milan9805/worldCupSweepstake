import { handler } from '../../handlers/adminCreateGroup';
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
    path: '/api/admin/groups',
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

describe('adminCreateGroup handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockedAdminLogin.verifyAdminToken.mockResolvedValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns 401 if unauthorized', async () => {
    mockedAdminLogin.verifyAdminToken.mockResolvedValue(false);
    const event = makeEvent({
      headers: { Authorization: 'Bearer invalid' },
      body: JSON.stringify({ groupKey: 'new-group', groupName: 'New Group' }),
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(401);
  });

  it('returns 400 if groupKey missing', async () => {
    const event = makeEvent({ body: JSON.stringify({ groupName: 'New Group' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toBe('groupKey and groupName are required');
  });

  it('returns 400 if groupName missing', async () => {
    const event = makeEvent({ body: JSON.stringify({ groupKey: 'new-group' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
  });

  it('returns 400 if groupKey is invalid', async () => {
    const event = makeEvent({
      body: JSON.stringify({ groupKey: 'Bad Key!', groupName: 'Bad' }),
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/lowercase/);
  });

  it('returns 409 if group already exists', async () => {
    mockedDb.getGroup.mockResolvedValue({ groupKey: 'existing', groupName: 'Existing', members: [] });
    const event = makeEvent({
      body: JSON.stringify({ groupKey: 'existing', groupName: 'Existing' }),
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(409);
    expect(mockedDb.putGroup).not.toHaveBeenCalled();
  });

  it('returns 201 and creates the group', async () => {
    mockedDb.getGroup.mockResolvedValue(undefined);
    mockedDb.putGroup.mockResolvedValue(undefined);

    const event = makeEvent({
      body: JSON.stringify({ groupKey: 'lads-on-tour', groupName: 'Lads on Tour' }),
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(201);
    expect(JSON.parse(result.body)).toEqual({
      success: true,
      data: { groupKey: 'lads-on-tour', groupName: 'Lads on Tour', members: [] },
    });
    expect(mockedDb.putGroup).toHaveBeenCalledWith({
      groupKey: 'lads-on-tour',
      groupName: 'Lads on Tour',
      members: [],
    });
  });

  it('trims whitespace around inputs', async () => {
    mockedDb.getGroup.mockResolvedValue(undefined);
    mockedDb.putGroup.mockResolvedValue(undefined);

    const event = makeEvent({
      body: JSON.stringify({ groupKey: '  new-group  ', groupName: '  New Group  ' }),
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(201);
    expect(mockedDb.putGroup).toHaveBeenCalledWith({
      groupKey: 'new-group',
      groupName: 'New Group',
      members: [],
    });
  });

  it('returns 500 on unexpected error', async () => {
    mockedDb.getGroup.mockRejectedValue(new Error('DB error'));
    const event = makeEvent({
      body: JSON.stringify({ groupKey: 'g1', groupName: 'G1' }),
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(500);
  });
});
