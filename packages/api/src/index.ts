import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { handler as getGroupHandler } from './handlers/getGroup';
import { handler as getMatchesHandler } from './handlers/getMatches';
import { handler as getTeamsHandler } from './handlers/getTeams';
import { handler as getTreeHandler } from './handlers/getTree';
import { handler as getBracketHandler } from './handlers/getBracket';
import { handler as refreshHandler } from './handlers/refresh';
import { handler as adminLoginHandler } from './handlers/adminLogin';
import { handler as adminMembersHandler } from './handlers/adminMembers';
import { handler as adminAssignHandler } from './handlers/adminAssign';
import { handler as adminUploadAvatarHandler } from './handlers/adminUploadAvatar';

// Convert API Gateway v2 event to v1 format expected by handlers
function toV1Event(event: APIGatewayProxyEventV2) {
  const method = event.requestContext.http.method;
  const path = event.rawPath;

  // Extract path parameters from the path
  const pathParameters: Record<string, string> = {};
  const groupMatch = path.match(/\/api\/group\/(.+)/);
  if (groupMatch) {
    pathParameters.key = groupMatch[1];
  }

  return {
    httpMethod: method,
    path,
    pathParameters: Object.keys(pathParameters).length > 0 ? pathParameters : null,
    queryStringParameters: event.queryStringParameters || null,
    headers: event.headers as Record<string, string>,
    body: event.body || null,
    isBase64Encoded: event.isBase64Encoded,
    resource: '',
    stageVariables: null,
    requestContext: {} as any,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
  };
}

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const method = event.requestContext.http.method;
  const path = event.rawPath;

  // Handle CORS preflight requests
  if (method === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
      body: '',
    };
  }

  // Route requests to the appropriate handler
  if (method === 'GET' && path.startsWith('/api/group/')) {
    return getGroupHandler(toV1Event(event));
  }
  if (method === 'GET' && path === '/api/matches') {
    return getMatchesHandler(toV1Event(event));
  }
  if (method === 'GET' && path === '/api/teams') {
    return getTeamsHandler(toV1Event(event));
  }
  if (method === 'GET' && path === '/api/tree') {
    return getTreeHandler(toV1Event(event));
  }
  if (method === 'GET' && path === '/api/bracket') {
    return getBracketHandler(toV1Event(event));
  }
  if (method === 'POST' && path === '/api/refresh') {
    return refreshHandler(toV1Event(event));
  }
  if (method === 'POST' && path === '/api/admin/login') {
    return adminLoginHandler(toV1Event(event));
  }
  if (method === 'POST' && path === '/api/admin/members') {
    return adminMembersHandler(toV1Event(event));
  }
  if (method === 'POST' && path === '/api/admin/assign') {
    return adminAssignHandler(toV1Event(event));
  }
  if (method === 'POST' && path === '/api/admin/upload-avatar') {
    return adminUploadAvatarHandler(toV1Event(event));
  }

  return {
    statusCode: 404,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ success: false, error: 'Not found' }),
  };
}
