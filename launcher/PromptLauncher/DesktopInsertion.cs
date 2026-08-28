using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using PromptLauncher.Core;

namespace PromptLauncher;

public sealed class DesktopInsertion : IClipboardWriter, ITargetWindow, IPasteSender
{
    public nint CaptureForegroundWindow() => GetForegroundWindow();

    public bool TryCopy(string text, out string? error)
    {
        for (var attempt = 0; attempt < 4; attempt++)
        {
            try
            {
                System.Windows.Clipboard.SetText(text);
                error = null;
                return true;
            }
            catch (COMException) when (attempt < 3) { Thread.Sleep(40 * (attempt + 1)); }
        }
        error = "The clipboard is busy. Try Copy again.";
        return false;
    }

    public Task<DesktopInsertResult> InsertAsync(string text, nint targetWindow) =>
        new PasteCoordinator(this, this, this).InsertAsync(text, targetWindow);

    bool IClipboardWriter.TryWrite(string text, out string? error) => TryCopy(text, out error);
    bool ITargetWindow.IsAvailable(nint handle) => IsWindow(handle);
    bool ITargetWindow.TryActivate(nint handle) => SetForegroundWindow(handle);

    bool IPasteSender.TrySendPaste()
    {
        var inputs = CreatePasteInputs();
        var sent = SendInput((uint)inputs.Length, inputs, Marshal.SizeOf<INPUT>());
        return sent == inputs.Length;
    }

    private static INPUT[] CreatePasteInputs() =>
    [
        Key(0x11, false), // Ctrl down
        Key(0x56, false), // V down
        Key(0x56, true),
        Key(0x11, true)
    ];

    private static INPUT Key(ushort virtualKey, bool up) => new()
    {
        type = 1,
        U = new InputUnion { ki = new KEYBDINPUT { wVk = virtualKey, dwFlags = up ? 0x0002u : 0 } }
    };

    [StructLayout(LayoutKind.Sequential)] private struct INPUT { public uint type; public InputUnion U; }
    [StructLayout(LayoutKind.Explicit)] private struct InputUnion { [FieldOffset(0)] public KEYBDINPUT ki; }
    [StructLayout(LayoutKind.Sequential)] private struct KEYBDINPUT
    {
        public ushort wVk;
        public ushort wScan;
        public uint dwFlags;
        public uint time;
        public nuint dwExtraInfo;
    }

    [DllImport("user32.dll")] private static extern nint GetForegroundWindow();
    [DllImport("user32.dll")] private static extern bool SetForegroundWindow(nint hWnd);
    [DllImport("user32.dll")] private static extern bool IsWindow(nint hWnd);
    [DllImport("user32.dll", SetLastError = true)] private static extern uint SendInput(uint count, INPUT[] inputs, int size);
}
