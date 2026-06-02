import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  DeleteCommand,
  GetCommand,
  PutCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';

let _docClient: DynamoDBDocumentClient | null = null;

function getDocClient(): DynamoDBDocumentClient {
  if (!_docClient) {
    const isLocal = process.env.IS_LOCAL === 'true';
    const client = new DynamoDBClient(
      isLocal
        ? {
            endpoint: 'http://localhost:8000',
            region: 'local',
            credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
          }
        : {}
    );
    _docClient = DynamoDBDocumentClient.from(client);
  }
  return _docClient;
}

const TABLE_PREFIX = process.env.TABLE_PREFIX || '';

export const tables = {
  groups: `${TABLE_PREFIX}Groups`,
  matches: `${TABLE_PREFIX}Matches`,
  teams: `${TABLE_PREFIX}Teams`,
  tree: `${TABLE_PREFIX}TournamentTree`,
  config: `${TABLE_PREFIX}Config`,
};

export async function getGroup(groupKey: string) {
  const result = await getDocClient().send(
    new GetCommand({
      TableName: tables.groups,
      Key: { groupKey },
    })
  );
  return result.Item;
}

export async function putGroup(group: Record<string, unknown>) {
  await getDocClient().send(
    new PutCommand({
      TableName: tables.groups,
      Item: group,
    })
  );
}

export async function getAllTeams() {
  const result = await getDocClient().send(
    new ScanCommand({ TableName: tables.teams })
  );
  return result.Items || [];
}

export async function putTeam(team: Record<string, unknown>) {
  await getDocClient().send(
    new PutCommand({
      TableName: tables.teams,
      Item: team,
    })
  );
}

export async function getAllMatches() {
  const result = await getDocClient().send(
    new ScanCommand({ TableName: tables.matches })
  );
  return result.Items || [];
}

export async function putMatch(match: Record<string, unknown>) {
  await getDocClient().send(
    new PutCommand({
      TableName: tables.matches,
      Item: match,
    })
  );
}

export async function getTree() {
  const result = await getDocClient().send(
    new ScanCommand({ TableName: tables.tree })
  );
  return result.Items || [];
}

export async function putTreeSlot(slot: Record<string, unknown>) {
  await getDocClient().send(
    new PutCommand({
      TableName: tables.tree,
      Item: slot,
    })
  );
}

export async function clearTree() {
  const items = await getTree();
  for (const item of items) {
    await getDocClient().send(
      new DeleteCommand({
        TableName: tables.tree,
        Key: { round: item.round, position: item.position },
      })
    );
  }
}

export async function getConfig(configKey: string) {
  const result = await getDocClient().send(
    new GetCommand({
      TableName: tables.config,
      Key: { configKey },
    })
  );
  return result.Item;
}

export async function putConfig(configKey: string, value: string) {
  await getDocClient().send(
    new PutCommand({
      TableName: tables.config,
      Item: { configKey, value },
    })
  );
}
