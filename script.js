

document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const menuItems = document.querySelectorAll('.menu-item');
    const nowPlaying = document.querySelector('.now-playing');
    const songTitle = document.querySelector('.song-title');
    const artist = document.querySelector('.artist');
    const progressBar = document.querySelector('.progress');
    const spotifyLogin = document.getElementById('spotify-login');
    const loginButton = document.getElementById('login-button');
    const spotifyPlaylists = document.querySelector('.spotify-playlists');
    const playlistItems = document.querySelector('.playlist-items');
    
    // Buttons
    const menuButton = document.querySelector('.menu-button');
    const forwardButton = document.querySelector('.forward-button');
    const backwardButton = document.querySelector('.backward-button');
    const playPauseButton = document.querySelector('.play-pause');
    const centerButton = document.querySelector('.center-button');

    let currentMenuIndex = 0;
    let accessToken = null;
    let currentPlaylist = null;
    let isPlaying = false;
    let currentTrackUri = null;
    let pollingInterval = null;

    // Helper function to handle API responses
    async function handleSpotifyResponse(response) {
        if (response.status === 204) {
            return null;
        }
        
        if (response.status === 401) {
            // Token expired or invalid
            spotifyLogin.classList.remove('hidden');
            document.querySelector('.menu-items').classList.add('hidden');
            throw new Error('Authentication expired');
        }

        if (response.status === 403) {
            alert('This action requires Spotify Premium. Some features may be limited.');
            throw new Error('Premium required');
        }

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        // Only try to parse JSON if we have content
        const contentLength = response.headers.get('content-length');
        if (contentLength && contentLength !== '0') {
            return await response.json();
        }
        
        return null;
    }

    // Spotify Authentication
    function loginToSpotify() {
        const state = generateRandomString(16);
        localStorage.setItem('spotify_auth_state', state);

        const url = 'https://accounts.spotify.com/authorize?' +
            'response_type=token' +
            '&client_id=' + encodeURIComponent(CLIENT_ID) +
            '&scope=' + encodeURIComponent(SCOPES.join(' ')) +
            '&redirect_uri=' + encodeURIComponent(REDIRECT_URI) +
            '&state=' + encodeURIComponent(state) +
            '&show_dialog=true'; // Force showing the auth dialog

        window.location = url;
    }

    function checkCallback() {
        const hash = window.location.hash
            .substring(1)
            .split('&')
            .reduce((initial, item) => {
                const parts = item.split('=');
                initial[parts[0]] = decodeURIComponent(parts[1]);
                return initial;
            }, {});

        if (hash.access_token) {
            accessToken = hash.access_token;
            window.history.pushState("", document.title, window.location.pathname);
            spotifyLogin.classList.add('hidden');
            document.querySelector('.menu-items').classList.remove('hidden');
            fetchPlaylists();
            startPlaybackStatePolling();
        } else {
            spotifyLogin.classList.remove('hidden');
            document.querySelector('.menu-items').classList.add('hidden');
        }
    }

    // Spotify API Calls
    async function fetchPlaylists() {
        try {
            const response = await fetch('https://api.spotify.com/v1/me/playlists', {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });
            const data = await handleSpotifyResponse(response);
            if (data && data.items) {
                renderPlaylists(data.items);
            }
        } catch (error) {
            console.error('Error fetching playlists:', error);
        }
    }

    function renderPlaylists(playlists) {
        playlistItems.innerHTML = '';
        playlists.forEach((playlist, index) => {
            const div = document.createElement('div');
            div.className = 'playlist-item';
            div.textContent = playlist.name;
            div.dataset.uri = playlist.uri;
            div.dataset.index = index;
            div.addEventListener('click', () => playPlaylist(playlist.uri));
            playlistItems.appendChild(div);
        });
    }

    async function playPlaylist(uri) {
        try {
            const devicesResponse = await fetch('https://api.spotify.com/v1/me/player/devices', {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });
            const devicesData = await handleSpotifyResponse(devicesResponse);

            if (!devicesData || devicesData.devices.length === 0) {
                alert('No active Spotify devices found. Please open Spotify on any device.');
                return;
            }

            // Try to play on the first active device
            const activeDevice = devicesData.devices.find(device => device.is_active) || devicesData.devices[0];

            const playResponse = await fetch('https://api.spotify.com/v1/me/player/play' + (activeDevice ? `?device_id=${activeDevice.id}` : ''), {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    context_uri: uri
                })
            });
            await handleSpotifyResponse(playResponse);
            
            currentPlaylist = uri;
            nowPlaying.classList.remove('hidden');
            spotifyPlaylists.classList.add('hidden');
        } catch (error) {
            console.error('Error playing playlist:', error);
            if (error.message !== 'Premium required') {
                alert('Please make sure Spotify is open and playing on one of your devices');
            }
        }
    }

    async function togglePlayback() {
        try {
            const stateResponse = await fetch('https://api.spotify.com/v1/me/player', {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });
            const state = await handleSpotifyResponse(stateResponse);

            if (!state) {
                alert('No active playback found. Please start playing something on Spotify.');
                return;
            }

            const endpoint = state.is_playing ? 'pause' : 'play';
            const response = await fetch(`https://api.spotify.com/v1/me/player/${endpoint}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });
            await handleSpotifyResponse(response);
            isPlaying = !state.is_playing;
        } catch (error) {
            console.error('Error toggling playback:', error);
        }
    }

    async function skipTrack(direction) {
        try {
            const response = await fetch(`https://api.spotify.com/v1/me/player/${direction}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });
            await handleSpotifyResponse(response);
        } catch (error) {
            console.error('Error skipping track:', error);
        }
    }

    function startPlaybackStatePolling() {
        // Clear existing interval if any
        if (pollingInterval) {
            clearInterval(pollingInterval);
        }

        pollingInterval = setInterval(async () => {
            try {
                const response = await fetch('https://api.spotify.com/v1/me/player', {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`
                    }
                });
                
                const data = await handleSpotifyResponse(response);
                if (data && data.item) {
                    songTitle.textContent = data.item.name;
                    artist.textContent = data.item.artists.map(artist => artist.name).join(', ');
                    const progress = (data.progress_ms / data.item.duration_ms) * 100;
                    progressBar.style.width = `${progress}%`;
                    isPlaying = data.is_playing;
                }
            } catch (error) {
                if (error.message === 'Authentication expired') {
                    clearInterval(pollingInterval);
                }
                console.error('Error fetching playback state:', error);
            }
        }, 1000);
    }

    // Button Controls
    loginButton.addEventListener('click', loginToSpotify);

    menuButton.addEventListener('click', () => {
        nowPlaying.classList.add('hidden');
        spotifyPlaylists.classList.add('hidden');
        document.querySelector('.menu-items').classList.remove('hidden');
    });

    centerButton.addEventListener('click', () => {
        const selectedMenu = menuItems[currentMenuIndex].textContent;
        if (selectedMenu === 'Now Playing') {
            nowPlaying.classList.remove('hidden');
            spotifyPlaylists.classList.add('hidden');
            document.querySelector('.menu-items').classList.add('hidden');
        } else if (selectedMenu === 'Spotify Playlists') {
            spotifyPlaylists.classList.remove('hidden');
            nowPlaying.classList.add('hidden');
            document.querySelector('.menu-items').classList.add('hidden');
        }
    });

    playPauseButton.addEventListener('click', () => {
        if (accessToken) {
            togglePlayback();
        }
    });

    forwardButton.addEventListener('click', () => {
        if (document.querySelector('.menu-items').classList.contains('hidden')) {
            if (accessToken) {
                skipTrack('next');
            }
        } else {
            currentMenuIndex = (currentMenuIndex + 1) % menuItems.length;
            updateMenuSelection();
        }
    });

    backwardButton.addEventListener('click', () => {
        if (document.querySelector('.menu-items').classList.contains('hidden')) {
            if (accessToken) {
                skipTrack('previous');
            }
        } else {
            currentMenuIndex = (currentMenuIndex - 1 + menuItems.length) % menuItems.length;
            updateMenuSelection();
        }
    });

    // Menu navigation
    function updateMenuSelection() {
        menuItems.forEach((item, index) => {
            item.classList.toggle('active', index === currentMenuIndex);
        });
    }

    // Utility function
    function generateRandomString(length) {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < length; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

    // Initialize
    checkCallback();
}); 