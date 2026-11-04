# Screenshot of the Tizen TV emulator's window (QEMU's own screendump only sees a blank console).
# Usage: tools\emulator-shot.ps1 <out.png>
param([Parameter(Mandatory)][string]$Out)
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System; using System.Runtime.InteropServices;
public class EmuWin {
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out R r);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr dc, uint f);
  public struct R { public int L, T, Rt, B; }
}
'@
$p = Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -eq 'Tizen Emulator' } | Select-Object -First 1
if (-not $p) { throw 'No "Tizen Emulator" window: launch it with em-cli launch -n hometv.' }
$r = New-Object EmuWin+R
[EmuWin]::GetWindowRect($p.MainWindowHandle, [ref]$r) | Out-Null
$bmp = New-Object System.Drawing.Bitmap ($r.Rt - $r.L), ($r.B - $r.T)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$dc = $g.GetHdc()
[EmuWin]::PrintWindow($p.MainWindowHandle, $dc, 2) | Out-Null
$g.ReleaseHdc($dc)
$bmp.Save($Out)
"Saved $Out ($($bmp.Width)x$($bmp.Height))"
