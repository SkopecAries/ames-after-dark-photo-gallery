import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { useRoles } from '../RoleContext';

const ALBUMS_API = 'https://api.amesafterdark.com/api/r2/albums';
const PHOTOS_API = 'https://api.amesafterdark.com/api/r2/photos';

export default function Photographer() {
    const { isAuthenticated, isLoading, logout } = useAuth0();
    const { isAdmin, isCheckingRole } = useRoles();
    const navigate = useNavigate();
    const devPreviewMode = import.meta.env.DEV && new URLSearchParams(window.location.search).get('preview') === '1';

    const [albums, setAlbums] = useState([]);
    const [loadingAlbums, setLoadingAlbums] = useState(true);
    const [albumsError, setAlbumsError] = useState('');

    const [selectedAlbum, setSelectedAlbum] = useState(null);
    const [photos, setPhotos] = useState([]);
    const [loadingPhotos, setLoadingPhotos] = useState(false);
    const [photosError, setPhotosError] = useState('');

    useEffect(() => {
        if (devPreviewMode) return;
        if (!isLoading && !isAuthenticated) {
            navigate('/login');
        }
    }, [devPreviewMode, isLoading, isAuthenticated, navigate]);

    useEffect(() => {
        if (devPreviewMode) return;
        if (!isAuthenticated || isCheckingRole || isAdmin === null) return;

        if (isAdmin !== 'photographer' && isAdmin !== 'superadmin') {
            navigate('/dashboard');
        }
    }, [devPreviewMode, isAuthenticated, isCheckingRole, isAdmin, navigate]);

    useEffect(() => {
        if (devPreviewMode) {
            loadAlbums();
            return;
        }

        if (!isAuthenticated || isCheckingRole || isAdmin === null) return;
        if (isAdmin !== 'photographer' && isAdmin !== 'superadmin') return;

        loadAlbums();
    }, [devPreviewMode, isAuthenticated, isCheckingRole, isAdmin]);

    const loadAlbums = async () => {
        try {
            setLoadingAlbums(true);
            setAlbumsError('');

            const response = await fetch(ALBUMS_API);
            if (!response.ok) throw new Error(`Album API failed: ${response.status}`);

            const data = await response.json();
            setAlbums(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error('Failed to load albums:', error);
            setAlbumsError('Failed to load albums. Please try again.');
        } finally {
            setLoadingAlbums(false);
        }
    };

    const openAlbum = async (album) => {
        setSelectedAlbum(album);
        setPhotos([]);
        setPhotosError('');
        setLoadingPhotos(true);

        try {
            const url = `${PHOTOS_API}?prefix=${encodeURIComponent(album.albumUri)}`;
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Photo API failed: ${response.status}`);

            const data = await response.json();
            setPhotos(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error('Failed to load photos:', error);
            setPhotosError('Error loading photos for this album.');
        } finally {
            setLoadingPhotos(false);
        }
    };

    const goBackToAlbums = () => {
        setSelectedAlbum(null);
        setPhotos([]);
        setPhotosError('');
    };

    const hidePhoto = async (e, photoId) => {
        e.preventDefault();
        e.stopPropagation();

        if (!window.confirm("Are you sure you want to hide this photo from the app?")) return;

        setPhotos(prevPhotos => prevPhotos.filter(p => p.id !== photoId));

        try {
            const response = await fetch(`${PHOTOS_API}/hide`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: photoId }),
            });

            if (!response.ok) throw new Error(`Failed to hide photo: ${response.status}`);
        } catch (error) {
            console.error("Error hiding photo:", error);
            alert("Something went wrong hiding the photo. Please refresh and try again.");
        }
    };

    if (!devPreviewMode && (isLoading || isCheckingRole || isAdmin === null)) {
        return (
            <main className="photoPage section">
                <div className="container">
                    <div className="photoLoading" role="status" aria-live="polite">
                        <span className="photoSpinner" aria-hidden="true"></span>
                        <p className="sub">Loading photographer portal...</p>
                    </div>
                </div>
            </main>
        );
    }

    return (
        <>
            <div className="bg" aria-hidden="true">
                <div className="orb orb--pink"></div>
                <div className="orb orb--cyan"></div>
                <div className="grid"></div>
                <div className="noise"></div>
            </div>

            <header className="header">
                <div className="container header__inner">
                    <Link className="brand" to="/" aria-label="Ames After Dark Home">
                        <img
                            className="brand__topbar"
                            src="/assets/topBar.png"
                            alt="Ames After Dark"
                            onError={(e) => {
                                e.target.style.display = 'none';
                            }}
                        />
                    </Link>
                    <div className="header__actions">
                        <Link className="btn btn--ghost" to="/dashboard">Dashboard</Link>
                        <button
                            className="btn btn--primary"
                            type="button"
                            onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
                        >
                            Log out
                        </button>
                    </div>
                </div>
            </header>

            <main className="photoPage section">
                <div className="container">
                    {devPreviewMode && (
                        <p className="sub" style={{ marginBottom: '12px' }}>
                            Preview mode is active. Auth and role checks are bypassed in local development only.
                        </p>
                    )}

                    {!selectedAlbum && (
                        <section>
                            <div className="photoHead">
                                <h1 className="h2 photoTitle">Photographer Albums</h1>
                                <p className="sub">Browse all Ames After Dark albums.</p>
                            </div>

                            {loadingAlbums && (
                                <div className="photoLoading" role="status" aria-live="polite">
                                    <span className="photoSpinner" aria-hidden="true"></span>
                                    <p className="sub">Loading albums...</p>
                                </div>
                            )}
                            {albumsError && <p className="photoError">{albumsError}</p>}

                            {!loadingAlbums && !albumsError && (
                                <div className="photoGrid" role="list">
                                    {albums.map((album) => (
                                        <button
                                            key={album.albumUri}
                                            className="photoCard"
                                            type="button"
                                            onClick={() => openAlbum(album)}
                                            role="listitem"
                                        >
                                            <img
                                                className="photoCard__cover"
                                                src={album.coverUrl}
                                                alt={album.name}
                                                loading="lazy"
                                            />
                                            <div className="photoCard__body">
                                                <h3 className="photoCard__title">{album.name}</h3>
                                                <p className="photoCard__date">{album.date}</p>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </section>
                    )}

                    {selectedAlbum && (
                        <section>
                            <div className="photoHead">
                                <button className="btn btn--ghost" type="button" onClick={goBackToAlbums}>
                                    Back to albums
                                </button>
                                <div>
                                    <h2 className="h2">{selectedAlbum.name}</h2>
                                    <p className="sub">Hover over an image to hide it, or click to view full size.</p>
                                </div>
                            </div>

                            {loadingPhotos && (
                                <div className="photoLoading" role="status" aria-live="polite">
                                    <span className="photoSpinner" aria-hidden="true"></span>
                                    <p className="sub">Loading photos...</p>
                                </div>
                            )}
                            {photosError && <p className="photoError">{photosError}</p>}
                            {!loadingPhotos && !photosError && photos.length === 0 && (
                                <p className="sub">No photos found in this album.</p>
                            )}

                            {!loadingPhotos && !photosError && photos.length > 0 && (
                                <div className="photoThumbGrid">
                                    {photos.map((photo) => {
                                        const photoUrl = photo?.image?.uri;
                                        if (!photoUrl) return null;

                                        return (
                                            <div key={photo.id} className="photoThumbWrap">
                                                <button 
                                                    className="hideBtn" 
                                                    onClick={(e) => hidePhoto(e, photo.id)}
                                                    aria-label="Hide photo"
                                                >
                                                    Hide Photo
                                                </button>
                                                <a className="photoThumb" href={photoUrl} target="_blank" rel="noreferrer">
                                                    <img src={photoUrl} alt="Event capture" loading="lazy" />
                                                </a>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </section>
                    )}
                </div>
            </main>
        </>
    );
}
