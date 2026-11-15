'use server';

import { revalidatePath } from 'next/cache';
import { isAdminEmail } from '@/lib/admin-auth';
import { createAuthServerClient } from '@/lib/supabase-server-actions';
import { createServiceClient } from '@/lib/supabase-server';

const SEMVER_RE = /^\d+\.\d+\.\d+$/;

function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

async function assertAdmin(): Promise<string | null> {
  const supabase = await createAuthServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isAdminEmail(user?.email)) {
    return 'You are not allowed to change version settings.';
  }
  return null;
}

export type UpdateVersionGateResult = {
  ok: boolean;
  error?: string;
};

export async function updateVersionGate(input: {
  platform: 'ios' | 'android';
  minVersion: string;
  latestVersion: string;
}): Promise<UpdateVersionGateResult> {
  const denied = await assertAdmin();
  if (denied) return { ok: false, error: denied };

  const { platform, minVersion, latestVersion } = input;

  if (!SEMVER_RE.test(minVersion)) {
    return { ok: false, error: `Invalid minimum version: "${minVersion}".` };
  }
  if (!SEMVER_RE.test(latestVersion)) {
    return { ok: false, error: `Invalid latest version: "${latestVersion}".` };
  }
  if (compareSemver(latestVersion, minVersion) < 0) {
    return { ok: false, error: 'Latest version must be greater than or equal to minimum version.' };
  }

  const supabase = createServiceClient();
  const { error } = await supabase
    .from('app_min_versions')
    .upsert(
      {
        platform,
        min_version: minVersion,
        latest_version: latestVersion,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'platform' },
    );

  if (error) return { ok: false, error: error.message };

  revalidatePath('/versions');
  return { ok: true };
}
