const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

document.addEventListener('DOMContentLoaded', async () => {
    // Load views
    const viewContainer = document.getElementById('view-container');
    const menuView = fs.readFileSync(path.join(__dirname, 'views/menu-view.html'), 'utf8');
    const playlistView = fs.readFileSync(path.join(__dirname, 'views/playlist-view.html'), 'utf8');
    
    // Add all views to container
    viewContainer.innerHTML = menuView + playlistView;

    // Elements
    const menuItems = document.querySelectorAll('.menu-item');
    const nowPlaying = document.querySelector('.now-playing');
    const songTitle = document.querySelector('.song-title');
    const artist = document.querySelector('.artist');
    const progressBar = document.querySelector('.progress');
    const playlistsContainer = document.querySelector('.playlists');
    const playlistItems = document.querySelector('.playlist-items');
    const albumArt = document.getElementById('album-art');
    const audioPlayer = document.getElementById('audio-player');
    const menuContainer = document.querySelector('.menu-items');
    
    // Buttons
    const menuButton = document.querySelector('.menu-button');
    const forwardButton = document.querySelector('.forward-button');
    const backwardButton = document.querySelector('.backward-button');
    const playPauseButton = document.querySelector('.play-pause');
    const centerButton = document.querySelector('.center-button');
    const minimizeBtn = document.querySelector('.minimize-btn');
    const closeBtn = document.querySelector('.close-btn');

    let currentMenuIndex = 0;
    let currentPlaylist = null;
    let currentSongIndex = 0;
    let isPlaying = false;

    // Initialize empty playlist array and try to load default playlist
    let playlistsArray = [];
    try {
        const kanyePlaylist = require('./playlists/kanye.js');
        if (kanyePlaylist) {
            playlistsArray.push(kanyePlaylist);
        }
    } catch (error) {
        console.warn('Default playlist not found, starting with empty library');
    }

    // Window controls
    minimizeBtn.addEventListener('click', () => {
        ipcRenderer.send('minimize-window');
    });

    closeBtn.addEventListener('click', () => {
        ipcRenderer.send('close-window');
    });

    // Fix the showView function
    function showView(viewToShow) {
        window.currentView = viewToShow;
        
        // First hide everything
        [nowPlaying, playlistsContainer, menuContainer].forEach(view => {
            if (view) {
                view.classList.add('hidden');
                view.style.display = 'none';
            }
        });
        
        if (viewToShow) {
            viewToShow.classList.remove('hidden');
            viewToShow.style.display = 'block';
            
            const menuTitle = document.querySelector('.menu-title');
            if (menuTitle) {
                menuTitle.style.display = (viewToShow === menuContainer) ? 'block' : 'none';
                menuTitle.textContent = getViewTitle(viewToShow);
            }
        }
    }

    // Helper function to get the title for each view
    function getViewTitle(view) {
        if (view === menuContainer) return 'iPod';
        if (view === playlistsContainer) return 'Playlists';
        if (view === nowPlaying) return 'Now Playing';
        return 'iPod';
    }

    // Audio player controls
    function formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    function loadSong(playlist, index) {
        const song = playlist.songs[index];
        audioPlayer.src = song.path;
        songTitle.textContent = song.title;
        artist.textContent = playlist.name;
        
        if (song.artwork) {
            albumArt.src = song.artwork;
            albumArt.style.display = 'block';
        } else {
            albumArt.style.display = 'none';
        }

        // Reset time display
        document.querySelector('.current-time').textContent = '0:00';
        document.querySelector('.total-time').textContent = '0:00';
        
        if (isPlaying) {
            audioPlayer.play();
        }
    }

    audioPlayer.addEventListener('timeupdate', () => {
        const progress = (audioPlayer.currentTime / audioPlayer.duration) * 100;
        progressBar.style.width = `${progress}%`;
        
        // Update time display
        document.querySelector('.current-time').textContent = formatTime(audioPlayer.currentTime);
        document.querySelector('.total-time').textContent = formatTime(audioPlayer.duration);
    });

    audioPlayer.addEventListener('ended', () => {
        if (currentPlaylist) {
            currentSongIndex = (currentSongIndex + 1) % currentPlaylist.songs.length;
            loadSong(currentPlaylist, currentSongIndex);
        }
    });

    // Import playlist
    async function importPlaylist() {
        const playlist = await ipcRenderer.invoke('import-playlist');
        if (playlist) {
            playlistsArray.push(playlist);
            await savePlaylists(); // Save after importing
            renderPlaylists();
        }
    }

    function renderPlaylists() {
        playlistItems.innerHTML = '';
        if (playlistsArray.length === 0) {
            const div = document.createElement('div');
            div.className = 'playlist-item';
            div.textContent = 'No playlists - Import one!';
            playlistItems.appendChild(div);
            return;
        }

        playlistsArray.forEach((playlist, index) => {
            const div = document.createElement('div');
            div.className = 'playlist-item';
            div.textContent = playlist.name;
            div.addEventListener('click', () => {
                currentPlaylist = playlist;
                currentSongIndex = 0;
                loadSong(playlist, 0);
                showView(nowPlaying);
                isPlaying = true;
                playPauseButton.textContent = '❚❚';
                audioPlayer.play();
            });
            playlistItems.appendChild(div);
        });
    }

    // Modify the centerButton click handler
    centerButton.addEventListener('click', () => {
        console.log('Center button clicked');
        const selectedMenu = menuItems[currentMenuIndex].textContent;
        switch (selectedMenu) {
            case 'Now Playing':
                if (currentPlaylist) {
                    showView(nowPlaying);
                }
                break;
            case 'Playlists':
                renderPlaylists();
                showView(playlistsContainer);
                break;
            case 'Import Playlist':
                importPlaylist();
                break;
        }
    });

    // Modify button handlers to be more reliable
    forwardButton.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent event bubbling
        
        if (window.currentView === menuContainer) {
            currentMenuIndex = (currentMenuIndex + 1) % menuItems.length;
            updateMenuSelection();
        } else if (currentPlaylist) {
            currentSongIndex = (currentSongIndex + 1) % currentPlaylist.songs.length;
            loadSong(currentPlaylist, currentSongIndex);
        }
    });

    backwardButton.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent event bubbling
        
        if (window.currentView === menuContainer) {
            currentMenuIndex = (currentMenuIndex - 1 + menuItems.length) % menuItems.length;
            updateMenuSelection();
        } else if (currentPlaylist) {
            currentSongIndex = (currentSongIndex - 1 + currentPlaylist.songs.length) % currentPlaylist.songs.length;
            loadSong(currentPlaylist, currentSongIndex);
        }
    });

    menuButton.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent event bubbling
        showView(menuContainer);
        updateMenuSelection();
    });

    // Button Controls
    playPauseButton.addEventListener('click', () => {
        if (audioPlayer.src) {
            if (isPlaying) {
                audioPlayer.pause();
            } else {
                audioPlayer.play();
            }
            isPlaying = !isPlaying;
            playPauseButton.textContent = isPlaying ? '❚❚' : '▶';
        }
    });

    // Menu navigation
    function updateMenuSelection() {
        menuItems.forEach((item, index) => {
            item.classList.toggle('active', index === currentMenuIndex);
        });
    }

    // Add this function to debug click events
    function addClickDebug() {
        const buttons = document.querySelectorAll('button');
        buttons.forEach(button => {
            button.addEventListener('click', (e) => {
                console.log('Button clicked:', e.target.className);
            });
        });
    }

    // Call this after DOMContentLoaded
    addClickDebug();

    // Ensure menu is visible on initialization
    async function initialize() {
        showView(menuContainer);
        
        // Load saved playlists
        const savedPlaylists = await ipcRenderer.invoke('load-playlists');
        if (savedPlaylists && savedPlaylists.length > 0) {
            playlistsArray = savedPlaylists;
        } else {
            // Try to load default playlist if no saved playlists
            try {
                const kanyePlaylist = require('./playlists/kanye.js');
                if (kanyePlaylist) {
                    playlistsArray = [kanyePlaylist];
                }
            } catch (error) {
                playlistsArray = [];
            }
        }
        
        updateMenuSelection();
        window.currentView = menuContainer;
    }

    // Add progress bar drag functionality
    const progressBarContainer = document.querySelector('.progress-bar');
    
    progressBarContainer.addEventListener('click', (e) => {
        if (!audioPlayer.duration) return;
        
        const rect = progressBarContainer.getBoundingClientRect();
        const pos = (e.clientX - rect.left) / rect.width;
        audioPlayer.currentTime = pos * audioPlayer.duration;
    });

    progressBarContainer.addEventListener('mousemove', (e) => {
        if (e.buttons === 1) { // Check if mouse button is held down
            const rect = progressBarContainer.getBoundingClientRect();
            const pos = (e.clientX - rect.left) / rect.width;
            audioPlayer.currentTime = pos * audioPlayer.duration;
        }
    });

    // Touch support for mobile devices
    progressBarContainer.addEventListener('touchstart', (e) => {
        const rect = progressBarContainer.getBoundingClientRect();
        const pos = (e.touches[0].clientX - rect.left) / rect.width;
        audioPlayer.currentTime = pos * audioPlayer.duration;
    });

    progressBarContainer.addEventListener('touchmove', (e) => {
        e.preventDefault();
        const rect = progressBarContainer.getBoundingClientRect();
        const pos = (e.touches[0].clientX - rect.left) / rect.width;
        audioPlayer.currentTime = Math.max(0, Math.min(1, pos)) * audioPlayer.duration;
    });

    // Add this function to save playlists
    async function savePlaylists() {
        await ipcRenderer.invoke('save-playlists', playlistsArray);
    }

    // Call initialize at the end of your DOMContentLoaded event
    initialize();
});