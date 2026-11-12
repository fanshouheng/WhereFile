using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using Microsoft.Win32;

static class Program
{
    internal static readonly string DataDirectory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "HaiyuWallpaper");
    internal static readonly JavaScriptSerializer Json = new JavaScriptSerializer();
    internal const string EventPrefix = "Local\\HaiyuWallpaper.";

    [STAThread]
    static void Main(string[] args)
    {
        string command = args.Length == 0 ? "manage" : args[0].TrimStart('-').ToLowerInvariant();
        Directory.CreateDirectory(DataDirectory);
        if(command=="recover"){
            if(args.Length>1){try{Process.GetProcessById(Int32.Parse(args[1])).WaitForExit();}catch(ArgumentException){}}
            using(var recoveryMutex=new Mutex(false,EventPrefix+"Instance")){
                try{recoveryMutex.WaitOne();}catch(AbandonedMutexException){}
                try{using(var shell=new DesktopShell())DesktopBoats.Recover(shell);}catch(Exception e){Log("Recovery: "+e.Message);}finally{recoveryMutex.ReleaseMutex();}
            }
            return;
        }
        if(command=="desktop-check"){
            try{using(var shell=new DesktopShell())File.WriteAllText(Path.Combine(DataDirectory,"desktop-check.json"),Json.Serialize(new{count=shell.Read().Count,autoArrange=shell.AutoArrange,view=shell.ViewHandle.ToInt64()}));}
            catch(Exception e){File.WriteAllText(Path.Combine(DataDirectory,"desktop-check.json"),Json.Serialize(new{error=e.ToString()}));}return;
        }
        if (command == "status")
        {
            string status = Path.Combine(DataDirectory, "status.json");
            if (File.Exists(status)) Console.WriteLine(File.ReadAllText(status));
            return;
        }
        bool created;
        using (Mutex mutex = new Mutex(true, EventPrefix + "Instance", out created))
        {
            if (!created)
            {
                Native.AllowSetForegroundWindow(-1);
                try { using (EventWaitHandle signal = EventWaitHandle.OpenExisting(EventPrefix + command)) signal.Set(); }
                catch (WaitHandleCannotBeOpenedException) { }
                return;
            }
            if (command == "exit") return;
            try { Native.SetProcessDpiAwarenessContext(new IntPtr(-4)); }
            catch (EntryPointNotFoundException) { Native.SetProcessDPIAware(); }
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
            Application.ThreadException += delegate(object s, ThreadExceptionEventArgs e) { Log(e.Exception.ToString()); };
            AppDomain.CurrentDomain.UnhandledException += delegate(object s, UnhandledExceptionEventArgs e) { Log(Convert.ToString(e.ExceptionObject)); };
            try { Application.Run(new WallpaperContext(command == "wallpaper")); }
            catch (Exception error)
            {
                Log(error.ToString());
                MessageBox.Show("海屿未能启动。请查看本机日志：\n" + Path.Combine(DataDirectory, "host.log") + "\n\n" + error.Message, "海屿壁纸", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
    }

    internal static void Log(string message)
    {
        try { File.AppendAllText(Path.Combine(DataDirectory, "host.log"), DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss ") + message + Environment.NewLine, Encoding.UTF8); }
        catch { }
    }
}

sealed class WallpaperContext : ApplicationContext
{
    readonly Dictionary<string, EventWaitHandle> commands = new Dictionary<string, EventWaitHandle>();
    readonly System.Windows.Forms.Timer timer = new System.Windows.Forms.Timer();
    readonly NotifyIcon tray;
    readonly ToolStripMenuItem pauseItem;
    readonly Dictionary<string,ToolStripMenuItem> wallpaperItems=new Dictionary<string,ToolStripMenuItem>();
    IslandWindow window;
    bool exiting, locked, userPaused, wantedWallpaper, ticking;
    int ticks;
    internal bool UserPaused { get { return userPaused; } }
    internal bool Exiting { get { return exiting; } }

    internal WallpaperContext(bool wallpaper)
    {
        wantedWallpaper = wallpaper;
        foreach (string command in new[] { "manage", "wallpaper", "exit" })
            commands.Add(command, new EventWaitHandle(false, EventResetMode.AutoReset, Program.EventPrefix + command));
        ContextMenuStrip menu = new ContextMenuStrip();
        menu.Items.Add("管理小船", null, delegate { Manage(); });
        menu.Items.Add("设为桌面壁纸", null, delegate { ApplyWallpaper(); });
        var scenery=new ToolStripMenuItem("换壁纸");
        foreach(var scene in new[]{new[]{"tropical","热带海湾"},new[]{"snow","雪松湖岸"},new[]{"autumn","秋日湖畔"}}){
            string id=scene[0];var item=new ToolStripMenuItem(scene[1]);
            item.Click+=delegate{window.Post(new{type="choose-wallpaper",id=id});};
            scenery.DropDownItems.Add(item);wallpaperItems.Add(id,item);
        }
        menu.Items.Add(scenery);
        pauseItem = new ToolStripMenuItem("暂停漂流", null, delegate { SetPaused(!userPaused); });
        menu.Items.Add(pauseItem);
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("退出海屿", null, delegate { Quit(); });
        tray = new NotifyIcon { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath), Text = "海屿壁纸 · 双击管理小船", ContextMenuStrip = menu, Visible = true };
        tray.DoubleClick += delegate { Manage(); };
        SystemEvents.SessionSwitch += SessionChanged;
        SystemEvents.DisplaySettingsChanged += DisplayChanged;
        CreateWindow(wallpaper);
        timer.Interval = 750;
        timer.Tick += Tick;
        timer.Start();
        Program.Log("Started " + (wallpaper ? "wallpaper" : "manager"));
    }

    void CreateWindow(bool wallpaper)
    {
        window = new IslandWindow(this, wallpaper);
        window.FormClosed += delegate { if (!exiting) Quit(); };
        window.Show();
    }

    void SessionChanged(object sender, SessionSwitchEventArgs e)
    {
        if (e.Reason == SessionSwitchReason.SessionLock) locked = true;
        if (e.Reason == SessionSwitchReason.SessionUnlock) locked = false;
    }

    void DisplayChanged(object sender, EventArgs e)
    {
        if (window != null && window.IsHandleCreated) window.BeginInvoke((Action)delegate { if (window.Wallpaper) window.PlaceOnDesktop(); });
    }

    void Tick(object sender, EventArgs e)
    {
        if (exiting || ticking) return;
        ticking = true;
        try { TickCore(); }
        finally { ticking = false; }
    }

    void TickCore()
    {
        foreach (KeyValuePair<string, EventWaitHandle> item in commands)
        {
            if (exiting) return;
            if (!item.Value.WaitOne(0)) continue;
            if (item.Key == "exit") { Quit(); return; }
            if (item.Key == "manage") Manage();
            if (item.Key == "wallpaper") ApplyWallpaper();
        }
        if (window == null || window.IsDisposed) return;
        // Explorer may replace its wallpaper host after a display or shell restart.
        if (wantedWallpaper && window.Ready && (!window.IsHandleCreated || !Native.IsWindow(window.DesktopParent)))
        {
            if (!window.IsHandleCreated)
            {
                Program.Log("Desktop host was recreated by Explorer; rebuilding wallpaper view.");
                window.Dispose();
                CreateWindow(true);
                return;
            }
            if (!window.PlaceOnDesktop()) wantedWallpaper = false;
        }
        bool suspended = locked || window.WindowState == FormWindowState.Minimized || (window.Wallpaper && FullScreenApplication());
        window.SetSuspended(suspended);
        if (++ticks % 4 == 0) window.WriteStatus();
    }

    bool FullScreenApplication()
    {
        IntPtr foreground = Native.GetForegroundWindow();
        if (foreground == IntPtr.Zero || foreground == window.Handle) return false;
        string name = Native.ClassName(foreground);
        if (name == "Progman" || name == "WorkerW" || name == "Shell_TrayWnd") return false;
        Native.RECT bounds;
        if (!Native.GetWindowRect(foreground, out bounds)) return false;
        Rectangle screen = Screen.PrimaryScreen.Bounds;
        return bounds.Left <= screen.Left + 2 && bounds.Top <= screen.Top + 2 && bounds.Right >= screen.Right - 2 && bounds.Bottom >= screen.Bottom - 2;
    }

    internal void Manage()
    {
        wantedWallpaper = false;
        if (window != null) window.ShowManager();
    }

    internal void ApplyWallpaper()
    {
        wantedWallpaper = true;
        if (window != null && window.Ready)
        {
            if (!window.PlaceOnDesktop()) wantedWallpaper = false;
        }
    }

    internal void AttachmentFailed(string message)
    {
        wantedWallpaper = false;
        tray.ShowBalloonTip(6000, "暂时无法设为桌面壁纸", message, ToolTipIcon.Info);
    }
    internal void DesktopNotice(string message){tray.ShowBalloonTip(6000,"桌面小船",message,ToolTipIcon.Info);}
    internal void WallpaperChoice(string id){foreach(var item in wallpaperItems)item.Value.Checked=item.Key==id;}

    internal void MotionState(bool paused)
    {
        if (exiting) return;
        userPaused = paused;
        pauseItem.Text = paused ? "继续漂流" : "暂停漂流";
        pauseItem.Checked = paused;
        window.WriteStatus();
    }

    internal void SetPaused(bool paused)
    {
        MotionState(paused);
        window.Post(new { type = "host-command", command = paused ? "pause" : "resume" });
    }

    internal void Quit()
    {
        if (exiting) return;
        exiting = true;
        timer.Stop();
        SystemEvents.SessionSwitch -= SessionChanged;
        SystemEvents.DisplaySettingsChanged -= DisplayChanged;
        if (window != null)
        {
            window.StopDesktopBoats();
            window.RestoreDesktop();
            window.WriteStatus(false);
            window.Dispose();
        }
        tray.Visible = false;
        tray.Dispose();
        timer.Dispose();
        foreach (EventWaitHandle signal in commands.Values) signal.Dispose();
        Program.Log("Exited; original desktop remains in place.");
        ExitThread();
    }
}

sealed class IslandWindow : Form
{
    const string Origin = "https://haiyu.local";
    readonly WallpaperContext owner;
    readonly WebView2 view = new WebView2();
    readonly bool startWallpaper;
    readonly Rectangle managerBounds;
    bool suspended, changingMode, savedWindowStyle;
    long managerStyle, managerExtendedStyle;
    string errorMessage = "";
    DesktopBoats desktopBoats;
    internal bool Ready { get; private set; }
    internal bool Wallpaper { get; private set; }
    internal IntPtr DesktopParent { get; private set; }

    internal IslandWindow(WallpaperContext context, bool wallpaper)
    {
        owner = context;
        startWallpaper = wallpaper;
        Text = "海屿壁纸 · 管理小船";
        Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        StartPosition = FormStartPosition.CenterScreen;
        Size = new Size(1100, 760);
        MinimumSize = new Size(520, 440);
        managerBounds = new Rectangle(Screen.PrimaryScreen.WorkingArea.X + Math.Max(0, (Screen.PrimaryScreen.WorkingArea.Width - Width) / 2), Screen.PrimaryScreen.WorkingArea.Y + Math.Max(0, (Screen.PrimaryScreen.WorkingArea.Height - Height) / 2), Width, Height);
        BackColor = Color.FromArgb(53, 183, 193);
        view.Dock = DockStyle.Fill;
        Controls.Add(view);
        Shown += Initialize;
    }

    async void Initialize(object sender, EventArgs e)
    {
        try
        {
            string www = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "www");
            if (!File.Exists(Path.Combine(www, "index.html"))) throw new FileNotFoundException("缺少 www 页面资源，请完整解压海屿壁纸。 ");
            var options = new CoreWebView2EnvironmentOptions("--disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows");
            var environment = await CoreWebView2Environment.CreateAsync(null, Path.Combine(Program.DataDirectory, "WebView2"), options);
            await view.EnsureCoreWebView2Async(environment);
            CoreWebView2 core = view.CoreWebView2;
            core.Settings.AreDefaultContextMenusEnabled = false;
            core.Settings.AreDevToolsEnabled = false;
            core.Settings.IsStatusBarEnabled = false;
            core.Settings.IsZoomControlEnabled = false;
            core.SetVirtualHostNameToFolderMapping("haiyu.local", www, CoreWebView2HostResourceAccessKind.DenyCors);
            core.NavigationStarting += delegate(object s, CoreWebView2NavigationStartingEventArgs args)
            {
                if (!IsLocal(args.Uri)) args.Cancel = true;
            };
            core.NewWindowRequested += delegate(object s, CoreWebView2NewWindowRequestedEventArgs args) { args.Handled = true; };
            core.PermissionRequested += delegate(object s, CoreWebView2PermissionRequestedEventArgs args) { args.State = CoreWebView2PermissionState.Deny; };
            core.WebMessageReceived += MessageReceived;
            core.NavigationCompleted += delegate(object s, CoreWebView2NavigationCompletedEventArgs args)
            {
                Ready = args.IsSuccess;
                if (!args.IsSuccess) { errorMessage = args.WebErrorStatus.ToString(); Program.Log("Navigation failed: " + errorMessage); }
                SendState();
                WriteStatus();
                if (Ready && startWallpaper && !Wallpaper) owner.ApplyWallpaper();
            };
            core.ProcessFailed += delegate(object s, CoreWebView2ProcessFailedEventArgs args)
            {
                errorMessage = args.ProcessFailedKind.ToString();
                Program.Log("WebView process failure: " + errorMessage);
                WriteStatus();
            };
            core.Navigate(Origin + "/index.html");
        }
        catch (Exception error)
        {
            errorMessage = error.Message;
            Program.Log(error.ToString());
            WriteStatus();
            MessageBox.Show(this, "海屿未能加载。请确认已安装 Microsoft Edge WebView2 Runtime，并完整解压软件。\n\n" + error.Message, "海屿壁纸", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    static bool IsLocal(string value)
    {
        Uri uri;
        return Uri.TryCreate(value, UriKind.Absolute, out uri) && uri.Scheme == "https" && uri.Host == "haiyu.local" && uri.IsDefaultPort;
    }

    void MessageReceived(object sender, CoreWebView2WebMessageReceivedEventArgs args)
    {
        if (!IsLocal(args.Source)) return;
        try
        {
            var message = Program.Json.Deserialize<Dictionary<string, object>>(args.WebMessageAsJson);
            object type;
            if (message == null || !message.TryGetValue("type", out type)) return;
            switch (Convert.ToString(type))
            {
                case "ready":
                    if(desktopBoats==null){desktopBoats=new DesktopBoats(this,owner.DesktopNotice);Process.Start(new ProcessStartInfo(Application.ExecutablePath,"--recover "+Process.GetCurrentProcess().Id){UseShellExecute=false,CreateNoWindow=true});}
                    desktopBoats.SetMode(Wallpaper);SendState();break;
                case "wallpaper": owner.ApplyWallpaper(); break;
                case "wallpaper-choice":
                    object choice;if(message.TryGetValue("id",out choice))owner.WallpaperChoice(Convert.ToString(choice));break;
                case "manage": owner.Manage(); break;
                case "pause": owner.SetPaused(true); break;
                case "resume": owner.SetPaused(false); break;
                case "quit": owner.Quit(); break;
                case "desktop-capture":case "desktop-ignore":case "desktop-open":case "desktop-restore":case "desktop-poses":
                    if(desktopBoats!=null)desktopBoats.Message(message,Convert.ToString(type));break;
                case "motion-state":
                    object paused;
                    if (message.TryGetValue("paused", out paused) && paused is bool) owner.MotionState((bool)paused);
                    break;
            }
        }
        catch (Exception error) { Program.Log("Ignored invalid page message: " + error.GetType().Name); }
    }

    internal void Post(object message)
    {
        if (view.CoreWebView2 != null && !view.IsDisposed) view.CoreWebView2.PostWebMessageAsJson(Program.Json.Serialize(message));
    }

    internal void StopDesktopBoats(){if(desktopBoats!=null){desktopBoats.Dispose();desktopBoats=null;}}

    void SendState() { Post(new { type = "host-state", wallpaper = Wallpaper, suspended = suspended }); }

    internal void SetSuspended(bool value)
    {
        if (suspended == value) return;
        suspended = value;
        SendState();
        if (view.CoreWebView2 != null) view.CoreWebView2.IsMuted = value;
    }

    internal bool PlaceOnDesktop()
    {
        if (changingMode || !Ready) return false;
        changingMode = true;
        try
        {
            IntPtr parent = Native.WallpaperParent();
            if (parent == IntPtr.Zero) throw new InvalidOperationException("没有找到 Windows 桌面层。可先使用管理窗口，稍后再设为壁纸。");
            WindowState = FormWindowState.Normal;
            IntPtr hwnd = Handle;
            if (!savedWindowStyle)
            {
                managerStyle = Native.GetWindowLongPtr(hwnd, -16).ToInt64();
                managerExtendedStyle = Native.GetWindowLongPtr(hwnd, -20).ToInt64();
                savedWindowStyle = true;
            }
            // Keep the WebView's HWND stable: changing WinForms ShowInTaskbar can recreate it.
            Native.ShowWindow(hwnd, 0);
            long style = Native.GetWindowLongPtr(hwnd, -16).ToInt64();
            Native.SetWindowLongPtr(hwnd, -16, new IntPtr((style | Native.WS_CHILD) & ~(Native.WS_POPUP | Native.WS_OVERLAPPEDWINDOW)));
            long extended = Native.GetWindowLongPtr(hwnd, -20).ToInt64();
            Native.SetWindowLongPtr(hwnd, -20, new IntPtr((extended | Native.WS_EX_NOACTIVATE | Native.WS_EX_TOOLWINDOW) & ~Native.WS_EX_APPWINDOW));
            Program.Log("Attach begin hwnd=" + hwnd.ToInt64() + " parent=" + parent.ToInt64() + " class=" + Native.ClassName(parent) + " childDpi=" + Native.DpiDescription(hwnd) + " parentDpi=" + Native.DpiDescription(parent));
            Native.SetLastError(0);
            IntPtr previous = Native.SetParent(hwnd, parent);
            int errorCode = Marshal.GetLastWin32Error();
            IntPtr actualParent = Native.GetParent(hwnd);
            IntPtr current = IsHandleCreated ? Handle : IntPtr.Zero;
            Program.Log("Attach result hwnd=" + hwnd.ToInt64() + " currentHwnd=" + current.ToInt64() + " previousParent=" + previous.ToInt64() + " win32Error=" + errorCode + " actualParent=" + actualParent.ToInt64() + " class=" + Native.ClassName(actualParent));
            if (current != hwnd || actualParent != parent) throw new InvalidOperationException("Windows 未允许嵌入桌面（" + errorCode + "）。请查看 host.log。");
            DesktopParent = parent;
            Wallpaper = true;
            if(desktopBoats!=null)desktopBoats.SetMode(true);
            errorMessage = "";
            Rectangle area = Screen.PrimaryScreen.Bounds;
            Native.POINT point = new Native.POINT { X = area.X, Y = area.Y };
            Native.ScreenToClient(parent, ref point);
            Native.SetWindowPos(hwnd, Native.HWND_BOTTOM, point.X, point.Y, area.Width, area.Height, Native.SWP_NOACTIVATE | Native.SWP_FRAMECHANGED | Native.SWP_SHOWWINDOW);
            SendState();
            WriteStatus();
            Program.Log("Wallpaper attached to " + Native.ClassName(parent) + " " + parent.ToInt64());
            return true;
        }
        catch (Exception error)
        {
            Program.Log("Attach failed: " + error.Message);
            errorMessage = error.Message;
            owner.AttachmentFailed(error.Message);
            changingMode = false;
            ShowManager();
            return false;
        }
        finally { changingMode = false; }
    }

    internal void RestoreDesktop()
    {
        if (!IsHandleCreated) return;
        if (Wallpaper || savedWindowStyle || Native.GetParent(Handle) != IntPtr.Zero)
        {
            IntPtr hwnd = Handle;
            Native.ShowWindow(hwnd, 0);
            Native.SetParent(hwnd, IntPtr.Zero);
            if (savedWindowStyle)
            {
                Native.SetWindowLongPtr(hwnd, -16, new IntPtr(managerStyle));
                Native.SetWindowLongPtr(hwnd, -20, new IntPtr(managerExtendedStyle));
                savedWindowStyle = false;
            }
            Wallpaper = false;
            if(desktopBoats!=null)desktopBoats.SetMode(false);
            DesktopParent = IntPtr.Zero;
            Native.RedrawDesktop();
        }
    }

    internal void ShowManager()
    {
        if (IsDisposed || changingMode) return;
        changingMode = true;
        try
        {
            RestoreDesktop();
            WindowState = FormWindowState.Normal;
            Bounds = managerBounds;
            SetSuspended(false);
            Show();
            Native.SetWindowPos(Handle, IntPtr.Zero, managerBounds.X, managerBounds.Y, managerBounds.Width, managerBounds.Height, Native.SWP_FRAMECHANGED | Native.SWP_SHOWWINDOW);
            Activate();
            Native.SetForegroundWindow(Handle);
            SendState();
            WriteStatus();
        }
        finally { changingMode = false; }
    }

    internal void WriteStatus(bool running = true)
    {
        try
        {
            IntPtr hwnd = IsHandleCreated ? Handle : IntPtr.Zero;
            IntPtr foreground = Native.GetForegroundWindow();
            Native.RECT rect;
            Native.GetWindowRect(hwnd, out rect);
            var status = new { running = running && !owner.Exiting, mode = Wallpaper ? "wallpaper" : "manage", suspended = suspended, paused = owner.UserPaused,
                ready = Ready, handle = hwnd.ToInt64(), parent = Native.GetParent(hwnd).ToInt64(),
                parentClass = Native.ClassName(DesktopParent), width = ClientSize.Width, height = ClientSize.Height,
                visible = Visible, nativeVisible = Native.IsWindowVisible(hwnd), windowState = WindowState.ToString(),
                rect = new { x = rect.Left, y = rect.Top, width = rect.Right - rect.Left, height = rect.Bottom - rect.Top },
                viewVisible = view.Visible, foreground = foreground.ToInt64(), foregroundClass = Native.ClassName(foreground),
                processId = Process.GetCurrentProcess().Id, updatedUtc = DateTime.UtcNow.ToString("o"), error = errorMessage };
            File.WriteAllText(Path.Combine(Program.DataDirectory, "status.json"), Program.Json.Serialize(status), Encoding.UTF8);
        }
        catch { }
    }
}

static class Native
{
    internal const long WS_CHILD = 0x40000000L, WS_POPUP = 0x80000000L, WS_OVERLAPPEDWINDOW = 0x00CF0000L, WS_EX_NOACTIVATE = 0x08000000L, WS_EX_TOOLWINDOW = 0x80L, WS_EX_APPWINDOW = 0x40000L;
    internal const uint SWP_NOACTIVATE = 0x0010, SWP_FRAMECHANGED = 0x0020, SWP_SHOWWINDOW = 0x0040;
    internal static readonly IntPtr HWND_BOTTOM = new IntPtr(1);
    internal delegate bool EnumWindowProc(IntPtr hwnd, IntPtr data);
    [StructLayout(LayoutKind.Sequential)] internal struct RECT { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)] internal struct POINT { public int X, Y; }
    [DllImport("user32.dll", SetLastError = true)] internal static extern IntPtr SetParent(IntPtr child, IntPtr parent);
    [DllImport("user32.dll")] internal static extern IntPtr GetParent(IntPtr hwnd);
    [DllImport("user32.dll")] internal static extern bool IsWindow(IntPtr hwnd);
    [DllImport("user32.dll")] internal static extern bool IsWindowVisible(IntPtr hwnd);
    [DllImport("user32.dll")] internal static extern bool SetWindowPos(IntPtr hwnd, IntPtr after, int x, int y, int width, int height, uint flags);
    [DllImport("user32.dll")] internal static extern bool ShowWindow(IntPtr hwnd, int command);
    [DllImport("user32.dll")] static extern IntPtr GetWindowDpiAwarenessContext(IntPtr hwnd);
    [DllImport("user32.dll")] static extern int GetAwarenessFromDpiAwarenessContext(IntPtr context);
    [DllImport("user32.dll")] static extern uint GetDpiForWindow(IntPtr hwnd);
    [DllImport("user32.dll")] internal static extern bool ScreenToClient(IntPtr hwnd, ref POINT point);
    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")] internal static extern IntPtr GetWindowLongPtr(IntPtr hwnd, int index);
    [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW")] internal static extern IntPtr SetWindowLongPtr(IntPtr hwnd, int index, IntPtr value);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] internal static extern IntPtr FindWindow(string className, string title);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] internal static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string className, string title);
    [DllImport("user32.dll")] internal static extern bool EnumWindows(EnumWindowProc callback, IntPtr data);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr hwnd, StringBuilder text, int capacity);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr SendMessageTimeout(IntPtr hwnd, uint message, IntPtr wParam, IntPtr lParam, uint flags, uint timeout, out IntPtr result);
    [DllImport("user32.dll")] internal static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] internal static extern bool GetWindowRect(IntPtr hwnd, out RECT rect);
    [DllImport("user32.dll")] internal static extern bool SetForegroundWindow(IntPtr hwnd);
    [DllImport("user32.dll")] internal static extern bool AllowSetForegroundWindow(int processId);
    [DllImport("user32.dll")] internal static extern bool SetProcessDpiAwarenessContext(IntPtr context);
    [DllImport("user32.dll")] internal static extern bool SetProcessDPIAware();
    [DllImport("kernel32.dll")] internal static extern void SetLastError(uint error);
    [DllImport("user32.dll")] static extern bool RedrawWindow(IntPtr hwnd, IntPtr rect, IntPtr region, uint flags);

    internal static string ClassName(IntPtr hwnd)
    {
        if (hwnd == IntPtr.Zero) return "";
        StringBuilder value = new StringBuilder(128);
        GetClassName(hwnd, value, value.Capacity);
        return value.ToString();
    }

    internal static string DpiDescription(IntPtr hwnd)
    {
        try
        {
            IntPtr context = GetWindowDpiAwarenessContext(hwnd);
            return context.ToInt64() + "/" + GetAwarenessFromDpiAwarenessContext(context) + "/" + GetDpiForWindow(hwnd);
        }
        catch (EntryPointNotFoundException) { return "unavailable"; }
    }

    internal static IntPtr WallpaperParent()
    {
        IntPtr progman = FindWindow("Progman", null), result;
        if (progman == IntPtr.Zero) return IntPtr.Zero;
        SendMessageTimeout(progman, 0x052C, IntPtr.Zero, IntPtr.Zero, 2, 1000, out result);
        IntPtr worker = IntPtr.Zero;
        EnumWindows(delegate(IntPtr top, IntPtr data)
        {
            if (FindWindowEx(top, IntPtr.Zero, "SHELLDLL_DefView", null) != IntPtr.Zero)
            {
                worker = FindWindowEx(IntPtr.Zero, top, "WorkerW", null);
                return worker == IntPtr.Zero;
            }
            return true;
        }, IntPtr.Zero);
        // Current shells may place the icon host directly under Progman.
        // A child placed at HWND_BOTTOM stays behind that icon host.
        if (worker == IntPtr.Zero && FindWindowEx(progman, IntPtr.Zero, "SHELLDLL_DefView", null) != IntPtr.Zero) worker = progman;
        return worker;
    }

    internal static void RedrawDesktop()
    {
        IntPtr progman = FindWindow("Progman", null);
        if (progman != IntPtr.Zero) RedrawWindow(progman, IntPtr.Zero, IntPtr.Zero, 0x0001 | 0x0080 | 0x0100);
    }
}
