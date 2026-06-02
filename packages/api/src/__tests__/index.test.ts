import { APIGatewayProxyEventV2 } from 'aws-lambda';

// Mock every downstream handler so we can verify dispatch without exercising
// real DynamoDB or external clients.
jest.mock('../handlers/getGroup', () => ({ handler: jest.fn() }));
jest.mock('../handlers/getMatches', () => ({ handler: jest.fn() }));
jest.mock('../handlers/getTeams', () => ({ handler: jest.fn() }));
jest.mock('../handlers/getTree', () => ({ handler: jest.fn() }));
jest.mock('../handlers/getBracket', () => ({ handler: jest.fn() }));
jest.mock('../handlers/refresh', () => ({ handler: jest.fn() }));
jest.mock('../handlers/adminLogin', () => ({ handler: jest.fn() }));
jest.mock('../handlers/adminMembers', () => ({ handler: jest.fn() }));
jest.mock('../handlers/adminAssign', () => ({ handler: jest.fn() }));
jest.mock('../handlers/adminUploadAvatar', () => ({ handler: jest.fn() }));

import { handler as dispatcher } from '../index';
import { handler as getGroupHandler } from '../handlers/getGroup';
import { handler as getMatchesHandler } from '../handlers/getMatches';
import { handler as getTeamsHandler } from '../handlers/getTeams';
import { handler as getTreeHandler } from '../handlers/getTree';
import { handler as getBracketHandler } from '../handlers/getBracket';
import { handler as refreshHandler } from '../handlers/refresh';
import { handler as adminLoginHandler } from '../handlers/adminLogin';
import { handler as adminMembersHandler } from '../handlers/adminMembers';
import { handler as adminAssignHandler } from '../handlers/adminAssign';
import { handler as adminUploadAvatarHandler } from '../handlers/adminUploadAvatar';

type MockedHandler = jest.MockedFunction<(typeof getGroupHandler)>;

function makeEvent(
  method: string,
  rawPath: string,
  overrides: Partial<APIGatewayProxyEventV2> = {},
): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: '$default',
    rawPath,
    rawQueryString: '',
    headers: { host: 'test' },
    requestContext: {
      http: { method, path: rawPath, protocol: 'HTTP/1.1', sourceIp: '127.0.0.1', userAgent: 'test' },
    } as APIGatewayProxyEventV2['requestContext'],
    isBase64Encoded: false,
    ...overrides,
  } as APIGatewayProxyEventV2;
}

const OK_RESPONSE = { statusCode: 200, body: 'ok' };

beforeEach(() => {
  jest.clearAllMocks();
  for (const h of [
    getGroupHandler, getMatchesHandler, getTeamsHandler, getTreeHandler,
    getBracketHandler, refreshHandler, adminLoginHandler, adminMembersHandler,
    adminAssignHandler, adminUploadAvatarHandler,
  ]) {
    (h as MockedHandler).mockResolvedValue(OK_RESPONSE);
  }
});

describe('Lambda dispatcher', () => {
  it('answers OPTIONS preflight with 200 + CORS headers', async () => {
    const result = await dispatcher(makeEvent('OPTIONS', '/api/anything'));
    expect(result).toMatchObject({
      statusCode: 200,
      headers: expect.objectContaining({
        'Access-Control-Allow-Origin': '*',
      }),
    });
  });

  it('returns 404 for unknown paths', async () => {
    const result = await dispatcher(makeEvent('GET', '/api/unknown'));
    expect(result).toMatchObject({ statusCode: 404 });
    expect(JSON.parse((result as { body: string }).body).success).toBe(false);
  });

  describe('route dispatch', () => {
    const cases: [string, string, MockedHandler][] = [
      ['GET', '/api/group/lads-on-tour', getGroupHandler as MockedHandler],
      ['GET', '/api/matches', getMatchesHandler as MockedHandler],
      ['GET', '/api/teams', getTeamsHandler as MockedHandler],
      ['GET', '/api/tree', getTreeHandler as MockedHandler],
      ['GET', '/api/bracket', getBracketHandler as MockedHandler],
      ['POST', '/api/refresh', refreshHandler as MockedHandler],
      ['POST', '/api/admin/login', adminLoginHandler as MockedHandler],
      ['POST', '/api/admin/members', adminMembersHandler as MockedHandler],
      ['POST', '/api/admin/assign', adminAssignHandler as MockedHandler],
      ['POST', '/api/admin/upload-avatar', adminUploadAvatarHandler as MockedHandler],
    ];

    it.each(cases)('routes %s %s to the matching handler', async (method, path, expected) => {
      await dispatcher(makeEvent(method, path));
      expect(expected).toHaveBeenCalledTimes(1);
    });
  });

  describe('toV1Event adapter', () => {
    it('extracts the :key path parameter for /api/group/:key', async () => {
      await dispatcher(makeEvent('GET', '/api/group/office-sweepstake'));
      const handed = (getGroupHandler as MockedHandler).mock.calls[0][0];
      expect(handed.pathParameters).toEqual({ key: 'office-sweepstake' });
    });

    it('passes through queryStringParameters, headers, and body', async () => {
      await dispatcher(
        makeEvent('POST', '/api/refresh', {
          queryStringParameters: { force: 'true' },
          headers: { authorization: 'Bearer abc', host: 'test' },
          body: '{"foo":1}',
        }),
      );
      const handed = (refreshHandler as MockedHandler).mock.calls[0][0];
      expect(handed.queryStringParameters).toEqual({ force: 'true' });
      expect(handed.headers).toEqual({ authorization: 'Bearer abc', host: 'test' });
      expect(handed.body).toBe('{"foo":1}');
      expect(handed.httpMethod).toBe('POST');
    });

    it('sets pathParameters to null when no :key is in the path', async () => {
      await dispatcher(makeEvent('GET', '/api/matches'));
      const handed = (getMatchesHandler as MockedHandler).mock.calls[0][0];
      expect(handed.pathParameters).toBeNull();
    });

    it('handles missing body and queryStringParameters', async () => {
      await dispatcher(makeEvent('GET', '/api/teams'));
      const handed = (getTeamsHandler as MockedHandler).mock.calls[0][0];
      expect(handed.body).toBeNull();
      expect(handed.queryStringParameters).toBeNull();
    });

    it('passes the client source IP through for IP-based rate limiting', async () => {
      await dispatcher(makeEvent('POST', '/api/admin/login'));
      const handed = (adminLoginHandler as MockedHandler).mock.calls[0][0];
      expect(handed.requestContext.identity.sourceIp).toBe('127.0.0.1');
    });
  });
});
