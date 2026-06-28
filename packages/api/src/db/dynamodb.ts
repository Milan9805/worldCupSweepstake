import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  BatchWriteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import { FeedEvent } from '@sweepstake/shared';

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
  events: `${TABLE_PREFIX}Events`,
};

// All feed events live under one partition so the feed is a single Query.
const FEED_PARTITION = 'FEED';

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

/**
 * Write many team rows in as few requests as possible — same chunk/retry shape
 * as {@link batchPutMatches}. Used by the stats refresh to persist the (usually
 * small) set of teams whose league record or card counts actually changed. A
 * no-op for an empty list.
 */
export async function batchPutTeams(teams: Record<string, unknown>[]): Promise<void> {
  const chunks: Record<string, unknown>[][] = [];
  for (let i = 0; i < teams.length; i += BATCH_WRITE_MAX) {
    chunks.push(teams.slice(i, i + BATCH_WRITE_MAX));
  }
  await Promise.all(chunks.map((chunk) => writeTeamChunk(chunk)));
}

async function writeTeamChunk(chunk: Record<string, unknown>[]): Promise<void> {
  let requestItems = {
    [tables.teams]: chunk.map((Item) => ({ PutRequest: { Item } })),
  };

  for (let attempt = 0; attempt < BATCH_WRITE_RETRIES; attempt++) {
    const result = await getDocClient().send(
      new BatchWriteCommand({ RequestItems: requestItems })
    );
    const unprocessed = result.UnprocessedItems;
    if (!unprocessed || Object.keys(unprocessed).length === 0) return;
    requestItems = unprocessed as typeof requestItems;
  }

  const dropped = requestItems[tables.teams]?.length ?? 0;
  if (dropped > 0) {
    console.error(`batchPutTeams: ${dropped} team write(s) still unprocessed after ${BATCH_WRITE_RETRIES} attempts`);
  }
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

/**
 * Persist a feed event. All events share the constant `feedId` partition and a
 * sort key of `ts#matchId#type#teamCode`, so the table is a single chronological
 * strip. The trailing `teamCode` differentiates events that share the same
 * ts/matchId/type within one refresh cycle — most importantly the two GOAL
 * events emitted when both sides score before the same poll (which otherwise
 * collide and silently overwrite each other). Events without a team (e.g.
 * KICKOFF, FULL_TIME, BRACKET_DRAWN) get an empty trailing segment, which is
 * still unique because only one such event of a given type exists per match.
 *
 * The `eventId` is appended last so the sort key is globally unique per logical
 * event even when several share the same ts/matchId/type/teamCode within one
 * poll — most importantly two bookings for the SAME team in one refresh (same
 * type + teamCode), which the teamCode segment alone cannot separate. Without it
 * the second PutItem would overwrite the first and drop a card from the feed.
 *
 * NOTE: the `sk` embeds `ts` (detection time), so re-detecting the same logical
 * event at a later poll APPENDS a new row rather than overwriting. The
 * deterministic `eventId` is the real idempotency key and is collapsed at read
 * time by `getRecentEvents` (newest wins). `detectEvents` only re-fires when a
 * match's stored score/status/actions actually change, so in practice this
 * churn is rare; the read-side dedupe keeps the feed correct regardless.
 */
export async function putEvent(event: FeedEvent) {
  await getDocClient().send(
    new PutCommand({
      TableName: tables.events,
      Item: {
        feedId: FEED_PARTITION,
        sk: `${event.ts}#${event.matchId ?? ''}#${event.type}#${event.teamCode ?? ''}#${event.eventId ?? ''}`,
        ...event,
      },
    })
  );
}

/**
 * Return the most recent feed events, newest first. Single-partition Query
 * (PK=FEED) with `ScanIndexForward=false` so we read off the end of the strip
 * without a table scan.
 *
 * Collapses any rows that share a deterministic `eventId`, keeping the newest.
 * The sort key embeds `ts` (set to detection time), so a logical event
 * re-detected at a later poll lands in a *new* row rather than overwriting —
 * the `eventId` is the true idempotency key, so we dedupe on it here at read
 * time. We over-fetch (the table is only a few hundred rows all tournament) so
 * that collapsing duplicates can't starve the caller of `limit` real events.
 */
export async function getRecentEvents(limit: number): Promise<FeedEvent[]> {
  const result = await getDocClient().send(
    new QueryCommand({
      TableName: tables.events,
      KeyConditionExpression: 'feedId = :feedId',
      ExpressionAttributeValues: { ':feedId': FEED_PARTITION },
      ScanIndexForward: false,
      Limit: Math.min(limit * 3, 600),
    })
  );
  return dedupeByEventId((result.Items || []) as FeedEvent[]).slice(0, limit);
}

/**
 * Keep the first occurrence of each `eventId` from an already newest-first list
 * (i.e. the most recent). Events with no `eventId` are passed through untouched.
 */
export function dedupeByEventId(events: FeedEvent[]): FeedEvent[] {
  const seen = new Set<string>();
  const out: FeedEvent[] = [];
  for (const event of events) {
    if (event.eventId) {
      if (seen.has(event.eventId)) continue;
      seen.add(event.eventId);
    }
    out.push(event);
  }
  return out;
}
