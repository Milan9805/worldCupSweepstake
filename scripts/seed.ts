/**
 * Seed script for DynamoDB Local.
 * Seeds the database with initial World Cup data for local development.
 * If FOOTBALL_DATA_API_KEY is set, fetches real fixtures from football-data.org.
 *
 * Usage: npx ts-node scripts/seed.ts
 * Requires DynamoDB Local running on port 8000.
 */

import { DynamoDBClient, CreateTableCommand, ListTablesCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import * as fs from 'fs';
import * as path from 'path';
import * as bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '..', '.env') });


const client = new DynamoDBClient({
  endpoint: 'http://localhost:8000',
  region: 'local',
  credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
});

const docClient = DynamoDBDocumentClient.from(client);

const TABLE_PREFIX = process.env.TABLE_PREFIX || '';

const TABLES = [
  {
    TableName: `${TABLE_PREFIX}Groups`,
    KeySchema: [{ AttributeName: 'groupKey', KeyType: 'HASH' as const }],
    AttributeDefinitions: [{ AttributeName: 'groupKey', AttributeType: 'S' as const }],
  },
  {
    TableName: `${TABLE_PREFIX}Matches`,
    KeySchema: [{ AttributeName: 'matchId', KeyType: 'HASH' as const }],
    AttributeDefinitions: [{ AttributeName: 'matchId', AttributeType: 'S' as const }],
  },
  {
    TableName: `${TABLE_PREFIX}Teams`,
    KeySchema: [{ AttributeName: 'teamCode', KeyType: 'HASH' as const }],
    AttributeDefinitions: [{ AttributeName: 'teamCode', AttributeType: 'S' as const }],
  },
  {
    TableName: `${TABLE_PREFIX}TournamentTree`,
    KeySchema: [
      { AttributeName: 'round', KeyType: 'HASH' as const },
      { AttributeName: 'position', KeyType: 'RANGE' as const },
    ],
    AttributeDefinitions: [
      { AttributeName: 'round', AttributeType: 'S' as const },
      { AttributeName: 'position', AttributeType: 'N' as const },
    ],
  },
  {
    TableName: `${TABLE_PREFIX}Config`,
    KeySchema: [{ AttributeName: 'configKey', KeyType: 'HASH' as const }],
    AttributeDefinitions: [{ AttributeName: 'configKey', AttributeType: 'S' as const }],
  },
  {
    TableName: `${TABLE_PREFIX}Events`,
    KeySchema: [
      { AttributeName: 'feedId', KeyType: 'HASH' as const },
      { AttributeName: 'sk', KeyType: 'RANGE' as const },
    ],
    AttributeDefinitions: [
      { AttributeName: 'feedId', AttributeType: 'S' as const },
      { AttributeName: 'sk', AttributeType: 'S' as const },
    ],
  },
];

async function createTables() {
  const existing = await client.send(new ListTablesCommand({}));
  const existingNames = existing.TableNames || [];

  for (const table of TABLES) {
    if (existingNames.includes(table.TableName)) {
      console.log(`  Table ${table.TableName} already exists, skipping.`);
      continue;
    }
    await client.send(
      new CreateTableCommand({
        ...table,
        BillingMode: 'PAY_PER_REQUEST',
      })
    );
    console.log(`  ✅ Created table: ${table.TableName}`);
  }
}

async function seedData() {
  const seedPath = path.join(__dirname, '..', 'data', 'seed.json');
  const seed = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));

  // Seed groups
  console.log('\n📦 Seeding groups...');
  for (const group of seed.groups) {
    await docClient.send(
      new PutCommand({ TableName: `${TABLE_PREFIX}Groups`, Item: group })
    );
    console.log(`  ✅ ${group.groupName} (${group.groupKey})`);
  }

  // Seed teams with default stats
  console.log('\n📦 Seeding teams...');
  for (const team of seed.teams) {
    const teamWithStats = {
      ...team,
      stats: {
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
        points: 0,
        yellowCards: 0,
        redCards: 0,
        possession: null,
        xG: null,
      },
      eliminated: false,
      eliminatedAt: null,
    };
    await docClient.send(
      new PutCommand({ TableName: `${TABLE_PREFIX}Teams`, Item: teamWithStats })
    );
    console.log(`  ✅ ${team.name} (${team.teamCode})`);
  }

  // Seed matches - fetch from football-data.org if API key is available, otherwise use seed.json
  console.log('\n📦 Seeding matches...');
  const apiKey = process.env.FOOTBALL_DATA_API_KEY;
  if (apiKey) {
    console.log('  🌐 Fetching real fixtures from football-data.org...');
    const matches = await fetchFixturesFromApi(apiKey);
    if (matches.length > 0) {
      for (const match of matches) {
        await docClient.send(
          new PutCommand({ TableName: `${TABLE_PREFIX}Matches`, Item: match })
        );
      }
      console.log(`  ✅ Loaded ${matches.length} fixtures from football-data.org`);
    } else {
      console.log('  ⚠️  No fixtures returned from API, falling back to seed data');
      await seedMatchesFromFile(seed.matches);
    }
  } else {
    console.log('  ℹ️  No FOOTBALL_DATA_API_KEY set, using seed.json fixtures');
    await seedMatchesFromFile(seed.matches);
  }

  // Seed config (admin secret)
  console.log('\n📦 Seeding config...');
  const hashedSecret = await bcrypt.hash('sweepstake-admin-2026', 10);
  await docClient.send(
    new PutCommand({
      TableName: `${TABLE_PREFIX}Config`,
      Item: { configKey: 'adminSecret', value: hashedSecret },
    })
  );
  console.log('  ✅ Admin secret set (password: sweepstake-admin-2026)');
}

async function seedMatchesFromFile(matches: any[]) {
  for (const match of matches) {
    await docClient.send(
      new PutCommand({ TableName: `${TABLE_PREFIX}Matches`, Item: match })
    );
    console.log(`  ✅ ${match.homeTeam} vs ${match.awayTeam}`);
  }
}

const COMPETITION_ID = 2000; // FIFA World Cup

function mapStatus(status: string): 'SCHEDULED' | 'LIVE' | 'FINISHED' {
  switch (status) {
    case 'FINISHED':
      return 'FINISHED';
    case 'IN_PLAY':
    case 'PAUSED':
    case 'HALFTIME':
      return 'LIVE';
    default:
      return 'SCHEDULED';
  }
}

function mapStage(stage: string): string {
  const stageMap: Record<string, string> = {
    GROUP_STAGE: 'GROUP_STAGE',
    LAST_32: 'ROUND_OF_32',
    LAST_16: 'ROUND_OF_16',
    QUARTER_FINALS: 'QUARTER_FINAL',
    SEMI_FINALS: 'SEMI_FINAL',
    FINAL: 'FINAL',
    THIRD_PLACE: 'THIRD_PLACE',
  };
  return stageMap[stage] || stage;
}

async function fetchFixturesFromApi(apiKey: string): Promise<any[]> {
  const response = await fetch(
    `https://api.football-data.org/v4/competitions/${COMPETITION_ID}/matches`,
    { headers: { 'X-Auth-Token': apiKey } }
  );

  if (!response.ok) {
    console.error(`  ❌ API returned ${response.status}: ${response.statusText}`);
    return [];
  }

  const data: any = await response.json();
  const matches: any[] = data.matches || [];

  return matches.map((m: any) => ({
    matchId: String(m.id),
    homeTeam: m.homeTeam.tla,
    awayTeam: m.awayTeam.tla,
    homeScore: m.score.fullTime.home,
    awayScore: m.score.fullTime.away,
    status: mapStatus(m.status),
    stage: mapStage(m.stage),
    group: m.group ? m.group.replace('GROUP_', '') : null,
    datetime: m.utcDate,
    venue: m.venue || 'TBC',
  }));
}

async function main() {
  console.log('🚀 Sweepstake Database Seed Script');
  console.log('===================================\n');
  console.log('📋 Creating tables...');

  try {
    await createTables();
    await seedData();
    console.log('\n✨ Seeding complete! You can now start the API server.');
    console.log('\n📌 Test credentials:');
    console.log('   Group keys: "lads-on-tour", "office-sweepstake"');
    console.log('   Admin secret: "sweepstake-admin-2026"');
  } catch (error: any) {
    if (error.name === 'ECONNREFUSED' || error.code === 'ECONNREFUSED') {
      console.error('\n❌ Could not connect to DynamoDB Local.');
      console.error('   Make sure it is running: docker run -p 8000:8000 amazon/dynamodb-local');
    } else {
      console.error('\n❌ Error:', error.message);
    }
    process.exit(1);
  }
}

main();
