import * as Api from "@/lib/_core/api";
import * as Auth from "@/lib/_core/auth";
import { trpc } from "@/lib/trpc";

export function useOwnerEmailSession() {
  const utils = trpc.useUtils();
  const status = trpc.ownerEmail.status.useQuery(undefined, { retry: false, staleTime: 30_000 });
  const login = trpc.ownerEmail.login.useMutation({
    onSuccess: async (result) => {
      await Auth.setSessionToken(result.token);
      await Auth.setUserInfo({ ...result.user, lastSignedIn: new Date(result.user.lastSignedIn) });
      await utils.ownerEmail.status.invalidate();
    },
  });

  const logout = async () => {
    await Api.logout().catch(() => undefined);
    await Auth.removeSessionToken();
    await Auth.clearUserInfo();
    await utils.ownerEmail.status.invalidate();
  };

  return { authenticated: status.data?.authenticated ?? false, loading: status.isLoading, error: status.error, login, logout, refresh: status.refetch };
}
