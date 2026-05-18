import { handler } from '../../handlers/adminAssign';
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
    path: '/api/admin/assign',
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

describe('adminAssign handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockedAdminLogin.verifyAdminToken.mockReturnValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns 401 if no auth token', async () => {
    const event = makeEvent({ headers: {} });
    mockedAdminLogin.verifyAdminToken.mockReturnValue(false);
    const result = await handler(event);
    expect(result.statusCode).toBe(401);
    expect(JSON.parse(result.body)).toEqual({ success: false, error: 'Unauthorized' });
  });

  it('returns 401 if token is invalid', async () => {
    mockedAdminLogin.verifyAdminToken.mockReturnValue(false);
    const event = makeEvent({
      body: JSON.stringify({ groupKey: 'g1', assignments: [] }),
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(401);
  });

  it('returns 400 if groupKey is missing', async () => {
    const event = makeEvent({
      body: JSON.stringify({ assignments: [] }),
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toBe('groupKey and assignments are required');
  });

  it('returns 400 if assignments is missing', async () => {
    const event = makeEvent({
      body: JSON.stringify({ groupKey: 'g1' }),
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
  });

  it('returns 404 if group not found', async () => {
    mockedDb.getGroup.mockResolvedValue(undefined);
    const event = makeEvent({
      body: JSON.stringify({ groupKey: 'g1', assignments: [{ personName: 'Alice', teams: ['ENG'] }] }),
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body).error).toBe('Group not found');
  });

  it('returns 200 and updates team assignments', async () => {
    const existing = {
      groupKey: 'g1',
      members: [
        { name: 'Alice', teams: [] },
        { name: 'Bob', teams: ['GER'] },
      ],
    };
    mockedDb.getGroup.mockResolvedValue(existing);
    mockedDb.putGroup.mockResolvedValue(undefined);

    const event = makeEvent({
      body: JSON.stringify({
        groupKey: 'g1',
        assignments: [{ personName: 'Alice', teams: ['ENG', 'BRA'] }],
      }),
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.data.members[0].teams).toEqual(['ENG', 'BRA']);
    expect(body.data.members[1].teams).toEqual(['GER']); // unchanged
  });

  it('returns 500 on unexpected error', async () => {
    mockedDb.getGroup.mockRejectedValue(new Error('DB error'));
    const event = makeEvent({
      body: JSON.stringify({ groupKey: 'g1', assignments: [] }),
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(500);
  });

  it('handles lowercase authorization header', async () => {
    mockedAdminLogin.verifyAdminToken.mockReturnValue(true);
    mockedDb.getGroup.mockResolvedValue({ groupKey: 'g1', members: [] });
    mockedDb.putGroup.mockResolvedValue(undefined);

    const event = makeEvent({
      headers: { authorization: 'Bearer valid-token' },
      body: JSON.stringify({ groupKey: 'g1', assignments: [] }),
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
  });
});
