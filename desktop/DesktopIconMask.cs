using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Drawing;
using System.Runtime.InteropServices;

// Clip only native icon rectangles. Files, attributes and Explorer's item model stay intact.
sealed class DesktopIconMask : IDisposable
{
    readonly IntPtr list,process,buffer;
    readonly Dictionary<string,Rectangle> holes=new Dictionary<string,Rectangle>(StringComparer.OrdinalIgnoreCase);
    bool ownsRegion;
    internal DesktopIconMask(IntPtr view){
        list=Native.FindWindowEx(view,IntPtr.Zero,"SysListView32",null);
        if(list==IntPtr.Zero)throw new InvalidOperationException("Desktop icon list is unavailable.");
        uint pid;GetWindowThreadProcessId(list,out pid);
        process=OpenProcess(0x38,false,pid);
        if(process==IntPtr.Zero)throw new Win32Exception();
        buffer=VirtualAllocEx(process,IntPtr.Zero,new UIntPtr(16),0x3000,4);
        if(buffer==IntPtr.Zero){CloseHandle(process);throw new Win32Exception();}
    }
    internal Rectangle Bounds(int index){
        var data=new byte[16];IntPtr transferred,result;
        if(!WriteProcessMemory(process,buffer,data,16,out transferred))throw new Win32Exception();
        if(SendMessageTimeout(list,0x100E,new IntPtr(index),buffer,2,500,out result)==IntPtr.Zero||result==IntPtr.Zero)throw new InvalidOperationException("Desktop icon bounds unavailable.");
        if(!ReadProcessMemory(process,buffer,data,16,out transferred))throw new Win32Exception();
        return Rectangle.FromLTRB(BitConverter.ToInt32(data,0),BitConverter.ToInt32(data,4),BitConverter.ToInt32(data,8),BitConverter.ToInt32(data,12));
    }
    internal bool Hide(string path,Rectangle rect){
        if(!ownsRegion){IntPtr old=CreateRectRgn(0,0,0,0);int kind=GetWindowRgn(list,old);DeleteObject(old);if(kind!=0)return false;ownsRegion=true;}
        Rectangle existing;if(holes.TryGetValue(path,out existing)&&existing==rect)return true;
        holes[path]=rect;return Apply();
    }
    internal void Restore(string path){holes.Remove(path);Apply();}
    internal void ClearRecovery(){SetWindowRgn(list,IntPtr.Zero,true);holes.Clear();ownsRegion=false;}
    internal bool IsMasked(Rectangle rect){IntPtr region=CreateRectRgn(0,0,0,0);try{return GetWindowRgn(list,region)!=0&&!PtInRegion(region,rect.Left+rect.Width/2,rect.Top+rect.Height/2);}finally{DeleteObject(region);}}
    bool Apply(){
        if(!ownsRegion)return true;
        if(holes.Count==0){SetWindowRgn(list,IntPtr.Zero,true);ownsRegion=false;return true;}
        Native.RECT client;GetClientRect(list,out client);IntPtr region=CreateRectRgn(0,0,client.Right,client.Bottom);
        foreach(var rect in holes.Values){IntPtr hole=CreateRectRgn(rect.Left,rect.Top,rect.Right,rect.Bottom);CombineRgn(region,region,hole,4);DeleteObject(hole);}
        if(SetWindowRgn(list,region,true)==0){DeleteObject(region);return false;}return true;
    }
    public void Dispose(){if(ownsRegion)ClearRecovery();VirtualFreeEx(process,buffer,UIntPtr.Zero,0x8000);CloseHandle(process);}
    [DllImport("user32.dll")]static extern uint GetWindowThreadProcessId(IntPtr hwnd,out uint pid);
    [DllImport("kernel32.dll",SetLastError=true)]static extern IntPtr OpenProcess(uint access,bool inherit,uint pid);
    [DllImport("kernel32.dll",SetLastError=true)]static extern IntPtr VirtualAllocEx(IntPtr process,IntPtr address,UIntPtr size,uint allocation,uint protection);
    [DllImport("kernel32.dll")]static extern bool VirtualFreeEx(IntPtr process,IntPtr address,UIntPtr size,uint type);
    [DllImport("kernel32.dll")]static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll",SetLastError=true)]static extern bool ReadProcessMemory(IntPtr process,IntPtr address,byte[] bytes,int size,out IntPtr transferred);
    [DllImport("kernel32.dll",SetLastError=true)]static extern bool WriteProcessMemory(IntPtr process,IntPtr address,byte[] bytes,int size,out IntPtr transferred);
    [DllImport("user32.dll")]static extern IntPtr SendMessageTimeout(IntPtr hwnd,uint message,IntPtr wp,IntPtr lp,uint flags,uint timeout,out IntPtr result);
    [DllImport("user32.dll")]static extern bool GetClientRect(IntPtr hwnd,out Native.RECT rect);
    [DllImport("user32.dll")]static extern int SetWindowRgn(IntPtr hwnd,IntPtr region,bool redraw);
    [DllImport("user32.dll")]static extern int GetWindowRgn(IntPtr hwnd,IntPtr region);
    [DllImport("gdi32.dll")]static extern IntPtr CreateRectRgn(int left,int top,int right,int bottom);
    [DllImport("gdi32.dll")]static extern int CombineRgn(IntPtr dest,IntPtr first,IntPtr second,int mode);
    [DllImport("gdi32.dll")]static extern bool DeleteObject(IntPtr obj);
    [DllImport("gdi32.dll")]static extern bool PtInRegion(IntPtr region,int x,int y);
}
