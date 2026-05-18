import { handler } from '../../handlers/refresh';
import { APIGatewayProxyEvent } from 'aws-lambda';
import * as refreshService from '../../services/refresh';

jest.mock('../../services/refresh');

const mockedRefreshService = refreshService as jest.Mocked<typeof refreshService>;

function makeEvent(): APIGatewayProxyEvent {
  return {
    httpMethod: 'POST',
    path: '/api/refresh',
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

describe('refresh handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns 200 with refreshed data', async () => {
    const data = { matches: [], teams: [] };
    mockedRefreshService.refreshData.mockResolvedValue(data as never);
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ success: true, data });
  });

  it('returns 500 on error', async () => {
    mockedRefreshService.refreshData.mockRejectedValue(new Error('API down'));
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body)).toEqual({ success: false, error: 'Internal server error' });
  });
});
