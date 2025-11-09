<#
.SYNOPSIS
  Force-free a TCP port on Windows by stopping services or killing processes that own the port.

.PARAMETER Port
  The local TCP port to free. Default 11434.

.PARAMETER Timeout
  Seconds to wait for the port to be freed after attempting to stop owners. Default 30.

Examples:
  .\free-port.ps1 -Port 11434 -Timeout 30
#>

param(
  [int]$Port = 11434,
  [int]$Timeout = 30
)

function Get-ListeningPids {
  param([int]$Port)
  # Try modern cmdlet first
  try {
    $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop
    return $conns | Select-Object -ExpandProperty OwningProcess -Unique
  } catch {
    # Fallback to netstat parsing for older PowerShell/Windows
    $regex = ":$Port\b"
    $lines = & netstat -aon 2>$null | Select-String $regex
    if (-not $lines) { return @() }
    $pids = $lines | ForEach-Object {
      $parts = ($_ -replace '\s+', ' ').Trim().Split(' ')
      $parts[-1]
    } | Where-Object { $_ -and $_ -ne '0' } | Sort-Object -Unique
    return $pids
  }
}

Write-Output "Looking for processes listening on port $Port..."
$pids = Get-ListeningPids -Port $Port
if (-not $pids -or $pids.Count -eq 0) {
  Write-Output "No listening processes found on port $Port."
  exit 0
}

foreach ($pid in $pids) {
  Write-Output "Found PID $pid owning port $Port"
  try {
    $proc = Get-Process -Id $pid -ErrorAction Stop
    Write-Output "  Process: $($proc.ProcessName) (Id=$pid)"
  } catch {
    Write-Warning "  Could not query process $pid"
    continue
  }

  # Try to find any Windows service running in that process
  try {
    $services = Get-CimInstance -ClassName Win32_Service -Filter "ProcessId = $pid" -ErrorAction SilentlyContinue
  } catch {
    $services = $null
  }

  if ($services -and $services.Count -gt 0) {
    foreach ($s in $services) {
      Write-Output "  Stopping service $($s.Name) - $($s.DisplayName)"
      try {
        Stop-Service -Name $s.Name -Force -ErrorAction Stop
        Write-Output "    Service $($s.Name) stopped"
      } catch {
        Write-Warning "    Failed to stop service $($s.Name): $_"
      }
    }
  } else {
    Write-Output "  No service found for PID $pid; force-stopping process"
    try {
      Stop-Process -Id $pid -Force -ErrorAction Stop
      Write-Output "    Process $pid terminated"
    } catch {
      Write-Warning "    Failed to terminate process $pid: $_"
      # Try wmic as last resort
      try {
        & wmic process where ProcessId=$pid call terminate > $null 2>&1
        Write-Output "    WMIC terminate attempted for PID $pid"
      } catch {
        Write-Warning "    WMIC terminate also failed for PID $pid"
      }
    }
  }
}

Write-Output "Waiting up to $Timeout seconds for port $Port to be freed..."
$deadline = (Get-Date).AddSeconds($Timeout)
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Seconds 1
  $remaining = Get-ListeningPids -Port $Port
  if (-not $remaining -or $remaining.Count -eq 0) {
    Write-Output "Port $Port freed."
    exit 0
  }
}

$left = Get-ListeningPids -Port $Port
if ($left -and $left.Count -gt 0) {
  Write-Warning "Port $Port still in use by PID(s): $($left -join ', ')"
  Write-Output "Netstat lines for diagnostics:"
  & netstat -aon | Select-String ":$Port\b" | ForEach-Object { $_.ToString() }
  exit 2
}

Write-Output "Port $Port freed (final check)."
exit 0
