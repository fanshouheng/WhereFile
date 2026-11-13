using System;

static class DesktopLayerTest
{
    static void Check(bool condition, string message)
    {
        if (!condition) throw new Exception(message);
    }

    static int Main()
    {
        IntPtr progman = new IntPtr(100), icons = new IntPtr(200), background = new IntPtr(300), classic = new IntPtr(400);
        var desktop = Native.SelectWallpaperLayer(progman, 0, IntPtr.Zero, IntPtr.Zero, classic);
        Check(desktop.Parent == classic && desktop.InsertAfter == Native.HWND_BOTTOM && !desktop.Layered, "Classic WorkerW layout changed.");
        Console.WriteLine("PASS: classic desktop remains attached to its separate WorkerW.");

        desktop = Native.SelectWallpaperLayer(progman, Native.WS_EX_NOREDIRECTIONBITMAP, icons, background, IntPtr.Zero);
        Check(desktop.Parent == progman && desktop.InsertAfter == icons && desktop.Layered, "Raised desktop would be hidden below its background.");
        Check(desktop.InsertAfter != Native.HWND_BOTTOM, "Raised desktop must not use HWND_BOTTOM.");
        Console.WriteLine("PASS: raised desktop uses a layered child immediately below the icons, above the original background.");

        desktop = Native.SelectWallpaperLayer(progman, Native.WS_EX_NOREDIRECTIONBITMAP, icons, background, classic);
        Check(desktop.Parent == progman && desktop.Layered, "Unrelated top-level WorkerW displaced the raised desktop.");
        desktop = Native.SelectWallpaperLayer(progman, 0, icons, background, classic);
        Check(desktop.Parent == progman && desktop.InsertAfter == icons && desktop.Layered, "Nested desktop structure was ignored.");
        Console.WriteLine("PASS: nested background wins over unrelated top-level WorkerW handles.");

        desktop = Native.SelectWallpaperLayer(progman, Native.WS_EX_NOREDIRECTIONBITMAP, icons, IntPtr.Zero, classic);
        Check(desktop.Parent == IntPtr.Zero, "Incomplete raised layout must not select an unrelated desktop.");
        desktop = Native.SelectWallpaperLayer(progman, Native.WS_EX_NOREDIRECTIONBITMAP, IntPtr.Zero, background, classic);
        Check(desktop.Parent == IntPtr.Zero, "Missing icon layer must not put wallpaper above icons.");
        desktop = Native.SelectWallpaperLayer(progman, 0, icons, IntPtr.Zero, IntPtr.Zero);
        Check(desktop.Parent == IntPtr.Zero, "Unsafe bottom-of-Progman fallback is still present.");
        desktop = Native.SelectWallpaperLayer(IntPtr.Zero, 0, icons, background, classic);
        Check(desktop.Parent == IntPtr.Zero, "Missing shell must fail.");
        Console.WriteLine("PASS: incomplete or missing desktop fails instead of silently using bottom-of-Progman.");
        return 0;
    }
}
