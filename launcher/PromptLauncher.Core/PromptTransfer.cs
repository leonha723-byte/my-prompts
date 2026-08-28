using System.Text.Json;

namespace PromptLauncher.Core;

public static class PromptTransfer
{
    public const int CurrentSchemaVersion = 1;
    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true };

    public static ImportResult Parse(string text, IReadOnlyList<PromptRecord>? existing = null)
    {
        JsonDocument document;
        try { document = JsonDocument.Parse(text); }
        catch (JsonException) { return new([], [], [], [], "The selected file is not valid JSON.", null); }

        using (document)
        {
            var root = document.RootElement;
            JsonElement records;
            string format;
            if (root.ValueKind == JsonValueKind.Array)
            {
                records = root;
                format = "legacy-array";
            }
            else if (root.ValueKind == JsonValueKind.Object && root.TryGetProperty("prompts", out records) && records.ValueKind == JsonValueKind.Array)
            {
                if (!root.TryGetProperty("schemaVersion", out var version) || version.ValueKind != JsonValueKind.Number || version.GetInt32() != CurrentSchemaVersion)
                {
                    var shown = root.TryGetProperty("schemaVersion", out version) ? version.ToString() : "undefined";
                    return new([], [], [], [], $"Unsupported backup schema version: {shown}.", null);
                }
                format = "versioned-envelope";
            }
            else return new([], [], [], [], "Backup must be a prompt array or a supported versioned envelope.", null);

            var normalized = PromptSchema.Normalize(records);
            var current = existing ?? [];
            var ids = current.Select(prompt => prompt.Id).ToHashSet(StringComparer.Ordinal);
            var added = normalized.Prompts.Where(prompt => ids.Add(prompt.Id)).ToList();
            var conflicts = normalized.Prompts.Where(prompt => !added.Contains(prompt)).Select(prompt => prompt.Id).ToList();
            return new(current.Concat(added).ToList(), added, conflicts, normalized.Issues, null, format);
        }
    }

    public static string Export(IReadOnlyList<PromptRecord> prompts, DateTimeOffset? exportedAt = null)
    {
        var normalized = PromptSchema.Normalize(prompts);
        if (normalized.Issues.Count > 0)
            throw new InvalidDataException("Cannot export a prompt library containing invalid or duplicate records.");

        return JsonSerializer.Serialize(new
        {
            schemaVersion = CurrentSchemaVersion,
            exportedAt = (exportedAt ?? DateTimeOffset.UtcNow).ToString("O"),
            prompts = normalized.Prompts.Select(ToJsonRecord)
        }, JsonOptions);
    }

    internal static object ToJsonRecord(PromptRecord prompt) => new
    {
        id = prompt.Id,
        title = prompt.Title,
        category = prompt.Category,
        description = prompt.Description,
        text = prompt.Text,
        pinned = prompt.Pinned
    };
}
