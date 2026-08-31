using System.Text.Json;

namespace PromptLauncher.Core;

public sealed class PromptStore(string dataDirectory)
{
    public string LibraryPath { get; } = Path.Combine(dataDirectory, "prompts.json");
    public string SettingsPath { get; } = Path.Combine(dataDirectory, "settings.json");

    public async Task<IReadOnlyList<PromptRecord>> LoadOrInitializeAsync(string defaultsJson)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(LibraryPath)!);
        var source = File.Exists(LibraryPath) ? await File.ReadAllTextAsync(LibraryPath) : defaultsJson;
        var result = PromptTransfer.Parse(source);
        if (result.FatalError is not null) throw new InvalidDataException(result.FatalError);
        if (result.Issues.Count > 0 && result.Prompts.Count == 0)
            throw new InvalidDataException("The prompt library contains no valid prompts.");
        await SaveAsync(result.Prompts);
        return result.Prompts;
    }

    public async Task SaveAsync(IReadOnlyList<PromptRecord> prompts)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(LibraryPath)!);
        var temp = LibraryPath + ".tmp";
        await File.WriteAllTextAsync(temp, PromptTransfer.Export(prompts));
        File.Move(temp, LibraryPath, true);
    }

    public async Task<LauncherSettings> LoadSettingsAsync()
    {
        if (!File.Exists(SettingsPath)) return LauncherSettings.Default;
        try
        {
            return JsonSerializer.Deserialize<LauncherSettings>(await File.ReadAllTextAsync(SettingsPath))
                ?? LauncherSettings.Default;
        }
        catch (JsonException) { return LauncherSettings.Default; }
    }

    public async Task SaveSettingsAsync(LauncherSettings settings)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(SettingsPath)!);
        await File.WriteAllTextAsync(SettingsPath, JsonSerializer.Serialize(settings, new JsonSerializerOptions { WriteIndented = true }));
    }
}

public sealed record LauncherSettings(uint Modifiers, uint VirtualKey)
{
    public static LauncherSettings Default { get; } = new(0x0002 | 0x0004, 0x50); // Ctrl+Shift+P
}
