using System;
using System.Collections.Generic;
using System.Collections.Concurrent;
using System.Threading;
using System.Threading.Tasks;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows.Forms;

// Read real desktop entries through Shell COM; visibility is a reversible window mask.
sealed class DesktopShell : IDisposable
{
    object windows, browserObject, viewObject;
    IFolderView folder;
    internal IntPtr ViewHandle;
    DesktopIconMask mask;
    internal DesktopShell()
    {
        windows = Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid("9BA05972-F6A8-11CF-A442-00A0C90A8F39")));
        dynamic collection = windows;
        object location = 0, root = 0; int hwnd;
        object desktop = collection.FindWindowSW(ref location, ref root, 8, out hwnd, 1);
        try {
            Guid service = new Guid("4C96BE40-915C-11CF-99D3-00AA004AE837"), iid = typeof(IShellBrowser).GUID;
            Marshal.ThrowExceptionForHR(((IShellServices)desktop).QueryService(ref service, ref iid, out browserObject));
            Marshal.ThrowExceptionForHR(((IShellBrowser)browserObject).QueryActiveShellView(out viewObject));
            folder = (IFolderView)viewObject;
            Marshal.ThrowExceptionForHR(((IOleWindow)viewObject).GetWindow(out ViewHandle));
            mask=new DesktopIconMask(ViewHandle);
        } finally { if(desktop != null) Marshal.ReleaseComObject(desktop); }
    }
    internal bool AutoArrange { get { return folder.GetAutoArrange() == 0; } }
    internal List<DesktopEntry> Read(bool positionsOnly=false)
    {
        int count; Marshal.ThrowExceptionForHR(folder.ItemCount(2, out count));
        var result = new List<DesktopEntry>();
        for(int i=0;i<count;i++) {
            IntPtr pidl; if(folder.Item(i,out pidl)!=0) continue;
            try {
                Native.POINT point; if(folder.GetItemPosition(pidl,out point)!=0) continue;
                IntPtr text; if(SHGetNameFromIDList(pidl,0x80058000u,out text)!=0) continue;
                string path; try { path=Marshal.PtrToStringUni(text); } finally { Marshal.FreeCoTaskMem(text); }
                if(String.IsNullOrEmpty(path)||(!File.Exists(path)&&!Directory.Exists(path))) continue;
                if(positionsOnly){result.Add(new DesktopEntry{Path=path,X=point.X,Y=point.Y});continue;}
                string name=Path.GetFileName(path);
                if(SHGetNameFromIDList(pidl,0,out text)==0){try{name=Marshal.PtrToStringUni(text);}finally{Marshal.FreeCoTaskMem(text);}}
                var screen=point; ClientToScreen(ViewHandle,ref screen);
                var rect=mask.Bounds(i);
                result.Add(new DesktopEntry { Path=path,Name=name,Left=rect.Left,Top=rect.Top,Width=rect.Width,Height=rect.Height,X=point.X,Y=point.Y,ScreenX=screen.X+32,ScreenY=screen.Y+32 });
            } finally { Marshal.FreeCoTaskMem(pidl); }
        }
        return result;
    }
    internal bool Move(string path,int x,int y)
    {
        int count;if(folder.ItemCount(2,out count)!=0)return false;
        for(int i=0;i<count;i++){
            IntPtr pidl;if(folder.Item(i,out pidl)!=0)continue;
            try{
                IntPtr text;if(SHGetNameFromIDList(pidl,0x80058000,out text)!=0)continue;
                string current;try{current=Marshal.PtrToStringUni(text);}finally{Marshal.FreeCoTaskMem(text);}
                if(!String.Equals(current,path,StringComparison.OrdinalIgnoreCase))continue;
                var point=new Native.POINT{X=x,Y=y};
                if(folder.SelectAndPositionItems(1,new[]{pidl},new[]{point},0x80)!=0)return false;
                Native.POINT actual;int result=folder.GetItemPosition(pidl,out actual);
                if(result!=0||actual.X!=x||actual.Y!=y)Program.Log("Icon position request "+x+","+y+" actual "+actual.X+","+actual.Y+" hr="+result);
                return result==0&&actual.X==x&&actual.Y==y;
            }finally{Marshal.FreeCoTaskMem(pidl);}
        }
        return false;
    }
    internal bool Hide(DesktopEntry entry){var current=Read().Find(e=>String.Equals(e.Path,entry.Path,StringComparison.OrdinalIgnoreCase));return current!=null&&mask.Hide(entry.Path,new Rectangle(current.Left,current.Top,current.Width,current.Height));}
    internal bool IsHidden(DesktopEntry entry){return mask.IsMasked(new Rectangle(entry.Left,entry.Top,entry.Width,entry.Height));}
    internal void ClearMask(){mask.ClearRecovery();}
    internal bool Restore(DesktopEntry entry){mask.Restore(entry.Path);return Move(entry.Path,entry.X,entry.Y);}
    public void Dispose(){if(mask!=null)mask.Dispose();folder=null;if(viewObject!=null)Marshal.ReleaseComObject(viewObject);if(browserObject!=null)Marshal.ReleaseComObject(browserObject);if(windows!=null)Marshal.ReleaseComObject(windows);}
    [DllImport("shell32.dll")] static extern int SHGetNameFromIDList(IntPtr pidl,uint sigdn,out IntPtr name);
    [DllImport("user32.dll")] static extern bool ClientToScreen(IntPtr hwnd,ref Native.POINT point);
}
// Shell COM objects stay on this STA; animation never waits synchronously for Explorer.
sealed class DesktopScanner : IDisposable
{
    internal sealed class Snapshot { internal List<DesktopEntry> Entries;internal bool AutoArrange; }
    readonly BlockingCollection<TaskCompletionSource<Snapshot>> requests=new BlockingCollection<TaskCompletionSource<Snapshot>>();
    internal DesktopScanner(){var thread=new Thread(Run){IsBackground=true,Name="WhereFile desktop scan"};thread.SetApartmentState(ApartmentState.STA);thread.Start();}
    internal Task<Snapshot> Read(){var request=new TaskCompletionSource<Snapshot>();requests.Add(request);return request.Task;}
    void Run(){
        DesktopShell reader=null;
        try{foreach(var request in requests.GetConsumingEnumerable()){
            try{if(reader==null)reader=new DesktopShell();request.SetResult(new Snapshot{Entries=reader.Read(true),AutoArrange=reader.AutoArrange});}
            catch(Exception error){request.SetException(error);}
        }}finally{if(reader!=null)reader.Dispose();requests.Dispose();}
    }
    public void Dispose(){requests.CompleteAdding();}
}
sealed class DesktopEntry
{
    public string Path,Name,Id;
    public int X,Y,ScreenX,ScreenY,Left,Top,Width,Height;
}
[ComImport,Guid("6D5140C1-7436-11CE-8034-00AA006009FA"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IShellServices { [PreserveSig] int QueryService(ref Guid service,ref Guid iid,[MarshalAs(UnmanagedType.Interface)]out object result); }
[ComImport,Guid("000214E3-0000-0000-C000-000000000046"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IOleWindow { [PreserveSig] int GetWindow(out IntPtr hwnd); [PreserveSig] int ContextSensitiveHelp(bool enter); }
[ComImport,Guid("000214E2-0000-0000-C000-000000000046"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IShellBrowser
{
    void GetWindow(out IntPtr hwnd); void ContextSensitiveHelp(bool enter);
    void InsertMenusSB(IntPtr a,IntPtr b);void SetMenuSB(IntPtr a,IntPtr b,IntPtr c);void RemoveMenusSB(IntPtr a);
    void SetStatusTextSB(IntPtr a);void EnableModelessSB(bool a);void TranslateAcceleratorSB(IntPtr a,ushort b);
    void BrowseObject(IntPtr a,uint b);void GetViewStateStream(uint a,out IntPtr b);void GetControlWindow(uint a,out IntPtr b);
    void SendControlMsg(uint a,uint b,IntPtr c,IntPtr d,out IntPtr e);
    [PreserveSig] int QueryActiveShellView([MarshalAs(UnmanagedType.Interface)]out object view);
}
[ComImport,Guid("CDE725B0-CCC9-4519-917E-325D72FAB4CE"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IFolderView
{
    [PreserveSig]int GetCurrentViewMode(out uint mode);[PreserveSig]int SetCurrentViewMode(uint mode);
    [PreserveSig]int GetFolder(ref Guid iid,out IntPtr result);[PreserveSig]int Item(int index,out IntPtr pidl);
    [PreserveSig]int ItemCount(uint flags,out int count);[PreserveSig]int Items(uint flags,ref Guid iid,out IntPtr result);
    [PreserveSig]int GetSelectionMarkedItem(out int item);[PreserveSig]int GetFocusedItem(out int item);
    [PreserveSig]int GetItemPosition(IntPtr pidl,out Native.POINT point);[PreserveSig]int GetSpacing(out Native.POINT point);
    [PreserveSig]int GetDefaultSpacing(out Native.POINT point);[PreserveSig]int GetAutoArrange();
    [PreserveSig]int SelectItem(int index,uint flags);
    [PreserveSig]int SelectAndPositionItems(uint count,[MarshalAs(UnmanagedType.LPArray,SizeParamIndex=0)]IntPtr[] items,[MarshalAs(UnmanagedType.LPArray,SizeParamIndex=0)]Native.POINT[] points,uint flags);
}
