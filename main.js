const { app, BrowserWindow, nativeTheme, Menu, session, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;


// --- CRITICAL FIX: Use userData instead of __dirname ---
// This ensures the folder is outside the read-only .asar archive
const extensionsPath = path.join(app.getPath('userData'), 'extensions');

if (!fs.existsSync(extensionsPath)) {
  fs.mkdirSync(extensionsPath);
}

// Track loaded extensions so we can access their IDs and remove them
const loadedExtensions = {};

// --- EXTENSION SAVING LOGIC ---
const settingsPath = path.join(app.getPath('userData'), 'pear-extensions.json');

function loadExtensionSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    }
  } catch (e) {
    console.error('Failed to load extension settings:', e);
  }
  return { enabledExtensions: [] }; // Default empty state
}

function saveExtensionSettings(settings) {
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  } catch (e) {
    console.error('Failed to save extension settings:', e);
  }
}

// Helper function to open extension HTML pages in a popup window
function openExtensionPage(ext, htmlPage, title) {
  if (!ext || !htmlPage) return;
  
  const extWindow = new BrowserWindow({
    width: 400,
    height: 600,
    title: title,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false 
    }
  });

  extWindow.loadURL(`chrome-extension://${ext.id}/${htmlPage}`);
}

async function setupExtensionsMenu() {
  const dirs = fs.readdirSync(extensionsPath, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

  const extensionMenuItems = [];
  const settings = loadExtensionSettings();

  for (const dir of dirs) {
    const extPath = path.join(extensionsPath, dir);
    let manifest;
    
    try {
      manifest = require(path.join(extPath, 'manifest.json'));
    } catch (e) {
      console.warn(`Skipping ${dir}: No valid manifest.json found.`);
      continue;
    }

    const extName = manifest.name || dir;
    const popupHtml = manifest.action?.default_popup || manifest.browser_action?.default_popup;
    const optionsHtml = manifest.options_ui?.page || manifest.options_page;

    let isLoaded = false;

    // AUTO-LOAD: If this extension was saved as enabled, load it now
    if (settings.enabledExtensions.includes(dir) && !loadedExtensions[extPath]) {
      try {
        const ext = await session.defaultSession.loadExtension(extPath);
        loadedExtensions[extPath] = ext;
        isLoaded = true;
        console.log(`Auto-loaded extension: ${extName}`);
      } catch (err) {
        console.error(`Failed to auto-load ${extName}:`, err);
      }
    } else if (loadedExtensions[extPath]) {
      // It's already loaded in the session
      isLoaded = true;
    }

    extensionMenuItems.push({
      label: extName,
      submenu: [
        {
          label: 'Enable Extension',
          type: 'checkbox',
          checked: isLoaded,
          click: async (menuItem) => {
            if (menuItem.checked) {
              try {
                const ext = await session.defaultSession.loadExtension(extPath);
                loadedExtensions[extPath] = ext;
                
                // Save state
                if (!settings.enabledExtensions.includes(dir)) {
                  settings.enabledExtensions.push(dir);
                  saveExtensionSettings(settings);
                }
                
                console.log(`Enabled extension: ${extName}`);
                setupExtensionsMenu(); // Refresh menu for popup buttons
              } catch (err) {
                console.error(`Failed to load extension ${extName}:`, err);
                menuItem.checked = false;
              }
            } else {
              const ext = loadedExtensions[extPath];
              if (ext) {
                session.defaultSession.removeExtension(ext.id);
                delete loadedExtensions[extPath];
                
                // Save state
                settings.enabledExtensions = settings.enabledExtensions.filter(d => d !== dir);
                saveExtensionSettings(settings);

                console.log(`Disabled extension: ${extName}`);
                setupExtensionsMenu(); // Refresh menu for popup buttons
              }
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Open Menu (Popup)',
          enabled: isLoaded && !!popupHtml,
          click: () => {
            const ext = loadedExtensions[extPath];
            openExtensionPage(ext, popupHtml, `${extName} - Menu`);
          }
        },
        {
          label: 'Open Options',
          enabled: isLoaded && !!optionsHtml,
          click: () => {
            const ext = loadedExtensions[extPath];
            openExtensionPage(ext, optionsHtml, `${extName} - Options`);
          }
        }
      ]
    });
  }

  const menu = Menu.buildFromTemplate([
    {
      label: 'App',
      submenu: [
        { role: 'quit' }
      ]
    },
    {
      label: 'Extensions',
      submenu: [
        {
          label: 'Open Extensions Folder...',
          click: () => {
            // This will open the folder in Finder (Mac) or File Explorer (Windows)
            shell.openPath(extensionsPath);
          }
        },
        { type: 'separator' },
        ...(extensionMenuItems.length > 0 
          ? extensionMenuItems 
          : [{ label: 'No extensions found in folder', enabled: false }])
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' }
      ]
    }
  ]);
  
  Menu.setApplicationMenu(menu);
}

async function createWindow() {
  await setupExtensionsMenu();

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    vibrancy: 'under-window',
    visualEffectState: 'active',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 18 },
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadURL('https://music.youtube.com');

  mainWindow.webContents.on('did-finish-load', () => {

    /* ---------- BASE + CLEANUP ---------- */
    mainWindow.webContents.insertCSS(`
      body, ytm-app, ytm-music-app, ytmusic-app-layout, ytmusic-player-page {
        background: transparent !important;
        background-image: none !important;
      }

      * {
        background-image: none !important;
      }

      ytmusic-nav-bar #left-content {
        margin-left: 60px !important;
        margin-bottom: 8px !important;
      }

      ytmusic-nav-bar .cast-button,
      ytmusic-nav-bar .settings-button {
        display: none !important;
      }

      ytmusic-search-box {
        max-width: 240px !important;
        position: absolute !important;
        right: 0px !important;
        left: auto !important;
        margin-right: 5px !important;
      }

      ytmusic-fullbleed-thumbnail-renderer,
      ytmusic-fullbleed-header-renderer::before,
      ytmusic-player-page::before,
      ytmusic-app-layout::before {
        display: none !important;
      }

      #player-bar-background {
        display: none !important;
      }
    `);
    
    mainWindow.webContents.insertCSS(`
      ytmusic-nav-bar .center-content {
        all: unset !important;
        display: contents !important;
      }
    `);

    /* ---------- fix placeholder ---------- */
    mainWindow.webContents.executeJavaScript(`
      const fixPlaceholder = () => {
        const input = document.querySelector('ytmusic-search-box input');
        if (input) {
          input.setAttribute('placeholder', 'Search');
        } else {
          setTimeout(fixPlaceholder, 300);
        }
      };
      fixPlaceholder();
    `);

    /* ---------- FLOATING PLAYER BAR ---------- */
    mainWindow.webContents.executeJavaScript(`
      const styleEl = document.createElement('style');
      styleEl.id = 'floating-player-style';
      document.head.appendChild(styleEl);

      function updatePlayerBar() {
        const app = document.querySelector('ytmusic-app');
        const collapsed = app?.hasAttribute('guide-collapsed');

        const left = collapsed ? 20 : 257;
        const maxWidth = collapsed
          ? 'calc(100% - 40px)'
          : 'calc(100% - 277px)';

        styleEl.textContent = \`
          ytmusic-player-bar[slot="player-bar"] {
            position: fixed !important;
            bottom: 20px !important;
            left: \${left + 10}px !important;
            right: 0px !important;
            max-width: \${maxWidth};
            
            /* THEME ADAPTIVE BACKGROUND */
            /* Prioritizes YTM theme variables, falls back to your custom rgba */
            background: var(--ytmusic-player-background, var(--ytmusic-general-background-c, rgba(236, 236, 236, 1))) !important;
            color: var(--ytmusic-text-primary);
            
            border-radius: 10px;
            padding: 6px 12px;
            display: flex !important;
            align-items: center;
            justify-content: space-between;
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            box-shadow: 0 2px 12px rgba(0,0,0,0.3);
            z-index: 9999;
            box-sizing: border-box;
          }

          #left-controls,
          .middle-controls,
          #right-controls {
            display: flex !important;
            align-items: center;
            justify-content: center;
            padding: 0 8px;
          }

          .middle-controls {
            border-left: 1px solid rgba(255,255,255,0.2);
            border-right: 1px solid rgba(255,255,255,0.2);
          }

          ytmusic-player-bar #progress-bar,
          ytmusic-player-bar .player-bar-background,
          ytmusic-player-bar .song-info {
            display: none !important;
          }

          ytmusic-player-page {
            --player-bar-height: 0px !important;
            padding-bottom: 0 !important;
          }
        \`;
      }
        
      updatePlayerBar();

      const appEl = document.querySelector('ytmusic-app');
      if (appEl) {
        new MutationObserver(updatePlayerBar).observe(appEl, { attributes: true });
      }
    `);

    /* ---------- DRAG REGION ---------- */
    mainWindow.webContents.executeJavaScript(`
      const drag = document.createElement('div');
      drag.style.position = 'fixed';
      drag.style.top = '0';
      drag.style.left = '240px';
      drag.style.right = '264px';
      drag.style.height = '64px';
      drag.style.webkitAppRegion = 'drag';
      drag.style.zIndex = '9999';
      document.body.appendChild(drag);
    `);

    /* ---------- CAROUSEL CLIENT-HIDE BUTTON ---------- */
    mainWindow.webContents.executeJavaScript(`
      if (!document.querySelector('#fa-style')) {
        const link = document.createElement('link');
        link.id = 'fa-style';
        link.rel = 'stylesheet';
        link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css';
        document.head.appendChild(link);
      }

      function injectHideButtons() {
        document.querySelectorAll('ytmusic-carousel-shelf-renderer').forEach(carousel => {
          if (carousel.querySelector('.hide-carousel-btn')) return;

          carousel.style.position = 'relative';

          const btn = document.createElement('button');
          btn.className = 'hide-carousel-btn';
          btn.innerHTML = '<i class="fa fa-eye-slash"></i>';

          Object.assign(btn.style, {
            position: 'absolute',
            top: '10px',
            right: '10px',
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            border: 'none',
            background: 'rgba(0,0,0,0.5)',
            color: 'white',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          });

          btn.onclick = () => {
            carousel.style.visibility = 'hidden';
            carousel.style.height = '0';
            carousel.style.margin = '0';
            carousel.style.padding = '0';
            carousel.style.overflow = 'hidden';
          };

          carousel.appendChild(btn);
        });
      }

      injectHideButtons();
      setInterval(injectHideButtons, 2000);
    `);
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});