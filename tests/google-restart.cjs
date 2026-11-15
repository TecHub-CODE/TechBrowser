// Two real Electron processes: Google button -> encrypted disk -> restarted app.
const path=require('path'),fs=require('fs'),assert=require('assert/strict');
if(!process.versions.electron){
 const root=path.join(__dirname,'.runtime','google-restart-'+Date.now());fs.mkdirSync(root,{recursive:true});
 const {spawn}=require('child_process');const run=phase=>new Promise((resolve,reject)=>{const p=spawn(require('electron'),[__filename,phase,root],{stdio:'inherit'});p.on('error',reject);p.on('exit',c=>c===0?resolve():reject(Error('Phase failed: '+phase)))});
 (async()=>{await run('login');await run('restore');await run('retry');console.log('GOOGLE RESTART 3/3 PASSED')})().catch(e=>{console.error(e);process.exitCode=1});
}else{
 const {app,BrowserWindow,shell}=require('electron');const phase=process.argv[2],root=process.argv[3];app.setPath('userData',root);
 process.env.GOOGLE_CLIENT_ID='synthetic-client';process.env.GOOGLE_CLIENT_SECRET='synthetic-secret';
 fs.writeFileSync(path.join(root,'techbrowser-settings.json'),JSON.stringify({termsAccepted:true,termsAcceptedVersion:require('../src/app-config').TERMS_VERSION}));
 const realFetch=global.fetch;let refreshed=false;
 global.fetch=async(url,options)=>{url=String(url);let data;
  if(url.startsWith('https://oauth2.googleapis.com/token'))data={id_token:'synthetic-google-token'};
  else if(url.includes('accounts:signInWithIdp'))data={idToken:'synthetic-firebase-token',refreshToken:'synthetic-refresh'};
  else if(url.includes('accounts:lookup'))data={users:[{localId:'google-test',email:'google@example.test',emailVerified:true,providerUserInfo:[{providerId:'google.com'}]}]};
  else if(url.startsWith('https://securetoken.googleapis.com/')){refreshed=true;assert.match(options.body,/refresh/);if(phase==='retry'&&!global.failedOnce){global.failedOnce=true;throw Error('fetch failed');}data={id_token:'renewed-token',refresh_token:'renewed-refresh'};}
  else throw Error('Unexpected network request');
  return{ok:true,json:async()=>data};
 };
 shell.openExternal=async input=>{const url=new URL(input);assert.equal(url.hostname,'accounts.google.com');const callback=new URL(url.searchParams.get('redirect_uri'));callback.hostname='127.0.0.1';callback.searchParams.set('code','synthetic-code');callback.searchParams.set('state',url.searchParams.get('state'));await realFetch(callback);};
 require('../main');
 const delay=ms=>new Promise(r=>setTimeout(r,ms));
 app.whenReady().then(async()=>{let win;for(let i=0;i<120;i++){win=BrowserWindow.getAllWindows()[0];if(win&&!win.webContents.isLoading()&&await win.webContents.executeJavaScript("typeof skipIntro==='function' && typeof cu!=='undefined'").catch(()=>false))break;await delay(100);}assert.ok(win,'Application window became ready');const evaluate=s=>win.webContents.executeJavaScript(s,true);await evaluate('skipIntro()');await delay(1800);
  if(phase==='login'){
   await evaluate("document.getElementById('rememberGoogle').checked=true;doGoogleLogin()");
   assert.equal(await evaluate('cu?.email'),'google@example.test');
   const file=fs.readFileSync(path.join(root,'techbrowser-auth.json'),'utf8');assert.equal(file.includes('synthetic-refresh'),false);assert.equal(JSON.parse(file).v,2);
   const avatar=require('electron').nativeImage.createFromPath(path.resolve('assets/icon.png')).toDataURL();
   const saved=await evaluate('window.electronAPI.invoke("profile-save-avatar",'+JSON.stringify({uid:'google-test',avatar})+')');
   assert.equal(saved.success,true);assert.ok(saved.user.avatar.startsWith('data:image/png;base64,'));
   const profileFile=fs.readFileSync(path.join(root,'techbrowser-profiles.json'),'utf8');assert.equal(profileFile.includes('data:image'),false);
   const forged=await evaluate('window.electronAPI.invoke("profile-save-avatar",'+JSON.stringify({uid:'other',avatar})+')');assert.equal(forged.success,false);
   console.log('PASS Google button persisted encrypted refresh token and avatar');
  }else{
   if(phase==='retry'){assert.equal(await evaluate('cu'),null);await evaluate("window.electronAPI.invoke('auth-profile').then(r=>{cu=r.user;})");}
   for(let i=0;i<50&&!await evaluate('!!cu');i++)await delay(100);
   assert.equal(await evaluate('cu?.email'),'google@example.test');assert.equal(refreshed,true);assert.ok(await evaluate("cu.avatar?.startsWith('data:image/png;base64,')"));console.log('PASS restarted source app restored Google account without login');
  }
  app.exit(0);
 }).catch(e=>{console.error(e);app.exit(1)});
 setTimeout(()=>app.exit(2),20000).unref();
}
