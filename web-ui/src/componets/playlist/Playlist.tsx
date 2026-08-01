import type { FunctionComponent } from "react";
import { usePlaylistQuery } from "../../hooks/usePlaylistQuery";

interface PlaylistProps {

}

const Playlist: FunctionComponent<PlaylistProps> = () => {
    const { data, isPending, isError, error } = usePlaylistQuery();

    if (isPending) {
        return <div>Loading playlist...</div>;
    }

    if (isError) {
        return <div>Playlist error: {(error as Error).message}</div>;
    }
    console.log({ data })
    const tracks = data?.tracks ?? [];
    console.log({ tracks })

    return (
        <section>
            <h3>Library Tracks</h3>
            <p>{tracks.length} songs</p>

            <ul>
                {tracks.map((track, index) => (
                    <li key={`${track.filename}-${index}`}>
                        <div>{track.title || track.filename}</div>
                        <div>{track.artist || "Unknown Artist"}</div>
                    </li>
                ))}
            </ul>
        </section>
    );
}

export default Playlist;