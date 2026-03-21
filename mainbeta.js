const { app, BrowserWindow, nativeTheme, Menu, session, shell, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const x11 = require('x11'); // <-- Added x11 package for Linux blur

// ═══════════════════════════════════════════════════════════
//  LINUX WAYLAND TRANSPARENCY FIX
// ═══════════════════════════════════════════════════════════
if (process.platform === 'linux') {
  // Removed native Wayland flags (ozone-platform-hint) to force XWayland for x11 blur
  
  // Required for the compositor to properly render the transparent alpha channel
  app.commandLine.appendSwitch('enable-transparent-visuals');
  app.commandLine.appendSwitch('disable-gpu-early-init');
  
  // Suppress the annoying libva hardware acceleration errors in the terminal
  app.disableHardwareAcceleration();
}

let mainWindow;

const isMac = process.platform === 'darwin';

// --- CRITICAL FIX: Use userData instead of __dirname ---
// This ensures the folder is outside the read-only .asar archive
const extensionsPath = path.join(app.getPath('userData'), 'extensions');

if (!fs.existsSync(extensionsPath)) {
  fs.mkdirSync(extensionsPath);
}

// -------------------------------------------------------
// PRELOAD: Write a tiny preload.js to userData so that
// non-macOS window control buttons can call ipcRenderer
// even with contextIsolation: true. macOS doesn't use this.
// -------------------------------------------------------
const preloadPath = path.join(app.getPath('userData'), 'pear-preload.js');
fs.writeFileSync(preloadPath, `
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('pearWindowControls', {
  close:    () => ipcRenderer.send('pear-win-close'),
  minimize: () => ipcRenderer.send('pear-win-minimize'),
  maximize: () => ipcRenderer.send('pear-win-maximize'),
  menu:     () => ipcRenderer.send('pear-win-menu'),
  isMaximized: (cb) => {
    ipcRenderer.on('pear-win-maximized-state', (_e, v) => cb(v));
    ipcRenderer.send('pear-win-query-maximized');
  }
});
`);

// IPC handlers for the injected window controls (Windows / Linux only)
ipcMain.on('pear-win-close',    () => mainWindow?.close());
ipcMain.on('pear-win-minimize', () => mainWindow?.minimize());
ipcMain.on('pear-win-maximize', () => {
  if (!mainWindow) return;
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
});
ipcMain.on('pear-win-query-maximized', (e) => {
  e.sender.send('pear-win-maximized-state', mainWindow?.isMaximized() ?? false);
});
ipcMain.on('pear-win-menu', (event) => {
  const menu = Menu.getApplicationMenu();
  if (menu) menu.popup({ window: BrowserWindow.fromWebContents(event.sender) });
});

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
  return { enabledExtensions: [] };
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

                if (!settings.enabledExtensions.includes(dir)) {
                  settings.enabledExtensions.push(dir);
                  saveExtensionSettings(settings);
                }

                console.log(`Enabled extension: ${extName}`);
                setupExtensionsMenu();
              } catch (err) {
                console.error(`Failed to load extension ${extName}:`, err);
                menuItem.checked = false;
              }
            } else {
              const ext = loadedExtensions[extPath];
              if (ext) {
                session.defaultSession.removeExtension(ext.id);
                delete loadedExtensions[extPath];

                settings.enabledExtensions = settings.enabledExtensions.filter(d => d !== dir);
                saveExtensionSettings(settings);

                console.log(`Disabled extension: ${extName}`);
                setupExtensionsMenu();
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

  // ═══════════════════════════════════════════════════════════
  //  macOS  — original config, untouched
  // ═══════════════════════════════════════════════════════════
  if (isMac) {
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

  // ═══════════════════════════════════════════════════════════
  //  Windows — Acrylic Blur
  // ═══════════════════════════════════════════════════════════
  } else if (process.platform === 'win32') {
    mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      frame: false,
      transparent: false, // Must be false on Windows for backgroundMaterial to work
      backgroundMaterial: 'acrylic', // OS-level blur (Mica is also an option for Win11)
      backgroundColor: '#00000000', 
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: preloadPath         
      }
    });

    mainWindow.on('maximize',   () => mainWindow.webContents.send('pear-win-maximized-state', true));
    mainWindow.on('unmaximize', () => mainWindow.webContents.send('pear-win-maximized-state', false));

  // ═══════════════════════════════════════════════════════════
  //  Linux — Transparent frameless (XWayland Blur injected via x11)
  // ═══════════════════════════════════════════════════════════
  } else {
    mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: preloadPath         
      }
    });

    mainWindow.on('maximize',   () => mainWindow.webContents.send('pear-win-maximized-state', true));
    mainWindow.on('unmaximize', () => mainWindow.webContents.send('pear-win-maximized-state', false));

    // <-- NEW: Inject the X11 KDE Blur property when the window is ready
    mainWindow.once('ready-to-show', () => {
      try {
        const handle = mainWindow.getNativeWindowHandle();
        const windowId = handle.readUInt32LE(0);

        x11.createClient((err, display) => {
          if (err) {
            console.error("Failed to connect to X server. Are you running XWayland/X11?", err.message);
            return;
          }
          
          const X = display.client;
          
          X.InternAtom(false, '_KDE_NET_WM_BLUR_BEHIND_REGION', (err, blurAtom) => {
            if (err) {
              console.error("Failed to find KDE blur atom:", err.message);
              return;
            }
            
            const data = Buffer.alloc(4);
            data.writeUInt32LE(0, 0); 

            X.ChangeProperty(
              0, // Mode: PropModeReplace
              windowId,
              blurAtom,
              display.client.atoms.CARDINAL, // Type
              32, // Format
              data
            );
            
            console.log("Success: XWayland Blur atom injected!");
            X.terminate(); 
          });
        });
      } catch (error) {
        console.error("Error applying XWayland blur:", error);
      }
    });
  }

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
    // macOS: leave room for native traffic lights on the left (starts at 240px)
    // Windows/Linux: leave room for injected buttons on the left (starts at 80px)
    const dragLeft = isMac ? 240 : 80;
    mainWindow.webContents.executeJavaScript(`
      const drag = document.createElement('div');
      drag.style.position = 'fixed';
      drag.style.top = '0';
      drag.style.left = '264px';
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

    // ═══════════════════════════════════════════════════════════
    //  Windows / Linux only — inject macOS-style traffic lights + Menu
    // ═══════════════════════════════════════════════════════════
    if (!isMac) {
      mainWindow.webContents.insertCSS(`
        #pear-traffic-lights {
          position: fixed;
          top: 23px;
          left: 15px;
          display: flex;
          gap: 8px;
          z-index: 99999;
          -webkit-app-region: no-drag;
        }

        .pear-tl-btn {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 8px;
          font-weight: 900;
          line-height: 1;
          color: transparent;
          padding: 0;
          transition: filter 0.1s ease;
          position: relative;
        }

        #pear-tl-close    { background: #ff5f57; }
        #pear-tl-minimize { background: #febc2e; }
        #pear-tl-maximize { background: #28c840; }

        #pear-traffic-lights:hover .pear-tl-btn {
          color: rgba(0, 0, 0, 0.55);
        }

        .pear-tl-btn:hover { filter: brightness(0.88); }
        .pear-tl-btn:active { filter: brightness(0.72); }

        #pear-tl-close::after    { content: '✕'; }
        #pear-tl-minimize::after { content: '−'; }
        #pear-tl-maximize::after { content: attr(data-symbol); }

        /* --- NEW MENU BUTTON STYLES --- */
        #pear-bottom-menu {
          position: fixed;
          bottom: 20px;
          left: 15px;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: rgba(150, 150, 150, 0.3);
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          color: rgba(255, 255, 255, 0.8);
          font-size: 16px;
          z-index: 99999;
          -webkit-app-region: no-drag;
          transition: all 0.2s ease;
        }
        
        #pear-bottom-menu:hover {
          background: rgba(150, 150, 150, 0.6);
          color: #fff;
        }
        
        #pear-bottom-menu::after {
          content: '☰';
        }
      `);

      mainWindow.webContents.executeJavaScript(`
        (function() {
          // 1. Setup the Traffic Lights (Top Left)
          const bar = document.createElement('div');
          bar.id = 'pear-traffic-lights';

          function makeBtn(id, label) {
            const b = document.createElement('button');
            b.id = id;
            b.className = 'pear-tl-btn';
            b.title = label;
            b.setAttribute('data-symbol', '+');
            bar.appendChild(b);
            return b;
          }

          const closeBtn    = makeBtn('pear-tl-close',    'Close');
          const minimizeBtn = makeBtn('pear-tl-minimize', 'Minimize');
          const maximizeBtn = makeBtn('pear-tl-maximize', 'Maximize / Restore');

          closeBtn.addEventListener('click',    () => window.pearWindowControls.close());
          minimizeBtn.addEventListener('click', () => window.pearWindowControls.minimize());
          maximizeBtn.addEventListener('click', () => window.pearWindowControls.maximize());

          window.pearWindowControls.isMaximized((isMax) => {
            maximizeBtn.setAttribute('data-symbol', isMax ? '⤡' : '+');
          });

          document.body.appendChild(bar);

          // 2. Setup the Menu Button (Bottom Left)
          const menuBtn = document.createElement('button');
          menuBtn.id = 'pear-bottom-menu';
          menuBtn.title = 'Menu';
          menuBtn.addEventListener('click', () => window.pearWindowControls.menu());
          
          document.body.appendChild(menuBtn);
        })();
      `);
    }
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});