using Microsoft.Win32;
using PromptLauncher.Core;
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Interop;
using System.Windows.Media;

namespace PromptLauncher;

public partial class MainWindow : Window
{
    private const int HotkeyId = 0x5057;
    private const int WmHotkey = 0x0312;
    private readonly DesktopInsertion insertion = new();
    private readonly PromptStore store;
    private readonly Dictionary<string, System.Windows.Controls.TextBox> variableInputs = new(StringComparer.Ordinal);
    private IReadOnlyList<PromptRecord> prompts = [];
    private PromptRecord? selectedPrompt;
    private string selectedCategory = "All";
    private LauncherSettings settings = LauncherSettings.Default;
    private nint windowHandle;
    private nint targetWindow;
    private bool initialized;

    public MainWindow()
    {
        InitializeComponent();
        var dataDirectory = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "PromptWorkspaceLauncher");
        store = new PromptStore(dataDirectory);
        SourceInitialized += Window_SourceInitialized;
        Loaded += Window_Loaded;
    }

    private async void Window_Loaded(object sender, RoutedEventArgs e)
    {
        if (initialized) return;
        initialized = true;
        try
        {
            var defaultsPath = Path.Combine(AppContext.BaseDirectory, "Assets", "default-prompts.json");
            prompts = await store.LoadOrInitializeAsync(await File.ReadAllTextAsync(defaultsPath));
            settings = await store.LoadSettingsAsync();
            var hotkeyReady = RegisterConfiguredHotkey(showError: true);
            RenderCategories();
            RenderPrompts();
            if (hotkeyReady) SetStatus($"Ready. Press {HotkeyText.Format(settings)} from any application.");
        }
        catch (Exception ex)
        {
            SetStatus($"Could not load the prompt library: {ex.Message}", true);
        }
    }

    private void Window_SourceInitialized(object? sender, EventArgs e)
    {
        windowHandle = new WindowInteropHelper(this).Handle;
        HwndSource.FromHwnd(windowHandle)?.AddHook(WindowMessageHook);
        RegisterConfiguredHotkey(showError: false);
    }

    private nint WindowMessageHook(nint hwnd, int message, nint wParam, nint lParam, ref bool handled)
    {
        if (message == WmHotkey && wParam == HotkeyId)
        {
            handled = true;
            targetWindow = insertion.CaptureForegroundWindow();
            ShowLauncher();
        }
        return 0;
    }

    public void OpenFromTray()
    {
        targetWindow = insertion.CaptureForegroundWindow();
        ShowLauncher();
    }

    private void ShowLauncher()
    {
        Show();
        WindowState = WindowState.Normal;
        Activate();
        Topmost = true;
        Topmost = false;
        SearchBox.Focus();
        SearchBox.SelectAll();
    }

    protected override void OnClosing(CancelEventArgs e)
    {
        e.Cancel = true;
        Hide();
        base.OnClosing(e);
    }

    protected override void OnClosed(EventArgs e)
    {
        if (windowHandle != 0) UnregisterHotKey(windowHandle, HotkeyId);
        base.OnClosed(e);
    }

    private void RenderCategories() => CategoryTree.ItemsSource = PromptLibrary.BuildCategoryTree(prompts);

    private void RenderPrompts()
    {
        var matches = PromptLibrary.Filter(prompts, SearchBox.Text, selectedCategory);
        PromptList.ItemsSource = matches;
        ResultHeading.Text = selectedCategory == "All" ? $"Prompts ({matches.Count})" : $"{selectedCategory} ({matches.Count})";
        if (selectedPrompt is not null)
            PromptList.SelectedItem = matches.FirstOrDefault(prompt => prompt.Id == selectedPrompt.Id);
        if (PromptList.SelectedItem is null && matches.Count > 0) PromptList.SelectedIndex = 0;
    }

    private void RenderSelectedPrompt()
    {
        variableInputs.Clear();
        VariablesPanel.Children.Clear();
        PromptTitle.Text = selectedPrompt?.Title ?? "Select a prompt";
        if (selectedPrompt is null)
        {
            PreviewBox.Text = "";
            InsertButton.IsEnabled = false;
            return;
        }

        foreach (var variable in PromptTemplate.Analyze(selectedPrompt.Text).Variables)
        {
            VariablesPanel.Children.Add(new TextBlock { Text = variable, Margin = new Thickness(0, 4, 0, 2) });
            var input = new System.Windows.Controls.TextBox { Padding = new Thickness(6), Tag = variable };
            input.TextChanged += Variable_TextChanged;
            variableInputs[variable] = input;
            VariablesPanel.Children.Add(input);
        }
        if (variableInputs.Count == 0)
            VariablesPanel.Children.Add(new TextBlock { Text = "No variables required.", Opacity = .7, Margin = new Thickness(0, 4, 0, 4) });
        UpdatePreview();
        variableInputs.Values.FirstOrDefault()?.Focus();
    }

    private SubstitutionResult CompletedPrompt() => PromptTemplate.Substitute(
        selectedPrompt?.Text,
        variableInputs.ToDictionary(pair => pair.Key, pair => pair.Value.Text, StringComparer.Ordinal));

    private void UpdatePreview()
    {
        var result = CompletedPrompt();
        PreviewBox.Text = result.Text;
        InsertButton.IsEnabled = selectedPrompt is not null && result.Unfilled.Count == 0;
        if (result.Unfilled.Count > 0) SetStatus($"Fill required variable(s): {string.Join(", ", result.Unfilled)}", true);
    }

    private void SearchBox_TextChanged(object sender, TextChangedEventArgs e)
    {
        if (initialized) RenderPrompts();
    }

    private void CategoryTree_SelectedItemChanged(object sender, RoutedPropertyChangedEventArgs<object> e)
    {
        if (e.NewValue is not CategoryNode node) return;
        selectedCategory = node.Path;
        RenderPrompts();
    }

    private void AllCategories_Click(object sender, RoutedEventArgs e)
    {
        selectedCategory = "All";
        RenderPrompts();
    }

    private void PromptList_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        selectedPrompt = PromptList.SelectedItem as PromptRecord;
        RenderSelectedPrompt();
    }

    private void Variable_TextChanged(object sender, TextChangedEventArgs e) => UpdatePreview();

    private async void Pin_Click(object sender, RoutedEventArgs e)
    {
        if ((sender as Button)?.Tag is not PromptRecord prompt) return;
        var updated = prompts.Select(item => item.Id == prompt.Id ? item with { Pinned = !item.Pinned } : item).ToList();
        try
        {
            await store.SaveAsync(updated);
            prompts = updated;
            selectedPrompt = updated.First(item => item.Id == prompt.Id);
            RenderCategories();
            RenderPrompts();
            SetStatus(selectedPrompt.Pinned ? "Added to favorites." : "Removed from favorites.");
        }
        catch (Exception ex) { SetStatus($"Favorite change was not saved: {ex.Message}", true); }
        e.Handled = true;
    }

    private void Copy_Click(object sender, RoutedEventArgs e)
    {
        if (!TryGetCompletedText(out var text)) return;
        SetStatus(insertion.TryCopy(text, out var error) ? "Copied. Paste manually with Ctrl+V." : error!, error is not null);
    }

    private async void Insert_Click(object sender, RoutedEventArgs e)
    {
        if (!TryGetCompletedText(out var text)) return;
        try
        {
            Hide();
            var result = await insertion.InsertAsync(text, targetWindow);
            SetStatus(result.Message, !result.Pasted);
            if (!result.Pasted) ShowLauncher();
        }
        catch (Exception ex)
        {
            LauncherLog.Write("Unexpected failure during insertion.", ex);
            SetStatus($"Insertion failed safely. The launcher is still running. Diagnostic log: {LauncherLog.LogPath}", true);
            ShowLauncher();
        }
    }

    private bool TryGetCompletedText(out string text)
    {
        var result = CompletedPrompt();
        text = result.Text;
        if (selectedPrompt is null) { SetStatus("Select a prompt first.", true); return false; }
        if (result.Unfilled.Count > 0) { SetStatus($"Fill required variable(s): {string.Join(", ", result.Unfilled)}", true); return false; }
        return true;
    }

    private async void Import_Click(object sender, RoutedEventArgs e)
    {
        var dialog = new OpenFileDialog { Filter = "JSON backup (*.json)|*.json|All files (*.*)|*.*" };
        if (dialog.ShowDialog(this) != true) return;
        try
        {
            var result = PromptTransfer.Parse(await File.ReadAllTextAsync(dialog.FileName), prompts);
            if (result.FatalError is not null) throw new InvalidDataException(result.FatalError);
            await store.SaveAsync(result.Prompts);
            prompts = result.Prompts;
            RenderCategories();
            RenderPrompts();
            SetStatus($"Imported {result.Added.Count}; skipped {result.Conflicts.Count} existing IDs and {result.Issues.Count} malformed records.", result.Issues.Count > 0);
        }
        catch (Exception ex) { SetStatus($"Import failed: {ex.Message}", true); }
    }

    private async void Export_Click(object sender, RoutedEventArgs e)
    {
        var dialog = new SaveFileDialog { Filter = "JSON backup (*.json)|*.json", FileName = "prompt_workspace_launcher_backup.json" };
        if (dialog.ShowDialog(this) != true) return;
        try { await File.WriteAllTextAsync(dialog.FileName, PromptTransfer.Export(prompts)); SetStatus("Prompt library exported."); }
        catch (Exception ex) { SetStatus($"Export failed: {ex.Message}", true); }
    }

    private async void Shortcut_Click(object sender, RoutedEventArgs e)
    {
        var dialog = new HotkeyDialog(settings) { Owner = this };
        if (dialog.ShowDialog() != true || dialog.SelectedHotkey is null) return;
        var previous = settings;
        settings = dialog.SelectedHotkey;
        if (!RegisterConfiguredHotkey(showError: true)) { settings = previous; RegisterConfiguredHotkey(showError: false); return; }
        await store.SaveSettingsAsync(settings);
        SetStatus($"Global shortcut changed to {HotkeyText.Format(settings)}.");
    }

    private bool RegisterConfiguredHotkey(bool showError)
    {
        if (windowHandle == 0) return false;
        UnregisterHotKey(windowHandle, HotkeyId);
        var ok = RegisterHotKey(windowHandle, HotkeyId, settings.Modifiers | 0x4000, settings.VirtualKey); // MOD_NOREPEAT
        if (!ok && showError) SetStatus("That shortcut is already registered by another application. Choose another.", true);
        return ok;
    }

    private void SetStatus(string message, bool error = false)
    {
        StatusText.Text = message;
        StatusText.Foreground = error ? Brushes.Firebrick : Brushes.SeaGreen;
    }

    [DllImport("user32.dll", SetLastError = true)] private static extern bool RegisterHotKey(nint hWnd, int id, uint modifiers, uint virtualKey);
    [DllImport("user32.dll", SetLastError = true)] private static extern bool UnregisterHotKey(nint hWnd, int id);
}
