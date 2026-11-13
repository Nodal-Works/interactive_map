param(
    [Parameter(Mandatory=$true)][ValidateSet('campus', 'lindholmen')][string]$Target,
    [switch]$NoOpen,
    [switch]$Check
)
$ErrorActionPreference = 'Stop'
$Repo = Split-Path $PSScriptRoot -Parent
$Mutex = New-Object System.Threading.Mutex($false, 'Local\MRStudioDesktopSwitch')
$Locked = $false
try {
    try { $Locked = $Mutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $Locked = $true }
    if (-not $Locked) { throw 'Another launcher is switching services. Please wait a moment and try again.' }
    $Settings = Get-Content (Join-Path $Repo '.runtime\desktop-launchers.json') -Raw | ConvertFrom-Json
    $Root = $Settings.$Target
    $Python = $Settings.python
    $Helper = Join-Path $PSScriptRoot 'desktop_service_process.py'
    foreach ($Required in @($Python, $Helper, (Join-Path $Root 'scripts\services.py'), (Join-Path $Root 'launcher.html'))) {
        if (-not (Test-Path -LiteralPath $Required)) { throw "Required launcher file is missing: $Required" }
    }
    $Ports = @()
    $HostPort = 0
    foreach ($Checkout in @($Settings.campus, $Settings.lindholmen)) {
        $Config = Get-Content (Join-Path $Checkout 'services.example.json') -Raw | ConvertFrom-Json
        $LocalFile = Join-Path $Checkout 'services.local.json'
        if (Test-Path $LocalFile) {
            $Local = Get-Content $LocalFile -Raw | ConvertFrom-Json
            foreach ($Prop in $Local.PSObject.Properties) {
                $Config | Add-Member -NotePropertyName $Prop.Name -NotePropertyValue $Prop.Value -Force
            }
        }
        $Ports += @($Config.host, $Config.ecom, $Config.coolpaths, $Config.sam)
        if ($Checkout -eq $Root) { $HostPort = $Config.host }
    }
    $Processes = @(Get-CimInstance Win32_Process)
    $Supervisors = @($Processes | Where-Object {
        $Process = $_
        $Process.Name -eq 'python.exe' -and (@($Settings.campus, $Settings.lindholmen) | Where-Object {
            $Script = [regex]::Escape((Join-Path $_ 'scripts\services.py'))
            $Process.CommandLine -match ('(?:^|[\s"])' + $Script + '(?:[\s"]|$)')
        })
    })
    $Owned = @{}
    foreach ($Process in $Supervisors) { $Owned[[int]$Process.ProcessId] = $Process }
    do {
        $Added = $false
        foreach ($Process in $Processes) {
            if ($Owned.ContainsKey([int]$Process.ParentProcessId) -and -not $Owned.ContainsKey([int]$Process.ProcessId)) {
                $Owned[[int]$Process.ProcessId] = $Process
                $Added = $true
            }
        }
    } while ($Added)
    $Listeners = @(Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -in $Ports })
    foreach ($Listener in $Listeners) {
        if (-not $Owned.ContainsKey([int]$Listener.OwningProcess)) {
            throw "Port $($Listener.LocalPort) belongs to an unrecognized process ($($Listener.OwningProcess)). It was left running."
        }
    }
    if ($Check) {
        Write-Output "Validated $Target; $($Supervisors.Count) recognized supervisor(s), $($Owned.Count) service processes."
        return
    }
    $Splash = $null
    if (-not $NoOpen) {
        Add-Type -AssemblyName System.Drawing
        Add-Type -AssemblyName System.Windows.Forms
        $Splash = New-Object System.Windows.Forms.Form
        $Splash.Text = 'MR Studio'
        $Splash.StartPosition = 'CenterScreen'
        $Splash.FormBorderStyle = 'FixedDialog'
        $Splash.ControlBox = $false
        $Splash.ShowInTaskbar = $true
        $Splash.ClientSize = New-Object System.Drawing.Size(440, 190)
        $Splash.BackColor = [System.Drawing.Color]::FromArgb(24, 28, 38)
        $Splash.ForeColor = [System.Drawing.Color]::White
        $Title = New-Object System.Windows.Forms.Label
        $Title.Text = 'MR Studio'
        $Title.Font = New-Object System.Drawing.Font('Segoe UI', 21, [System.Drawing.FontStyle]::Bold)
        $Title.ForeColor = [System.Drawing.Color]::White
        $Title.AutoSize = $true
        $Title.Location = New-Object System.Drawing.Point(28, 24)
        $Splash.Controls.Add($Title)
        $Detail = New-Object System.Windows.Forms.Label
        $Detail.Text = "Starting $Target workspace..."
        $Detail.Font = New-Object System.Drawing.Font('Segoe UI', 11)
        $Detail.ForeColor = [System.Drawing.Color]::FromArgb(198, 205, 218)
        $Detail.AutoSize = $true
        $Detail.Location = New-Object System.Drawing.Point(31, 78)
        $Splash.Controls.Add($Detail)
        $Progress = New-Object System.Windows.Forms.ProgressBar
        $Progress.Style = 'Marquee'
        $Progress.MarqueeAnimationSpeed = 24
        $Progress.Location = New-Object System.Drawing.Point(31, 125)
        $Progress.Size = New-Object System.Drawing.Size(378, 12)
        $Splash.Controls.Add($Progress)
        $Splash.Show()
        [System.Windows.Forms.Application]::DoEvents()
    }
    # Bring the checkout up to the latest merged main before starting it.
    # Only ever a fast-forward of a clean main checkout: anything else (another
    # branch, local edits, offline, diverged) is left exactly as it is and the
    # launch carries on with what is checked out.
    if ($Detail) {
        $Detail.Text = "Checking for updates..."
        [System.Windows.Forms.Application]::DoEvents()
    }
    $UpdateLog = Join-Path $Root '.runtime\desktop-update.log'
    $UpdateNote = $null
    $Git = Get-Command git -ErrorAction SilentlyContinue
    if (-not $Git) {
        $UpdateNote = 'git was not found; launching the checked-out version.'
    } else {
        $PreviousPreference = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        try {
            $Branch = (& git -C $Root rev-parse --abbrev-ref HEAD 2>$null | Out-String).Trim()
            $Dirty = (& git -C $Root status --porcelain --untracked-files=no 2>$null | Out-String).Trim()
            $Before = (& git -C $Root rev-parse --short HEAD 2>$null | Out-String).Trim()
            $FetchOutput = & git -C $Root fetch origin main 2>&1 | Out-String
            $Fetched = $LASTEXITCODE -eq 0
            if ($Branch -ne 'main') {
                $UpdateNote = "Not updated: $Root is on branch '$Branch', not main."
            } elseif ($Dirty) {
                $UpdateNote = "Not updated: $Root has uncommitted changes."
            } elseif (-not $Fetched) {
                $UpdateNote = "Not updated: could not reach origin (offline?). $($FetchOutput.Trim())"
            } else {
                $MergeOutput = & git -C $Root merge --ff-only origin/main 2>&1 | Out-String
                $Merged = $LASTEXITCODE -eq 0
                $After = (& git -C $Root rev-parse --short HEAD 2>$null | Out-String).Trim()
                if (-not $Merged) {
                    $UpdateNote = "Not updated: main cannot fast-forward to origin/main. $($MergeOutput.Trim())"
                } elseif ($Before -ne $After) {
                    $UpdateNote = "Updated main $Before -> $After."
                } else {
                    $UpdateNote = "Already up to date at $After."
                }
            }
        } catch {
            $UpdateNote = "Update check failed: $($_.Exception.Message)"
        } finally {
            $ErrorActionPreference = $PreviousPreference
        }
    }
    try { "$(Get-Date -Format s) $Target $UpdateNote" | Out-File $UpdateLog -Append -Encoding utf8 } catch {}
    if ($Detail -and $UpdateNote -like 'Not updated*') {
        $Detail.Text = $UpdateNote.Substring(0, [Math]::Min(60, $UpdateNote.Length))
        [System.Windows.Forms.Application]::DoEvents()
        Start-Sleep -Seconds 3
    }
    if ($Detail) {
        $Detail.Text = "Switching to $Target workspace..."
        [System.Windows.Forms.Application]::DoEvents()
    }
    foreach ($Process in $Supervisors) {
        # Recheck identity immediately before signalling; never kill by port/name.
        $Current = Get-CimInstance Win32_Process -Filter "ProcessId = $($Process.ProcessId)"
        if ($Current -and $Current.CreationDate -eq $Process.CreationDate) {
            & $Python $Helper stop $Process.ProcessId
            if ($LASTEXITCODE -ne 0) { throw 'Could not request graceful shutdown. No replacement was started.' }
        }
    }
    $Deadline = (Get-Date).AddSeconds(25)
    do {
        if ($Splash) { [System.Windows.Forms.Application]::DoEvents() }
        $Remaining = @(Get-CimInstance Win32_Process | Where-Object {
            $Owned.ContainsKey([int]$_.ProcessId) -and $_.CreationDate -eq $Owned[[int]$_.ProcessId].CreationDate
        })
        if (-not $Remaining.Count) { break }
        Start-Sleep -Milliseconds 400
    } while ((Get-Date) -lt $Deadline)
    if ($Remaining.Count) { throw 'The previous services have not finished shutting down. Nothing was forcibly killed; try again after they finish.' }
    $Occupied = @(Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -in $Ports })
    if ($Occupied.Count) { throw 'A service port is still occupied. No replacement was started.' }
    if ($Detail) {
        $Detail.Text = "Starting $Target services..."
        [System.Windows.Forms.Application]::DoEvents()
    }
    $StartedId = & $Python $Helper start $Root
    if ($LASTEXITCODE -ne 0) { throw 'Service startup failed. See .runtime\desktop-supervisor.log.' }
    $Deadline = (Get-Date).AddSeconds(90)
    $Ready = $false
    do {
        if ($Splash) { [System.Windows.Forms.Application]::DoEvents() }
        if (-not (Get-Process -Id ([int]$StartedId) -ErrorAction SilentlyContinue)) {
            throw "Service startup exited. See $Root\.runtime\desktop-supervisor.log."
        }
        try {
            $Health = Invoke-RestMethod "http://127.0.0.1:$HostPort/api/health" -TimeoutSec 2
            $Runtime = Invoke-RestMethod "http://127.0.0.1:$HostPort/api/runtime" -TimeoutSec 2
            $Ready = $Health.service -eq 'mr-studio' -and $Runtime.services.host.status -in @('ready', 'reused')
        } catch { $Ready = $false }
        if (-not $Ready) { Start-Sleep -Milliseconds 500 }
    } while (-not $Ready -and (Get-Date) -lt $Deadline)
    if (-not $Ready) { throw "The launcher is still starting. See $Root\.runtime\desktop-supervisor.log." }
    # Verify the selected checkout, not just a generic MR Studio health response.
    $ServedConfig = (Invoke-WebRequest "http://127.0.0.1:$HostPort/app-config.js" -UseBasicParsing -TimeoutSec 5).Content
    $ExpectedConfig = Get-Content (Join-Path $Root 'app-config.js') -Raw
    if ($ServedConfig -ne $ExpectedConfig) { throw 'The running server does not match the selected campus. The browser was not opened.' }
    $Url = "http://127.0.0.1:$HostPort/launcher.html?site=$Target&launch=$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())"
    if ($Splash) { $Splash.Close(); $Splash.Dispose(); $Splash = $null }
    if (-not $NoOpen) { Start-Process $Url }
    Write-Output "$Target ready: $Url (supervisor $StartedId)"
} catch {
    $Message = $_.Exception.Message
    $Message | Out-File (Join-Path $Repo '.runtime\desktop-launcher-error.log') -Append
    if ($Splash) { $Splash.Close(); $Splash.Dispose(); $Splash = $null }
    if (-not $NoOpen -and -not $Check) {
        Add-Type -AssemblyName System.Windows.Forms
        [System.Windows.Forms.MessageBox]::Show($Message, 'MR Studio launcher') | Out-Null
    }
    Write-Error $Message
    exit 1
} finally {
    if ($Splash) { $Splash.Close(); $Splash.Dispose() }
    if ($Locked) { $Mutex.ReleaseMutex() }
    $Mutex.Dispose()
}
