$ErrorActionPreference = 'Stop'
$Repo = Split-Path $PSScriptRoot -Parent
$Mutex = New-Object System.Threading.Mutex($false, 'Local\MRStudioDesktopSwitch')
$Locked = $false
try {
    try { $Locked = $Mutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $Locked = $true }
    if (-not $Locked) { throw 'A desktop launcher is changing services. Wait for it to finish, then try again.' }

    $Settings = Get-Content (Join-Path $Repo '.runtime\desktop-launchers.json') -Raw | ConvertFrom-Json
    $Roots = @($Settings.campus, $Settings.lindholmen) | Select-Object -Unique
    $Ports = @()
    foreach ($Root in $Roots) {
        $Config = Get-Content (Join-Path $Root 'services.example.json') -Raw | ConvertFrom-Json
        $LocalFile = Join-Path $Root 'services.local.json'
        if (Test-Path -LiteralPath $LocalFile) {
            $Local = Get-Content $LocalFile -Raw | ConvertFrom-Json
            foreach ($Prop in $Local.PSObject.Properties) {
                $Config | Add-Member -NotePropertyName $Prop.Name -NotePropertyValue $Prop.Value -Force
            }
        }
        $Ports += @($Config.host, $Config.ecom, $Config.coolpaths, $Config.sam)
    }
    $Ports = @($Ports | Select-Object -Unique)

    $Processes = @(Get-CimInstance Win32_Process)
    $Supervisors = @($Processes | Where-Object {
        $Process = $_
        $Process.Name -eq 'python.exe' -and (@($Roots | Where-Object {
            $Script = [regex]::Escape((Join-Path $_ 'scripts\services.py'))
            $Process.CommandLine -match ('(?:^|[\s"])' + $Script + '(?:[\s"]|$)')
        })).Count -gt 0
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
    if (-not $Supervisors.Count) {
        Write-Output 'No MR Studio desktop services are running.'
        return
    }

    Write-Output "Requesting shutdown of $($Supervisors.Count) MR Studio service supervisor(s)..."
    $Python = $Settings.python
    $Helper = Join-Path $PSScriptRoot 'desktop_service_process.py'
    foreach ($Process in $Supervisors) {
        $Current = Get-CimInstance Win32_Process -Filter "ProcessId = $($Process.ProcessId)"
        if ($Current -and $Current.CreationDate -eq $Process.CreationDate) {
            & $Python $Helper stop $Process.ProcessId
            if ($LASTEXITCODE -ne 0) { throw "Could not request shutdown for supervisor $($Process.ProcessId)." }
        }
    }

    $Deadline = (Get-Date).AddSeconds(25)
    do {
        $Remaining = @(Get-CimInstance Win32_Process | Where-Object {
            $Owned.ContainsKey([int]$_.ProcessId) -and $_.CreationDate -eq $Owned[[int]$_.ProcessId].CreationDate
        })
        if (-not $Remaining.Count) { break }
        Start-Sleep -Milliseconds 400
    } while ((Get-Date) -lt $Deadline)
    if ($Remaining.Count) {
        $Ids = ($Remaining | ForEach-Object { $_.ProcessId }) -join ', '
        throw "Some MR Studio processes are still shutting down (PID $Ids). They were not forcibly stopped."
    }
    Write-Output 'All MR Studio desktop services have stopped.'
} catch {
    $Message = $_.Exception.Message
    $Message | Out-File (Join-Path $Repo '.runtime\desktop-shutdown-error.log') -Append
    Write-Error $Message
    exit 1
} finally {
    if ($Locked) { $Mutex.ReleaseMutex() }
    $Mutex.Dispose()
}
