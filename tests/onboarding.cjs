const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { TERMS_VERSION, ONBOARDING_VERSION } = require('../src/app-config');

const profile = path.join(__dirname, '.runtime', 'onboarding-' + Date.now());
fs.mkdirSync(profile, { recursive: true });
fs.writeFileSync(
  path.join(profile, 'techbrowser-settings.json'),
  JSON.stringify({
    termsAccepted: true,
    termsAcceptedVersion: TERMS_VERSION,
    onboardingPending: true,
  }),
);
app.setPath('userData', profile);
require('../main');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

app
  .whenReady()
  .then(async () => {
    await delay(2200);
    const window = BrowserWindow.getAllWindows()[0];
    const run = (source) => window.webContents.executeJavaScript(source, true);
    await run('skipIntro()');
    await delay(1600);
    assert.deepEqual(
      await run(`({
        tabs: Array.from(document.querySelectorAll('.tab')).map(t => t.querySelector('.tab-title').textContent),
        active: document.querySelector('.first-run-page.active')?.id,
        address: document.getElementById('addr').value,
        stepCount: document.querySelectorAll('#firstRunSetup .first-run-steps span').length,
        browserPreviews: document.querySelectorAll('#firstRunThemes .theme-toolbar').length,
        engineLogos: document.querySelectorAll('#firstRunSearch .engine-logo').length,
        accentChoices: document.querySelectorAll('#firstRunAccents [data-accent-choice]').length,
        importAction: document.getElementById('firstRunImport').textContent.trim(),
        helperCopy: document.querySelectorAll('#firstRunSetup .first-run-label small').length,
        floatingMark: document.querySelector('#firstRunSetup .first-run-mark') !== null,
        primaryAction: document.getElementById('firstRunSave').textContent.replace(/\s+/g, ' ').trim(),
        checkInLabel: getComputedStyle(document.querySelector('.first-run-theme.selected strong'), '::after').content !== 'none',
        checkOnPreview: getComputedStyle(document.querySelector('.first-run-theme.selected'), '::after').content !== 'none',
        inactiveOpacity: getComputedStyle(document.querySelector('[data-theme-choice="light"]')).opacity,
        searchFillsColumn: Math.abs(
          document.getElementById('firstRunSearch').getBoundingClientRect().right -
          document.getElementById('firstRunSearch').closest('.first-run-section').getBoundingClientRect().right
        ) < 2
      })`),
      {
        tabs: ['Başlangıç', 'Kısa Anket'],
        active: 'firstRunSetup',
        address: 'techbrowser://setup',
        stepCount: 2,
        browserPreviews: 3,
        engineLogos: 3,
        accentChoices: 5,
        importAction: 'İçe Aktar',
        helperCopy: 0,
        floatingMark: false,
        primaryAction: 'Devam et →',
        checkInLabel: true,
        checkOnPreview: false,
        inactiveOpacity: '0.7',
        searchFillsColumn: true,
      },
    );
    fs.mkdirSync(path.join(__dirname, 'results'), { recursive: true });
    fs.writeFileSync(
      path.join(__dirname, 'results', 'onboarding-setup.png'),
      (await window.webContents.capturePage()).toPNG(),
    );
    await run(`
      document.querySelector('[data-theme-choice="light"]').click();
      document.querySelector('[data-accent-choice="purple"]').click();
      document.querySelector('[data-search-choice="duck"]').click();
      document.getElementById('firstRunAdBlock').checked = false;
      saveFirstRunSetup();
    `);
    await delay(700);
    assert.deepEqual(
      await run(
        `({theme:cfg.theme,accent:cfg.accentColor,accentValue:document.body.style.getPropertyValue('--ac'),search:cfg.searchEngine,adBlock:cfg.adBlock,page:document.querySelector('.first-run-page.active')?.id})`,
      ),
      {
        theme: 'light',
        accent: 'purple',
        accentValue: '#7c3aed',
        search: 'duck',
        adBlock: false,
        page: 'firstRunSurvey',
      },
    );
    await run(`
      document.querySelector('[data-source="other"]').click();
      document.getElementById('firstRunOtherInput').value = 'GitHub etkinliği';
    `);
    await delay(220);
    assert.deepEqual(
      await run(`(() => {
        const selected = document.querySelector('#firstRunSources .selected');
        const selectedCheck = getComputedStyle(selected, '::after');
        return {
          columns: getComputedStyle(document.getElementById('firstRunSources')).gridTemplateColumns.split(' ').length,
          helperCopy: document.querySelectorAll('#firstRunSources small').length,
          inactiveOpacity: getComputedStyle(document.querySelector('[data-source="instagram"]')).opacity,
          selectedOpacity: getComputedStyle(selected).opacity,
          checkRight: selectedCheck.right,
          checkCentered: selectedCheck.transform !== 'none',
          skipBorder: getComputedStyle(document.getElementById('firstRunSkipSurvey')).borderTopStyle,
          primaryWidth: Math.round(document.getElementById('firstRunFinish').getBoundingClientRect().width),
          otherVisible: document.getElementById('firstRunOther').classList.contains('visible'),
          otherEnabled: !document.getElementById('firstRunOtherInput').disabled,
          privacyLock: document.querySelector('.survey-note .icon use').getAttribute('href')
        };
      })()`),
      {
        columns: 4,
        helperCopy: 0,
        inactiveOpacity: '0.7',
        selectedOpacity: '1',
        checkRight: '14px',
        checkCentered: true,
        skipBorder: 'solid',
        primaryWidth: 254,
        otherVisible: true,
        otherEnabled: true,
        privacyLock: '#i-lock',
      },
    );
    fs.writeFileSync(
      path.join(__dirname, 'results', 'onboarding-survey.png'),
      (await window.webContents.capturePage()).toPNG(),
    );
    await run(`completeFirstRun(firstRunSource);`);
    await delay(700);
    const saved = JSON.parse(
      fs.readFileSync(path.join(profile, 'techbrowser-settings.json'), 'utf8'),
    );
    assert.equal(saved.onboardingPending, false);
    assert.equal(saved.onboardingVersion, ONBOARDING_VERSION);
    assert.equal(saved.discoverySource, 'other');
    assert.equal(saved.discoverySourceDetail, 'GitHub etkinliği');
    assert.equal(await run(`document.querySelectorAll('.first-run-page.active').length`), 0);
    assert.equal(await run(`Object.values(tabData).some(tab => tab.internal)`), false);
    console.log(
      'PASS first install opens two internal tabs, applies preferences and stores survey locally',
    );
    app.exit(0);
  })
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
