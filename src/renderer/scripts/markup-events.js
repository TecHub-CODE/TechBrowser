// Static markup events. Dynamic panels bind their own actions.
(function bindMarkupEvents() {
  const bindings = [
    [
      'ui-1',
      'ended',
      function (event) {
        skipIntro();
      },
    ],
    [
      'ui-1',
      'error',
      function (event) {
        skipIntro();
      },
    ],
    [
      'ui-2',
      'click',
      function (event) {
        skipIntro();
      },
    ],
    [
      'ui-3',
      'change',
      function (event) {
        onTermsCheck();
      },
    ],
    [
      'ui-4',
      'click',
      function (event) {
        acceptTerms();
      },
    ],
    [
      'ui-5',
      'change',
      function (event) {
        handleAvatarUpload(this);
      },
    ],
    [
      'ui-6',
      'click',
      function (event) {
        openAccountModal();
      },
    ],
    [
      'ui-7',
      'click',
      function (event) {
        window.electronAPI.minimize();
      },
    ],
    [
      'ui-8',
      'click',
      function (event) {
        window.electronAPI.maximize();
      },
    ],
    [
      'ui-9',
      'click',
      function (event) {
        window.electronAPI.close();
      },
    ],
    [
      'ui-10',
      'click',
      function (event) {
        selectTab(this);
      },
    ],
    [
      'ui-10',
      'dragstart',
      function (event) {
        tabDragStart(event, this);
      },
    ],
    [
      'ui-10',
      'dragover',
      function (event) {
        tabDragOver(event, this);
      },
    ],
    [
      'ui-10',
      'dragleave',
      function (event) {
        tabDragLeave(event, this);
      },
    ],
    [
      'ui-10',
      'drop',
      function (event) {
        tabDrop(event, this);
      },
    ],
    [
      'ui-10',
      'dragend',
      function (event) {
        tabDragEnd(event, this);
      },
    ],
    [
      'ui-11',
      'click',
      function (event) {
        closeTab(event, this);
      },
    ],
    [
      'ui-12',
      'click',
      function (event) {
        newTab();
      },
    ],
    [
      'ui-13',
      'click',
      function (event) {
        navBack();
      },
    ],
    [
      'ui-14',
      'click',
      function (event) {
        navFwd();
      },
    ],
    [
      'ui-15',
      'click',
      function (event) {
        reload();
      },
    ],
    [
      'ui-16',
      'keydown',
      function (event) {
        handleAddr(event);
      },
    ],
    [
      'ui-16',
      'input',
      function (event) {
        showSug(this.value);
      },
    ],
    [
      'ui-16',
      'focus',
      function (event) {
        this.select();
        showSug(this.value);
      },
    ],
    [
      'ui-16',
      'blur',
      function (event) {
        setTimeout(hideSug, 150);
      },
    ],
    [
      'ui-17',
      'click',
      function (event) {
        openPanel('settings');
      },
    ],
    [
      'ui-18',
      'click',
      function (event) {
        bookmark();
      },
    ],
    [
      'ui-19',
      'click',
      function (event) {
        toggleReader();
      },
    ],
    [
      'ui-20',
      'click',
      function (event) {
        openPanel('history');
      },
    ],
    [
      'ui-21',
      'click',
      function (event) {
        openPanel('downloads');
      },
    ],
    [
      'ui-22',
      'click',
      function (event) {
        openPanel('ext');
      },
    ],
    [
      'ui-23',
      'click',
      function (event) {
        toggleIncognito();
      },
    ],
    [
      'ui-24',
      'click',
      function (event) {
        toggleVpnPopup();
      },
    ],
    [
      'ui-25',
      'click',
      function (event) {
        toggleVpn();
      },
    ],
    [
      'ui-26',
      'click',
      function (event) {
        selectVpnServer('tr', 'TR', 'Türkiye', '3ms');
      },
    ],
    [
      'ui-27',
      'click',
      function (event) {
        selectVpnServer('de', 'DE', 'Almanya', '8ms');
      },
    ],
    [
      'ui-28',
      'click',
      function (event) {
        selectVpnServer('nl', 'NL', 'Hollanda', '12ms');
      },
    ],
    [
      'ui-29',
      'click',
      function (event) {
        selectVpnServer('us', 'US', 'ABD', '95ms');
      },
    ],
    [
      'ui-30',
      'click',
      function (event) {
        selectVpnServer('jp', 'JP', 'Japonya', '180ms');
      },
    ],
    [
      'ui-31',
      'click',
      function (event) {
        zoomOut();
      },
    ],
    [
      'ui-32',
      'click',
      function (event) {
        zoomIn();
      },
    ],
    [
      'ui-33',
      'click',
      function (event) {
        toggleAiPanel();
      },
    ],
    [
      'ui-34',
      'click',
      function (event) {
        translatePage();
      },
    ],
    [
      'ui-35',
      'click',
      function (event) {
        openPanel('passwords');
      },
    ],
    [
      'ui-36',
      'click',
      function (event) {
        openPanel('notes');
      },
    ],
    [
      'ui-37',
      'click',
      function (event) {
        openPanel('settings');
      },
    ],
    [
      'ui-38',
      'click',
      function (event) {
        toggleFind();
      },
    ],
    [
      'ui-39',
      'keydown',
      function (event) {
        handleNewTabSearchKey(event);
      },
    ],
    [
      'ui-40',
      'click',
      function (event) {
        doSearch();
      },
    ],
    [
      'ui-41',
      'click',
      function (event) {
        newTab(false, 'https://github.com/new');
      },
    ],
    [
      'ui-42',
      'click',
      function (event) {
        newTab(false, 'https://figma.com/new');
      },
    ],
    [
      'ui-43',
      'click',
      function (event) {
        newTab(false, 'https://notion.so/new');
      },
    ],
    [
      'ui-44',
      'click',
      function (event) {
        toggleIncognito();
      },
    ],
    [
      'ui-45',
      'click',
      function (event) {
        doNavigate('https://github.com');
      },
    ],
    [
      'ui-46',
      'click',
      function (event) {
        doNavigate('https://youtube.com');
      },
    ],
    [
      'ui-47',
      'click',
      function (event) {
        doNavigate('https://notion.so');
      },
    ],
    [
      'ui-48',
      'click',
      function (event) {
        doNavigate('https://figma.com');
      },
    ],
    [
      'ui-49',
      'click',
      function (event) {
        doNavigate('https://claude.ai');
      },
    ],
    [
      'ui-50',
      'click',
      function (event) {
        doNavigate('https://linear.app');
      },
    ],
    [
      'ui-51',
      'click',
      function (event) {
        navBack();
        closeCtx();
      },
    ],
    [
      'ui-52',
      'click',
      function (event) {
        navFwd();
        closeCtx();
      },
    ],
    [
      'ui-53',
      'click',
      function (event) {
        reload();
        closeCtx();
      },
    ],
    [
      'ui-54',
      'click',
      function (event) {
        copyUrl();
        closeCtx();
      },
    ],
    [
      'ui-55',
      'click',
      function (event) {
        bookmark();
        closeCtx();
      },
    ],
    [
      'ui-56',
      'click',
      function (event) {
        toggleReader();
        closeCtx();
      },
    ],
    [
      'ui-57',
      'click',
      function (event) {
        newIncogTab();
        closeCtx();
      },
    ],
    [
      'ui-58',
      'click',
      function (event) {
        openDevTools();
        closeCtx();
      },
    ],
    [
      'ui-59',
      'change',
      function (event) {
        onAiModelChange();
      },
    ],
    [
      'ui-60',
      'click',
      function (event) {
        toggleAiPanel();
      },
    ],
    [
      'ui-61',
      'click',
      function (event) {
        saveAiKey();
      },
    ],
    [
      'ui-62',
      'click',
      function (event) {
        misketContext('summary');
      },
    ],
    [
      'ui-63',
      'click',
      function (event) {
        misketContext('selection');
      },
    ],
    [
      'ui-64',
      'keydown',
      function (event) {
        onAiKey(event);
      },
    ],
    [
      'ui-64',
      'input',
      function (event) {
        autoResizeAi(this);
      },
    ],
    [
      'ui-65',
      'click',
      function (event) {
        sendAiMessage();
      },
    ],
    [
      'ui-66',
      'click',
      function (event) {
        closeSpanel();
      },
    ],
    [
      'ui-67',
      'input',
      function (event) {
        doFind(this.value);
      },
    ],
    [
      'ui-68',
      'click',
      function (event) {
        toggleFind();
      },
    ],
    [
      'ui-69',
      'click',
      function (event) {
        closeAllModals();
      },
    ],
    [
      'ui-70',
      'click',
      function (event) {
        event.stopPropagation();
      },
    ],
    [
      'ui-71',
      'click',
      function (event) {
        closeAllModals();
      },
    ],
    [
      'ui-72',
      'click',
      function (event) {
        switchAuthTab('li');
      },
    ],
    [
      'ui-73',
      'click',
      function (event) {
        switchAuthTab('rg');
      },
    ],
    [
      'ui-74',
      'keydown',
      function (event) {
        if (event.key === 'Enter') doLogin();
      },
    ],
    [
      'ui-75',
      'click',
      function (event) {
        doLogin();
      },
    ],
    [
      'ui-76',
      'click',
      function (event) {
        doGoogleLogin();
      },
    ],
    [
      'ui-77',
      'click',
      function (event) {
        showAuthStep('forgot');
      },
    ],
    [
      'ui-78',
      'click',
      function (event) {
        resendVerification();
      },
    ],
    [
      'ui-79',
      'keydown',
      function (event) {
        if (event.key === 'Enter') doRegister();
      },
    ],
    [
      'ui-80',
      'click',
      function (event) {
        doRegister();
      },
    ],
    [
      'ui-81',
      'input',
      function (event) {
        tfaInput(this, 0);
      },
    ],
    [
      'ui-81',
      'keydown',
      function (event) {
        tfaKey(event, 0);
      },
    ],
    [
      'ui-82',
      'input',
      function (event) {
        tfaInput(this, 1);
      },
    ],
    [
      'ui-82',
      'keydown',
      function (event) {
        tfaKey(event, 1);
      },
    ],
    [
      'ui-83',
      'input',
      function (event) {
        tfaInput(this, 2);
      },
    ],
    [
      'ui-83',
      'keydown',
      function (event) {
        tfaKey(event, 2);
      },
    ],
    [
      'ui-84',
      'input',
      function (event) {
        tfaInput(this, 3);
      },
    ],
    [
      'ui-84',
      'keydown',
      function (event) {
        tfaKey(event, 3);
      },
    ],
    [
      'ui-85',
      'input',
      function (event) {
        tfaInput(this, 4);
      },
    ],
    [
      'ui-85',
      'keydown',
      function (event) {
        tfaKey(event, 4);
      },
    ],
    [
      'ui-86',
      'input',
      function (event) {
        tfaInput(this, 5);
      },
    ],
    [
      'ui-86',
      'keydown',
      function (event) {
        tfaKey(event, 5);
      },
    ],
    [
      'ui-87',
      'click',
      function (event) {
        verify2FA();
      },
    ],
    [
      'ui-88',
      'click',
      function (event) {
        cancel2FA();
      },
    ],
    [
      'ui-89',
      'click',
      function (event) {
        verifyOtp();
      },
    ],
    [
      'ui-90',
      'click',
      function (event) {
        resendOtp();
      },
    ],
    [
      'ui-91',
      'click',
      function (event) {
        showAuthStep('login');
      },
    ],
    [
      'ui-92',
      'keydown',
      function (event) {
        if (event.key === 'Enter') sendResetCode();
      },
    ],
    [
      'ui-93',
      'click',
      function (event) {
        sendResetCode();
      },
    ],
    [
      'ui-94',
      'click',
      function (event) {
        showAuthStep('login');
      },
    ],
    [
      'ui-95',
      'click',
      function (event) {
        showAuthStep('login');
      },
    ],
    [
      'ui-96',
      'error',
      function (event) {
        this.style.display = 'none';
      },
    ],
    [
      'ui-97',
      'click',
      function (event) {
        closeAllModals();
      },
    ],
    [
      'ui-98',
      'click',
      function (event) {
        document.getElementById('avatarInput').click();
      },
    ],
    [
      'ui-99',
      'click',
      function (event) {
        document.getElementById('avatarInput').click();
      },
    ],
    [
      'ui-100',
      'click',
      function (event) {
        openPanel('settings');
        closeAllModals();
      },
    ],
    [
      'ui-101',
      'click',
      function (event) {
        openPanel('history');
        closeAllModals();
      },
    ],
    [
      'ui-102',
      'click',
      function (event) {
        openPanel('ext');
        closeAllModals();
      },
    ],
    [
      'ui-103',
      'click',
      function (event) {
        syncData();
        closeAllModals();
      },
    ],
    [
      'ui-104',
      'click',
      function (event) {
        openMfaSetup();
      },
    ],
    [
      'ui-105',
      'click',
      function (event) {
        doLogout();
      },
    ],
    [
      'ui-106',
      'click',
      function (event) {
        closeAllModals();
        setTimeout(showDeleteAccountModal, 150);
      },
    ],
    [
      'ui-106',
      'mouseover',
      function (event) {
        this.style.opacity = '1';
      },
    ],
    [
      'ui-106',
      'mouseout',
      function (event) {
        this.style.opacity = '.75';
      },
    ],
    [
      'ui-107',
      'click',
      function (event) {
        closeAllModals();
      },
    ],
    [
      'ui-108',
      'click',
      function (event) {
        closeCmd();
      },
    ],
    [
      'ui-109',
      'input',
      function (event) {
        filterCmd(this.value);
      },
    ],
    [
      'ui-109',
      'keydown',
      function (event) {
        handleCmdKey(event);
      },
    ],
    [
      'ui-110',
      'mouseenter',
      function (event) {
        this.style.background = 'rgba(255,95,87,0.15)';
        this.style.color = '#ff5f57';
      },
    ],
    [
      'ui-110',
      'mouseleave',
      function (event) {
        this.style.background = 'rgba(255,255,255,0.05)';
        this.style.color = '#44445a';
      },
    ],
    [
      'ui-111',
      'click',
      function (event) {
        startUpdateDownload();
      },
    ],
    [
      'ui-112',
      'click',
      function (event) {
        installUpdateNow();
      },
    ],
    [
      'ui-113',
      'mouseenter',
      function (event) {
        this.style.background = 'rgba(255,95,87,0.15)';
        this.style.color = '#ff5f57';
      },
    ],
    [
      'ui-113',
      'mouseleave',
      function (event) {
        this.style.background = 'rgba(255,255,255,0.05)';
        this.style.color = '#44445a';
      },
    ],
    [
      'ui-114',
      'mouseenter',
      function (event) {
        this.style.opacity = '0.88';
        this.style.transform = 'translateY(-1px)';
      },
    ],
    [
      'ui-114',
      'mouseleave',
      function (event) {
        this.style.opacity = '1';
        this.style.transform = 'translateY(0)';
      },
    ],
    [
      'ui-115',
      'click',
      function (event) {
        hideReportModal();
      },
    ],
    [
      'ui-116',
      'click',
      function (event) {
        selectReportCat(this);
      },
    ],
    [
      'ui-117',
      'click',
      function (event) {
        selectReportCat(this);
      },
    ],
    [
      'ui-118',
      'click',
      function (event) {
        selectReportCat(this);
      },
    ],
    [
      'ui-119',
      'click',
      function (event) {
        selectReportCat(this);
      },
    ],
    [
      'ui-120',
      'click',
      function (event) {
        selectReportCat(this);
      },
    ],
    [
      'ui-121',
      'click',
      function (event) {
        selectReportCat(this);
      },
    ],
    [
      'ui-122',
      'click',
      function (event) {
        selectReportCat(this);
      },
    ],
    [
      'ui-123',
      'click',
      function (event) {
        selectReportCat(this);
      },
    ],
    [
      'ui-124',
      'input',
      function (event) {
        document.getElementById('rDescCount').textContent = this.value.length;
      },
    ],
    [
      'ui-125',
      'click',
      function (event) {
        submitReport();
      },
    ],
    [
      'ui-126',
      'click',
      function (event) {
        hideDeleteAccountModal();
      },
    ],
  ];
  for (const [id, type, handler] of bindings) {
    const element = document.querySelector('[data-ui="' + id + '"]');
    if (element)
      element.addEventListener(type, function (event) {
        if (handler.call(this, event) === false) event.preventDefault();
      });
  }
})();
