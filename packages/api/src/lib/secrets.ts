import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

let ssmClient: SSMClient | undefined;
const cache = new Map<string, Promise<string>>();

function getClient(): SSMClient {
  if (!ssmClient) {
    ssmClient = new SSMClient({});
  }
  return ssmClient;
}

async function fetchFromSsm(parameterName: string): Promise<string> {
  const result = await getClient().send(
    new GetParameterCommand({ Name: parameterName, WithDecryption: true }),
  );
  const value = result.Parameter?.Value;
  if (!value) {
    throw new Error(`SSM parameter ${parameterName} has no value`);
  }
  return value;
}

export async function getSecret(envVarName: string, ssmNameEnvVar: string): Promise<string> {
  const direct = process.env[envVarName];
  if (direct) {
    return direct;
  }

  const ssmName = process.env[ssmNameEnvVar];
  if (!ssmName) {
    throw new Error(
      `Secret not configured: set ${envVarName} for local dev or ${ssmNameEnvVar} pointing to an SSM parameter`,
    );
  }

  const cached = cache.get(ssmName);
  if (cached) {
    return cached;
  }

  const pending = fetchFromSsm(ssmName).catch((err) => {
    cache.delete(ssmName);
    throw err;
  });
  cache.set(ssmName, pending);
  return pending;
}

export function _resetSecretCacheForTests(): void {
  cache.clear();
  ssmClient = undefined;
}
