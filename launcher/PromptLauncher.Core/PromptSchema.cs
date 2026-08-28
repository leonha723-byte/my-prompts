using System.Text.Json;

namespace PromptLauncher.Core;

public static class PromptSchema
{
    public static ValidationResult Normalize(JsonElement records)
    {
        if (records.ValueKind != JsonValueKind.Array)
            return new([], [new(null, null, ["Prompt collection must be an array."])]);

        var prompts = new List<PromptRecord>();
        var issues = new List<ValidationIssue>();
        var seenIds = new HashSet<string>(StringComparer.Ordinal);
        var index = 0;

        foreach (var record in records.EnumerateArray())
        {
            var (prompt, errors, candidateId) = NormalizeRecord(record);
            if (prompt is null)
            {
                issues.Add(new(index++, candidateId, errors));
                continue;
            }

            if (!seenIds.Add(prompt.Id))
            {
                issues.Add(new(index++, prompt.Id, [$"Duplicate prompt ID: {prompt.Id}."]));
                continue;
            }

            prompts.Add(prompt);
            index++;
        }

        return new(prompts, issues);
    }

    public static ValidationResult Normalize(IEnumerable<PromptRecord> records)
    {
        var json = JsonSerializer.SerializeToElement(records.Select(prompt => new
        {
            id = prompt.Id,
            title = prompt.Title,
            category = prompt.Category,
            description = prompt.Description,
            text = prompt.Text,
            pinned = prompt.Pinned
        }));
        return Normalize(json);
    }

    private static (PromptRecord? Prompt, List<string> Errors, string? CandidateId) NormalizeRecord(JsonElement record)
    {
        if (record.ValueKind != JsonValueKind.Object)
            return (null, ["Prompt must be an object."], null);

        var errors = new List<string>();
        var id = ReadString(record, "id", true, errors);
        var title = ReadString(record, "title", true, errors);
        var category = ReadString(record, "category", true, errors);
        var description = ReadString(record, "description", false, errors);
        var text = ReadString(record, "text", true, errors);
        var pinned = false;

        if (record.TryGetProperty("pinned", out var pin))
        {
            if (pin.ValueKind is JsonValueKind.True or JsonValueKind.False) pinned = pin.GetBoolean();
            else errors.Add("Invalid optional field: pinned must be a boolean.");
        }

        if (PromptTemplate.Analyze(text).EmptyPlaceholders.Count > 0)
            errors.Add("Variable names cannot be empty.");

        return errors.Count > 0
            ? (null, errors, id.Length > 0 ? id : null)
            : (new(id, title, category, description, text, pinned), errors, id);
    }

    private static string ReadString(JsonElement record, string name, bool required, List<string> errors)
    {
        if (!record.TryGetProperty(name, out var value))
        {
            if (required) errors.Add($"Missing or invalid required field: {name}.");
            return "";
        }

        if (value.ValueKind != JsonValueKind.String)
        {
            errors.Add(required
                ? $"Missing or invalid required field: {name}."
                : $"Invalid optional field: {name} must be a string.");
            return "";
        }

        var result = value.GetString()!.Trim();
        if (required && result.Length == 0)
            errors.Add($"Missing or invalid required field: {name}.");
        return result;
    }
}
