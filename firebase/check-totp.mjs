// Run in an authorized Google Cloud Shell: node check-totp.mjs
// Reads configuration only. Does not print or persist access tokens.
import { execFileSync } from 'node:child_process';

const project = 'techbrowser02';

try {
  const token = execFileSync('gcloud', ['auth', 'print-access-token', '--quiet'], {
    encoding: 'utf8',
    timeout: 60000,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  if (!token) throw new Error('No access token');
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/admin/v2/projects/${project}/config`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Goog-User-Project': project,
      },
      redirect: 'error',
      signal: AbortSignal.timeout(30000),
    },
  );
  if (!response.ok) {
    console.error(`Configuration read failed (HTTP ${response.status}); no change made.`);
    process.exitCode = 1;
  } else {
    const { mfa = {} } = await response.json();
    console.log(JSON.stringify({
      project,
      mfaState: mfa.state ?? 'UNSPECIFIED',
      totp: (mfa.providerConfigs ?? [])
        .filter((provider) => provider.totpProviderConfig)
        .map((provider) => ({
          state: provider.state ?? 'UNSPECIFIED',
          adjacentIntervals: provider.totpProviderConfig.adjacentIntervals ?? null,
        })),
    }, null, 2));
  }
} catch {
  console.error('Configuration could not be read; check Cloud Shell authorization. No change made.');
  process.exitCode = 1;
}
