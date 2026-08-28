using PromptLauncher.Core;
using System.Text.Json;

var tests = new (string Name, Func<Task> Run)[]
{
    ("schema normalization and validation", TestSchema),
    ("legacy and versioned imports", TestImports),
    ("variable normalization and substitution", TestVariables),
    ("search, category hierarchy, and pinned order", TestLibrary),
    ("favorites and settings persistence", TestPersistence),
    ("paste success and copy-only fallbacks", TestPasteCoordinator)
};

var failures = 0;
foreach (var test in tests)
{
    try { await test.Run(); Console.WriteLine($"PASS {test.Name}"); }
    catch (Exception ex) { failures++; Console.Error.WriteLine($"FAIL {test.Name}: {ex.Message}"); }
}
Console.WriteLine($"{tests.Length - failures}/{tests.Length} tests passed.");
return failures == 0 ? 0 : 1;

static Task TestSchema()
{
    using var json = JsonDocument.Parse("""
        [
          {"id":" one ","title":" First ","category":" Work ","description":" D ","text":" Hello ","pinned":true},
          {"id":"one","title":"Duplicate","category":"Work","text":"Text"},
          {"id":"bad","title":"Bad","category":"Work","text":"{{ }}"}
        ]
        """);
    var result = PromptSchema.Normalize(json.RootElement);
    Equal(1, result.Prompts.Count);
    Equal("one", result.Prompts[0].Id);
    True(result.Prompts[0].Pinned);
    Equal(2, result.Issues.Count);
    return Task.CompletedTask;
}

static Task TestImports()
{
    var basePrompt = Prompt("one");
    var legacy = PromptTransfer.Parse(JsonSerializer.Serialize(new[] { JsonPrompt(Prompt("two")) }), [basePrompt]);
    Equal("legacy-array", legacy.Format);
    Equal(2, legacy.Prompts.Count);
    var envelope = PromptTransfer.Export([basePrompt], DateTimeOffset.UnixEpoch);
    var versioned = PromptTransfer.Parse(envelope, [basePrompt]);
    Equal("versioned-envelope", versioned.Format);
    Equal(1, versioned.Conflicts.Count);
    True(PromptTransfer.Parse("{").FatalError is not null);
    True(PromptTransfer.Parse("{\"schemaVersion\":99,\"prompts\":[]}").FatalError is not null);
    return Task.CompletedTask;
}

static Task TestVariables()
{
    var analysis = PromptTemplate.Analyze("{{ Name }} {{Name}} {{ Topic }}");
    Sequence(["Name", "Topic"], analysis.Variables);
    var result = PromptTemplate.Substitute("Hi {{ Name }}: {{Missing}}", new Dictionary<string, string> { ["Name"] = " Ada " });
    Equal("Hi Ada: {{Missing}}", result.Text);
    Sequence(["Missing"], result.Unfilled);
    return Task.CompletedTask;
}

static Task TestLibrary()
{
    var prompts = new[]
    {
        Prompt("a") with { Title = "Alpha", Category = "Learning/EE" },
        Prompt("b") with { Title = "Beta", Category = "Learning/EE", Pinned = true },
        Prompt("c") with { Title = "Meeting", Category = "Work" }
    };
    Sequence(["b", "a"], PromptLibrary.Filter(prompts, "Learning").Select(prompt => prompt.Id));
    var tree = PromptLibrary.BuildCategoryTree(prompts);
    Equal("Learning", tree[0].Name);
    Equal("Learning/EE", tree[0].Children[0].Path);
    return Task.CompletedTask;
}

static async Task TestPersistence()
{
    var directory = Path.Combine(Path.GetTempPath(), $"prompt-launcher-tests-{Guid.NewGuid():N}");
    try
    {
        var store = new PromptStore(directory);
        var original = Prompt("one");
        await store.SaveAsync([original]);
        var pinned = original with { Pinned = true };
        await store.SaveAsync([pinned]);
        var loaded = await store.LoadOrInitializeAsync("[]");
        True(loaded[0].Pinned);
        var settings = new LauncherSettings(3, 0x41);
        await store.SaveSettingsAsync(settings);
        Equal(settings, await store.LoadSettingsAsync());
    }
    finally { if (Directory.Exists(directory)) Directory.Delete(directory, true); }
}

static async Task TestPasteCoordinator()
{
    var fake = new FakeDesktop();
    var service = new PasteCoordinator(fake, fake, fake);
    var success = await service.InsertAsync("hello", 42, 0);
    True(success.Pasted);
    Equal("hello", fake.CopiedText);

    fake.CanActivate = false;
    var fallback = await service.InsertAsync("copy", 42, 0);
    True(!fallback.Pasted && fallback.Copied);
    Equal(1, fake.PasteCount);

    fake.ClipboardWorks = false;
    var failed = await service.InsertAsync("fail", 42, 0);
    True(!failed.Pasted && !failed.Copied);
}

static PromptRecord Prompt(string id) => new(id, "Prompt", "Testing", "Description", "Hello {{Name}}", false);
static object JsonPrompt(PromptRecord prompt) => new { id = prompt.Id, title = prompt.Title, category = prompt.Category, description = prompt.Description, text = prompt.Text, pinned = prompt.Pinned };
static void True(bool condition) { if (!condition) throw new Exception("Expected true."); }
static void Equal<T>(T expected, T actual) { if (!EqualityComparer<T>.Default.Equals(expected, actual)) throw new Exception($"Expected {expected}; got {actual}."); }
static void Sequence<T>(IEnumerable<T> expected, IEnumerable<T> actual) { if (!expected.SequenceEqual(actual)) throw new Exception("Sequences differ."); }

sealed class FakeDesktop : IClipboardWriter, ITargetWindow, IPasteSender
{
    public bool ClipboardWorks { get; set; } = true;
    public bool CanActivate { get; set; } = true;
    public string? CopiedText { get; private set; }
    public int PasteCount { get; private set; }
    public bool TryWrite(string text, out string? error) { CopiedText = text; error = ClipboardWorks ? null : "busy"; return ClipboardWorks; }
    public bool IsAvailable(nint handle) => handle == 42;
    public bool TryActivate(nint handle) => CanActivate;
    public bool TrySendPaste() { PasteCount++; return true; }
}
