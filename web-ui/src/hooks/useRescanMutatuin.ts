import { useMutation, useQueryClient } from "@tanstack/react-query";
import { rescanPlaylist } from "../lib/api";

export function useRescanMutation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: rescanPlaylist,
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["playlist"] });
            await queryClient.invalidateQueries({ queryKey: ["status"] });
        },
    });
}