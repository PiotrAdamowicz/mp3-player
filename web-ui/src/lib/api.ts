export type Track = {
    title?: string;
    artist?: string;
    album?: string;
    filename: string;
    is_current?: boolean;
};

export async function getPlaylist(): Promise<{ tracks: Track[] }> {
    const res = await fetch("/api/playlist", {
        headers: {
            Accept: "application/json",
        },
        cache: "no-store",
    });

    const contentType = res.headers.get("content-type") || "";

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to fetch playlist: ${res.status} ${text}`);
    }

    if (!contentType.includes("application/json")) {
        const text = await res.text();
        throw new Error(`Expected JSON, got ${contentType}: ${text.slice(0, 200)}`);
    }

    return res.json();
}

export async function rescanPlaylist() {
    const res = await fetch("/api/rescan", { method: "POST" });
    if (!res.ok) throw new Error("Rescan failed");
    return res.json();
}

export async function getStatus() {
    const res = await fetch("/api/status");

    if (!res.ok) {
        throw new Error(`Failed to fetch status: ${res.status}`)
    }

    return res.json()
}