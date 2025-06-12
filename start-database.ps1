# PowerShell script to start a Docker PostgreSQL container for local development
# Usage: Run in PowerShell: ./start-database.ps1

$DB_CONTAINER_NAME = "gitdiagram-postgres"

# Check if Docker is installed
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "Docker is not installed. Please install Docker and try again."
    Write-Host "Docker install guide: https://docs.docker.com/engine/install/"
    exit 1
}

# Check if Docker daemon is running
try {
    docker info | Out-Null
} catch {
    Write-Host "Docker daemon is not running. Please start Docker Desktop and try again."
    exit 1
}

# Check if container is already running
$running = docker ps -q -f "name=$DB_CONTAINER_NAME"
if ($running) {
    Write-Host "Database container '$DB_CONTAINER_NAME' already running"
    exit 0
}

# Check if container exists but is stopped
$exists = docker ps -a -q -f "name=$DB_CONTAINER_NAME"
if ($exists) {
    docker start $DB_CONTAINER_NAME | Out-Null
    Write-Host "Existing database container '$DB_CONTAINER_NAME' started"
    exit 0
}

# Parse .env for POSTGRES_URL
$defaults = @{ DB_PASSWORD = "password"; DB_PORT = "5432" }
$envFile = ".env"
if (-not (Test-Path $envFile)) {
    Write-Host ".env file not found. Please create one with POSTGRES_URL."
    exit 1
}

$envLines = Get-Content $envFile | Where-Object { $_ -match '^POSTGRES_URL=' }
if (-not $envLines) {
    Write-Host "POSTGRES_URL not found in .env file."
    exit 1
}

# Extract POSTGRES_URL value
$POSTGRES_URL = $envLines[0] -replace '^POSTGRES_URL="?','' -replace '"?$',''

# Parse password and port from POSTGRES_URL
# Example: postgres://postgres:password@localhost:5432/gitdiagram
if ($POSTGRES_URL -match ":([^:]+)@") {
    $DB_PASSWORD = $matches[1]
} else {
    $DB_PASSWORD = $defaults.DB_PASSWORD
}

# Improved port extraction: match :<port>/ after @host
if ($POSTGRES_URL -match "@[^:]+:(\d+)") {
    $DB_PORT = $matches[1]
} else {
    $DB_PORT = $defaults.DB_PORT
}

if ($DB_PASSWORD -eq "password") {
    Write-Host "You are using the default database password."
    $REPLY = Read-Host "Should we generate a random password for you? [y/N]"
    if ($REPLY -match '^[Yy]$') {
        # Generate a random 12-character URL-safe password
        $bytes = New-Object 'Byte[]' 12
        (New-Object System.Security.Cryptography.RNGCryptoServiceProvider).GetBytes($bytes)
        $DB_PASSWORD = [Convert]::ToBase64String($bytes) -replace '[+/=]', ''
        # Update .env file with new password
        (Get-Content $envFile) -replace ":password@", ":$DB_PASSWORD@" | Set-Content $envFile
        Write-Host "Password updated in .env file."
        if (-not $DB_PASSWORD) {
            Write-Host "Generated password is empty. Exiting."
            exit 1
        }
        # Re-extract the password from the updated .env file to ensure correct value
        $envLines = Get-Content $envFile | Where-Object { $_ -match '^POSTGRES_URL=' }
        $POSTGRES_URL = $envLines[0] -replace '^POSTGRES_URL="?','' -replace '"?$',''
        if ($POSTGRES_URL -match ":([^:]+)@") {
            $DB_PASSWORD = $matches[1]
        }
    } else {
        Write-Host "Please change the default password in the .env file and try again."
        exit 1
    }
}

docker run -d `
    --name "$DB_CONTAINER_NAME" `
    -e "POSTGRES_USER=postgres" `
    -e "POSTGRES_PASSWORD=$DB_PASSWORD" `
    -e "POSTGRES_DB=gitdiagram" `
    -p "${DB_PORT}:5432" `
    "postgres:15" | Out-Null

Write-Host "Database container '$DB_CONTAINER_NAME' was successfully created"
