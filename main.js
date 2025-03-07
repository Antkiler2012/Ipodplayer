const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
const userDataPath = app.getPath('userData');
const playlistsFile = path.join(userDataPath, 'savedPlaylists.json');

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 350,
        height: 600,
        frame: false,
        resizable: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    mainWindow.loadFile('index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// Window controls
ipcMain.on('minimize-window', () => {
    mainWindow.minimize();
});

ipcMain.on('close-window', () => {
    app.quit();
});

// Handle playlist import
ipcMain.handle('import-playlist', async () => {
    try {
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openDirectory'],
            title: 'Select a folder containing MP3 files',
            message: 'Choose a folder with your music files'
        });

        if (!result.canceled) {
            const playlistPath = result.filePaths[0];
            const files = fs.readdirSync(playlistPath);
            
            const musicFiles = files.filter(file => file.toLowerCase().endsWith('.mp3'));
            
            if (musicFiles.length === 0) {
                await dialog.showMessageBox(mainWindow, {
                    type: 'warning',
                    title: 'No Music Files',
                    message: 'No MP3 files found in the selected folder.'
                });
                return null;
            }

            const playlist = {
                name: path.basename(playlistPath),
                songs: []
            };

            musicFiles.forEach(file => {
                const songName = path.basename(file, '.mp3');
                const artworkPath = files.find(f => 
                    f.toLowerCase().startsWith(songName.toLowerCase()) && 
                    (f.toLowerCase().endsWith('.jpg') || f.toLowerCase().endsWith('.png'))
                );
                
                playlist.songs.push({
                    title: songName,
                    path: path.join(playlistPath, file),
                    artwork: artworkPath ? path.join(playlistPath, artworkPath) : null
                });
            });

            return playlist;
        }
        return null;
    } catch (error) {
        console.error('Error importing playlist:', error);
        await dialog.showMessageBox(mainWindow, {
            type: 'error',
            title: 'Import Error',
            message: 'Error importing playlist. Please try again.'
        });
        return null;
    }
});

// Add these new IPC handlers
ipcMain.handle('save-playlists', async (event, playlists) => {
    try {
        fs.writeFileSync(playlistsFile, JSON.stringify(playlists, null, 2));
        return true;
    } catch (error) {
        console.error('Error saving playlists:', error);
        return false;
    }
});

ipcMain.handle('load-playlists', async () => {
    try {
        if (fs.existsSync(playlistsFile)) {
            const data = fs.readFileSync(playlistsFile, 'utf8');
            return JSON.parse(data);
        }
        return [];
    } catch (error) {
        console.error('Error loading playlists:', error);
        return [];
    }
});