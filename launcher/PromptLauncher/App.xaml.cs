using System;
using System.Threading;
using System.Windows;

namespace PromptLauncher;

public partial class App : System.Windows.Application
{
    private System.Windows.Forms.NotifyIcon? trayIcon;
    private Mutex? singleInstanceMutex;

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        singleInstanceMutex = new Mutex(true, @"Local\PromptWorkspaceLauncher", out var firstInstance);
        if (!firstInstance)
        {
            System.Windows.MessageBox.Show(
                "Prompt Workspace Launcher is already running. Find it in the notification area or press its global shortcut.",
                "Prompt Workspace Launcher",
                MessageBoxButton.OK,
                MessageBoxImage.Information);
            Shutdown();
            return;
        }

        DispatcherUnhandledException += (_, args) =>
        {
            LauncherLog.Write("Unhandled UI exception.", args.Exception);
            System.Windows.MessageBox.Show(
                $"An unexpected error was handled and logged.\n\n{LauncherLog.LogPath}",
                "Prompt Workspace Launcher",
                MessageBoxButton.OK,
                MessageBoxImage.Error);
            args.Handled = true;
        };
        AppDomain.CurrentDomain.UnhandledException += (_, args) =>
            LauncherLog.Write("Unhandled process exception.", args.ExceptionObject as Exception);

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
        if (singleInstanceMutex is not null)
        {
            try { singleInstanceMutex.ReleaseMutex(); }
            catch (ApplicationException) { }
            singleInstanceMutex.Dispose();
            singleInstanceMutex = null;
        }
        base.OnExit(e);
    }
}
