using System;
using System.ComponentModel;
using System.Drawing;
using System.Runtime.InteropServices;

// Premultiplied per-pixel alpha: no chroma-key backdrop or colored contour.
static class AlphaWindow
{
    [StructLayout(LayoutKind.Sequential)]struct Size{public int Width,Height;}
    [StructLayout(LayoutKind.Sequential,Pack=1)]struct Blend{public byte Operation,Flags,Alpha,Format;}
    internal static void Present(IntPtr window,Bitmap bitmap,Point location){
        IntPtr screen=GetDC(IntPtr.Zero),memory=CreateCompatibleDC(screen),image=IntPtr.Zero,old=IntPtr.Zero;
        try{
            image=bitmap.GetHbitmap(Color.FromArgb(0));old=SelectObject(memory,image);
            var point=new Native.POINT{X=location.X,Y=location.Y};var origin=new Native.POINT();
            var size=new Size{Width=bitmap.Width,Height=bitmap.Height};var blend=new Blend{Alpha=255,Format=1};
            if(!UpdateLayeredWindow(window,screen,ref point,ref size,memory,ref origin,0,ref blend,2))throw new Win32Exception();
        }finally{if(old!=IntPtr.Zero)SelectObject(memory,old);if(image!=IntPtr.Zero)DeleteObject(image);DeleteDC(memory);ReleaseDC(IntPtr.Zero,screen);}
    }
    [DllImport("user32.dll")]static extern IntPtr GetDC(IntPtr hwnd);
    [DllImport("user32.dll")]static extern int ReleaseDC(IntPtr hwnd,IntPtr dc);
    [DllImport("gdi32.dll")]static extern IntPtr CreateCompatibleDC(IntPtr dc);
    [DllImport("gdi32.dll")]static extern IntPtr SelectObject(IntPtr dc,IntPtr obj);
    [DllImport("gdi32.dll")]static extern bool DeleteObject(IntPtr obj);
    [DllImport("gdi32.dll")]static extern bool DeleteDC(IntPtr dc);
    [DllImport("user32.dll",SetLastError=true)]static extern bool UpdateLayeredWindow(IntPtr hwnd,IntPtr dest,ref Native.POINT point,ref Size size,IntPtr source,ref Native.POINT origin,uint key,ref Blend blend,uint flags);
}
