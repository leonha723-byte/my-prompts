using System;
using System.IO;

namespace PromptLauncher;

internal static class LauncherLog
{
    private static readonly object Sync = new();
    private static readonly string DirectoryPath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "PromptWorkspaceLauncher");

    public static string LogPath { get; } = Path.Combine(DirectoryPath, "launcher.log");

    public static void Write(string message, Exception? exception = null)
    {
        try
        {
            lock (Sync)
            {
                Directory.CreateDirectory(DirectoryPath);
                File.AppendAllText(
                    LogPath,
                    $"[{DateTimeOffset.Now:O}] {message}{Environment.NewLine}" +
                    (exception is null ? "" : $"{exception}{Environment.NewLine}"));
            }
        }
        catch
        {
            // Logging must never become another launcher failure.
        }
    }
}
