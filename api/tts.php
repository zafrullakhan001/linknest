<?php
/**
 * Routable TTS — returns WAV so the browser can play it on a chosen output device
 * via HTMLMediaElement.setSinkId / AudioContext.setSinkId.
 *
 * Windows: System.Speech (SAPI)
 * Linux/macOS: espeak / espeak-ng when available on PATH
 */
declare(strict_types=1);

require_once __DIR__ . '/config.php';

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$raw = file_get_contents('php://input') ?: '';
$data = json_decode($raw, true);
if (!is_array($data)) {
    http_response_code(400);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'Invalid JSON body']);
    exit;
}

$text = trim((string)($data['text'] ?? ''));
if ($text === '') {
    http_response_code(400);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'Text is required']);
    exit;
}

// Keep payloads bounded for safety / PHP timeouts
if (mb_strlen($text) > 12000) {
    $text = mb_substr($text, 0, 12000);
}

$rate = (float)($data['rate'] ?? 1.0);
if ($rate < 0.5) $rate = 0.5;
if ($rate > 2.5) $rate = 2.5;

$gender = strtolower(trim((string)($data['gender'] ?? '')));
if ($gender !== 'male' && $gender !== 'female') {
    $gender = '';
}

$tmpDir = sys_get_temp_dir();
$base = 'linknest_tts_' . bin2hex(random_bytes(8));
$wavPath = $tmpDir . DIRECTORY_SEPARATOR . $base . '.wav';
$textPath = $tmpDir . DIRECTORY_SEPARATOR . $base . '.txt';

function linknest_tts_cleanup(string ...$paths): void {
    foreach ($paths as $path) {
        if ($path !== '' && is_file($path)) {
            @unlink($path);
        }
    }
}

function linknest_tts_is_windows(): bool {
    return strtoupper(substr(PHP_OS, 0, 3)) === 'WIN';
}

function linknest_tts_sapi_rate(float $rate): int {
    // SAPI rate is -10..10; map 0.5→-5, 1→0, 2→10
    $sapi = (int)round(($rate - 1.0) * 10);
    return max(-10, min(10, $sapi));
}

function linknest_tts_windows_sapi(string $textPath, string $wavPath, float $rate, string $gender): bool {
    $sapiRate = linknest_tts_sapi_rate($rate);
    $psTextPath = str_replace("'", "''", $textPath);
    $psWavPath = str_replace("'", "''", $wavPath);
    $genderHint = $gender === 'male'
        ? 'david|mark|james|george|richard|thomas|guy|ryan|brian|christopher'
        : ($gender === 'female'
            ? 'zira|hazel|susan|helen|catherine|linda|heather|eva|jenny|aria|emma|michelle'
            : '');

    $script = <<<'PS'
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.Rate = __RATE__
$genderHint = '__GENDER_HINT__'
if ($genderHint -ne '') {
  $voices = $synth.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo }
  $pick = $voices | Where-Object { $_.Name -match $genderHint } | Select-Object -First 1
  if (-not $pick -and '__GENDER__' -eq 'female') {
    $pick = $voices | Where-Object { $_.Gender -eq 'Female' } | Select-Object -First 1
  }
  if (-not $pick -and '__GENDER__' -eq 'male') {
    $pick = $voices | Where-Object { $_.Gender -eq 'Male' } | Select-Object -First 1
  }
  if ($pick) { $synth.SelectVoice($pick.Name) }
}
$text = Get-Content -LiteralPath '__TEXT__' -Raw -Encoding UTF8
$synth.SetOutputToWaveFile('__WAV__')
$synth.Speak($text)
$synth.Dispose()
PS;

    $script = str_replace(
        ['__RATE__', '__GENDER_HINT__', '__GENDER__', '__TEXT__', '__WAV__'],
        [(string)$sapiRate, $genderHint, $gender, $psTextPath, $psWavPath],
        $script
    );

    $ps1 = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'linknest_tts_' . bin2hex(random_bytes(6)) . '.ps1';
    if (file_put_contents($ps1, $script) === false) {
        return false;
    }

    $cmd = 'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File ' . escapeshellarg($ps1);
    $output = [];
    $code = 1;
    @exec($cmd . ' 2>&1', $output, $code);
    @unlink($ps1);

    return $code === 0 && is_file($wavPath) && filesize($wavPath) > 44;
}

function linknest_tts_espeak(string $textPath, string $wavPath, float $rate): bool {
    $candidates = ['espeak-ng', 'espeak'];
    $bin = null;
    foreach ($candidates as $name) {
        $which = [];
        $code = 1;
        @exec('command -v ' . escapeshellarg($name) . ' 2>/dev/null', $which, $code);
        if ($code === 0 && !empty($which[0])) {
            $bin = trim($which[0]);
            break;
        }
    }
    if ($bin === null) {
        // Windows chocolatey / manual install
        foreach (['espeak-ng', 'espeak'] as $name) {
            $which = [];
            $code = 1;
            @exec('where ' . escapeshellarg($name) . ' 2>NUL', $which, $code);
            if ($code === 0 && !empty($which[0])) {
                $bin = trim($which[0]);
                break;
            }
        }
    }
    if ($bin === null) {
        return false;
    }

    // espeak speed ~80–450 wpm; default ~175. Map rate 1 → 175.
    $wpm = (int)round(175 * $rate);
    $wpm = max(80, min(450, $wpm));

    $cmd = escapeshellarg($bin)
        . ' -f ' . escapeshellarg($textPath)
        . ' -w ' . escapeshellarg($wavPath)
        . ' -s ' . $wpm;
    $output = [];
    $code = 1;
    @exec($cmd . ' 2>&1', $output, $code);
    return $code === 0 && is_file($wavPath) && filesize($wavPath) > 44;
}

if (file_put_contents($textPath, $text) === false) {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'Failed to stage TTS text']);
    exit;
}

$ok = false;
$engine = '';
if (linknest_tts_is_windows()) {
    $ok = linknest_tts_windows_sapi($textPath, $wavPath, $rate, $gender);
    $engine = 'sapi';
}
if (!$ok) {
    $ok = linknest_tts_espeak($textPath, $wavPath, $rate);
    $engine = 'espeak';
}

if (!$ok) {
    linknest_tts_cleanup($textPath, $wavPath);
    http_response_code(503);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'error' => 'Routable TTS unavailable on this server',
        'hint' => 'Install Windows Speech (SAPI) or espeak-ng, or use System default speaker with browser voices.',
    ]);
    exit;
}

$bytes = file_get_contents($wavPath);
linknest_tts_cleanup($textPath, $wavPath);

if ($bytes === false || $bytes === '') {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'TTS produced empty audio']);
    exit;
}

header('Content-Type: audio/wav');
header('Content-Length: ' . strlen($bytes));
header('Cache-Control: no-store');
header('X-LinkNest-TTS-Engine: ' . $engine);
echo $bytes;
exit;
