import { handler } from '../../handlers/adminUploadAvatar';
import { APIGatewayProxyEvent } from 'aws-lambda';
import * as adminLogin from '../../handlers/adminLogin';

jest.mock('../../handlers/adminLogin');
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({})),
  PutObjectCommand: jest.fn().mockImplementation((input) => input),
}));
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://signed-url.example.com'),
}));
jest.mock('crypto', () => ({
  randomUUID: jest.fn().mockReturnValue('test-uuid-1234'),
}));

const mockedAdminLogin = adminLogin as jest.Mocked<typeof adminLogin>;

function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'POST',
    path: '/api/admin/upload-avatar',
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

describe('adminUploadAvatar handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockedAdminLogin.verifyAdminToken.mockReturnValue(true);
    process.env.IS_LOCAL = 'true';
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterEach(() => {
    delete process.env.IS_LOCAL;
  });

  it('returns 401 if unauthorized', async () => {
    mockedAdminLogin.verifyAdminToken.mockReturnValue(false);
    const event = makeEvent({
      body: JSON.stringify({ groupKey: 'g1', personName: 'Alice', contentType: 'image/png' }),
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(401);
  });

  it('returns 400 if groupKey missing', async () => {
    const event = makeEvent({
      body: JSON.stringify({ personName: 'Alice', contentType: 'image/png' }),
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toBe('groupKey, personName, and contentType are required');
  });

  it('returns 400 if personName missing', async () => {
    const event = makeEvent({
      body: JSON.stringify({ groupKey: 'g1', contentType: 'image/png' }),
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
  });

  it('returns 400 if contentType missing', async () => {
    const event = makeEvent({
      body: JSON.stringify({ groupKey: 'g1', personName: 'Alice' }),
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
  });

  it('returns 400 for invalid content type', async () => {
    const event = makeEvent({
      body: JSON.stringify({ groupKey: 'g1', personName: 'Alice', contentType: 'application/pdf' }),
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toBe('Invalid content type');
  });

  it('returns 200 with upload URL for valid jpeg', async () => {
    const event = makeEvent({
      body: JSON.stringify({ groupKey: 'g1', personName: 'Alice', contentType: 'image/jpeg' }),
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.data.uploadUrl).toBe('https://signed-url.example.com');
    expect(body.data.imageUrl).toContain('test-uuid-1234');
  });

  it('returns 200 with upload URL for valid png', async () => {
    const event = makeEvent({
      body: JSON.stringify({ groupKey: 'g1', personName: 'Alice', contentType: 'image/png' }),
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
  });

  it('returns 200 with upload URL for valid webp', async () => {
    const event = makeEvent({
      body: JSON.stringify({ groupKey: 'g1', personName: 'Alice', contentType: 'image/webp' }),
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
  });

  it('returns 500 on unexpected error', async () => {
    mockedAdminLogin.verifyAdminToken.mockImplementation(() => {
      throw new Error('Unexpected');
    });
    const event = makeEvent({
      body: JSON.stringify({ groupKey: 'g1', personName: 'Alice', contentType: 'image/png' }),
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(500);
  });
});
