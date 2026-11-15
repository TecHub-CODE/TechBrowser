; Keep NSIS responsible for removing files, shortcuts and its registry records.
; The interactive wizard is also used by Windows Settings > Installed apps.
!define MUI_BGCOLOR "13161B"
!define MUI_TEXTCOLOR "F5F6F8"
!define MUI_INSTFILESPAGE_COLORS "F5F6F8 0A0B0D"
!ifdef BUILD_UNINSTALLER
!define MUI_FINISHPAGE_TITLE "TechBrowser kaldırıldı"
!define MUI_FINISHPAGE_TEXT "TechBrowser bu bilgisayardan kaldırıldı.$\r$\n$\r$\nYer imleriniz, geçmişiniz ve hesap verileriniz korundu. Yeniden kurduğunuzda kullanabilirsiniz."
!endif

!macro customUnWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "TechBrowser kaldırma sihirbazı"
  !define MUI_WELCOMEPAGE_TEXT "Bu sihirbaz TechBrowser uygulamasını ve kısayollarını bilgisayarınızdan kaldırır.$\r$\n$\r$\nYer imleriniz, geçmişiniz ve hesap verileriniz silinmez.$\r$\n$\r$\nDevam etmeden önce TechBrowser pencerelerini kapatın."
  !insertmacro MUI_UNPAGE_WELCOME
  !insertmacro MUI_UNPAGE_CONFIRM
!macroend

!macro customInstall
  WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" UninstallString '"$INSTDIR\TechBrowser-Uninstall.exe"'
  CreateShortcut "$SMPROGRAMS\TechBrowser Kaldır.lnk" "$INSTDIR\TechBrowser-Uninstall.exe"
!macroend

!macro customUnInstall
  Delete "$SMPROGRAMS\TechBrowser Kaldır.lnk"
!macroend
