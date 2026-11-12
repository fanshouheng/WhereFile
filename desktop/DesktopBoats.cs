using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Windows.Forms;

sealed class DesktopBoats : IDisposable
{
    readonly IslandWindow window;
    readonly Action<string> notice;
    DesktopShell shell;
    readonly Dictionary<string,DesktopEntry> hidden=new Dictionary<string,DesktopEntry>(StringComparer.OrdinalIgnoreCase);
    Dictionary<string,DesktopEntry> previous=new Dictionary<string,DesktopEntry>(StringComparer.OrdinalIgnoreCase);
    readonly Dictionary<string,DesktopEntry> pending=new Dictionary<string,DesktopEntry>();
    readonly Dictionary<string,BoatWindow> boats=new Dictionary<string,BoatWindow>();
    readonly Timer timer=new Timer();
    readonly DesktopScanner scanner=new DesktopScanner();
    bool warned,active,scanning,disposed;int pollCount,modeVersion;
    internal static string Journal { get { return Path.Combine(Program.DataDirectory,"desktop-icons.json"); } }
    internal DesktopBoats(IslandWindow target,Action<string> message)
    {
        window=target;notice=message;
        try { shell=new DesktopShell(); Recover(shell); }
        catch(Exception e){Program.Log("Desktop integration: "+e.Message);notice("暂时无法连接桌面图标，原图标保持不变。");}
        timer.Interval=70;timer.Tick+=delegate{Poll();};timer.Start();
    }
    internal static void Recover(DesktopShell view)
    {
        if(!File.Exists(Journal))return;
        var entries=Program.Json.Deserialize<List<DesktopEntry>>(File.ReadAllText(Journal));
        if(entries.Count>0)view.ClearMask();
        var remaining=new List<DesktopEntry>();
        foreach(var entry in entries)if((File.Exists(entry.Path)||Directory.Exists(entry.Path))&&!view.Restore(entry))remaining.Add(entry);
        File.WriteAllText(Journal,Program.Json.Serialize(remaining));
        if(remaining.Count>0)throw new IOException("部分桌面图标待恢复，请退出海屿后重试。");
    }
    void Save(){string temp=Journal+".tmp";File.WriteAllText(temp,Program.Json.Serialize(hidden.Values.ToArray()));if(File.Exists(Journal))File.Replace(temp,Journal,null);else File.Move(temp,Journal);}
    internal void SetMode(bool wallpaper)
    {
        active=wallpaper;modeVersion++;previous.Clear();pending.Clear();
        if(wallpaper&&shell!=null)try{previous=shell.Read().ToDictionary(e=>e.Path,StringComparer.OrdinalIgnoreCase);}catch(Exception e){Program.Log("Desktop baseline: "+e.Message);}
        foreach(var boat in boats.Values)boat.Visible=wallpaper;
    }
    async void Poll()
    {
        if(shell==null||!active||!window.Ready||scanning||disposed)return;
        // Explorer commits icon positions after mouse-up, sometimes in a later tick.
        // Compare stable Shell positions; foreground windows and mouse polling are not drag evidence.
        if((Control.MouseButtons&MouseButtons.Left)!=0)return;
        if(previous.Count>0&&++pollCount%3!=0)return;
        scanning=true;int version=modeVersion;
        try {
            var snapshot=await scanner.Read();
            if(disposed||!active||version!=modeVersion)return;
            var entries=snapshot.Entries;

            if(snapshot.AutoArrange){if(!warned){notice("请在桌面右键 → 查看中关闭“自动排列图标”，然后把图标拖进海里。");warned=true;}previous=entries.ToDictionary(e=>e.Path,StringComparer.OrdinalIgnoreCase);return;}
            foreach(var entry in entries){
                DesktopEntry old;
                bool moved=previous.TryGetValue(entry.Path,out old)&&(old.X!=entry.X||old.Y!=entry.Y);
                if(hidden.ContainsKey(entry.Path)){if(moved)shell.Hide(entry);continue;}
                if(moved){
                    var current=shell.Read().Find(e=>String.Equals(e.Path,entry.Path,StringComparison.OrdinalIgnoreCase));
                    if(current==null)continue;
                    entry.Id=Guid.NewGuid().ToString("N");pending[entry.Id]=old;old.Id=entry.Id;
                    Rectangle area=Screen.PrimaryScreen.Bounds;
                    old.Name=current.Name;
                    window.Post(new{type="desktop-moved",id=entry.Id,name=current.Name,x=current.ScreenX-area.X,y=current.ScreenY-area.Y});
                    Program.Log("Desktop move detected; awaiting sea hit test.");
                }
            }
            previous=entries.ToDictionary(e=>e.Path,StringComparer.OrdinalIgnoreCase);
        }catch(Exception e){if(!disposed){Program.Log("Desktop polling stopped: "+e.Message);active=false;notice("桌面连接已变化，请退出海屿再启动以恢复图标。");}}
        finally{scanning=false;}
    }
    internal void Message(Dictionary<string,object> data,string type)
    {
        if(type=="desktop-poses"){
            object raw;if(!data.TryGetValue("items",out raw))return;
            foreach(var item in (System.Collections.IEnumerable)raw){var pose=item as Dictionary<string,object>;if(pose==null)continue;BoatWindow boat;if(boats.TryGetValue(Convert.ToString(pose["id"]),out boat))boat.Pose(Convert.ToDouble(pose["x"]),Convert.ToDouble(pose["y"]),Convert.ToDouble(pose["roll"]),Convert.ToInt32(pose["direction"]),active);}
            return;
        }
        string id=Convert.ToString(data["id"]);
        if(type=="desktop-capture"){
            DesktopEntry entry;if(!active||!pending.TryGetValue(id,out entry))return;pending.Remove(id);
            if(hidden.ContainsKey(entry.Path))return;
            hidden[entry.Path]=entry;Save();
            if(!shell.Hide(entry)){hidden.Remove(entry.Path);Save();notice("当前桌面未允许隐藏这个图标。");return;}
            BoatWindow boat;
            try{boat=new BoatWindow(entry,window,shell.ViewHandle);}catch{shell.Restore(entry);hidden.Remove(entry.Path);Save();throw;}
            boats[id]=boat;
            window.Post(new{type="desktop-added",id=id,name=entry.Name,x=data["x"],y=data["y"]});
        }else if(type=="desktop-ignore")pending.Remove(id);
        else {
            var entry=hidden.Values.FirstOrDefault(e=>e.Id==id);if(entry==null)return;
            if(type=="desktop-open"){
                try{Process.Start(new ProcessStartInfo(entry.Path){UseShellExecute=true});}catch{notice("文件已移动或暂时无法打开，原图标仍可恢复。");}
            }else if(type=="desktop-restore"){
                if(shell.Restore(entry)){hidden.Remove(entry.Path);Save();BoatWindow boat;if(boats.TryGetValue(id,out boat)){boats.Remove(id);boat.Dispose();}window.Post(new{type="desktop-removed",id=id});previous.Clear();}
                else notice("暂时无法恢复图标，请退出后重新启动海屿重试。");
            }
        }
    }
    public void Dispose(){disposed=true;scanner.Dispose();timer.Stop();timer.Dispose();foreach(var boat in boats.Values)boat.Dispose();if(shell!=null){try{Recover(shell);}catch(Exception e){Program.Log("Restore icons: "+e.Message);}shell.Dispose();}}
}

// Only the boat-sized windows receive input; the rest of Explorer stays interactive.
sealed class BoatWindow : Form
{
    readonly DesktopEntry entry;readonly IslandWindow window;readonly Image art;
    readonly Icon fileIcon;float roll,offsetX,offsetY;int direction=1;bool dragging;Point start,origin;
    bool painted;
    readonly Bitmap surface=new Bitmap(180,190,System.Drawing.Imaging.PixelFormat.Format32bppPArgb);
    internal event Action PoseApplied;
    internal BoatWindow(DesktopEntry item,IslandWindow target,IntPtr desktopView)
    {
        entry=item;window=target;Text=item.Name;FormBorderStyle=FormBorderStyle.None;ShowInTaskbar=false;
        ClientSize=new Size(180,190);
        DoubleBuffered=true;StartPosition=FormStartPosition.Manual;
        art=Image.FromFile(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"www/assets/boat-directions.png"));
        try{fileIcon=Icon.ExtractAssociatedIcon(item.Path);}catch{}
        var handle=Handle;
        // Owned by Explorer's icon host: above icons, below normal application windows.
        Native.SetWindowLongPtr(handle,-8,Native.GetParent(desktopView));
        MouseDown+=delegate(object s,MouseEventArgs e){if(e.Button!=MouseButtons.Left)return;dragging=true;start=Cursor.Position;origin=Location;Capture=true;window.Post(new{type="desktop-drag",id=entry.Id});};
        MouseMove+=delegate{if(dragging){var p=Cursor.Position;Location=new Point(origin.X+p.X-start.X,origin.Y+p.Y-start.Y);}};
        MouseUp+=delegate{if(!dragging)return;dragging=false;Capture=false;Rectangle area=Screen.PrimaryScreen.Bounds;window.Post(new{type="desktop-drop",id=entry.Id,x=Left+90-area.X,y=Top+90-area.Y});};
        MouseDoubleClick+=delegate{window.Post(new{type="desktop-doubleclick",id=entry.Id});};
    }
    protected override bool ShowWithoutActivation { get{return true;} }
    protected override CreateParams CreateParams { get{var p=base.CreateParams;p.ExStyle|=0x08000000|0x80|0x80000;return p;} }
    internal void Pose(double x,double y,double angle,int facing,bool visible){
        if(!dragging){
            Rectangle area=Screen.PrimaryScreen.Bounds;
            var position=new Point(area.X+(int)Math.Floor(x)-90,area.Y+(int)Math.Floor(y)-90);
            float nextX=(float)(x-Math.Floor(x)),nextY=(float)(y-Math.Floor(y));
            float nextRoll=(float)angle;int nextDirection=Math.Max(0,Math.Min(7,facing));
            if(!painted||roll!=nextRoll||direction!=nextDirection||offsetX!=nextX||offsetY!=nextY){
                roll=nextRoll;direction=nextDirection;offsetX=nextX;offsetY=nextY;RenderAlpha(position);painted=true;
            }else if(Location!=position)Location=position;
        }
        if(Visible!=visible)Visible=visible;
        if(PoseApplied!=null)PoseApplied();
    }
    void RenderAlpha(Point position){
        using(var graphics=Graphics.FromImage(surface)){graphics.Clear(Color.Transparent);PaintBoat(graphics,Location);}
        // Update pixels and position together; unchanged art is moved without repainting.
        AlphaWindow.Present(Handle,surface,position);
        // UpdateLayeredWindow moves the HWND without updating WinForms' cached bounds.
        UpdateBounds(position.X,position.Y,Width,Height);
    }
    internal void PaintBoat(Graphics g,Point origin){
        var state=g.Save();g.TranslateTransform(Left-origin.X+offsetX,Top-origin.Y+offsetY);g.InterpolationMode=InterpolationMode.HighQualityBicubic;
        g.TranslateTransform(90,90);g.RotateTransform(roll);g.DrawImage(art,new Rectangle(-60,-60,120,120),new Rectangle(direction*256,0,256,256),GraphicsUnit.Pixel);
        if(fileIcon!=null)g.DrawIcon(fileIcon,new Rectangle(-8,-5,18,21));g.Restore(state);
        using(var format=new StringFormat{Alignment=StringAlignment.Center,Trimming=StringTrimming.EllipsisCharacter,FormatFlags=StringFormatFlags.NoWrap}){
            var rect=new RectangleF(Left-origin.X+offsetX,Top-origin.Y+offsetY,180,25);
            using(var shadow=new SolidBrush(Color.FromArgb(190,20,60,70)))g.DrawString(entry.Name,Font,shadow,new RectangleF(rect.X+1,rect.Y+1,180,25),format);
            g.DrawString(entry.Name,Font,Brushes.White,rect,format);
        }
    }
    protected override void Dispose(bool disposing){if(disposing){surface.Dispose();art.Dispose();if(fileIcon!=null)fileIcon.Dispose();}base.Dispose(disposing);}
}
