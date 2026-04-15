$sourceExts = @('.ts', '.tsx', '.js', '.jsx', '.json', '.sql', '.css', '.md', '.yml', '.yaml')
$codeExts = @('.ts', '.tsx', '.js', '.jsx')
$backendPatterns = @(
  'SUPABASE_URL',
  '/rest/v1/',
  '/functions/v1/',
  '/auth/v1/',
  '/storage/v1/'
)

$excludedRegex = '\\node_modules\\|\\.git\\|\\.expo\\|\\dist\\|\\build\\|\\coverage\\|\\android\\app\\build\\|\\ios\\build\\'

Write-Host "=== Repo Metrics ==="

$allFiles = Get-ChildItem -Recurse -File | Where-Object { $_.FullName -notmatch $excludedRegex }
$sourceFiles = $allFiles | Where-Object { $_.Extension -in $sourceExts }
$codeFiles = $allFiles | Where-Object { $_.Extension -in $codeExts }

$totalFiles = $allFiles.Count
$totalSourceFiles = $sourceFiles.Count

$sourceLineCount = 0
$sourceIndex = 0
$sourceTotal = [Math]::Max($sourceFiles.Count, 1)

foreach ($file in $sourceFiles) {
  $sourceIndex++
  Write-Progress `
    -Id 1 `
    -Activity "Counting source lines" `
    -Status "$sourceIndex / $sourceTotal : $($file.FullName)" `
    -PercentComplete (($sourceIndex / $sourceTotal) * 100)

  try {
    $sourceLineCount += (Get-Content -LiteralPath $file.FullName -ErrorAction Stop | Measure-Object -Line).Lines
  } catch {
    Write-Warning "Skipping unreadable file: $($file.FullName)"
  }
}

Write-Progress -Id 1 -Activity "Counting source lines" -Completed

$backendMatches = @()
$codeIndex = 0
$codeTotal = [Math]::Max($codeFiles.Count, 1)

foreach ($file in $codeFiles) {
  $codeIndex++
  Write-Progress `
    -Id 2 `
    -Activity "Scanning backend connections" `
    -Status "$codeIndex / $codeTotal : $($file.FullName)" `
    -PercentComplete (($codeIndex / $codeTotal) * 100)

  try {
    $matches = Select-String -Path $file.FullName -Pattern $backendPatterns -SimpleMatch -ErrorAction Stop
    if ($matches) {
      $backendMatches += $matches
    }
  } catch {
    Write-Warning "Skipping backend scan for unreadable file: $($file.FullName)"
  }
}

Write-Progress -Id 2 -Activity "Scanning backend connections" -Completed

$backendConnectedFiles = ($backendMatches | Select-Object -ExpandProperty Path -Unique | Measure-Object).Count
$totalBackendCallSites = ($backendMatches | Measure-Object).Count

$edgeFunctionCount = if (Test-Path ".\supabase\functions") {
  (Get-ChildItem ".\supabase\functions" -Directory | Measure-Object).Count
} else {
  0
}

$summary = [PSCustomObject]@{
  TotalFiles             = $totalFiles
  SourceFiles            = $totalSourceFiles
  SourceLines            = $sourceLineCount
  BackendConnectedFiles  = $backendConnectedFiles
  BackendCallSiteMatches = $totalBackendCallSites
  EdgeFunctions          = $edgeFunctionCount
}

$summary | Format-List

Write-Host ""
Write-Host "=== Lines by Extension ==="

$extResults = @()
$groupedSourceFiles = $sourceFiles | Group-Object Extension | Sort-Object Name
$groupIndex = 0
$groupTotal = [Math]::Max($groupedSourceFiles.Count, 1)

foreach ($group in $groupedSourceFiles) {
  $groupIndex++
  Write-Progress `
    -Id 3 `
    -Activity "Calculating lines by extension" `
    -Status "$groupIndex / $groupTotal : $($group.Name)" `
    -PercentComplete (($groupIndex / $groupTotal) * 100)

  $lines = 0
  foreach ($file in $group.Group) {
    try {
      $lines += (Get-Content -LiteralPath $file.FullName -ErrorAction Stop | Measure-Object -Line).Lines
    } catch {
      Write-Warning "Skipping unreadable file in extension summary: $($file.FullName)"
    }
  }

  $extResults += [PSCustomObject]@{
    Extension = $group.Name
    Files     = $group.Count
    Lines     = $lines
  }
}

Write-Progress -Id 3 -Activity "Calculating lines by extension" -Completed

$extResults | Format-Table -AutoSize