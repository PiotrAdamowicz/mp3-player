import { useQuery } from "@tanstack/react-query";
import { getPlaylist } from "../lib/api";

export function usePlaylistQuery() {
    return useQuery({
        queryKey: ["playlist"],
        queryFn: getPlaylist,
        staleTime: 0,
        gcTime: 1000 * 60 * 2,
        refetchOnMount: true,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
    });
}