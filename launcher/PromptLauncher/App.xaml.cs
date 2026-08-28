using System;
using System.Windows;

namespace PromptLauncher;

public partial class App : System.Windows.Application
{
    private System.Windows.Forms.NotifyIcon? trayIcon;

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        var window = new MainWindow();
        MainWindow = window;

        trayIcon = new System.Windows.Forms.NotifyIcon
        {
            Icon = System.Drawing.SystemIcons.Application,
            Text = "Prompt Workspace Launcher",
            Visible = true
        };
        trayIcon.DoubleClick += (_, _) => window.OpenFromTray();
        var menu = new System.Windows.Forms.ContextMenuStrip();
        menu.Items.Add("Open", null, (_, _) => window.OpenFromTray());
        menu.Items.Add("Exit", null, (_, _) => ExitApplication());
        trayIcon.ContextMenuStrip = menu;

        window.Show();
        window.Hide();
    }

    public void ExitApplication()
    {
        trayIcon?.Dispose();
        trayIcon = null;
        MainWindow?.Close();
        Shutdown();
    }

    protected override void OnExit(ExitEventArgs e)
    {
        trayIcon?.Dispose();
        base.OnExit(e);
    }
}
