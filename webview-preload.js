// Google'ın Electron tespitini engelle
try {
  // window.chrome tanımla
  if (!window.chrome) {
    Object.defineProperty(window, 'chrome', {
      value: {
        app: { isInstalled: false, InstallState: {}, RunningState: {} },
        csi: function(){},
        loadTimes: function(){},
        runtime: {},
      },
      writable: true, configurable: true
    });
  }

  // navigator.webdriver = false
  Object.defineProperty(navigator, 'webdriver', {
    get: () => false, configurable: true
  });

  // navigator.plugins — gerçekmiş gibi göster
  Object.defineProperty(navigator, 'plugins', {
    get: () => [
      { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
      { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
      { name: 'Native Client', filename: 'internal-nacl-plugin' },
    ],
    configurable: true
  });

  // navigator.languages
  Object.defineProperty(navigator, 'languages', {
    get: () => ['tr-TR', 'tr', 'en-US', 'en'],
    configurable: true
  });

  // Konum izni popup'ını engelle — her zaman reddedilmiş gibi davran
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition = function(success, error) {
      if (error) error({ code: 1, message: 'Konum erişimi reddedildi.' });
    };
    navigator.geolocation.watchPosition = function(success, error) {
      if (error) error({ code: 1, message: 'Konum erişimi reddedildi.' });
      return 0;
    };
  }

  // Electron izlerini sil
  delete window.process;
  delete window.require;

} catch(e) {}
