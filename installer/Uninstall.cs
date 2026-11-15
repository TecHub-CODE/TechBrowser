using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Markup;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Media.Imaging;
using System.Windows.Threading;

public class Uninstall : Window {
 FrameworkElement ui; bool busy, done, preview; string nativeUninstaller;
 readonly DispatcherTimer mottoTimer=new DispatcherTimer { Interval=TimeSpan.FromSeconds(5) };
 readonly string[] mottos={"Yeniden görüşmek üzere.","Kapımız her zaman açık.","Dilediğiniz zaman geri dönebilirsiniz."};
 int mottoIndex;
 T Find<T>(string name) where T:class { return ui.FindName(name) as T; }
 static Stream Resource(string name) { return Assembly.GetExecutingAssembly().GetManifestResourceStream(name); }
 static string Read(string name) { using(var s=Resource(name)) using(var r=new StreamReader(s)) return r.ReadToEnd(); }
 void Text(string name,string value) { Find<TextBlock>(name).Text=value; }
 void Picture(string name,string resource) { using(var stream=Resource(resource)){var b=new BitmapImage();b.BeginInit();b.CacheOption=BitmapCacheOption.OnLoad;b.StreamSource=stream;b.EndInit();b.Freeze();Find<Image>(name).Source=b;} }

 public Uninstall(string uninstaller,bool isPreview) {
  nativeUninstaller=uninstaller;preview=isPreview;Width=1040;Height=650;ResizeMode=ResizeMode.NoResize;WindowStyle=WindowStyle.None;AllowsTransparency=true;Background=Brushes.Transparent;WindowStartupLocation=WindowStartupLocation.CenterScreen;Title="TechBrowser Kaldırma Sihirbazı";
  ui=(FrameworkElement)XamlReader.Parse(Read("window.xaml"));Content=ui;
  Picture("Art","glass.png");Picture("HeaderLogo","browser.png");Picture("BrowserLogo","browser.png");Picture("StudioLogo","studio.png");
  Text("Heading","TechBrowser kaldırılsın mı?");Text("Subtitle","Gittiğinizi görmek üzücü. Uygulama kaldırılacak; kişisel tarayıcı verileriniz korunacak.");Text("Status","Kaldırmaya hazır");Text("Hint","Devam etmeden önce açık TechBrowser pencerelerini kapatın.");Text("Step1","01  Hazırlık");Text("Step2","02  Kaldırma");Text("Step3","03  Tamamlandı");Text("Motto",mottos[0]);
  Find<StackPanel>("Options").Visibility=Visibility.Collapsed;Find<Border>("DeleteDataOption").Visibility=Visibility.Visible;Find<Button>("Action").Content="Kaldır";Find<Button>("Cancel").Content="İptal";Text("FooterNote","Güvenli kaldırma");
  Find<CheckBox>("DeleteData").Checked+=(s,e)=>{Find<Button>("Action").Content="Her şeyi kaldır";Text("FooterNote","Bu işlem geri alınamaz");};
  Find<CheckBox>("DeleteData").Unchecked+=(s,e)=>{Find<Button>("Action").Content="Kaldır";Text("FooterNote","Güvenli kaldırma");};
  mottoTimer.Tick+=(s,e)=>{if(WindowState==WindowState.Minimized)return;var label=Find<TextBlock>("Motto");if(!SystemParameters.ClientAreaAnimation){label.Text=mottos[++mottoIndex%mottos.Length];return;}var fade=new DoubleAnimation(1,0,TimeSpan.FromMilliseconds(240));fade.Completed+=(ss,ee)=>{label.Text=mottos[++mottoIndex%mottos.Length];label.BeginAnimation(OpacityProperty,new DoubleAnimation(0,1,TimeSpan.FromMilliseconds(360)));};label.BeginAnimation(OpacityProperty,fade);};
  Loaded+=(s,e)=>mottoTimer.Start();Closed+=(s,e)=>mottoTimer.Stop();
  Find<Button>("Close").Click+=(s,e)=>Close();Find<Button>("Cancel").Click+=(s,e)=>Close();Find<Button>("Minimize").Click+=(s,e)=>WindowState=WindowState.Minimized;
  MouseLeftButtonDown+=(s,e)=>{if(e.GetPosition(this).Y<60)DragMove();};
  Closing+=(s,e)=>{if(busy){e.Cancel=true;Text("Hint","Kaldırma sürüyor. İşlemin tamamlanmasını bekleyin.");}};
  Find<Button>("Action").Click+=async(s,e)=>{if(done){Close();return;}if(!preview)await Remove();};
 }

 async Task Remove() {
  bool deleteData=Find<CheckBox>("DeleteData").IsChecked==true;
  busy=true;Find<Button>("Action").IsEnabled=false;Find<Button>("Cancel").IsEnabled=false;Find<CheckBox>("DeleteData").IsEnabled=false;
  Text("Heading","TechBrowser kaldırılıyor");Text("Subtitle",deleteData?"Uygulama ve bu cihazdaki kişisel verileriniz kalıcı olarak kaldırılıyor.":"Uygulama ve kısayollar kaldırılıyor. Kişisel verileriniz sizde kalacak.");Text("Status","Kaldırma devam ediyor");Text("Hint","Bu pencereyi açık tutun.");Text("Step1","01  Tamamlandı");Text("Step2","02  Kaldırılıyor");Find<ProgressBar>("Progress").IsIndeterminate=true;Find<Button>("Action").Content="Kaldırılıyor";
  try {
   if(String.IsNullOrWhiteSpace(nativeUninstaller)||!File.Exists(nativeUninstaller))throw new FileNotFoundException("TechBrowser kaldırma dosyası bulunamadı.");
   if(Process.GetProcessesByName("TechBrowser02").Length>0)throw new InvalidOperationException("Devam etmek için tüm TechBrowser pencerelerini kapatın.");
   int code=await Task.Run(()=>{var info=new ProcessStartInfo(nativeUninstaller,"/S /currentuser"){UseShellExecute=false,CreateNoWindow=true};using(var process=Process.Start(info)){process.WaitForExit();return process.ExitCode;}});
   if(code!=0)throw new InvalidOperationException("Kaldırma tamamlanamadı (kod "+code+").");
   if(deleteData)await Task.Run(new Action(DeleteKnownUserData));
   Find<ProgressBar>("Progress").IsIndeterminate=false;Find<ProgressBar>("Progress").Value=100;Text("Percent","100%");Text("Heading",deleteData?"Tamamen kaldırıldı":"Yeniden görüşmek üzere");Text("Subtitle",deleteData?"TechBrowser ve bu cihazdaki kişisel verileriniz kaldırıldı.":"TechBrowser kaldırıldı. Dilediğiniz zaman geri dönebilirsiniz.");Text("Status","Kaldırma tamamlandı");Text("Hint",deleteData?"Bulut hesabınız ve buluttaki verileriniz etkilenmedi.":"Kişisel tarayıcı verileriniz korundu.");Text("Step2","02  Tamamlandı");Text("Step3","03  Hazır");Find<Button>("Action").Content="Kapat";Find<Button>("Cancel").Visibility=Visibility.Collapsed;Find<Border>("DeleteDataOption").Visibility=Visibility.Collapsed;done=true;
  } catch(Exception ex) {
   Find<ProgressBar>("Progress").IsIndeterminate=false;Text("Heading","Kaldırma tamamlanamadı.");Text("Status","Tekrar deneyebilirsiniz");Text("Hint",ex.Message);Text("Percent","");Find<Button>("Action").Content="Tekrar dene";
  } finally {busy=false;Find<Button>("Action").IsEnabled=true;Find<Button>("Cancel").IsEnabled=true;Find<CheckBox>("DeleteData").IsEnabled=true;}
 }

 static void DeleteKnownUserData() {
  string roaming=Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),local=Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
  DeleteDirectory(Path.Combine(roaming,"TechBrowser02"));
  DeleteDirectory(Path.Combine(local,"TechBrowser02"));
  DeleteDirectory(Path.Combine(local,"techbrowser02-updater"));
 }
 static void DeleteDirectory(string target) {
  if(String.IsNullOrWhiteSpace(target)||!Directory.Exists(target))return;
  string full=Path.GetFullPath(target),parent=Path.GetDirectoryName(full),name=Path.GetFileName(full);
  if(String.IsNullOrWhiteSpace(parent)||(name!="TechBrowser02"&&!name.Equals("techbrowser02-updater",StringComparison.OrdinalIgnoreCase)))throw new InvalidOperationException("Güvenli olmayan veri yolu reddedildi.");
  Exception last=null;
  for(int attempt=0;attempt<5;attempt++)try { foreach(string file in Directory.GetFiles(full,"*",SearchOption.AllDirectories))File.SetAttributes(file,FileAttributes.Normal);Directory.Delete(full,true);return; } catch(Exception ex) { last=ex;System.Threading.Thread.Sleep(250); }
  throw new IOException("Bazı kişisel veriler silinemedi. TechBrowser'ın kapalı olduğundan emin olup yeniden deneyin.",last);
 }

 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool MoveFileEx(string existing,string replacement,int flags);
 static string Quote(string value) { return "\""+value.Replace("\"","\\\"")+"\""; }
 [STAThread] public static void Main(string[] args) {
  bool preview=Array.IndexOf(args,"--preview")>=0;int worker=Array.IndexOf(args,"--worker");
  if(!preview&&worker<0) {
   string source=Assembly.GetExecutingAssembly().Location,uninstaller=Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"Uninstall TechBrowser02.exe");
   string temp=Path.Combine(Path.GetTempPath(),"TechBrowser-Uninstall-"+Guid.NewGuid().ToString("N")+".exe");File.Copy(source,temp,true);
   Process.Start(new ProcessStartInfo(temp,"--worker "+Quote(uninstaller)){UseShellExecute=true});return;
  }
  string native=worker>=0&&worker+1<args.Length?args[worker+1]:"preview";var app=new Application();var window=new Uninstall(native,preview);
  int capture=Array.IndexOf(args,"--capture");if(capture>=0&&capture+1<args.Length){window.Loaded+=(s,e)=>{var timer=new DispatcherTimer{Interval=TimeSpan.FromSeconds(1)};timer.Tick+=(ss,ee)=>{timer.Stop();var bitmap=new RenderTargetBitmap((int)window.Width,(int)window.Height,96,96,PixelFormats.Pbgra32);bitmap.Render(window.ui);var encoder=new PngBitmapEncoder();encoder.Frames.Add(BitmapFrame.Create(bitmap));using(var file=File.Create(args[capture+1]))encoder.Save(file);window.Close();};timer.Start();};}
  app.Run(window);if(worker>=0)MoveFileEx(Assembly.GetExecutingAssembly().Location,null,4);
 }
}
