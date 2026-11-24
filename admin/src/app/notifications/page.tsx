import NavLink from '@/components/NavLink';
import { createServiceClient } from '@/lib/supabase-server';
import { createAuthServerClient } from '@/lib/supabase-server-actions';
import SignOutButton from '@/components/SignOutButton';
import CheckDeliveryButton from './CheckDeliveryButton';
import SendForm from './SendForm';

export const dynamic = 'force-dynamic';

type SendRow = {
  id: string;
  title: string;
  body: string;
  url: string | null;
  environments: string[];
  recipient_count: number;
  error_count: number;
  created_at: string;
  receipts_checked_at: string | null;
};

async function countEnabled(environments: string[]): Promise<number> {
  const supabase = createServiceClient();
  const { count, error } = await supabase
    .from('push_tokens')
    .select('id', { count: 'exact', head: true })
    .eq('enabled', true)
    .in('environment', environments);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default async function NotificationsPage() {
  const auth = await createAuthServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();

  const service = createServiceClient();
  const [productionCount, allCount, sendsResult] = await Promise.all([
    countEnabled(['production']),
    countEnabled(['production', 'preview', 'development']),
    service
      .from('push_sends')
      .select(
        'id, title, body, url, environments, recipient_count, error_count, created_at, receipts_checked_at',
      )
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  if (sendsResult.error) throw new Error(sendsResult.error.message);
  const sends = (sendsResult.data ?? []) as SendRow[];

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <header className="mb-8 flex items-center justify-between gap-4">
        <div>
          <NavLink href="/" className="text-sm text-gray-400 hover:text-gray-200">
            Dashboard
          </NavLink>
          <h1 className="mt-1 text-2xl font-bold">Notifications</h1>
          <p className="mt-1 text-sm text-gray-400">Signed in as {user?.email}</p>
        </div>
        <SignOutButton />
      </header>

      <SendForm productionCount={productionCount} allCount={allCount} />

      <p className="mt-3 text-xs text-gray-500">
        Delivery receipts are usually ready within a few minutes. Expo recommends waiting about 15
        minutes before checking.
      </p>

      <h2 className="mb-3 mt-10 text-xs font-semibold uppercase tracking-wider text-gray-500">
        Recent sends
      </h2>
      {sends.length === 0 ? (
        <p className="text-sm text-gray-500">No notifications sent yet.</p>
      ) : (
        <ul className="space-y-3">
          {sends.map((send) => (
            <li
              key={send.id}
              className="flex items-start justify-between gap-4 rounded-xl border border-gray-800 bg-gray-900 p-4"
            >
              <div className="min-w-0">
                <p className="font-semibold">{send.title}</p>
                <p className="mt-1 text-sm text-gray-300">{send.body}</p>
                <p className="mt-2 text-xs text-gray-500">
                  {formatWhen(send.created_at)} · {send.recipient_count} devices
                  {send.error_count > 0 ? ` · ${send.error_count} failed` : ''} ·{' '}
                  {send.environments.join(', ')}
                  {send.url ? ` · ${send.url}` : ''}
                </p>
                {send.receipts_checked_at && (
                  <p className="mt-1 text-xs text-gray-500">
                    Receipts checked {formatWhen(send.receipts_checked_at)}
                  </p>
                )}
              </div>
              <CheckDeliveryButton sendId={send.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
