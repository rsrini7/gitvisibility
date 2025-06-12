#!/usr/bin/env bash
set -e

# Convert CRLF to LF if needed (for Windows compatibility)
case "$(uname)" in
    *MINGW* | *MSYS* | *CYGWIN*)
        exec dos2unix < "$0" | bash
        exit 0
        ;;
esac

echo "Current ENVIRONMENT: $ENVIRONMENT"

if [ "$ENVIRONMENT" = "development" ]; then
    echo "Starting in development mode with hot reload..."
    exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
elif [ "$ENVIRONMENT" = "production" ]; then
    echo "Starting in production mode with multiple workers..."
    exec uvicorn app.main:app \
        --host 0.0.0.0 \
        --port 8000 \
        --timeout-keep-alive 300 \
        --workers 2 \
        --loop uvloop \
        --http httptools
else
    echo "ENVIRONMENT must be set to either 'development' or 'production'"
    exit 1
fi