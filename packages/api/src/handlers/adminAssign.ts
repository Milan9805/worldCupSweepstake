import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getGroup, putGroup } from '../db/dynamodb';
import { verifyAdminToken } from './adminLogin';

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const authHeader = event.headers['Authorization'] || event.headers['authorization'];
    const token = authHeader?.replace('Bearer ', '');

    if (!token || !verifyAdminToken(token)) {
      return {
        statusCode: 401,
        headers: corsHeaders(),
        body: JSON.stringify({ success: false, error: 'Unauthorized' }),
      };
    }

    const body = JSON.parse(event.body || '{}');
    const { groupKey, assignments } = body;

    if (!groupKey || !assignments) {
      return {
        statusCode: 400,
        headers: corsHeaders(),
        body: JSON.stringify({ success: false, error: 'groupKey and assignments are required' }),
      };
    }

    const existing = await getGroup(groupKey);
    if (!existing) {
      return {
        statusCode: 404,
        headers: corsHeaders(),
        body: JSON.stringify({ success: false, error: 'Group not found' }),
      };
    }

    // Update team assignments for each member
    const updatedMembers = existing.members.map((member: { name: string; teams: string[] }) => {
      const assignment = assignments.find(
        (a: { personName: string }) => a.personName === member.name
      );
      if (assignment) {
        return { ...member, teams: assignment.teams };
      }
      return member;
    });

    await putGroup({ ...existing, members: updatedMembers });

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({ success: true, data: { groupKey, members: updatedMembers } }),
    };
  } catch (error) {
    console.error('Error assigning teams:', error);
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ success: false, error: 'Internal server error' }),
    };
  }
}

function corsHeaders() {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  };
}
