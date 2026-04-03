param(
  [Parameter(Mandatory = $true)]
  [string]$InputCsv,

  [string]$OutputJson = ".\local-data\roster.normalized.json"
)

$ErrorActionPreference = "Stop"

$flightMap = @{
  "A FLT" = "Apex"
  "B FLT" = "Bomber"
  "C FLT" = "Cryptid"
  "D FLT" = "Doom"
  "E FLT" = "Ewok"
  "F FLT" = "Foxhound"
  "ADF"   = "ADF"
  "DET 1" = "DET"
}

$ignoredFlights = @("CCEA", "CC", "SEL", "CCQ", "CCF", "DO")

$rankMap = @{
  "AMN" = "Amn"
  "A1C" = "A1C"
  "SRA" = "SrA"
  "SSG" = "SSgt"
  "TSG" = "TSgt"
  "MSG" = "MSgt"
  "SMS" = "SMSgt"
}

function Parse-Name {
  param([string]$FullName)

  $parts = $FullName.Split(",", 2)
  if ($parts.Count -lt 2) {
    return $null
  }

  $lastName = [string]$parts[0]
  $firstAndMiddle = [string]$parts[1]
  $lastName = $lastName.Trim()
  $firstAndMiddle = $firstAndMiddle.Trim()
  if ([string]::IsNullOrWhiteSpace($lastName) -or [string]::IsNullOrWhiteSpace($firstAndMiddle)) {
    return $null
  }

  $givenParts = ($firstAndMiddle -split "\s+" | ForEach-Object { [string]$_ }) | Where-Object { $_ -and $_.Trim().Length -gt 0 }
  if ($givenParts.Count -eq 0) {
    return $null
  }

  [pscustomobject]@{
    firstName = ([string]$givenParts[0]).Trim()
    lastName  = $lastName
  }
}

$rows = Import-Csv $InputCsv
$normalized = @()
$ignored = @()
$unknownFlights = @()

foreach ($row in $rows) {
  $flightCode = "$($row.'FLT-DET')".Trim().ToUpper()
  $rankCode = "$($row.RANK)".Trim().ToUpper()
  $fullName = "$($row.FULL_NAME)".Trim()

  if ([string]::IsNullOrWhiteSpace($fullName)) {
    continue
  }

  if ($ignoredFlights -contains $flightCode) {
    $ignored += [pscustomobject]@{
      fullName = $fullName
      rank = $rankCode
      flightCode = $flightCode
      reason = "ignored_flight_code"
    }
    continue
  }

  if (-not $flightMap.ContainsKey($flightCode)) {
    if ($unknownFlights -notcontains $flightCode) {
      $unknownFlights += $flightCode
    }

    $ignored += [pscustomobject]@{
      fullName = $fullName
      rank = $rankCode
      flightCode = $flightCode
      reason = "unknown_flight_code"
    }
    continue
  }

  $parsedName = Parse-Name -FullName $fullName
  if ($null -eq $parsedName) {
    $ignored += [pscustomobject]@{
      fullName = $fullName
      rank = $rankCode
      flightCode = $flightCode
      reason = "name_parse_failed"
    }
    continue
  }

  $normalizedRank = if ($rankMap.ContainsKey($rankCode)) { $rankMap[$rankCode] } else { $rankCode }

  $normalized += [pscustomobject]@{
    rank = $normalizedRank
    firstName = $parsedName.firstName
    lastName = $parsedName.lastName
    flight = $flightMap[$flightCode]
    sourceFlightCode = $flightCode
  }
}

$outputDir = Split-Path -Parent $OutputJson
if ($outputDir -and -not (Test-Path $outputDir)) {
  New-Item -ItemType Directory -Path $outputDir | Out-Null
}

$result = [pscustomobject]@{
  generatedAt = (Get-Date).ToString("o")
  inputCsv = (Resolve-Path $InputCsv).Path
  importedCount = $normalized.Count
  ignoredCount = $ignored.Count
  unknownFlightCodes = @($unknownFlights)
  members = @($normalized)
  ignoredRows = @($ignored)
}

$result | ConvertTo-Json -Depth 6 | Set-Content -Path $OutputJson -Encoding UTF8

Write-Output "Normalized roster written to: $OutputJson"
Write-Output "Imported members: $($normalized.Count)"
Write-Output "Ignored rows: $($ignored.Count)"
if ($unknownFlights.Count -gt 0) {
  Write-Output "Unknown flight codes: $($unknownFlights -join ', ')"
}
