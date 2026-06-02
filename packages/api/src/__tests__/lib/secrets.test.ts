import { getSecret, _resetSecretCacheForTests } from '../../lib/secrets';

const mockSend = jest.fn();

jest.mock('@aws-sdk/client-ssm', () => ({
  SSMClient: jest.fn(() => ({ send: mockSend })),
  GetParameterCommand: jest.fn((input) => ({ input })),
}));

describe('getSecret', () => {
  beforeEach(() => {
    mockSend.mockReset();
    _resetSecretCacheForTests();
    delete process.env.TEST_DIRECT;
    delete process.env.TEST_SSM_NAME;
  });

  it('returns env var value when set, without calling SSM', async () => {
    process.env.TEST_DIRECT = 'env-value';
    const value = await getSecret('TEST_DIRECT', 'TEST_SSM_NAME');
    expect(value).toBe('env-value');
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('fetches from SSM when env var not set', async () => {
    process.env.TEST_SSM_NAME = '/sweepstake/dev/some_secret';
    mockSend.mockResolvedValueOnce({ Parameter: { Value: 'ssm-value' } });
    const value = await getSecret('TEST_DIRECT', 'TEST_SSM_NAME');
    expect(value).toBe('ssm-value');
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('caches the SSM fetch across calls', async () => {
    process.env.TEST_SSM_NAME = '/sweepstake/dev/cached';
    mockSend.mockResolvedValueOnce({ Parameter: { Value: 'cached-value' } });
    await getSecret('TEST_DIRECT', 'TEST_SSM_NAME');
    await getSecret('TEST_DIRECT', 'TEST_SSM_NAME');
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('throws if neither env var nor SSM name is set', async () => {
    await expect(getSecret('TEST_DIRECT', 'TEST_SSM_NAME')).rejects.toThrow(/Secret not configured/);
  });

  it('throws if SSM returns no value', async () => {
    process.env.TEST_SSM_NAME = '/missing';
    mockSend.mockResolvedValueOnce({ Parameter: {} });
    await expect(getSecret('TEST_DIRECT', 'TEST_SSM_NAME')).rejects.toThrow(/has no value/);
  });

  it('does not cache failed lookups', async () => {
    process.env.TEST_SSM_NAME = '/retry';
    mockSend.mockRejectedValueOnce(new Error('boom'));
    mockSend.mockResolvedValueOnce({ Parameter: { Value: 'ok' } });
    await expect(getSecret('TEST_DIRECT', 'TEST_SSM_NAME')).rejects.toThrow('boom');
    const value = await getSecret('TEST_DIRECT', 'TEST_SSM_NAME');
    expect(value).toBe('ok');
    expect(mockSend).toHaveBeenCalledTimes(2);
  });
});
