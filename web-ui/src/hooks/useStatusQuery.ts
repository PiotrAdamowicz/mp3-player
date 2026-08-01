import { useQuery } from "@tanstack/react-query";
import { getStatus } from "../lib/api";

export function useStatusQuery() {
    return useQuery({
        queryKey: ["status"],
        queryFn: getStatus,
        staleTime: 0,
        refetchInterval: 1000,
        refetchIntervalInBackground: true,
        refetchOnWindowFocus: false,
    });
} 