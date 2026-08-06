import type { FunctionComponent } from "react";
import { usePlaylistQuery } from "../../hooks/usePlaylistQuery";

interface PlaylistProps {

}

const Playlist: FunctionComponent<PlaylistProps> = () => {
    const { data, isPending, isError, error } = usePlaylistQuery();

    if (isPending) {
        return (
            <div className="w-full text-center">
                <span className="loading loading-spinner loading-xl my-50 bg-primary"></span>
            </div>)
    }

    if (isError) {
        return (
            <div className="w-full text-center">
                <div className="my-50 text-error text-xl">Playlist error: {(error as Error).message}</div>
            </div>
        )
    }

    const tracks = data?.tracks ?? [];


    return (
        <section className="mx-auto flex justify-center flex-col max-w-2xl text-center gap-4">
            <h3 className="my-2 text-4xl font-bold">Playlist Name</h3>
            <p className="my-1 text-2xl font-semibold">{tracks.length} songs</p>

            <ul className="list bg-base-100 rounded-box shadow-md">
                {tracks.map((track, index) => (
                    <li className="text-start my-2 text-xl flex" key={`${track.filename}-${index}`}>
                        <div>{track.title || track.filename}</div><span className="mx-2"> - </span>
                        <div>{track.artist || "Unknown Artist"}</div>
                    </li>
                ))}
            </ul>
        </section>
    );
}

export default Playlist;