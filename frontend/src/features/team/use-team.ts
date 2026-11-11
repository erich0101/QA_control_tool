import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { usersApi, type UserInput } from '@/lib/api/users';
import { queryKeys } from '@/lib/query-keys';

export function useTeam() {
  return useQuery({
    queryKey: queryKeys.users,
    queryFn: usersApi.list,
    select: (data) => data.users ?? [],
    staleTime: 5 * 60_000,
  });
}

export function useUserMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.users });

  const create = useMutation({
    mutationFn: (input: UserInput) => usersApi.create(input),
    onSuccess: async () => {
      await invalidate();
      toast.success('Usuario creado');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const update = useMutation({
    mutationFn: ({ id, input }: { id: number; input: UserInput }) => usersApi.update(id, input),
    onSuccess: async () => {
      await invalidate();
      toast.success('Usuario actualizado');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return { create, update };
}
