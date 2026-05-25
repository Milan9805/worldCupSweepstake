import { handler, verifyAdminToken, _resetRateLimitForTests } from '../../handlers/adminLogin';
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

function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}, ip = '1.2.3.4'): APIGatewayProxyEvent {
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
    requestContext: { identity: { sourceIp: ip } } as APIGatewayProxyEvent['requestContext'],
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    ...overrides,
  };
}

describe('adminLogin handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    _resetRateLimitForTests();
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

  it('returns 429 after MAX_ATTEMPTS failed logins from the same IP', async () => {
    mockedDb.getConfig.mockResolvedValue({ configKey: 'adminSecret', value: '$2a$10$hash' });
    (mockedBcrypt.compare as jest.Mock).mockResolvedValue(false as never);

    for (let i = 0; i < 5; i++) {
      const result = await handler(makeEvent({ body: JSON.stringify({ secret: 'wrong' }) }));
      expect(result.statusCode).toBe(401);
    }

    const blocked = await handler(makeEvent({ body: JSON.stringify({ secret: 'wrong' }) }));
    expect(blocked.statusCode).toBe(429);
    expect(blocked.headers).toMatchObject({ 'Retry-After': expect.any(String) });
    expect(JSON.parse(blocked.body).error).toMatch(/too many/i);
  });

  it('tracks failed attempts per IP independently', async () => {
    mockedDb.getConfig.mockResolvedValue({ configKey: 'adminSecret', value: '$2a$10$hash' });
    (mockedBcrypt.compare as jest.Mock).mockResolvedValue(false as never);

    for (let i = 0; i < 5; i++) {
      await handler(makeEvent({ body: JSON.stringify({ secret: 'wrong' }) }, '1.1.1.1'));
    }

    const otherIp = await handler(makeEvent({ body: JSON.stringify({ secret: 'wrong' }) }, '2.2.2.2'));
    expect(otherIp.statusCode).toBe(401);
  });

  it('clears rate-limit counter on successful login', async () => {
    mockedDb.getConfig.mockResolvedValue({ configKey: 'adminSecret', value: '$2a$10$hash' });
    (mockedBcrypt.compare as jest.Mock)
      .mockResolvedValueOnce(false as never)
      .mockResolvedValueOnce(false as never)
      .mockResolvedValueOnce(true as never)
      .mockResolvedValueOnce(false as never);
    (mockedJwt.sign as jest.Mock).mockReturnValue('fake-token');

    await handler(makeEvent({ body: JSON.stringify({ secret: 'wrong' }) }));
    await handler(makeEvent({ body: JSON.stringify({ secret: 'wrong' }) }));
    const ok = await handler(makeEvent({ body: JSON.stringify({ secret: 'right' }) }));
    expect(ok.statusCode).toBe(200);

    const next = await handler(makeEvent({ body: JSON.stringify({ secret: 'wrong' }) }));
    expect(next.statusCode).toBe(401);
  });

  it('returns 500 if JWT_SECRET env var is missing', async () => {
    mockedDb.getConfig.mockResolvedValue({ configKey: 'adminSecret', value: '$2a$10$hash' });
    (mockedBcrypt.compare as jest.Mock).mockResolvedValue(true as never);
    const original = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;
    try {
      const result = await handler(makeEvent({ body: JSON.stringify({ secret: 'correct' }) }));
      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).error).toBe('Internal server error');
    } finally {
      process.env.JWT_SECRET = original;
    }
  });
});

describe('verifyAdminToken', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns true for valid admin token', async () => {
    (mockedJwt.verify as jest.Mock).mockReturnValue({ role: 'admin' });
    await expect(verifyAdminToken('valid-token')).resolves.toBe(true);
  });

  it('returns false for non-admin role', async () => {
    (mockedJwt.verify as jest.Mock).mockReturnValue({ role: 'user' });
    await expect(verifyAdminToken('valid-token')).resolves.toBe(false);
  });

  it('returns false for invalid token', async () => {
    (mockedJwt.verify as jest.Mock).mockImplementation(() => {
      throw new Error('invalid token');
    });
    await expect(verifyAdminToken('invalid-token')).resolves.toBe(false);
  });

  it('returns false if JWT_SECRET is unset and no SSM name configured', async () => {
    const original = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;
    try {
      await expect(verifyAdminToken('any-token')).resolves.toBe(false);
    } finally {
      process.env.JWT_SECRET = original;
    }
  });
});
