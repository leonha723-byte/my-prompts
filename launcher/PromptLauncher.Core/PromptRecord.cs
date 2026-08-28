namespace PromptLauncher.Core;

public sealed record PromptRecord(
    string Id,
    string Title,
    string Category,
    string Description,
    string Text,
    bool Pinned);

public sealed record ValidationIssue(int? Index, string? Id, IReadOnlyList<string> Errors);

public sealed record ValidationResult(IReadOnlyList<PromptRecord> Prompts, IReadOnlyList<ValidationIssue> Issues);

public sealed record ImportResult(
    IReadOnlyList<PromptRecord> Prompts,
    IReadOnlyList<PromptRecord> Added,
    IReadOnlyList<string> Conflicts,
    IReadOnlyList<ValidationIssue> Issues,
    string? FatalError,
    string? Format);

public sealed record SubstitutionResult(string Text, IReadOnlyList<string> Unfilled);

public sealed class CategoryNode
{
    public required string Name { get; init; }
    public required string Path { get; init; }
    public List<CategoryNode> Children { get; } = [];
    public List<PromptRecord> Prompts { get; } = [];
}
