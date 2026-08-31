using PromptLauncher.Core;
using System.Collections.Generic;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;

namespace PromptLauncher;

public sealed class HotkeyDialog : Window
{
    private readonly System.Windows.Controls.TextBox box = new() { IsReadOnly = true, Margin = new(12), Padding = new Thickness(8) };
    public LauncherSettings? SelectedHotkey { get; private set; }

    public HotkeyDialog(LauncherSettings current)
    {
        Title = "Set global shortcut";
        Width = 390;
        Height = 170;
        WindowStartupLocation = WindowStartupLocation.CenterOwner;
        ResizeMode = ResizeMode.NoResize;
        var panel = new StackPanel();
        panel.Children.Add(new TextBlock { Text = "Click below, then press a shortcut containing Ctrl, Alt, Shift, or Windows.", Margin = new Thickness(12, 12, 12, 0), TextWrapping = TextWrapping.Wrap });
        panel.Children.Add(box);
        var save = new Button { Content = "Save", HorizontalAlignment = HorizontalAlignment.Right, Margin = new Thickness(12) };
        save.Click += (_, _) => { if (SelectedHotkey is not null) DialogResult = true; };
        panel.Children.Add(save);
        Content = panel;
        PreviewKeyDown += Capture;
        box.Text = HotkeyText.Format(current);
    }

    private void Capture(object sender, System.Windows.Input.KeyEventArgs e)
    {
        var key = e.Key == Key.System ? e.SystemKey : e.Key;
        if (key is Key.LeftCtrl or Key.RightCtrl or Key.LeftAlt or Key.RightAlt or Key.LeftShift or Key.RightShift or Key.LWin or Key.RWin) return;
        var modifiers = 0u;
        if (Keyboard.Modifiers.HasFlag(ModifierKeys.Alt)) modifiers |= 0x0001;
        if (Keyboard.Modifiers.HasFlag(ModifierKeys.Control)) modifiers |= 0x0002;
        if (Keyboard.Modifiers.HasFlag(ModifierKeys.Shift)) modifiers |= 0x0004;
        if (Keyboard.Modifiers.HasFlag(ModifierKeys.Windows)) modifiers |= 0x0008;
        if (modifiers == 0) { box.Text = "Include at least one modifier key."; return; }
        SelectedHotkey = new LauncherSettings(modifiers, (uint)KeyInterop.VirtualKeyFromKey(key));
        box.Text = HotkeyText.Format(SelectedHotkey);
        e.Handled = true;
    }
}

internal static class HotkeyText
{
    public static string Format(LauncherSettings settings)
    {
        var parts = new List<string>();
        if ((settings.Modifiers & 0x0002) != 0) parts.Add("Ctrl");
        if ((settings.Modifiers & 0x0001) != 0) parts.Add("Alt");
        if ((settings.Modifiers & 0x0004) != 0) parts.Add("Shift");
        if ((settings.Modifiers & 0x0008) != 0) parts.Add("Win");
        parts.Add(KeyInterop.KeyFromVirtualKey((int)settings.VirtualKey).ToString());
        return string.Join("+", parts);
    }
}
