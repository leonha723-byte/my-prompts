using System.Text.RegularExpressions;

namespace PromptLauncher.Core;

public static partial class PromptTemplate
{
    [GeneratedRegex(@"\{\{([^}]*)\}\}")]
    private static partial Regex PlaceholderPattern();

    public sealed record Analysis(IReadOnlyList<string> Variables, IReadOnlyList<string> EmptyPlaceholders);

    public static Analysis Analyze(string? text)
    {
        var variables = new List<string>();
        var empty = new List<string>();
        var seen = new HashSet<string>(StringComparer.Ordinal);

        foreach (Match match in PlaceholderPattern().Matches(text ?? ""))
        {
            var name = match.Groups[1].Value.Trim();
            if (name.Length == 0) empty.Add(match.Value);
            else if (seen.Add(name)) variables.Add(name);
        }
        return new(variables, empty);
    }

    public static SubstitutionResult Substitute(string? text, IReadOnlyDictionary<string, string>? values)
    {
        var unfilled = new List<string>();
        var seen = new HashSet<string>(StringComparer.Ordinal);
        var result = PlaceholderPattern().Replace(text ?? "", match =>
        {
            var name = match.Groups[1].Value.Trim();
            if (name.Length == 0) return match.Value;
            if (values is null || !values.TryGetValue(name, out var value) || string.IsNullOrWhiteSpace(value))
            {
                if (seen.Add(name)) unfilled.Add(name);
                return match.Value;
            }
            return value.Trim();
        });
        return new(result, unfilled);
    }
}
