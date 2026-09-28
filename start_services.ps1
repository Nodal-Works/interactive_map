$Supervisor = Join-Path $PSScriptRoot 'scripts\services.py'
$PythonLauncher = Get-Command py -ErrorAction SilentlyContinue
if (-not $PythonLauncher) {
    $LauncherPath = Join-Path $env:LOCALAPPDATA 'Programs\Python\Launcher\py.exe'
    if (Test-Path $LauncherPath) {
        $PythonLauncher = [pscustomobject]@{ Source = $LauncherPath }
    }
}

function Test-Python310 {
    param($Output, $ExitCode)
    if ($ExitCode -ne 0 -or "$Output" -notmatch '^Python 3\.(\d+)') {
        return $false
    }
    return [int]$Matches[1] -ge 10
}

if ($PythonLauncher) {
    $VersionOutput = & $PythonLauncher.Source -3 --version 2>&1
    if (-not (Test-Python310 $VersionOutput $LASTEXITCODE)) {
        Write-Error 'Python 3.10 or newer is required. Install it, then reopen PowerShell.'
        exit 1
    }
    $PythonArguments = @('-3', $Supervisor) + $args
    & $PythonLauncher.Source @PythonArguments
    exit $LASTEXITCODE
}

$PythonCommand = Get-Command python -ErrorAction SilentlyContinue
if (-not $PythonCommand) {
    $PythonPath = Join-Path $env:LOCALAPPDATA 'Programs\Python\Python312\python.exe'
    if (Test-Path $PythonPath) {
        $PythonCommand = [pscustomobject]@{ Source = $PythonPath }
    }
}
if (-not $PythonCommand) {
    Write-Error 'Python 3.10 or newer is required. Install it, then reopen PowerShell.'
    exit 1
}

$VersionOutput = & $PythonCommand.Source --version 2>&1
if (-not (Test-Python310 $VersionOutput $LASTEXITCODE)) {
    $PythonPath = Join-Path $env:LOCALAPPDATA 'Programs\Python\Python312\python.exe'
    if (Test-Path $PythonPath) {
        $PythonCommand = [pscustomobject]@{ Source = $PythonPath }
        $VersionOutput = & $PythonCommand.Source --version 2>&1
    }
}
if (-not (Test-Python310 $VersionOutput $LASTEXITCODE)) {
    Write-Error 'Python 3.10 or newer is required. Install it, then reopen PowerShell.'
    exit 1
}

& $PythonCommand.Source $Supervisor @args
exit $LASTEXITCODE