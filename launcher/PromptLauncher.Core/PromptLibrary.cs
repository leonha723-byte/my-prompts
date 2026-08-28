namespace PromptLauncher.Core;

public static class PromptLibrary
{
    public static IReadOnlyList<PromptRecord> Filter(IEnumerable<PromptRecord> prompts, string? query, string? category = null)
    {
        var term = (query ?? "").Trim();
        return prompts.Where(prompt =>
            (string.IsNullOrEmpty(category) || category == "All" || prompt.Category == category) &&
            (term.Length == 0 || string.Join('\n', prompt.Title, prompt.Description, prompt.Category, prompt.Text)
                .Contains(term, StringComparison.OrdinalIgnoreCase)))
            .OrderByDescending(prompt => prompt.Pinned)
            .ThenBy(prompt => prompt.Title, StringComparer.CurrentCulture)
            .ToList();
    }

    public static IReadOnlyList<CategoryNode> BuildCategoryTree(IEnumerable<PromptRecord> prompts)
    {
        var root = new CategoryNode { Name = "", Path = "" };
        foreach (var prompt in prompts)
        {
            var parent = root;
            var path = "";
            foreach (var name in prompt.Category.Split('/').Select(part => part.Trim()).Where(part => part.Length > 0))
            {
                path = path.Length == 0 ? name : $"{path}/{name}";
                var node = parent.Children.FirstOrDefault(child => child.Name == name);
                if (node is null)
                {
                    node = new CategoryNode { Name = name, Path = path };
                    parent.Children.Add(node);
                }
                parent = node;
            }
            if (parent != root) parent.Prompts.Add(prompt);
        }
        Sort(root);
        return root.Children;
    }

    private static void Sort(CategoryNode node)
    {
        node.Children.Sort((a, b) => StringComparer.CurrentCulture.Compare(a.Name, b.Name));
        node.Prompts.Sort((a, b) => StringComparer.CurrentCulture.Compare(a.Title, b.Title));
        node.Children.ForEach(Sort);
    }
}
