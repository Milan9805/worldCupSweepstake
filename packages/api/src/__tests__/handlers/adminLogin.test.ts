import { handler, verifyAdminToken } from '../../handlers/adminLogin';
import { APIGatewayProxyEvent } from 'aws-lambda';
import * as db from '../../db/dynamodb';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';

jest.mock('../../db/dynamodb');
jest.mock('bcryptjs');
jest.mock('jsonwebtoken');

const mockedDb = db as jest.Mocked<typeof db>;
const mockedBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;
const mockedJwt = jwt as jest.Mocked<typeof jwt>;

function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'POST',
    path: '/api/admin/login',
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
    ...overrides,
  };
}

describe('adminLogin handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns 400 if secret is missing', async () => {
    const event = makeEvent({ body: JSON.stringify({}) });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({ success: false, error: 'Secret is required' });
  });

  it('returns 400 if body is empty', async () => {
    const event = makeEvent({ body: null });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toBe('Secret is required');
  });

  it('returns 500 if admin not configured', async () => {
    mockedDb.getConfig.mockResolvedValue(undefined);
    const event = makeEvent({ body: JSON.stringify({ secret: 'test' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body)).toEqual({ success: false, error: 'Admin not configured' });
  });

  it('returns 401 if secret is invalid', async () => {
    mockedDb.getConfig.mockResolvedValue({ configKey: 'adminSecret', value: '$2a$10$hash' });
    (mockedBcrypt.compare as jest.Mock).mockResolvedValue(false as never);
    const event = makeEvent({ body: JSON.stringify({ secret: 'wrong' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(401);
    expect(JSON.parse(result.body)).toEqual({ success: false, error: 'Invalid secret' });
  });

  it('returns 200 with token on valid secret', async () => {
    mockedDb.getConfig.mockResolvedValue({ configKey: 'adminSecret', value: '$2a$10$hash' });
    (mockedBcrypt.compare as jest.Mock).mockResolvedValue(true as never);
    (mockedJwt.sign as jest.Mock).mockReturnValue('fake-token');
    const event = makeEvent({ body: JSON.stringify({ secret: 'correct' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ success: true, data: { token: 'fake-token' } });
  });

  it('returns 500 on unexpected error', async () => {
    mockedDb.getConfig.mockRejectedValue(new Error('DB error'));
    const event = makeEvent({ body: JSON.stringify({ secret: 'test' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body)).toEqual({ success: false, error: 'Internal server error' });
  });

  it('includes CORS headers', async () => {
    const event = makeEvent({ body: JSON.stringify({}) });
    const result = await handler(event);
    expect(result.headers).toEqual({
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    });
  });
});

describe('verifyAdminToken', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns true for valid admin token', () => {
    (mockedJwt.verify as jest.Mock).mockReturnValue({ role: 'admin' });
    expect(verifyAdminToken('valid-token')).toBe(true);
  });

  it('returns false for non-admin role', () => {
    (mockedJwt.verify as jest.Mock).mockReturnValue({ role: 'user' });
    expect(verifyAdminToken('valid-token')).toBe(false);
  });

  it('returns false for invalid token', () => {
    (mockedJwt.verify as jest.Mock).mockImplementation(() => {
      throw new Error('invalid token');
    });
    expect(verifyAdminToken('invalid-token')).toBe(false);
  });
});
