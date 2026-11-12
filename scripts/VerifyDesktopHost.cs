using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Windows.Forms;

static class DesktopHostTest
{
    static object Field(object obj,string name){return obj.GetType().GetField(name,BindingFlags.Instance|BindingFlags.NonPublic).GetValue(obj);}
    static void VerifySubpixel(DesktopEntry entry,IslandWindow window,IntPtr view){
        using(var boat=new BoatWindow(entry,window,view))using(var first=new Bitmap(180,190))using(var second=new Bitmap(180,190)){
            boat.Pose(500.1,500.1,0,0,false);Point position=boat.Location;
            using(var g=Graphics.FromImage(first))boat.PaintBoat(g,position);
            boat.Pose(500.4,500.1,0,0,false);
            using(var g=Graphics.FromImage(second))boat.PaintBoat(g,boat.Location);
            if(position!=boat.Location)throw new Exception("Subpixel test unexpectedly moved the integer window.");
            int changed=0;for(int y=0;y<190;y++)for(int x=0;x<180;x++)if(first.GetPixel(x,y)!=second.GetPixel(x,y))changed++;
            if(changed<100)throw new Exception("Fractional movement was lost before drawing.");
            Console.WriteLine("PASS: fractional movement changes boat pixels without an integer window jump.");
        }
    }
    [STAThread]
    static int Main(string[] args){
        if(args.Length>0){typeof(Program).GetMethod("Main",BindingFlags.Static|BindingFlags.NonPublic).Invoke(null,new object[]{args});return 0;}
        string path=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),"海屿航行验证-"+Guid.NewGuid().ToString("N")+".txt");
        int result=1,stage=0,ticks=0;Point first=Point.Empty;DesktopEntry entry=null;bool savedPause=false;
        var movementGaps=new List<double>();var movementClock=new Stopwatch();
        string savedWallpaper="tropical";
        Application.EnableVisualStyles();
        File.WriteAllText(path,"Temporary native bridge fixture");
        var context=new WallpaperContext(false);
        var timer=new Timer{Interval=500};
        timer.Tick+=delegate{
            try{
                if(++ticks>70)throw new Exception("Native pipeline timeout at stage "+stage);
                var window=(IslandWindow)Field(context,"window");
                var controller=(DesktopBoats)Field(window,"desktopBoats");
                if(!window.Ready||controller==null){if(stage==0)ticks=0;return;}
                if(!window.Wallpaper){context.ApplyWallpaper();if(stage==0)ticks=0;return;}
                var shell=(DesktopShell)Field(controller,"shell");
                var boats=(Dictionary<string,BoatWindow>)Field(controller,"boats");
                if(stage==0&&ticks>=6){
                    entry=shell.Read().FirstOrDefault(e=>e.Path==path);if(entry==null)return;
                    savedPause=context.UserPaused;context.SetPaused(false);
                    savedWallpaper=((Dictionary<string,ToolStripMenuItem>)Field(context,"wallpaperItems")).First(p=>p.Value.Checked).Key;
                    // Exercise the actual polling/hit-test pipeline after manager startup,
                    // without injecting a capture message or simulating mouse timing.
                    shell.Move(path,entry.X>900?800:1300,550);
                    stage=1;ticks=0;
                }else if(stage==1&&ticks>=4){
                    var converted=((Dictionary<string,DesktopEntry>)Field(controller,"hidden")).Values.FirstOrDefault(e=>e.Path==path);
                    if(converted==null){if(ticks<20)return;throw new Exception("Shell position change was not detected after manager startup.");}
                    entry.Id=converted.Id;
                    var current=shell.Read().First(e=>e.Path==path);
                    if(!shell.IsHidden(current))throw new Exception("Real icon was not masked.");
                    if(!boats.ContainsKey(entry.Id))throw new Exception("Native boat missing.");
                    first=boats[entry.Id].Location;if(!boats[entry.Id].Visible)throw new Exception("Boat window is invisible.");
                    boats[entry.Id].PoseApplied+=delegate{if(stage==2){if(movementClock.IsRunning)movementGaps.Add(movementClock.Elapsed.TotalMilliseconds);movementClock.Restart();}};
                    stage=2;ticks=0;
                }else if(stage==2&&ticks>=12){
                    var moved=boats[entry.Id].Location;if(Math.Abs(moved.X-first.X)+Math.Abs(moved.Y-first.Y)<15)throw new Exception("Boat did not receive live voyage poses.");
                    if(movementGaps.Count>0){movementGaps.Sort();Console.WriteLine("Pose gaps: samples={0}, median={1:F1}ms, p95={2:F1}ms, max={3:F1}ms",movementGaps.Count,movementGaps[movementGaps.Count/2],movementGaps[(int)((movementGaps.Count-1)*.95)],movementGaps.Last());}
                    VerifySubpixel(entry,window,shell.ViewHandle);
                    window.Post(new{type="choose-wallpaper",id="snow"});stage=5;ticks=0;
                }else if(stage==5&&ticks>=4){
                    if(!((Dictionary<string,ToolStripMenuItem>)Field(context,"wallpaperItems"))["snow"].Checked||!boats.ContainsKey(entry.Id))throw new Exception("Snow wallpaper switch lost boat or failed.");
                    window.Post(new{type="choose-wallpaper",id="autumn"});stage=6;ticks=0;
                }else if(stage==6&&ticks>=4){
                    if(!((Dictionary<string,ToolStripMenuItem>)Field(context,"wallpaperItems"))["autumn"].Checked||!boats.ContainsKey(entry.Id))throw new Exception("Autumn wallpaper switch lost boat or failed.");
                    Console.WriteLine("PASS: native wallpaper switching preserves the real desktop boat.");
                    window.Post(new{type="desktop-drop",id=entry.Id,x=80,y=300});stage=3;ticks=0;
                }else if(stage==3&&ticks>=4){
                    if(boats.Count!=0||shell.IsHidden(entry))throw new Exception("Dragging to shore did not restore native icon.");
                    if(File.ReadAllText(path)!="Temporary native bridge fixture")throw new Exception("File content changed.");
                    Console.WriteLine("PASS: manager startup -> wallpaper -> real Shell position change detected -> hidden icon and moving boat -> shore restore.");
                    result=0;window.Post(new{type="choose-wallpaper",id=savedWallpaper});context.SetPaused(savedPause);stage=4;ticks=0;
                }else if(stage==4&&ticks>=2){
                    timer.Stop();context.Quit();
                }
            }catch(Exception e){Console.Error.WriteLine(e);if(stage>0)context.SetPaused(savedPause);timer.Stop();context.Quit();}
        };
        timer.Start();Application.Run(context);timer.Dispose();
        if(File.Exists(path))File.Delete(path);return result;
    }
}
