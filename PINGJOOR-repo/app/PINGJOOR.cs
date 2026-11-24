// PINGJOOR Windows client (C# 5 compatible: compiled on the user's PC by the built-in csc.exe).
// Shows the user's own PINGJOOR panel in a WebView2 window. bridge.js (injected into the panel page)
// asks this program, through cancelled navigations to pjapp://..., to set/clear the Windows DNS.
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace Pingjoor
{
    static class Program
    {
        [DllImport("user32.dll")] static extern bool SetProcessDPIAware();

        [STAThread]
        static void Main()
        {
            try { SetProcessDPIAware(); } catch (Exception) { }
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new MainForm());
        }
    }

    class MainForm : Form
    {
        const string HOME = "https://pingjoor.app/index.html";
        WebView2 wv;
        WebView2 wv2;                       // the panel is preloaded here, BEHIND the login page, and shown only when fully laid out
        CoreWebView2Environment penv;
        CoreWebView2 live;                  // the page that talks to us through the bridge (panel)
        string bridgeJs = "";
        bool panelShown = false;
        System.Windows.Forms.Timer swapTimer;
        string dir;
        string dataDir;
        string panelOrigin = "";
        bool busy = false;
        readonly object gate = new object();

        [DllImport("dwmapi.dll")] static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int val, int size);

        protected override void OnHandleCreated(EventArgs e)
        {
            base.OnHandleCreated(e);
            try
            {
                IntPtr hw = ((Control)this).Handle; int on = 1; int cap = (28 << 16) | (12 << 8) | 8; int txt = (255 << 16) | (242 << 8) | 238;
                DwmSetWindowAttribute(hw, 20, ref on, 4);
                DwmSetWindowAttribute(hw, 19, ref on, 4);
                DwmSetWindowAttribute(hw, 35, ref cap, 4);
                DwmSetWindowAttribute(hw, 34, ref cap, 4);
                DwmSetWindowAttribute(hw, 36, ref txt, 4);
            }
            catch (Exception) { }
        }

        public MainForm()
        {
            Text = "PINGJOOR";
            StartPosition = FormStartPosition.CenterScreen;
            ClientSize = new Size(1180, 760);
            MinimumSize = new Size(440, 660);
            BackColor = Color.FromArgb(6, 10, 27);
            dir = AppDomain.CurrentDomain.BaseDirectory;
            dataDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "PINGJOOR");
            try { Icon = new Icon(Path.Combine(dir, "icon.ico")); } catch (Exception) { }
            wv = new WebView2();
            wv.Dock = DockStyle.Fill;
            Controls.Add(wv);
            Shown += delegate { Init(); };
        }

        async void Init()
        {
            try
            {
                string ud = Path.Combine(dataDir, "webview");
                CoreWebView2Environment env = await CoreWebView2Environment.CreateAsync(null, ud, null);
                await wv.EnsureCoreWebView2Async(env);
                CoreWebView2 core = wv.CoreWebView2;
                penv = env;
                bridgeJs = File.ReadAllText(Path.Combine(dir, "bridge.js"), Encoding.UTF8);
                await core.AddScriptToExecuteOnDocumentCreatedAsync(bridgeJs);
                core.SetVirtualHostNameToFolderMapping("pingjoor.app", Path.Combine(dir, "ui"), CoreWebView2HostResourceAccessKind.Allow);
                Hook(core);
                RecoverIfUnclean();
                core.Navigate(HOME);
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    "WebView2 could not start.\n\nInstall the Microsoft Edge WebView2 Runtime (free, from microsoft.com) and open PINGJOOR again.\n\n" + ex.Message,
                    "PINGJOOR", MessageBoxButtons.OK, MessageBoxIcon.Error);
                Close();
            }
        }


        void Hook(CoreWebView2 core)
        {
            core.WebMessageReceived += delegate (object s2, CoreWebView2WebMessageReceivedEventArgs e2)
            {
                string m = null;
                try { m = e2.TryGetWebMessageAsString(); } catch (Exception) { }
                if (m == null) return;
                if (m.StartsWith("pjapp://", StringComparison.OrdinalIgnoreCase))
                {
                    string copy2 = m;
                    ThreadPool.QueueUserWorkItem(delegate { Handle(copy2); });
                }
                else if (m.StartsWith("pjgo:", StringComparison.Ordinal))
                {
                    // only the built-in login page (pingjoor.app) may ask to open a panel
                    string ssrc = "";
                    try { ssrc = ((CoreWebView2)s2).Source ?? ""; } catch (Exception) { }
                    if (!ssrc.StartsWith("https://pingjoor.app/", StringComparison.OrdinalIgnoreCase)) return;
                    string target = m.Substring(5);
                    BeginInvoke(new Action(delegate { StartPanel(target); }));
                }
            };
            core.NavigationStarting += OnNavStart;
            core.NavigationCompleted += OnNavDone;
            core.NewWindowRequested += delegate (object s, CoreWebView2NewWindowRequestedEventArgs e)
            {
                e.Handled = true;
                OpenExternal(e.Uri);
            };
        }

        // The login page stays on screen (button waiting). The panel loads in a second WebView behind it
        // and is brought to the front only when bridge.js reports that everything is placed.
        async void StartPanel(string url)
        {
            try
            {
                Uri u;
                if (!Uri.TryCreate(url, UriKind.Absolute, out u) || (u.Scheme != "http" && u.Scheme != "https") || !u.AbsolutePath.StartsWith("/u/"))
                {
                    wv.CoreWebView2.Navigate(HOME + "?fail=1");
                    return;
                }
                DisposePanel();
                wv2 = new WebView2();
                wv2.Dock = DockStyle.Fill;
                Controls.Add(wv2);
                wv2.SendToBack();
                WebView2 mine = wv2;
                await mine.EnsureCoreWebView2Async(penv);
                if (mine != wv2) return;
                CoreWebView2 c2 = mine.CoreWebView2;
                await c2.AddScriptToExecuteOnDocumentCreatedAsync(bridgeJs);
                Hook(c2);
                live = c2;
                swapTimer = new System.Windows.Forms.Timer();
                swapTimer.Interval = 12000;
                swapTimer.Tick += delegate { ShowPanel(); };
                swapTimer.Start();
                c2.Navigate(u.AbsoluteUri);
            }
            catch (Exception)
            {
                try { DisposePanel(); wv.CoreWebView2.Navigate(HOME + "?fail=1"); } catch (Exception) { }
            }
        }

        void ShowPanel()
        {
            if (panelShown || wv2 == null) return;
            panelShown = true;
            if (swapTimer != null) { swapTimer.Stop(); swapTimer.Dispose(); swapTimer = null; }
            wv2.BringToFront();
            wv.Visible = false;
        }

        void DisposePanel()
        {
            live = null;
            panelShown = false;
            if (swapTimer != null) { swapTimer.Stop(); swapTimer.Dispose(); swapTimer = null; }
            if (wv2 != null)
            {
                WebView2 old = wv2;
                wv2 = null;
                try { Controls.Remove(old); old.Dispose(); } catch (Exception) { }
            }
            wv.Visible = true;
            wv.BringToFront();
        }

        static string OriginOf(Uri x)
        {
            return x.Scheme + "://" + x.Host + ":" + x.Port;
        }

        void OnNavStart(object sender, CoreWebView2NavigationStartingEventArgs e)
        {
            string u = e.Uri ?? "";
            if (u.StartsWith("pjapp://", StringComparison.OrdinalIgnoreCase))
            {
                e.Cancel = true;
                string copy = u;
                ThreadPool.QueueUserWorkItem(delegate { Handle(copy); });
                return;
            }
            Uri x;
            if (Uri.TryCreate(u, UriKind.Absolute, out x) && (x.Scheme == "http" || x.Scheme == "https"))
            {
                if (x.AbsolutePath.StartsWith("/u/")) { panelOrigin = OriginOf(x); return; }
                // a link the user clicked that leads to another site (ads etc.) opens in the system browser
                if (!e.IsRedirected && panelOrigin.Length > 0 && OriginOf(x) != panelOrigin && !x.Host.Equals("pingjoor.app", StringComparison.OrdinalIgnoreCase))
                {
                    e.Cancel = true;
                    OpenExternal(u);
                }
            }
        }

        static void OpenExternal(string u)
        {
            try
            {
                Uri x;
                if (Uri.TryCreate(u, UriKind.Absolute, out x) && (x.Scheme == "http" || x.Scheme == "https"))
                    Process.Start(new ProcessStartInfo(x.AbsoluteUri) { UseShellExecute = true });
            }
            catch (Exception) { }
        }

        void OnNavDone(object sender, CoreWebView2NavigationCompletedEventArgs e)
        {
            if (e.IsSuccess) return;
            // cancelled navigations (our own pjapp:// bridge calls) are not real failures
            if (e.WebErrorStatus == CoreWebView2WebErrorStatus.OperationCanceled) return;
            Uri x;
            CoreWebView2 sc = sender as CoreWebView2;
            string src = sc != null ? (sc.Source ?? "") : "";
            if (panelOrigin.Length > 0 && Uri.TryCreate(src, UriKind.Absolute, out x) && OriginOf(x) == panelOrigin)
            {
                DisposePanel();
                wv.CoreWebView2.Navigate(HOME + "?fail=1");
            }
        }

        void Eval(string code)
        {
            try
            {
                BeginInvoke(new Action(delegate
                {
                    try { (live ?? wv.CoreWebView2).ExecuteScriptAsync(code); } catch (Exception) { }
                }));
            }
            catch (Exception) { }
        }

        string CurrentOrigin()
        {
            string res = "";
            try
            {
                Invoke(new Action(delegate
                {
                    Uri x;
                    string s = (live ?? wv.CoreWebView2).Source ?? "";
                    if (Uri.TryCreate(s, UriKind.Absolute, out x)) res = OriginOf(x);
                }));
            }
            catch (Exception) { }
            return res;
        }

        // ---------- bridge requests (worker thread) ----------
        void Handle(string url)
        {
            Uri x;
            if (!Uri.TryCreate(url, UriKind.Absolute, out x)) return;
            if (panelOrigin.Length == 0 || CurrentOrigin() != panelOrigin) return;   // only the user's own panel page
            string action = x.Host.ToLowerInvariant();
            if (action == "status")
            {
                Eval("window.__pjStatus({\"dns\":" + ListJson(LoadDns()) + "})");
            }
            else if (action == "set" || action == "clear")
            {
                lock (gate) { if (busy) return; busy = true; }
                string result;
                try
                {
                    if (action == "set")
                    {
                        List<string> ips = ParseIps(Query(x, "d"));
                        result = ips == null ? Fail("set", "آدرس DNS نامعتبر است") : DoSet(ips);
                    }
                    else result = DoClear();
                }
                catch (Exception ex) { result = Fail(action, ex.Message); }
                lock (gate) { busy = false; }
                Eval("window.__pjResult(" + result + ")");
            }
            else if (action == "ready")
            {
                BeginInvoke(new Action(ShowPanel));
            }
            else if (action == "open")
            {
                OpenExternal(Query(x, "u"));
            }
            else if (action == "change")
            {
                BeginInvoke(new Action(delegate { DisposePanel(); wv.CoreWebView2.Navigate(HOME + "?change=1"); }));
            }
        }

        static string Query(Uri x, string key)
        {
            string q = x.Query;
            if (q.StartsWith("?")) q = q.Substring(1);
            foreach (string part in q.Split('&'))
            {
                int i = part.IndexOf('=');
                if (i < 0) continue;
                if (part.Substring(0, i) == key) return Uri.UnescapeDataString(part.Substring(i + 1));
            }
            return "";
        }

        static List<string> ParseIps(string s)
        {
            List<string> outl = new List<string>();
            foreach (string raw in s.Split(','))
            {
                string p = raw.Trim();
                string[] o = p.Split('.');
                if (o.Length != 4) return null;
                int[] n = new int[4];
                for (int i = 0; i < 4; i++)
                {
                    if (o[i].Length == 0 || o[i].Length > 3) return null;
                    foreach (char c in o[i]) if (c < '0' || c > '9') return null;
                    n[i] = int.Parse(o[i]);
                    if (n[i] > 255) return null;
                }
                if (n[0] == 0 || n[0] == 127 || n[0] >= 224) return null;
                string t = n[0] + "." + n[1] + "." + n[2] + "." + n[3];
                if (!outl.Contains(t)) outl.Add(t);
            }
            if (outl.Count == 0 || outl.Count > 4) return null;
            return outl;
        }

        // ---------- JSON helpers ----------
        static string Q(string s)
        {
            StringBuilder sb = new StringBuilder("\"");
            foreach (char c in s)
            {
                if (c == '"') sb.Append("\\\"");
                else if (c == '\\') sb.Append("\\\\");
                else if (c == '\n') sb.Append("\\n");
                else if (c == '\r') { }
                else if (c == '<' || c == '>' || c == '&' || c < 32) sb.Append("\\u" + ((int)c).ToString("x4"));
                else sb.Append(c);
            }
            sb.Append('"');
            return sb.ToString();
        }
        static string ListJson(List<string> l)
        {
            List<string> q = new List<string>();
            foreach (string s in l) q.Add(Q(s));
            return "[" + string.Join(",", q.ToArray()) + "]";
        }
        static string Fail(string op, string msg)
        {
            return "{\"ok\":false,\"op\":" + Q(op) + ",\"msg\":" + Q(msg) + "}";
        }

        // ---------- state (what we changed + what the user had BEFORE) ----------
        class AdRow
        {
            public int Idx;
            public string Guid = "";
            public string Kind = "U";                       // S = static DNS, D = DHCP/automatic, U = unknown (never touched on restore)
            public List<string> Cur = new List<string>();   // DNS servers in effect right now
            public List<string> Cfg = new List<string>();   // statically configured servers (Kind S)
        }
        class DnsState
        {
            public List<string> Dns = new List<string>();   // what PINGJOOR applied
            public string Adapters = "";
            public List<AdRow> Prev = new List<AdRow>();    // original settings, one per adapter
        }

        string StatePath() { Directory.CreateDirectory(dataDir); return Path.Combine(dataDir, "dns-state.txt"); }
        string FlagPath() { Directory.CreateDirectory(dataDir); return Path.Combine(dataDir, "running.flag"); }

        static List<string> SplitCsv(string s)
        {
            List<string> r = new List<string>();
            if (s == null) return r;
            foreach (string p in s.Split(',')) if (p.Trim().Length > 0) r.Add(p.Trim());
            return r;
        }

        DnsState LoadState()
        {
            DnsState st = new DnsState();
            try
            {
                foreach (string l in File.ReadAllLines(StatePath()))
                {
                    if (l.StartsWith("dns=")) st.Dns = SplitCsv(l.Substring(4));
                    else if (l.StartsWith("adapters=")) st.Adapters = l.Substring(9).Trim();
                    else if (l.StartsWith("prev="))
                    {
                        string[] p = l.Substring(5).Split('|');
                        int n;
                        if (p.Length >= 4 && int.TryParse(p[0], out n))
                        {
                            AdRow r = new AdRow();
                            r.Idx = n; r.Guid = p[1]; r.Kind = (p[2] == "S" || p[2] == "D") ? p[2] : "U"; r.Cfg = SplitCsv(p[3]);
                            st.Prev.Add(r);
                        }
                    }
                }
            }
            catch (Exception) { }
            return st;
        }

        void SaveState(DnsState st)
        {
            StringBuilder sb = new StringBuilder();
            sb.Append("dns=" + string.Join(",", st.Dns.ToArray()) + "\r\n");
            sb.Append("adapters=" + st.Adapters + "\r\n");
            foreach (AdRow r in st.Prev)
                sb.Append("prev=" + r.Idx + "|" + r.Guid + "|" + r.Kind + "|" + string.Join(",", r.Cfg.ToArray()) + "\r\n");
            string path = StatePath();
            File.WriteAllText(path + ".tmp", sb.ToString());
            if (File.Exists(path)) File.Delete(path);
            File.Move(path + ".tmp", path);
        }

        List<string> LoadDns() { return LoadState().Dns; }
        string LoadAdapters() { return LoadState().Adapters; }

        static AdRow FindRow(List<AdRow> l, int idx)
        {
            foreach (AdRow r in l) if (r.Idx == idx) return r;
            return null;
        }
        static bool SameSet(List<string> a, List<string> b)
        {
            if (a.Count != b.Count) return false;
            foreach (string x in a) if (!b.Contains(x)) return false;
            return true;
        }

        // ---------- PowerShell ----------
        // Read-only query (no admin rights): per adapter -> index|guid|S/D/U|current servers|static servers
        const string PS_QUERY = @"$ErrorActionPreference = 'SilentlyContinue'
$ids = @(%LIST%)
if ($ids.Count -eq 0) { $ids = @(Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -ne $null -and $_.NetAdapter.Status -eq 'Up' } | ForEach-Object { $_.InterfaceIndex }) }
foreach ($i in $ids) {
  $n = Get-NetAdapter -InterfaceIndex $i
  if (-not $n) { continue }
  $g = [string]$n.InterfaceGuid
  $p = Get-ItemProperty -Path ('HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Interfaces\' + $g)
  $st = 'U'; $ns = ''
  if ($p -ne $null) { $ns = [string]$p.NameServer; if ($ns.Trim().Length -gt 0) { $st = 'S' } else { $st = 'D' } }
  $cur = (@((Get-DnsClientServerAddress -InterfaceIndex $i -AddressFamily IPv4).ServerAddresses) -join ',')
  $cfg = ((($ns -split '[,; ]') | Where-Object { $_ }) -join ',')
  Write-Output ($i.ToString() + '|' + $g + '|' + $st + '|' + $cur + '|' + $cfg)
}
";
        const string PS_SET = @"$ErrorActionPreference = 'Stop'
$out = '%OUT%'
try {
  $idx = @(%IDX%)
  if ($idx.Count -eq 0) { throw 'No active network adapter found' }
  foreach ($i in $idx) {
    Set-DnsClientServerAddress -InterfaceIndex $i -ServerAddresses (%LIST%)
  }
  Clear-DnsClientCache
  Set-Content -Path $out -Value ('OK|' + ($idx -join ',')) -Encoding ASCII
} catch {
  Set-Content -Path $out -Value ('ERR|' + $_.Exception.Message) -Encoding UTF8
}
";
        // restore EXACT previous settings: items are 'index|S|ip1,ip2' (static) or 'index|D|' (automatic / DHCP)
        const string PS_RESTORE = @"$ErrorActionPreference = 'Stop'
$out = '%OUT%'
try {
  foreach ($it in @(%ITEMS%)) {
    $p = $it.Split('|'); $i = [int]$p[0]
    try {
      if ($p[1] -eq 'S' -and $p[2].Length -gt 0) { Set-DnsClientServerAddress -InterfaceIndex $i -ServerAddresses ($p[2].Split(',')) }
      else { Set-DnsClientServerAddress -InterfaceIndex $i -ResetServerAddresses }
    } catch { }
  }
  Clear-DnsClientCache
  Set-Content -Path $out -Value 'OK|' -Encoding ASCII
} catch {
  Set-Content -Path $out -Value ('ERR|' + $_.Exception.Message) -Encoding UTF8
}
";
        // legacy (state file written by v21 or older, no saved originals): automatic/DHCP
        const string PS_CLEAR = @"$ErrorActionPreference = 'Stop'
$out = '%OUT%'
try {
  $idx = @(%LIST%)
  if ($idx.Count -eq 0) {
    $idx = @(Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -ne $null } | ForEach-Object { $_.InterfaceIndex })
  }
  foreach ($i in $idx) {
    try { Set-DnsClientServerAddress -InterfaceIndex $i -ResetServerAddresses } catch { }
  }
  Clear-DnsClientCache
  Set-Content -Path $out -Value 'OK|' -Encoding ASCII
} catch {
  Set-Content -Path $out -Value ('ERR|' + $_.Exception.Message) -Encoding UTF8
}
";

        static string RunPlain(string script)
        {
            string ps1 = Path.Combine(Path.GetTempPath(), "pj_" + DateTime.Now.Ticks.ToString() + ".ps1");
            File.WriteAllText(ps1, script, new UTF8Encoding(true));
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo("powershell.exe", "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"" + ps1 + "\"");
                psi.UseShellExecute = false;
                psi.RedirectStandardOutput = true;
                psi.CreateNoWindow = true;
                psi.StandardOutputEncoding = Encoding.UTF8;
                using (Process p = Process.Start(psi))
                {
                    string o = p.StandardOutput.ReadToEnd();
                    if (!p.WaitForExit(30000)) { try { p.Kill(); } catch (Exception) { } }
                    return o;
                }
            }
            finally
            {
                try { File.Delete(ps1); } catch (Exception) { }
            }
        }

        List<AdRow> Query(List<int> ids)
        {
            List<string> nums = new List<string>();
            if (ids != null) foreach (int n in ids) nums.Add(n.ToString());
            List<AdRow> rows = new List<AdRow>();
            string o = RunPlain(PS_QUERY.Replace("%LIST%", string.Join(",", nums.ToArray())));
            foreach (string line in o.Split('\n'))
            {
                string[] p = line.Trim().Split('|');
                int n2;
                if (p.Length < 5 || !int.TryParse(p[0], out n2)) continue;
                AdRow r = new AdRow();
                r.Idx = n2; r.Guid = p[1]; r.Kind = (p[2] == "S" || p[2] == "D") ? p[2] : "U";
                r.Cur = SplitCsv(p[3]); r.Cfg = SplitCsv(p[4]);
                rows.Add(r);
            }
            return rows;
        }

        static string RunElevated(string script)
        {
            string id = DateTime.Now.Ticks.ToString();
            string ps1 = Path.Combine(Path.GetTempPath(), "pj_" + id + ".ps1");
            string outp = Path.Combine(Path.GetTempPath(), "pj_" + id + ".out");
            script = script.Replace("%OUT%", outp.Replace("'", "''"));
            File.WriteAllText(ps1, script, new UTF8Encoding(true));
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo("powershell.exe", "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"" + ps1 + "\"");
                psi.Verb = "runas";
                psi.UseShellExecute = true;
                psi.WindowStyle = ProcessWindowStyle.Hidden;
                Process p = Process.Start(psi);
                if (p != null) { p.WaitForExit(90000); p.Dispose(); }
            }
            catch (Win32Exception)
            {
                throw new Exception("دسترسی ادمین (UAC) تایید نشد");
            }
            finally
            {
                try { File.Delete(ps1); } catch (Exception) { }
            }
            if (!File.Exists(outp)) throw new Exception("نتیجه‌ای از PowerShell دریافت نشد");
            string t = File.ReadAllText(outp, Encoding.UTF8).Trim().TrimStart('﻿');
            try { File.Delete(outp); } catch (Exception) { }
            return t;
        }

        bool Ask(string text, MessageBoxIcon icon)
        {
            bool res = false;
            Invoke(new Action(delegate
            {
                res = MessageBox.Show(this, text, "PINGJOOR", MessageBoxButtons.YesNo, icon, MessageBoxDefaultButton.Button2,
                    MessageBoxOptions.RtlReading | MessageBoxOptions.RightAlign) == DialogResult.Yes;
            }));
            return res;
        }

        // ---------- connect: remember what the user had, then apply ----------
        string DoSet(List<string> ips)
        {
            DnsState old = LoadState();
            List<AdRow> rows = Query(null);
            if (rows.Count == 0) return Fail("set", "No active network adapter found");
            DnsState ns = new DnsState();
            ns.Dns = ips;
            List<string> idx = new List<string>();
            foreach (AdRow r in rows)
            {
                idx.Add(r.Idx.ToString());
                AdRow keep = FindRow(old.Prev, r.Idx);
                if (keep != null && keep.Guid == r.Guid) ns.Prev.Add(keep);          // already connected: keep the ORIGINAL settings, not our own
                else
                {
                    if (SameSet(r.Cur, ips) && old.Dns.Count == 0) r.Kind = "D";     // state lost but it already shows our DNS: fall back to automatic
                    ns.Prev.Add(r);
                }
            }
            foreach (AdRow o in old.Prev) if (FindRow(ns.Prev, o.Idx) == null) ns.Prev.Add(o);   // adapter not active now but still changed earlier
            List<string> all = new List<string>();
            foreach (AdRow r in ns.Prev) all.Add(r.Idx.ToString());
            ns.Adapters = string.Join(",", all.ToArray());
            SaveState(ns);                                                           // BEFORE changing anything: a crash from here on is recoverable
            List<string> q = new List<string>();
            foreach (string ip in ips) q.Add("'" + ip + "'");
            string t;
            try { t = RunElevated(PS_SET.Replace("%IDX%", string.Join(",", idx.ToArray())).Replace("%LIST%", string.Join(",", q.ToArray()))); }
            catch (Exception) { try { SaveState(old); } catch (Exception) { } throw; }
            if (t.StartsWith("OK|")) return "{\"ok\":true,\"op\":\"set\",\"dns\":" + ListJson(ips) + "}";
            try { SaveState(old); } catch (Exception) { }
            return Fail("set", t.StartsWith("ERR|") ? t.Substring(4) : t);
        }

        // ---------- disconnect: restore EXACTLY the previous settings ----------
        string DoClear()
        {
            DnsState st = LoadState();
            if (st.Prev.Count == 0) return DoClearLegacy(st);
            List<int> ids = new List<int>();
            foreach (AdRow p in st.Prev) ids.Add(p.Idx);
            List<AdRow> now = Query(ids);
            List<AdRow> ready = new List<AdRow>();
            List<AdRow> changed = new List<AdRow>();
            foreach (AdRow p in st.Prev)
            {
                AdRow c = FindRow(now, p.Idx);
                if (c == null || c.Guid != p.Guid) continue;                          // adapter no longer exists
                if (p.Kind == "U") continue;                                          // original unknown: never guess
                if (st.Dns.Count > 0 && !SameSet(c.Cur, st.Dns)) changed.Add(p); else ready.Add(p);
            }
            if (changed.Count > 0)
            {
                if (Ask("DNS یک یا چند کارت شبکه بعد از اتصال دستی تغییر کرده و با تنظیم PINGJOOR یکی نیست.\r\nتغییر شما حفظ شود؟\r\n\r\nخیر = حفظ تغییر دستی من و رها کردن آن کارت‌ها\r\nبله = با این حال DNS قبلی (قبل از PINGJOOR) برگردد", MessageBoxIcon.Question)) ready.AddRange(changed);
            }
            if (ready.Count > 0)
            {
                List<string> items = new List<string>();
                foreach (AdRow p in ready)
                    items.Add("'" + p.Idx + "|" + p.Kind + "|" + string.Join(",", p.Cfg.ToArray()) + "'");
                string t = RunElevated(PS_RESTORE.Replace("%ITEMS%", string.Join(",", items.ToArray())));
                if (!t.StartsWith("OK|")) return Fail("clear", t.StartsWith("ERR|") ? t.Substring(4) : t);
                List<int> rid = new List<int>();
                foreach (AdRow p in ready) rid.Add(p.Idx);
                foreach (AdRow c in Query(rid))
                    if (st.Dns.Count > 0 && SameSet(c.Cur, st.Dns))
                        return Fail("clear", "بازگرداندن DNS قبلی تایید نشد؛ دوباره تلاش کنید (وضعیت ذخیره‌شده حفظ شد)");
            }
            SaveState(new DnsState());
            return "{\"ok\":true,\"op\":\"clear\",\"dns\":[]}";
        }

        string DoClearLegacy(DnsState st)
        {
            List<string> nums = new List<string>();
            foreach (string a in st.Adapters.Split(','))
            {
                int n;
                if (int.TryParse(a.Trim(), out n)) nums.Add(n.ToString());
            }
            string t = RunElevated(PS_CLEAR.Replace("%LIST%", string.Join(",", nums.ToArray())));
            if (t.StartsWith("OK|"))
            {
                SaveState(new DnsState());
                return "{\"ok\":true,\"op\":\"clear\",\"dns\":[]}";
            }
            return Fail("clear", t.StartsWith("ERR|") ? t.Substring(4) : t);
        }

        // ---------- crash / sudden close recovery ----------
        async void RecoverIfUnclean()
        {
            try
            {
                bool unclean = File.Exists(FlagPath());
                DnsState st = LoadState();
                File.WriteAllText(FlagPath(), DateTime.Now.ToString("s"));
                if (!unclean || st.Dns.Count == 0) return;
                if (!Ask("برنامه بار قبل ناگهانی بسته شد و DNS هنوز روی PINGJOOR است.\r\nDNS قبلی شما بازگردانده شود؟", MessageBoxIcon.Question)) return;
                string r = await System.Threading.Tasks.Task.Run(new Func<string>(delegate { try { return DoClear(); } catch (Exception ex) { return Fail("clear", ex.Message); } }));
                if (r.IndexOf("\"ok\":false") >= 0)
                    MessageBox.Show(this, "بازگرداندن DNS انجام نشد. با دکمه قطع داخل برنامه دوباره تلاش کنید.", "PINGJOOR", MessageBoxButtons.OK, MessageBoxIcon.Warning, MessageBoxDefaultButton.Button1, MessageBoxOptions.RtlReading | MessageBoxOptions.RightAlign);
            }
            catch (Exception) { }
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            base.OnFormClosing(e);
            if (e.Cancel) return;
            try
            {
                if (LoadState().Dns.Count == 0) return;
                DialogResult r = MessageBox.Show(this, "DNS هنوز روی PINGJOOR است.\r\n\r\nبله = DNS قبلی برگردد و برنامه بسته شود\r\nخیر = بسته شود و DNS فعلی بماند\r\nانصراف = برنامه باز بماند", "PINGJOOR",
                    MessageBoxButtons.YesNoCancel, MessageBoxIcon.Question, MessageBoxDefaultButton.Button1, MessageBoxOptions.RtlReading | MessageBoxOptions.RightAlign);
                if (r == DialogResult.Cancel) { e.Cancel = true; return; }
                if (r == DialogResult.Yes)
                {
                    string res = DoClear();
                    if (res.IndexOf("\"ok\":false") >= 0)
                    {
                        MessageBox.Show(this, "بازگرداندن DNS انجام نشد؛ برنامه باز می‌ماند.", "PINGJOOR", MessageBoxButtons.OK, MessageBoxIcon.Warning, MessageBoxDefaultButton.Button1, MessageBoxOptions.RtlReading | MessageBoxOptions.RightAlign);
                        e.Cancel = true;
                    }
                }
            }
            catch (Exception) { }
        }

        protected override void OnFormClosed(FormClosedEventArgs e)
        {
            try { File.Delete(FlagPath()); } catch (Exception) { }
            base.OnFormClosed(e);
        }
    }
}
