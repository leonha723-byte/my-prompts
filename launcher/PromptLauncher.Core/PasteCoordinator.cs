namespace PromptLauncher.Core;

public interface IClipboardWriter
{
    bool TryWrite(string text, out string? error);
}

public interface ITargetWindow
{
    bool IsAvailable(nint handle);
    bool TryActivate(nint handle);
}

public interface IPasteSender
{
    bool TrySendPaste();
}

public sealed record DesktopInsertResult(bool Pasted, bool Copied, string Message);

public sealed class PasteCoordinator(IClipboardWriter clipboard, ITargetWindow windows, IPasteSender pasteSender)
{
    public async Task<DesktopInsertResult> InsertAsync(string text, nint targetWindow, int activationDelayMs = 100)
    {
        if (!clipboard.TryWrite(text, out var error))
            return new(false, false, error ?? "The clipboard could not be updated.");
        if (targetWindow == 0 || !windows.IsAvailable(targetWindow))
            return new(false, true, "Copied. The previous application is no longer available; paste manually.");
        if (!windows.TryActivate(targetWindow))
            return new(false, true, "Copied. Windows did not restore the previous application; paste manually.");
        if (activationDelayMs > 0) await Task.Delay(activationDelayMs);
        return pasteSender.TrySendPaste()
            ? new(true, true, "Inserted at the active caret. The launcher never sends Enter.")
            : new(false, true, "Copied, but automatic paste was blocked; press Ctrl+V manually.");
    }
}
