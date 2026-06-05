import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  BatchWriteCommand,
  DeleteCommand,
  GetCommand,
  PutCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';

const BATCH_WRITE_MAX = 25; // DynamoDB BatchWriteItem hard limit per request
const BATCH_WRITE_RETRIES = 3;

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

/**
 * Write many match rows in as few requests as possible. Chunks into the 25-item
 * BatchWriteItem limit, runs the chunks concurrently, and retries any items
 * DynamoDB returns unprocessed. A no-op for an empty list, so callers can pass
 * the (often small) set of changed matches without guarding first.
 */
export async function batchPutMatches(matches: Record<string, unknown>[]): Promise<void> {
  const chunks: Record<string, unknown>[][] = [];
  for (let i = 0; i < matches.length; i += BATCH_WRITE_MAX) {
    chunks.push(matches.slice(i, i + BATCH_WRITE_MAX));
  }
  await Promise.all(chunks.map((chunk) => writeMatchChunk(chunk)));
}

async function writeMatchChunk(chunk: Record<string, unknown>[]): Promise<void> {
  let requestItems = {
    [tables.matches]: chunk.map((Item) => ({ PutRequest: { Item } })),
  };

  for (let attempt = 0; attempt < BATCH_WRITE_RETRIES; attempt++) {
    const result = await getDocClient().send(
      new BatchWriteCommand({ RequestItems: requestItems })
    );
    const unprocessed = result.UnprocessedItems;
    if (!unprocessed || Object.keys(unprocessed).length === 0) return;
    requestItems = unprocessed as typeof requestItems;
  }

  // Still unprocessed after all retries (sustained throttling). Don't fail the
  // whole refresh — the next scheduled/poll cycle will pick these up — but log
  // loudly so the dropped writes are visible in CloudWatch rather than silent.
  const dropped = requestItems[tables.matches]?.length ?? 0;
  if (dropped > 0) {
    console.error(`batchPutMatches: ${dropped} match write(s) still unprocessed after ${BATCH_WRITE_RETRIES} attempts`);
  }
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
