using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Diagnostics;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Media;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Markup;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Media.Animation;
using System.Windows.Threading;

public sealed class HardwareProfile {
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Auto)] struct MemoryStatus { public uint Length,Load;public ulong TotalPhysical,AvailablePhysical,TotalPage,AvailablePage,TotalVirtual,AvailableVirtual,AvailableExtended; }
 [DllImport("kernel32.dll",CharSet=CharSet.Auto,SetLastError=true)] static extern bool GlobalMemoryStatusEx(ref MemoryStatus status);
 public int MemoryGB,LogicalProcessors; public bool RecommendPerformance;
 public static HardwareProfile Detect() {
  var status=new MemoryStatus();status.Length=(uint)Marshal.SizeOf(typeof(MemoryStatus));ulong bytes=0;if(GlobalMemoryStatusEx(ref status))bytes=status.TotalPhysical;
  var profile=new HardwareProfile { MemoryGB=(int)Math.Max(1,Math.Round(bytes/1024d/1024d/1024d)),LogicalProcessors=Math.Max(1,Environment.ProcessorCount) };
  profile.RecommendPerformance=profile.MemoryGB<=8||profile.LogicalProcessors<=4;return profile;
 }
 public static HardwareProfile SimulatedLowEnd() { return new HardwareProfile { MemoryGB=4,LogicalProcessors=2,RecommendPerformance=true }; }
 public void SavePerformanceMode(bool enabled) {
  string directory=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),"TechBrowser02");Directory.CreateDirectory(directory);string target=Path.Combine(directory,"performance-mode.json"),temporary=target+".tmp";
  File.WriteAllText(temporary,"{\"enabled\":"+(enabled?"true":"false")+",\"source\":\"installer-hardware-check\",\"memoryGB\":"+MemoryGB+",\"logicalProcessors\":"+LogicalProcessors+"}");if(File.Exists(target))File.Delete(target);File.Move(temporary,target);
 }
}

public sealed class SetupIntro : Window {
 const int IntroFrameLimit=160;
 readonly Image frame=new Image { Stretch=Stretch.Uniform }; readonly DispatcherTimer frameTimer=new DispatcherTimer { Interval=TimeSpan.FromMilliseconds(50) }; Stream archiveStream; ZipArchive archive; ZipArchiveEntry[] frames; int frameIndex; bool finishing;
 public event Action Completed;
 static Stream Resource(string name) { return Assembly.GetExecutingAssembly().GetManifestResourceStream(name); }
 public SetupIntro() {
  Width=960;Height=540;ResizeMode=ResizeMode.NoResize;WindowStyle=WindowStyle.None;AllowsTransparency=true;WindowStartupLocation=WindowStartupLocation.CenterScreen;Title="TechBrowser";Background=Brushes.Transparent;ShowInTaskbar=false;Topmost=true;Content=frame;
  RenderOptions.SetBitmapScalingMode(frame,BitmapScalingMode.HighQuality);frameTimer.Tick+=(s,e)=>ShowNextFrame();Loaded+=(s,e)=>StartPlayback();Closed+=(s,e)=>Cleanup();
 }
 void StartPlayback() {
  try {
   archiveStream=Resource("setupintro-frames.zip");if(archiveStream==null){Finish();return;}archive=new ZipArchive(archiveStream,ZipArchiveMode.Read);var list=new List<ZipArchiveEntry>();foreach(var entry in archive.Entries){if(entry.Name.StartsWith("frame-",StringComparison.Ordinal)&&entry.Name.EndsWith(".png",StringComparison.OrdinalIgnoreCase))list.Add(entry);}list.Sort((a,b)=>StringComparer.Ordinal.Compare(a.Name,b.Name));frames=list.ToArray();if(frames.Length==0){Finish();return;}ShowNextFrame();frameTimer.Start();
  }catch{Finish();}
 }
 void ShowNextFrame() {
  if(frames==null||frameIndex>=frames.Length||frameIndex>=IntroFrameLimit){Finish();return;}try{using(var source=frames[frameIndex++].Open())using(var stream=new MemoryStream()){source.CopyTo(stream);stream.Position=0;var image=new BitmapImage();image.BeginInit();image.CacheOption=BitmapCacheOption.OnLoad;image.StreamSource=stream;image.EndInit();image.Freeze();frame.Source=image;}}catch{Finish();}
 }
 void Finish() {
  if(finishing)return;finishing=true;frameTimer.Stop();var fade=new DoubleAnimation(1,0,TimeSpan.FromMilliseconds(320));fade.EasingFunction=new QuadraticEase { EasingMode=EasingMode.EaseInOut };fade.Completed+=(s,e)=>{Hide();if(Completed!=null)Completed();};BeginAnimation(OpacityProperty,fade);
 }
 void Cleanup() {
  frameTimer.Stop();frame.Source=null;try{if(archive!=null)archive.Dispose();if(archiveStream!=null)archiveStream.Dispose();}catch{}
 }
}

public class Setup : Window {
 readonly DispatcherTimer mottoTimer=new DispatcherTimer { Interval=TimeSpan.FromSeconds(5) };
 readonly string[] mottos={"Kendi alanınız. Kendi tarayıcınız.","Daha sakin. Daha size ait.","Web, sizin ritminizde."};
 int mottoIndex;
 FrameworkElement ui; bool busy, done, preview, choosingPerformance; HardwareProfile pendingHardware; string destination, temp;
 SoundPlayer narrator;
 CheckBox voiceGuide;
 DispatcherTimer voiceDelay;
 bool welcoming;
 T Find<T>(string name) where T:class { return ui.FindName(name) as T; }
 static Stream Resource(string name) { return Assembly.GetExecutingAssembly().GetManifestResourceStream(name); }
 static string Read(string name) { using(var s=Resource(name)) using(var r=new StreamReader(s)) return r.ReadToEnd(); }
 void Text(string name,string value) { Find<TextBlock>(name).Text=value; }
 void Picture(string name,string resource) { using(var stream=Resource(resource)){var b=new BitmapImage();b.BeginInit();b.CacheOption=BitmapCacheOption.OnLoad;b.StreamSource=stream;b.EndInit();b.Freeze();Find<Image>(name).Source=b;} }
 public Setup(bool isPreview, bool enableVoiceGuide) {
  preview=isPreview; Width=1040;Height=650;ResizeMode=ResizeMode.NoResize;WindowStyle=WindowStyle.None;AllowsTransparency=true;Background=Brushes.Transparent;WindowStartupLocation=WindowStartupLocation.CenterScreen;Title="TechBrowser Kurulumu";
  ui=(FrameworkElement)XamlReader.Parse(Read("window.xaml"));Content=ui;
  Picture("Art","glass.png");
  mottoTimer.Tick+=(s,e)=>{if(WindowState==WindowState.Minimized)return;var label=Find<TextBlock>("Motto");if(!SystemParameters.ClientAreaAnimation){label.Text=mottos[++mottoIndex%mottos.Length];return;}var fade=new DoubleAnimation(1,0,TimeSpan.FromMilliseconds(240));fade.Completed+=(ss,ee)=>{label.Text=mottos[++mottoIndex%mottos.Length];label.BeginAnimation(OpacityProperty,new DoubleAnimation(0,1,TimeSpan.FromMilliseconds(360)));};label.BeginAnimation(OpacityProperty,fade);};
  Loaded+=(s,e)=>mottoTimer.Start();Closed+=(s,e)=>mottoTimer.Stop();
  Picture("HeaderLogo","browser.png");Picture("BrowserLogo","browser.png");Picture("StudioLogo","studio.png");
  destination=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Programs","TechBrowser02");Text("InstallPath",destination);
  Find<Button>("Close").Click+=(s,e)=>Close();Find<Button>("Cancel").Click+=(s,e)=>Close();Find<Button>("Minimize").Click+=(s,e)=>WindowState=WindowState.Minimized;
  Find<Button>("StandardMode").Click+=(s,e)=>CompletePerformanceChoice(false);Find<Button>("EnablePerformance").Click+=(s,e)=>CompletePerformanceChoice(true);
  MouseLeftButtonDown+=(s,e)=>{if(e.GetPosition(this).Y<60)DragMove();};
  Closing+=(s,e)=>{if(busy){e.Cancel=true;Text("Hint","Kurulum sürüyor. Dosyaların tamamlanmasını bekleyin.");}};
  Find<Button>("Location").Click+=(s,e)=>{using(var d=new System.Windows.Forms.FolderBrowserDialog()){d.Description="TechBrowser kurulum klasörü";d.SelectedPath=destination;if(d.ShowDialog()==System.Windows.Forms.DialogResult.OK){destination=d.SelectedPath;Text("InstallPath",destination);}}};
  Find<Button>("License").Click+=(s,e)=>{var w=new Window{Title="TechBrowser — Lisans koşulları",Owner=this,Width=700,Height=500,Background=new SolidColorBrush(Color.FromRgb(19,22,27)),WindowStartupLocation=WindowStartupLocation.CenterOwner};w.Content=new TextBox{Text=Read("license.txt"),IsReadOnly=true,TextWrapping=TextWrapping.Wrap,VerticalScrollBarVisibility=ScrollBarVisibility.Auto,Padding=new Thickness(24),FontFamily=new FontFamily("Segoe UI"),FontSize=14,Foreground=new SolidColorBrush(Color.FromRgb(245,246,248)),Background=new SolidColorBrush(Color.FromRgb(19,22,27)),BorderThickness=new Thickness(0)};w.ShowDialog();};
  Find<Button>("Action").Click+=async(s,e)=>{if(done){try{Process.Start(new ProcessStartInfo(Path.Combine(destination,"TechBrowser02.exe")){UseShellExecute=true});Close();}catch(Exception ex){Text("Hint","Tarayıcı açılamadı: "+ex.Message);}return;}if(!preview)await Install();};
  Loaded+=(s,e)=>{ui.BeginAnimation(OpacityProperty,new DoubleAnimation(0,1,TimeSpan.FromMilliseconds(300)));if(preview && Array.IndexOf(Environment.GetCommandLineArgs(),"--ready")<0){Text("Heading","TechBrowser hazırlanıyor");Text("Subtitle","Gerekli dosyalar kuruluyor. Bu işlem genellikle birkaç saniye sürer.");Text("Status","Kurulum devam ediyor");Text("Percent","68%");Find<ProgressBar>("Progress").Value=68;Text("Hint","Önizleme — bilgisayarınıza kurulum yapılmaz.");Text("Step1","01  Tamamlandı");Text("Step2","02  Kuruluyor");Find<StackPanel>("Options").Visibility=Visibility.Collapsed;Find<Button>("Action").Visibility=Visibility.Collapsed;}};
  if(enableVoiceGuide) ContentRendered+=(s,e)=>StartVoiceGuide();
 }
 void StartVoiceGuide() {
  if(voiceGuide!=null)return;
  voiceGuide=Find<CheckBox>("VoiceGuide");
  voiceGuide.Visibility=Visibility.Visible;
  var focusTemplate=new ControlTemplate(typeof(Control));
  var outline=new FrameworkElementFactory(typeof(Border));
  outline.SetValue(Border.BorderBrushProperty,Brushes.White);
  outline.SetValue(Border.BorderThicknessProperty,new Thickness(2));
  outline.SetValue(Border.MarginProperty,new Thickness(-3));
  outline.SetValue(Border.CornerRadiusProperty,new CornerRadius(5));
  focusTemplate.VisualTree=outline;
  var focusStyle=new Style(typeof(Control));
  focusStyle.Setters.Add(new Setter(Control.TemplateProperty,focusTemplate));
  foreach(var name in new[]{"VoiceGuide","Minimize","Close","Location","License","StandardMode","EnablePerformance","Cancel","Action"})
   Find<Control>(name).FocusVisualStyle=focusStyle;
  voiceDelay=new DispatcherTimer { Interval=TimeSpan.FromSeconds(1) };
  voiceDelay.Tick+=(s,e)=>{voiceDelay.Stop();welcoming=false;FocusAndRead(choosingPerformance?"StandardMode":"Action",true);};
  voiceGuide.Checked+=(s,e)=>ReadFocusedControl();
  voiceGuide.Unchecked+=(s,e)=>StopReading();
  GotKeyboardFocus+=(s,e)=>ReadFocusedControl();
  Activated+=(s,e)=>FocusAndRead(choosingPerformance?"StandardMode":"Action",true);
  Deactivated+=(s,e)=>StopReading();
  Closed+=(s,e)=>StopReading();

  try {
   welcoming=true;
   Find<Button>(choosingPerformance?"StandardMode":"Action").Focus();
   voiceDelay.Interval=PlayVoice("Welcome")+TimeSpan.FromSeconds(1);
   voiceDelay.Start();
  }catch{VoiceUnavailable("Sesli rehber başlatılamadı.");}
 }
 TimeSpan PlayVoice(string clip) {
  StopPlayback();
  var stream=Resource("voice."+clip+".wav");
  if(stream==null)throw new InvalidDataException("Ses kaydı bulunamadı: "+clip);
  narrator=new SoundPlayer(stream);
  // The generated WAV files use a 44-byte PCM header.
  double seconds;
  using(var reader=new BinaryReader(stream,System.Text.Encoding.UTF8,true)){
   stream.Position=28;
   seconds=(stream.Length-44)/(double)reader.ReadUInt32();
  }
  stream.Position=0;
  narrator.Load();
  narrator.Play();
  return TimeSpan.FromSeconds(seconds);
 }
 void StopPlayback() {
  if(narrator==null)return;
  narrator.Stop();
  narrator.Stream.Dispose();
  narrator.Dispose();
  narrator=null;
 }
 void VoiceUnavailable(string message) {
  StopReading();
  voiceGuide.IsChecked=false;
  voiceGuide.IsEnabled=false;
  Text("VoiceStatus",message);
  Find<TextBlock>("VoiceStatus").Visibility=Visibility.Visible;
  System.Windows.Automation.AutomationProperties.SetHelpText(voiceGuide,message);
 }
 void StopReading() {
  voiceDelay.Stop();
  welcoming=false;
  StopPlayback();
 }
 void FocusAndRead(string name,bool keepCurrentFocus=false) {
  if(voiceGuide==null || voiceGuide.IsChecked!=true || welcoming || !IsActive)return;
  var target=Find<Control>(name);
  if((!keepCurrentFocus || !IsKeyboardFocusWithin) && target.IsEnabled && target.IsVisible){
   if(!target.IsKeyboardFocused && target.Focus())return; // The focus handler reads it.
  }
  ReadFocusedControl();
 }
 void ReadFocusedControl() {
  if(voiceGuide.IsChecked!=true || !IsActive || welcoming)return;
  var control=Keyboard.FocusedElement as Control;
  if(control==null || !IsKeyboardFocusWithin)return;
  string clip=control.Name;
  switch(clip){
   case "Action": clip=done?"Launch":Equals(((Button)control).Content,"Tekrar dene")?"Retry":"Action";break;
   case "Cancel": if(done)clip="Finish";break;
   case "VoiceGuide":case "Minimize":case "Close":case "Location":case "License":case "StandardMode":case "EnablePerformance":break;
   default:return;
  }
  try {
   PlayVoice(clip);
  }catch{VoiceUnavailable("Ses çıkışı kullanılamıyor.");}
 }
 public void ShowHardwareRecommendation(HardwareProfile profile) {
  if(profile==null||!profile.RecommendPerformance)return;pendingHardware=profile;choosingPerformance=true;
  string memoryLabel=profile.MemoryGB<=4?"4 GB veya daha az":profile.MemoryGB<=8?"8 GB veya daha az":profile.MemoryGB+" GB";
  Text("Heading","Daha akıcı bir başlangıç");Text("Subtitle","Donanımınıza uygun olarak arka plan optimizasyonları ve hafif performans modu önerilir.");Text("DetectedMemory","Cihazınızda "+memoryLabel+" sistem belleği tespit edildi.");Text("FooterNote","Cihazınıza göre önerildi");
  Find<Border>("InstallCard").Visibility=Visibility.Collapsed;Find<StackPanel>("PerformanceStep").Visibility=Visibility.Visible;Find<StackPanel>("Options").Visibility=Visibility.Collapsed;Find<StackPanel>("DefaultActions").Visibility=Visibility.Collapsed;Find<StackPanel>("PerformanceActions").Visibility=Visibility.Visible;
 }
 void CompletePerformanceChoice(bool enabled) {
  if(!choosingPerformance)return;choosingPerformance=false;try{pendingHardware.SavePerformanceMode(enabled);}catch{}
  Text("Heading","Başlamaya hazırsınız.");Text("Subtitle","TechHub ailesine hoş geldiniz. Kurulum yalnızca birkaç saniye sürecek.");Text("FooterNote","Güvenli kurulum");
  Find<Border>("InstallCard").Visibility=Visibility.Visible;Find<StackPanel>("PerformanceStep").Visibility=Visibility.Collapsed;Find<StackPanel>("Options").Visibility=Visibility.Visible;Find<StackPanel>("DefaultActions").Visibility=Visibility.Visible;Find<StackPanel>("PerformanceActions").Visibility=Visibility.Collapsed;
  FocusAndRead("Action");
 }
 async Task Install() {
  busy=true;Find<Button>("Action").IsEnabled=false;Find<Button>("Cancel").IsEnabled=false;Find<StackPanel>("Options").Visibility=Visibility.Collapsed;
  Text("Heading","TechBrowser hazırlanıyor");Text("Subtitle","Gerekli dosyalar kuruluyor. Bu işlem genellikle birkaç saniye sürer.");Text("Status","Kurulum başlatılıyor");Text("Hint","Bu pencereyi açık tutun.");Find<Button>("Action").Content="Kuruluyor";
  try {
   temp=Path.Combine(Path.GetTempPath(),"TechBrowser-Setup-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(temp);string payload=Path.Combine(temp,"installer.exe");
   await Task.Run(()=>{using(var source=Resource("payload.exe")){if(source==null)throw new InvalidOperationException("Kurulum paketi bulunamadı.");using(var target=File.Create(payload)){var bytes=new byte[1024*1024];long total=0;int count;while((count=source.Read(bytes,0,bytes.Length))>0){target.Write(bytes,0,count);total+=count;double p=100.0*total/source.Length;Dispatcher.Invoke(new Action(()=>{Find<ProgressBar>("Progress").Value=p;Text("Percent",((int)p)+"%");}));}}}using(var sha=SHA256.Create())using(var file=File.OpenRead(payload)){var actual=BitConverter.ToString(sha.ComputeHash(file)).Replace("-","");if(!String.Equals(actual,Read("payload.sha256").Trim(),StringComparison.OrdinalIgnoreCase))throw new InvalidDataException("Kurulum dosyasının bütünlüğü doğrulanamadı.");}});
   Text("Step1","01  Tamamlandı");Text("Step2","02  Kuruluyor");Text("Status","TechBrowser kuruluyor");Text("Percent","");Find<ProgressBar>("Progress").IsIndeterminate=true;
   // NSIS owns installation, shortcuts, upgrades and rollback. Never terminate it mid-write.
   int code=await Task.Run(()=>{var info=new ProcessStartInfo(payload,"/S /currentuser /D="+destination){UseShellExecute=false,CreateNoWindow=true};using(var p=Process.Start(info)){p.WaitForExit();return p.ExitCode;}});
   if(code!=0)throw new InvalidOperationException("Kurulum tamamlanamadı (kod "+code+").");
   if(!File.Exists(Path.Combine(destination,"TechBrowser02.exe")))throw new IOException("Kurulum sonucu doğrulanamadı.");
   Find<ProgressBar>("Progress").IsIndeterminate=false;Find<ProgressBar>("Progress").Value=100;Text("Percent","100%");Text("Heading","Hoş geldiniz");Text("Subtitle","TechBrowser hazır. İyi keşifler.");Text("Status","Kurulum tamamlandı");Text("Hint","TechBrowser'ı şimdi açabilirsiniz.");Text("Step2","02  Tamamlandı");Text("Step3","03  Hazır");Find<Button>("Action").Content="TechBrowser'ı aç";Find<Button>("Cancel").Content="Kapat";done=true;
  }catch(Exception ex){Find<ProgressBar>("Progress").IsIndeterminate=false;Text("Heading","Kurulum tamamlanamadı.");Text("Status","Tekrar deneyebilirsiniz");Text("Percent","");Text("Hint",ex.Message);Find<Button>("Action").Content="Tekrar dene";Find<StackPanel>("Options").Visibility=Visibility.Visible;}
  finally {busy=false;Find<Button>("Action").IsEnabled=true;Find<Button>("Cancel").IsEnabled=true;if(temp!=null){try{Directory.Delete(temp,true);}catch{}}FocusAndRead("Action");}
 }
 [STAThread] public static void Main(string[] args) {
  var app=new Application();bool hardwarePreview=Array.IndexOf(args,"--preview-hardware")>=0;bool previewMode=Array.IndexOf(args,"--preview")>=0||Array.IndexOf(args,"--capture")>=0||hardwarePreview;
  bool automated=previewMode||Array.IndexOf(args,"--test-install")>=0;
  var w=new Setup(previewMode,!automated||Array.IndexOf(args,"--preview-voice")>=0);
  if(hardwarePreview)w.Loaded+=(s,e)=>w.ShowHardwareRecommendation(HardwareProfile.SimulatedLowEnd());
#if TESTING
  if(args.Length==2&&args[0]=="--test-install") {w.destination=args[1];w.Loaded+=async(s,e)=>{await w.Install();app.Shutdown(w.done?0:3);};}
  if(Array.IndexOf(args,"--test-voice")>=0) {
   w.ContentRendered+=(s,e)=>{
    w.StartVoiceGuide();
    bool started=w.welcoming && w.voiceDelay.IsEnabled && w.voiceDelay.Interval.TotalSeconds>1;
    w.StopReading();
    w.done=true;
    w.FocusAndRead("Action");
    bool launchRead=w.Find<Button>("Action").IsKeyboardFocused && w.narrator!=null &&
     w.narrator.Stream.Length==Resource("voice.Launch.wav").Length;
    w.voiceGuide.IsChecked=false;
    bool stopped=!w.welcoming && !w.voiceDelay.IsEnabled && w.narrator==null;
    app.Shutdown(started && launchRead && stopped?0:4);
   };
   app.Run(w);return;
  }
#endif
  int capture=Array.IndexOf(args,"--capture");if(capture>=0&&capture+1<args.Length){w.Loaded+=(s,e)=>{var timer=new DispatcherTimer{Interval=TimeSpan.FromSeconds(1)};timer.Tick+=(ss,ee)=>{timer.Stop();var bitmap=new RenderTargetBitmap((int)w.Width,(int)w.Height,96,96,PixelFormats.Pbgra32);bitmap.Render(w.ui);var encoder=new PngBitmapEncoder();encoder.Frames.Add(BitmapFrame.Create(bitmap));using(var f=File.Create(args[capture+1]))encoder.Save(f);w.Close();};timer.Start();};}
  if(automated){app.Run(w);return;}
  app.ShutdownMode=ShutdownMode.OnExplicitShutdown;var intro=new SetupIntro();bool testLow=Array.IndexOf(args,"--test-low-hardware")>=0;var hardwareTask=Task.Run(()=>testLow?HardwareProfile.SimulatedLowEnd():HardwareProfile.Detect());
  intro.Completed+=()=>{try{var hardware=hardwareTask.GetAwaiter().GetResult();w.ShowHardwareRecommendation(hardware);}catch(Exception ex){if(testLow){try{File.WriteAllText(Path.Combine(Path.GetTempPath(),"TechBrowser-HardwarePrompt-error.txt"),ex.ToString());}catch{}}}app.MainWindow=w;w.Show();app.ShutdownMode=ShutdownMode.OnLastWindowClose;intro.Close();};intro.Show();app.Run();
 }
}
