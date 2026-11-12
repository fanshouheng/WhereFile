using System;
using System.IO;
using System.Diagnostics;
using System.Linq;
using System.Threading;

static class DesktopShellTest
{
    [STAThread]
    static int Main()
    {
        string path=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),"海屿验证-"+Guid.NewGuid().ToString("N")+".txt");
        DesktopEntry original=null;
        using(var shell=new DesktopShell()){
            try{
                if(shell.AutoArrange)throw new Exception("Auto-arrange must be off for the position test.");
                var before=shell.Read();
                var watch=Stopwatch.StartNew();var detailed=shell.Read();watch.Stop();double fullMs=watch.Elapsed.TotalMilliseconds;
                watch.Restart();var positions=shell.Read(true);watch.Stop();
                if(detailed.Count!=positions.Count||detailed.Any(e=>!positions.Any(p=>p.Path==e.Path&&p.X==e.X&&p.Y==e.Y)))throw new Exception("Lightweight polling differs from full Shell positions.");
                Console.WriteLine("Shell scan: full={0:F1}ms, positions-only={1:F1}ms, entries={2}",fullMs,watch.Elapsed.TotalMilliseconds,positions.Count);
                File.WriteAllText(path,"Haiyu temporary integration fixture");
                for(int i=0;i<30&&original==null;i++){Thread.Sleep(100);original=shell.Read().FirstOrDefault(e=>e.Path==path);}
                if(original==null)throw new Exception("Explorer did not enumerate the temporary fixture.");
                if(!shell.Hide(original))throw new Exception("Hide API failed.");
                Thread.Sleep(300);
                if(!shell.IsHidden(original))throw new Exception("Explorer still displays the icon.");
                if(!shell.Restore(original))throw new Exception("Restore API failed.");
                Thread.Sleep(300);
                var restored=shell.Read().First(e=>e.Path==path);
                if(restored.X!=original.X||restored.Y!=original.Y)throw new Exception("Original icon position was not restored.");
                if(File.ReadAllText(path)!="Haiyu temporary integration fixture")throw new Exception("Original file content changed.");
                var after=shell.Read();
                foreach(var item in before){var match=after.FirstOrDefault(e=>e.Path==item.Path);if(match!=null&&(match.X!=item.X||match.Y!=item.Y))throw new Exception("An unrelated icon moved.");}
                Console.WriteLine("PASS: real Shell icon clipped from view and restored at exact position; original file and other icons unchanged.");
                return 0;
            }catch(Exception e){Console.Error.WriteLine(e.Message);return 1;}
            finally{if(original!=null)shell.Restore(original);if(File.Exists(path))File.Delete(path);}
        }
    }
}

