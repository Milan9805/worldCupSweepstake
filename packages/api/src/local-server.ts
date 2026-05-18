// Set local mode BEFORE any imports that use process.env
process.env.IS_LOCAL = 'true';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

import express from 'express';
import cors from 'cors';
import { handler as getGroupHandler } from './handlers/getGroup';
import { handler as getMatchesHandler } from './handlers/getMatches';
import { handler as getTeamsHandler } from './handlers/getTeams';
import { handler as getTreeHandler } from './handlers/getTree';
import { handler as refreshHandler } from './handlers/refresh';
import { handler as adminLoginHandler } from './handlers/adminLogin';
import { handler as adminMembersHandler } from './handlers/adminMembers';
import { handler as adminAssignHandler } from './handlers/adminAssign';
import { handler as adminUploadAvatarHandler } from './handlers/adminUploadAvatar';
import { APIGatewayProxyEvent } from 'aws-lambda';

const app = express();
app.use(cors());
app.use(express.json());

// Helper to convert Express req to Lambda event
function toLambdaEvent(req: express.Request): APIGatewayProxyEvent {
  return {
    httpMethod: req.method,
    path: req.path,
    pathParameters: req.params,
    queryStringParameters: req.query as Record<string, string>,
    headers: req.headers as Record<string, string>,
    body: req.body ? JSON.stringify(req.body) : null,
    isBase64Encoded: false,
    resource: '',
    stageVariables: null,
    requestContext: {} as unknown as APIGatewayProxyEvent['requestContext'],
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
  };
}

// Routes
app.get('/api/group/:key', async (req, res) => {
  const event = toLambdaEvent(req);
  const result = await getGroupHandler(event);
  res.status(result.statusCode).json(JSON.parse(result.body));
});

app.get('/api/matches', async (req, res) => {
  const event = toLambdaEvent(req);
  const result = await getMatchesHandler(event);
  res.status(result.statusCode).json(JSON.parse(result.body));
});

app.get('/api/teams', async (req, res) => {
  const event = toLambdaEvent(req);
  const result = await getTeamsHandler(event);
  res.status(result.statusCode).json(JSON.parse(result.body));
});

app.get('/api/tree', async (req, res) => {
  const event = toLambdaEvent(req);
  const result = await getTreeHandler(event);
  res.status(result.statusCode).json(JSON.parse(result.body));
});

app.post('/api/refresh', async (req, res) => {
  const event = toLambdaEvent(req);
  const result = await refreshHandler(event);
  res.status(result.statusCode).json(JSON.parse(result.body));
});

app.post('/api/admin/login', async (req, res) => {
  const event = toLambdaEvent(req);
  const result = await adminLoginHandler(event);
  res.status(result.statusCode).json(JSON.parse(result.body));
});

app.post('/api/admin/members', async (req, res) => {
  const event = toLambdaEvent(req);
  const result = await adminMembersHandler(event);
  res.status(result.statusCode).json(JSON.parse(result.body));
});

app.post('/api/admin/assign', async (req, res) => {
  const event = toLambdaEvent(req);
  const result = await adminAssignHandler(event);
  res.status(result.statusCode).json(JSON.parse(result.body));
});

app.post('/api/admin/upload-avatar', async (req, res) => {
  const event = toLambdaEvent(req);
  const result = await adminUploadAvatarHandler(event);
  res.status(result.statusCode).json(JSON.parse(result.body));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 API server running at http://localhost:${PORT}`);
  console.log(`   DynamoDB Local expected at http://localhost:8000`);
});
